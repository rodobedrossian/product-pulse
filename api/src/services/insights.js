/**
 * GPT-4o-mini insight analysis service.
 * Reads a completed Whisper transcript and annotates emotionally/behaviorally
 * significant moments for UX research.
 *
 * Design principles:
 * - temperature: 0 — deterministic output, minimises false positives
 * - json_schema response_format — typed output, no regex parsing
 * - Strict prompt — only unambiguous signals flagged, omit if uncertain
 * - Post-parse validation — defence against model ignoring enum constraints
 */
import OpenAI from 'openai'
import adminDb from '../db-admin.js'

const VALID_TYPES = new Set([
  'confusion', 'frustration', 'delight', 'hesitation', 'discovery', 'comparison'
])

const SYSTEM_PROMPT = `You are a UX research analyst reviewing a usability test transcript. Identify moments where the participant showed a clear, observable behavioral or emotional signal relevant to product usability.

STRICT RULES:
1. Only annotate a segment if the signal is direct and unambiguous — NOT inferred from pacing, silence, or vague phrasing.
2. Do NOT annotate neutral task narration, thinking-aloud without emotional content, or ambiguous statements.
3. Do NOT infer frustration from slow progress alone — there must be explicit language.
4. Each quote must be verbatim from the transcript text (5–20 words exactly).
5. If you are uncertain about a segment, do not include it. Precision is more important than recall.
6. Return an empty insights array if no clear signals are present.

INSIGHT TYPES:
- confusion: Participant is lost, explicitly states they don't understand, or expresses surprise at UI behavior. Examples: "wait, where did that go?", "I don't understand why...", "that's weird", "huh?"
- frustration: Annoyance, disappointment, or expressed failure. Examples: "ugh", "this is annoying", "I can't figure out", "why is it doing that", "it's not working"
- delight: Genuine positive reaction or pleasant discovery. Examples: "oh that's nice!", "I love that", "oh wow, it automatically...", "that's really cool"
- hesitation: Visible uncertainty about what to do next, questioning choices aloud. Examples: "hmm, should I...", "I'm not sure if I should", "maybe I'll try...", "I think I need to..."
- discovery: "Aha" moment — finding something they were looking for or a feature they didn't expect. Examples: "oh there it is!", "I didn't know you could do that", "oh, I see now"
- comparison: Explicit comparison to another product or prior expectation. Examples: "in [other app] you can...", "I expected it to work like...", "usually this would...", "unlike..."`

const RESPONSE_SCHEMA = {
  type: 'json_schema',
  json_schema: {
    name: 'transcript_insights',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        insights: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              type:  { type: 'string', enum: ['confusion', 'frustration', 'delight', 'hesitation', 'discovery', 'comparison'] },
              start: { type: 'number' },
              end:   { type: 'number' },
              quote: { type: 'string' },
              label: { type: 'string' },
            },
            required: ['type', 'start', 'end', 'quote', 'label'],
            additionalProperties: false,
          },
        },
      },
      required: ['insights'],
      additionalProperties: false,
    },
  },
}

let _openai = null
function getOpenAI() {
  if (!_openai) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not set — cannot analyze transcript')
    }
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  }
  return _openai
}

function formatSegments(segments) {
  return segments
    .map((s) => `[${(+s.start).toFixed(1)}–${(+s.end).toFixed(1)}]: "${String(s.text).trim()}"`)
    .join('\n')
}

/**
 * Analyze a completed transcript for UX insights.
 * @param {{ transcriptId: string, transcriptText: string, segments: Array }} opts
 */
export async function analyzeTranscript({ transcriptId, transcriptText, segments }) {
  if (!transcriptId) {
    console.error('[insights] missing transcriptId — skipping')
    return
  }

  const hasContent = (segments?.length > 0) || transcriptText?.trim()
  if (!hasContent) {
    console.warn(`[insights] no content for transcript ${transcriptId} — skipping`)
    return
  }

  // Mark as processing immediately
  await adminDb.from('transcripts')
    .update({ insights_status: 'processing', updated_at: new Date().toISOString() })
    .eq('id', transcriptId)

  try {
    // Format transcript content for the prompt
    const userContent = segments?.length > 0
      ? formatSegments(segments)
      : `[full transcript]: "${transcriptText}"`

    const response = await getOpenAI().chat.completions.create({
      model:           'gpt-4o-mini',
      temperature:     0,          // deterministic — critical for a research tool
      max_tokens:      2048,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user',   content: userContent },
      ],
      response_format: RESPONSE_SCHEMA,
    })

    const raw     = response.choices[0]?.message?.content ?? '{}'
    const parsed  = JSON.parse(raw)
    const rawList = Array.isArray(parsed.insights) ? parsed.insights : []

    // Validate each item — defence in depth against model ignoring constraints
    const insights = rawList.filter((item) =>
      VALID_TYPES.has(item.type) &&
      typeof item.start  === 'number' &&
      typeof item.end    === 'number' &&
      typeof item.quote  === 'string' && item.quote.trim().length > 0 &&
      typeof item.label  === 'string' && item.label.trim().length > 0
    )

    await adminDb.from('transcripts')
      .update({
        insights,
        insights_status: 'done',
        insights_error:  null,
        updated_at:      new Date().toISOString(),
      })
      .eq('id', transcriptId)

    console.log(`[insights] done for transcript ${transcriptId}: ${insights.length} insights`)

  } catch (err) {
    console.error(`[insights] failed for transcript ${transcriptId}:`, err.message)

    await adminDb.from('transcripts')
      .update({
        insights_status: 'error',
        insights_error:  err.message,
        updated_at:      new Date().toISOString(),
      })
      .eq('id', transcriptId)
  }
}
