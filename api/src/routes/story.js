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
const SIGNED_URL_EXPIRES = 3600 // 1 hour

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

function findSegmentForTime(segments, relSec) {
  if (!segments?.length) return null
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    const nextStart = segments[i + 1]?.start ?? Infinity
    if (relSec >= seg.start && relSec < nextStart) return seg
  }
  return segments[segments.length - 1]
}

function findInsightsForSegment(insights, seg) {
  if (!seg || !insights?.length) return []
  const segEnd = seg.end ?? seg.start + 10
  return insights.filter(
    (ins) => ins.start != null && ins.end != null && ins.start < segEnd && ins.end > seg.start
  )
}

// GET /api/tests/:testId/participants/:participantId/story
router.get('/:testId/participants/:participantId/story', requireAuth, async (req, res) => {
  const { testId, participantId } = req.params

  const test = await loadTestForTeam(testId, req.teamId)
  if (!test) return res.status(404).json({ error: 'Test not found' })

  // Get participant
  const { data: participant, error: pErr } = await adminDb
    .from('participants')
    .select('id, name, tid')
    .eq('id', participantId)
    .eq('test_id', testId)
    .single()

  if (pErr || !participant) return res.status(404).json({ error: 'Participant not found' })

  // Fetch events + recordings + transcript in parallel
  const [eventsResult, recordingsResult] = await Promise.all([
    adminDb
      .from('events')
      .select('id, type, selector, url, metadata, timestamp, x, y, vw, vh, screenshot_object_path')
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

  const events = eventsResult.data ?? []
  const recordings = recordingsResult.data ?? []

  // Get transcript for the first done recording
  let transcript = null
  if (recordings.length > 0) {
    const recordingIds = recordings.map((r) => r.id)
    const { data: transcriptData } = await adminDb
      .from('transcripts')
      .select('id, status, transcript_text, segments, insights, insights_status')
      .in('recording_id', recordingIds)
      .eq('status', 'done')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    transcript = transcriptData
  }

  const segments = Array.isArray(transcript?.segments) ? transcript.segments : []
  const insights = Array.isArray(transcript?.insights) ? transcript.insights : []

  // Session start timestamp
  const sessionStart = events.length > 0 ? new Date(events[0].timestamp).getTime() : null
  const sessionEnd =
    events.length > 1 ? new Date(events[events.length - 1].timestamp).getTime() : null
  const sessionDurationMs = sessionStart && sessionEnd ? sessionEnd - sessionStart : null

  // Generate signed screenshot URLs in bulk
  const screenshotPaths = [...new Set(events.filter((e) => e.screenshot_object_path).map((e) => e.screenshot_object_path))]
  const signedUrls = {}
  if (screenshotPaths.length > 0) {
    const { data: urlData } = await adminDb.storage
      .from(SCREENSHOT_BUCKET)
      .createSignedUrls(screenshotPaths, SIGNED_URL_EXPIRES)
    if (urlData) {
      for (const item of urlData) {
        signedUrls[item.path] = item.signedUrl
      }
    }
  }

  // Build 5-second timeline windows
  const WINDOW_SEC = 5
  const windows = []

  for (const event of events) {
    const relSec = sessionStart ? (new Date(event.timestamp).getTime() - sessionStart) / 1000 : 0
    const windowKey = Math.floor(relSec / WINDOW_SEC)

    let win = windows.find((w) => w.windowKey === windowKey)
    if (!win) {
      const seg = findSegmentForTime(segments, relSec)
      win = {
        windowKey,
        start_seconds: windowKey * WINDOW_SEC,
        events: [],
        segment: seg
          ? { text: seg.text, start: seg.start, end: seg.end ?? null }
          : null,
        insights: findInsightsForSegment(insights, findSegmentForTime(segments, relSec)),
        screenshot_url: null,
      }
      windows.push(win)
    }

    win.events.push({
      id: event.id,
      type: event.type,
      selector: event.selector || null,
      url: event.url || null,
      metadata: event.metadata || null,
      relative_seconds: Math.round(relSec * 10) / 10,
    })

    // Last screenshot in the window wins
    if (event.screenshot_object_path && signedUrls[event.screenshot_object_path]) {
      win.screenshot_url = signedUrls[event.screenshot_object_path]
    }
  }

  // Remove redundant segment duplicates across adjacent windows
  // (keep the segment text only on the first window where that segment appears)
  const seenSegmentStarts = new Set()
  for (const win of windows) {
    if (win.segment) {
      if (seenSegmentStarts.has(win.segment.start)) {
        win.segment = null
      } else {
        seenSegmentStarts.add(win.segment.start)
      }
    }
  }

  // ─── GPT-4o synthesis ──────────────────────────────────────────────────────
  let aiSummary = null
  let keyFindings = []

  if (events.length > 0 && process.env.OPENAI_API_KEY) {
    try {
      const durationLabel = sessionDurationMs
        ? `${Math.round(sessionDurationMs / 1000)}s`
        : 'unknown'

      const eventLines = events.slice(0, 100).map((e) => {
        const relSec = sessionStart
          ? Math.round((new Date(e.timestamp).getTime() - sessionStart) / 1000)
          : 0
        const parts = [`[${relSec}s] ${e.type}`]
        if (e.url) parts.push(`on ${e.url}`)
        if (e.selector) parts.push(`(${e.selector})`)
        return parts.join(' ')
      })

      const insightLines =
        insights.length > 0
          ? insights
              .map((ins) => `- [${ins.type}] "${ins.quote || ''}" — ${ins.label || ''}`)
              .join('\n')
          : '(none detected)'

      const transcriptExcerpt = transcript?.transcript_text?.slice(0, 3000) ?? '(no transcript)'

      const prompt = `You are a UX research analyst. Synthesize this participant session into a clear, evidence-based story.

TEST
Name: ${test.name}
Research intent: ${test.research_intent || 'Not specified'}
Prototype context: ${test.context || 'Not specified'}

PARTICIPANT
Name: ${participant.name}
Session duration: ${durationLabel}
Total interactions: ${events.length}

EVENTS (chronological)
${eventLines.join('\n')}

TRANSCRIPT (what the participant said aloud)
${transcriptExcerpt}

EMOTIONAL SIGNALS (AI-detected from transcript)
${insightLines}

Write a concise session story. Return JSON with exactly:
{
  "summary": "2-3 sentence executive summary of what happened and how the participant experienced the prototype",
  "key_findings": ["Finding 1 (specific, grounded in data)", "Finding 2", "Finding 3", "Finding 4 (optional)", "Finding 5 (optional)"]
}
Focus on what matters: where they struggled, what worked, what surprised them. Be specific — cite timestamps, actions, and quotes where relevant.`

      const completion = await getOpenAI().chat.completions.create({
        model: 'gpt-4o',
        temperature: 0.3,
        max_tokens: 600,
        response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: prompt }],
      })

      const parsed = JSON.parse(completion.choices[0].message.content)
      aiSummary = typeof parsed.summary === 'string' ? parsed.summary : null
      keyFindings = Array.isArray(parsed.key_findings) ? parsed.key_findings.slice(0, 5) : []
    } catch (err) {
      console.error('[story] GPT-4o synthesis error:', err.message)
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
          has_insights: insights.length > 0,
          insight_count: insights.length,
        }
      : null,
    session_start: events.length > 0 ? events[0].timestamp : null,
    session_duration_ms: sessionDurationMs,
    total_events: events.length,
    ai_summary: aiSummary,
    key_findings: keyFindings,
    timeline: windows,
  })
})

export default router
