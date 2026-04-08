import { Router } from 'express'
import adminDb from '../db-admin.js'
import { requireAuth } from '../middleware/auth.js'
import OpenAI from 'openai'

const router = Router()

let _openai = null
function getOpenAI() {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  return _openai
}

const SCREENSHOT_BUCKET = 'event-screenshots'
const SIGNED_URL_EXPIRES = 3600

// Events that carry no UX signal
const NOISE_TYPES = new Set([
  'mousemove', 'mousemove_batch', 'scroll', 'focus', 'blur',
  'keypress', 'mouseenter', 'mouseleave', 'mousedown', 'mouseup',
  'touchstart', 'touchend', 'touchmove', 'pointerdown', 'pointerup',
])

async function loadTestForTeam(testId, teamId) {
  let q = adminDb
    .from('tests')
    .select('id, team_id, name, research_intent, context, test_type')
    .eq('id', testId)
  if (teamId) q = q.eq('team_id', teamId)
  const { data, error } = await q.single()
  if (error || !data) return null
  if (teamId && data.team_id !== teamId) return null
  return data
}

/**
 * Convert a raw event record into a human-readable action + target.
 * Priority: metadata.text > metadata.label > selector ID > element type
 */
function describeEvent(event) {
  const { type, selector, url, metadata } = event
  const metaText = (metadata?.text || metadata?.label || '').trim().slice(0, 80) || null
  const urlPath = url ? (url.replace(/^https?:\/\/[^/]+/, '') || '/') : null

  if (type === 'pageview') {
    return { action: 'Opened', target: urlPath || '/', isNav: true }
  }

  if (type === 'click') {
    if (metaText) return { action: 'Clicked', target: metaText }
    // Try to pull a meaningful ID from the CSS selector
    const idMatch = selector?.match(/#([\w-]+)/)
    if (idMatch) return { action: 'Clicked', target: `#${idMatch[1]}` }
    // Get element tag
    const tagMatch = selector?.match(/^([a-zA-Z]+)/)
    const tag = tagMatch?.[1]?.toLowerCase()
    if (tag === 'button') return { action: 'Clicked', target: 'a button' }
    if (tag === 'a') return { action: 'Clicked', target: 'a link' }
    if (tag === 'input') return { action: 'Clicked', target: 'an input' }
    return { action: 'Clicked', target: tag ? `a ${tag}` : 'an element' }
  }

  if (type === 'input' || type === 'change') {
    const name = metadata?.name || metadata?.placeholder || metadata?.label || null
    if (name) return { action: 'Typed in', target: name }
    const tagMatch = selector?.match(/^([a-zA-Z]+)/)
    const tag = tagMatch?.[1]?.toLowerCase()
    return { action: 'Typed in', target: tag || 'a field' }
  }

  if (type === 'submit') {
    return { action: 'Submitted', target: metaText || 'a form' }
  }

  if (type === 'select' || type === 'selectchange') {
    const name = metadata?.name || metaText || null
    return { action: 'Selected', target: name || 'a dropdown option' }
  }

  return { action: type, target: metaText || urlPath || '' }
}

// GET /api/tests/:testId/participants/:participantId/story
router.get('/:testId/participants/:participantId/story', requireAuth, async (req, res) => {
  const { testId, participantId } = req.params

  const test = await loadTestForTeam(testId, req.teamId)
  if (!test) return res.status(404).json({ error: 'Test not found' })

  const { data: participant, error: pErr } = await adminDb
    .from('participants')
    .select('id, name, tid')
    .eq('id', participantId)
    .eq('test_id', testId)
    .single()

  if (pErr || !participant) return res.status(404).json({ error: 'Participant not found' })

  // Fetch events + recordings in parallel
  const [eventsResult, recordingsResult] = await Promise.all([
    adminDb
      .from('events')
      .select('id, type, selector, url, metadata, timestamp, screenshot_object_path')
      .eq('tid', participant.tid)
      .eq('test_id', testId)
      .order('timestamp', { ascending: true }),
    adminDb
      .from('participant_recordings')
      .select('id, tid, duration_ms, created_at')
      .eq('participant_id', participantId)
      .eq('test_id', testId)
      .order('created_at', { ascending: true }),
  ])

  const allEvents = eventsResult.data ?? []
  const recordings = recordingsResult.data ?? []

  // Get first completed transcript
  let transcript = null
  if (recordings.length > 0) {
    const { data } = await adminDb
      .from('transcripts')
      .select('id, status, transcript_text, segments, insights, insights_status')
      .in('recording_id', recordings.map((r) => r.id))
      .eq('status', 'done')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    transcript = data
  }

  const insights = Array.isArray(transcript?.insights) ? transcript.insights : []

  // Session timing from all events (including noise, for accurate duration)
  const sessionStart = allEvents.length > 0 ? new Date(allEvents[0].timestamp).getTime() : null
  const sessionEnd = allEvents.length > 1 ? new Date(allEvents[allEvents.length - 1].timestamp).getTime() : null
  const sessionDurationMs = sessionStart && sessionEnd ? sessionEnd - sessionStart : null

  // Filter to meaningful events only
  const events = allEvents.filter((e) => !NOISE_TYPES.has(e.type))

  // Generate signed screenshot URLs in bulk (from all events, including noise, for coverage)
  const screenshotPaths = [
    ...new Set(
      allEvents.filter((e) => e.screenshot_object_path).map((e) => e.screenshot_object_path)
    ),
  ]
  const signedUrls = {}
  if (screenshotPaths.length > 0) {
    const { data: urlData } = await adminDb.storage
      .from(SCREENSHOT_BUCKET)
      .createSignedUrls(screenshotPaths, SIGNED_URL_EXPIRES)
    if (urlData) {
      for (const item of urlData) signedUrls[item.path] = item.signedUrl
    }
  }

  // ─── Build page sections (group by URL changes) ──────────────────────────────
  //
  // A section = one URL visit. Sections begin at the first event and whenever
  // the URL changes (pageview event OR any event on a different URL).
  // Events within a section are shown as an action list.
  //
  const pageSections = []
  let currentSection = null

  for (const event of events) {
    const relSec = sessionStart
      ? (new Date(event.timestamp).getTime() - sessionStart) / 1000
      : 0
    const urlPath = event.url ? (event.url.replace(/^https?:\/\/[^/]+/, '') || '/') : null
    const isNav = event.type === 'pageview'

    // Start a new section when: first event, explicit navigation, or URL changed
    if (!currentSection || (isNav && urlPath && urlPath !== currentSection.url)) {
      currentSection = {
        url: urlPath,
        entered_at_seconds: Math.round(relSec),
        duration_seconds: null, // filled after loop
        actions: [],
        screenshot_url: null,
      }
      pageSections.push(currentSection)
    }

    // Skip bare pageview events from the actions list — they're already the section header
    if (!isNav) {
      const { action, target } = describeEvent(event)
      currentSection.actions.push({
        relative_seconds: Math.round(relSec * 10) / 10,
        type: event.type,
        action,
        target,
      })
    }

    // Keep the last screenshot per section
    if (event.screenshot_object_path && signedUrls[event.screenshot_object_path]) {
      currentSection.screenshot_url = signedUrls[event.screenshot_object_path]
    }
  }

  // Calculate time spent per page
  for (let i = 0; i < pageSections.length; i++) {
    const next = pageSections[i + 1]
    if (next) {
      pageSections[i].duration_seconds = next.entered_at_seconds - pageSections[i].entered_at_seconds
    } else if (sessionDurationMs != null) {
      pageSections[i].duration_seconds = Math.round(sessionDurationMs / 1000) - pageSections[i].entered_at_seconds
    }
  }

  // Remove sections with zero actions AND no screenshot (empty visits)
  const filteredSections = pageSections.filter(
    (s) => s.actions.length > 0 || s.screenshot_url
  )

  // ─── GPT-4o synthesis ────────────────────────────────────────────────────────
  let aiSummary = null
  let keyFindings = []

  if (allEvents.length > 0 && process.env.OPENAI_API_KEY) {
    try {
      const durationLabel = sessionDurationMs
        ? `${Math.round(sessionDurationMs / 1000)}s`
        : 'unknown'

      // Feed the AI meaningful events only (not raw selectors)
      const actionLines = events.slice(0, 120).map((e) => {
        const relSec = sessionStart
          ? Math.round((new Date(e.timestamp).getTime() - sessionStart) / 1000)
          : 0
        const { action, target } = describeEvent(e)
        return `[${relSec}s] ${action} ${target}`
      })

      const insightLines =
        insights.length > 0
          ? insights.map((ins) => `- [${ins.type}] "${ins.quote || ''}" — ${ins.label || ''}`).join('\n')
          : '(none detected)'

      const transcriptExcerpt = transcript?.transcript_text?.slice(0, 3000) ?? '(no transcript)'

      const prompt = `You are a UX research analyst. Synthesize this usability test session into a clear, honest story.

TEST
Name: ${test.name}
Research intent: ${test.research_intent || 'Not specified'}
Prototype context: ${test.context || 'Not specified'}

PARTICIPANT: ${participant.name}
Session duration: ${durationLabel} · ${events.length} meaningful interactions (noise filtered)

ACTIONS (chronological — what they clicked/typed/submitted)
${actionLines.join('\n')}

TRANSCRIPT (what they said aloud — timing is relative to recording start, may differ from session start)
${transcriptExcerpt}

EMOTIONAL SIGNALS (detected in transcript)
${insightLines}

Write a concise, honest session story grounded in the data above.
Return JSON with:
{
  "summary": "2–3 sentence executive summary of what this participant experienced — be specific, cite real moments",
  "key_findings": [
    "Finding 1 (specific and actionable — name the element, the moment, or the quote)",
    "Finding 2",
    "Finding 3",
    "Finding 4 (optional)",
    "Finding 5 (optional)"
  ]
}

Rules: Do NOT fabricate moments not in the data. If the transcript and events seem misaligned in time, trust the content not the timestamps. Focus on usability friction and delight.`

      const completion = await getOpenAI().chat.completions.create({
        model: 'gpt-4o',
        temperature: 0.2,
        max_tokens: 700,
        response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: prompt }],
      })

      const parsed = JSON.parse(completion.choices[0].message.content)
      aiSummary = typeof parsed.summary === 'string' ? parsed.summary : null
      keyFindings = Array.isArray(parsed.key_findings) ? parsed.key_findings.slice(0, 5) : []
    } catch (err) {
      console.error('[story] GPT-4o error:', err.message)
    }
  }

  res.json({
    test: {
      id: test.id,
      name: test.name,
      research_intent: test.research_intent ?? null,
      context: test.context ?? null,
      test_type: test.test_type,
    },
    participant: {
      id: participant.id,
      name: participant.name,
      tid: participant.tid,
    },
    recordings: recordings.map((r) => ({
      id: r.id,
      duration_ms: r.duration_ms,
      created_at: r.created_at,
    })),
    transcript: transcript
      ? {
          id: transcript.id,
          status: transcript.status,
          insights_status: transcript.insights_status,
          insight_count: insights.length,
        }
      : null,
    // Return insights flat — do NOT correlate to event timeline (offset is unknown)
    insights,
    session_start: allEvents.length > 0 ? allEvents[0].timestamp : null,
    session_duration_ms: sessionDurationMs,
    total_events: allEvents.length,
    meaningful_events: events.length,
    ai_summary: aiSummary,
    key_findings: keyFindings,
    // Page-grouped sections replace raw 5-second windows
    page_sections: filteredSections,
  })
})

export default router
