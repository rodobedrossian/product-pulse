import { z } from 'zod'
import { validateTestOwnership, validateParticipantOwnership } from '../utils/validate.js'
import { log } from '../utils/log.js'

export function registerGetTranscripts(server, db) {
  server.tool(
    'get_transcripts',
    'Get audio transcripts for a test. Returns the full transcript text and timed segments for each participant recording. ' +
    'Optionally filter to a single participant by tid. Transcripts are produced by Whisper from moderated-session recordings. ' +
    'Status can be "pending", "processing", "done", or "error" — only "done" transcripts contain text.',
    {
      test_id: z.string().uuid().describe('The test ID'),
      tid: z.string().optional()
        .describe('Optional participant tracking ID to fetch transcripts for a single participant only'),
      include_segments: z.boolean().default(false).optional()
        .describe('Include timed word/sentence segments (start/end seconds + text). Default false — only returns full transcript_text.'),
    },
    async ({ test_id, tid, include_segments = false }) => {
      const t0 = Date.now()
      await validateTestOwnership(db, test_id)
      if (tid) await validateParticipantOwnership(db, tid, test_id)

      // Load all recordings for this test (or just the one participant)
      let recQuery = db.raw.participant_recordings()
        .select('id, participant_id, tid, duration_ms, created_at')
        .eq('test_id', test_id)
        .order('created_at', { ascending: true })

      if (tid) recQuery = recQuery.eq('tid', tid)

      const { data: recordings, error: recErr } = await recQuery
      if (recErr) throw new Error(`Database error: ${recErr.message}`)
      if (!recordings?.length) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              test_id,
              total_recordings: 0,
              transcripts: [],
              note: tid
                ? 'No recordings found for this participant.'
                : 'No recordings found for this test. Transcripts are created from moderated-session audio recordings.',
            }, null, 2)
          }]
        }
      }

      const recordingIds = recordings.map(r => r.id)

      // Load transcripts for those recording IDs
      const segmentColumns = include_segments ? ', segments' : ''
      const { data: transcriptRows, error: txErr } = await db.raw.transcripts()
        .select(`id, recording_id, tid, status, transcript_text, error_message, model_used, created_at, updated_at${segmentColumns}`)
        .in('recording_id', recordingIds)

      if (txErr) throw new Error(`Database error: ${txErr.message}`)

      // Load participant names (id → name map)
      const participantIds = [...new Set(recordings.map(r => r.participant_id).filter(Boolean))]
      let nameById = {}
      if (participantIds.length) {
        const { data: parts } = await db.raw.participants()
          .select('id, name')
          .in('id', participantIds)
        for (const p of parts || []) nameById[p.id] = p.name
      }

      // Index transcripts by recording_id
      const txByRecordingId = {}
      for (const tx of transcriptRows || []) txByRecordingId[tx.recording_id] = tx

      // Assemble result — one entry per recording
      const transcripts = recordings.map(rec => {
        const tx = txByRecordingId[rec.id]
        const entry = {
          recording_id: rec.id,
          tid: rec.tid,
          participant_name: nameById[rec.participant_id] ?? null,
          duration_ms: rec.duration_ms ?? null,
          duration_formatted: rec.duration_ms ? formatDuration(rec.duration_ms) : null,
          recorded_at: rec.created_at,
          transcript_status: tx?.status ?? 'no_transcript',
          transcript_text: tx?.status === 'done' ? (tx.transcript_text ?? null) : null,
          model_used: tx?.model_used ?? null,
          error_message: tx?.status === 'error' ? (tx.error_message ?? null) : null,
          transcript_created_at: tx?.created_at ?? null,
        }
        if (include_segments && tx?.status === 'done') {
          entry.segments = tx.segments ?? []
        }
        return entry
      })

      const doneCount = transcripts.filter(t => t.transcript_status === 'done').length

      const result = {
        test_id,
        total_recordings: recordings.length,
        transcripts_done: doneCount,
        transcripts,
      }

      log('get_transcripts', db.teamId, Date.now() - t0)
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
      }
    }
  )
}

function formatDuration(ms) {
  const totalSec = Math.round(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) return `${h}h ${m}m ${s}s`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}
