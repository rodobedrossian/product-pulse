import { Router } from 'express'
import adminDb from '../db-admin.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()

async function loadTestForTeam(testId, teamId) {
  let q = adminDb.from('tests').select('id, team_id').eq('id', testId)
  if (teamId) q = q.eq('team_id', teamId)
  const { data, error } = await q.single()
  if (error || !data) return null
  if (teamId && data.team_id !== teamId) return null
  return data
}

// GET /api/tests/:testId/recordings/:recordingId/transcript
router.get('/:testId/recordings/:recordingId/transcript', requireAuth, async (req, res) => {
  const { testId, recordingId } = req.params

  const test = await loadTestForTeam(testId, req.teamId)
  if (!test) return res.status(404).json({ error: 'Test not found' })

  // Verify the recording belongs to this test
  const { data: rec, error: recErr } = await adminDb
    .from('participant_recordings')
    .select('id, test_id, tid, duration_ms, mime_type')
    .eq('id', recordingId)
    .eq('test_id', testId)
    .single()

  if (recErr || !rec) return res.status(404).json({ error: 'Recording not found' })

  const { data: transcript } = await adminDb
    .from('transcripts')
    .select('id, status, transcript_text, segments, insights, insights_status, insights_error, error_message, model_used, created_at, updated_at')
    .eq('recording_id', recordingId)
    .eq('test_id', testId)
    .maybeSingle()

  if (!transcript) {
    // No row yet — transcription hasn't started (e.g. recording uploaded before this feature)
    return res.status(404).json({ error: 'No transcript found for this recording' })
  }

  res.json(transcript)
})

// POST /api/tests/:testId/recordings/:recordingId/transcript/retry
// Allows re-triggering transcription for a recording that errored or has no transcript
router.post('/:testId/recordings/:recordingId/transcript/retry', requireAuth, async (req, res) => {
  const { testId, recordingId } = req.params

  const test = await loadTestForTeam(testId, req.teamId)
  if (!test) return res.status(404).json({ error: 'Test not found' })

  const { data: rec } = await adminDb
    .from('participant_recordings')
    .select('id, test_id, tid, audio_object_path, mime_type, byte_size')
    .eq('id', recordingId)
    .eq('test_id', testId)
    .single()

  if (!rec) return res.status(404).json({ error: 'Recording not found' })

  // Import and fire transcription asynchronously
  const { transcribeRecording } = await import('../services/transcription.js')
  transcribeRecording({
    id:                rec.id,
    test_id:           rec.test_id,
    tid:               rec.tid,
    audio_object_path: rec.audio_object_path,
    mime_type:         rec.mime_type,
    byte_size:         rec.byte_size,
  }).catch((err) => console.error('[transcription] retry error:', err))

  res.json({ status: 'processing', message: 'Transcription started' })
})

// POST /api/tests/:testId/recordings/:recordingId/transcript/insights/analyze
// Trigger on-demand insight analysis for a completed transcript
router.post('/:testId/recordings/:recordingId/transcript/insights/analyze', requireAuth, async (req, res) => {
  const { testId, recordingId } = req.params

  const test = await loadTestForTeam(testId, req.teamId)
  if (!test) return res.status(404).json({ error: 'Test not found' })

  const { data: rec } = await adminDb
    .from('participant_recordings')
    .select('id, test_id')
    .eq('id', recordingId)
    .eq('test_id', testId)
    .single()

  if (!rec) return res.status(404).json({ error: 'Recording not found' })

  const { data: transcript } = await adminDb
    .from('transcripts')
    .select('id, status, transcript_text, segments, insights_status')
    .eq('recording_id', recordingId)
    .eq('test_id', testId)
    .maybeSingle()

  if (!transcript) return res.status(404).json({ error: 'No transcript found — transcribe first' })
  if (transcript.status !== 'done') {
    return res.status(422).json({ error: 'Transcript must be complete before insight analysis' })
  }
  if (transcript.insights_status === 'processing') {
    return res.status(409).json({ error: 'Insight analysis already in progress' })
  }

  const { analyzeTranscript } = await import('../services/insights.js')
  analyzeTranscript({
    transcriptId:   transcript.id,
    transcriptText: transcript.transcript_text,
    segments:       transcript.segments,
  }).catch((err) => console.error('[insights] on-demand error:', err))

  res.json({ insights_status: 'processing', message: 'Insight analysis started' })
})

export default router
