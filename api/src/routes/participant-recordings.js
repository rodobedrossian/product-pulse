/**
 * Moderated session audio from the dashboard. Moderator obtains verbal consent on the call before pressing Record (no consent UI here).
 */
import { Router } from 'express'
import multer from 'multer'
import { randomUUID } from 'crypto'
import adminDb from '../db-admin.js'
import { requireAuth } from '../middleware/auth.js'
import { authenticateRecordingOrUser } from '../middleware/recordingAuth.js'
import { mintRecordingToken, recordingTokenTtlSeconds } from '../lib/recordingJwt.js'
import { transcribeRecording } from '../services/transcription.js'

const router = Router()
const BUCKET = 'participant-recordings'
const MAX_BYTES = 200 * 1024 * 1024 // 200 MB (long sessions upload 20-min segments ~15 MB each)

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES }
})

function extFromMime(mime) {
  const m = (mime || '').toLowerCase()
  if (m.includes('webm')) return 'webm'
  if (m.includes('mp4') || m.includes('m4a')) return 'm4a'
  if (m.includes('wav')) return 'wav'
  if (m.includes('mpeg') || m.includes('mp3')) return 'mp3'
  if (m.includes('ogg')) return 'ogg'
  return 'bin'
}

async function loadTestForTeam(testId, teamId) {
  let q = adminDb.from('tests').select('id, team_id').eq('id', testId)
  if (teamId) q = q.eq('team_id', teamId)
  const { data: test, error } = await q.single()
  if (error || !test) return null
  if (teamId && test.team_id !== teamId) return null
  return test
}

async function loadParticipant(testId, participantId) {
  const { data: p, error } = await adminDb
    .from('participants')
    .select('id, test_id, tid')
    .eq('id', participantId)
    .single()
  if (error || !p || p.test_id !== testId) return null
  return p
}

function teamIdForRequest(req) {
  return req.authKind === 'recording'
    ? req.recordingClaims?.team_id ?? null
    : req.teamId ?? null
}

// POST /api/tests/:id/participants/:participantId/recording-token — dashboard only; mints JWT for native app
router.post('/:id/participants/:participantId/recording-token', requireAuth, async (req, res) => {
  const { id: testId, participantId } = req.params
  const test = await loadTestForTeam(testId, req.teamId)
  if (!test) return res.status(404).json({ error: 'Test not found' })

  const participant = await loadParticipant(testId, participantId)
  if (!participant) return res.status(404).json({ error: 'Participant not found' })

  const ttlSec = recordingTokenTtlSeconds()
  let minted
  try {
    minted = mintRecordingToken({
      userId: req.user.id,
      testId,
      participantId,
      tid: participant.tid,
      teamId: test.team_id,
      ttlSec
    })
  } catch (e) {
    console.error('recording-token:', e)
    const body = { error: 'Recording token unavailable (server configuration)' }
    if (process.env.NODE_ENV !== 'production') {
      body.detail = e instanceof Error ? e.message : String(e)
    }
    return res.status(500).json(body)
  }

  const publicApi = (process.env.PUBLIC_API_URL || '').trim().replace(/\/$/, '')
  const tokenEnc = encodeURIComponent(minted.token)
  let deepLink = `productpulse://record?token=${tokenEnc}&test_id=${encodeURIComponent(testId)}&participant_id=${encodeURIComponent(participantId)}`
  if (publicApi) {
    deepLink += `&api_base=${encodeURIComponent(publicApi)}`
  }

  res.json({
    token: minted.token,
    expires_at: minted.expires_at,
    expires_in_seconds: ttlSec,
    deep_link: deepLink
  })
})

// POST /api/tests/:id/participants/:participantId/recordings — multipart field "audio"
router.post(
  '/:id/participants/:participantId/recordings',
  authenticateRecordingOrUser,
  (req, res, next) => {
    upload.single('audio')(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({ error: `File too large (max ${MAX_BYTES / (1024 * 1024)} MB)` })
        }
        return res.status(400).json({ error: err.message })
      }
      if (err) return next(err)
      next()
    })
  },
  async (req, res) => {
    const { id: testId, participantId } = req.params
    const file = req.file
    if (!file?.buffer?.length) {
      return res.status(400).json({ error: 'Missing audio file (field name: audio)' })
    }

    if (req.authKind === 'recording') {
      const c = req.recordingClaims
      if (
        String(c.test_id) !== String(testId) ||
        String(c.participant_id) !== String(participantId)
      ) {
        return res.status(403).json({ error: 'Token does not match this participant' })
      }
    }

    const test = await loadTestForTeam(testId, teamIdForRequest(req))
    if (!test) return res.status(404).json({ error: 'Test not found' })

    const participant = await loadParticipant(testId, participantId)
    if (!participant) return res.status(404).json({ error: 'Participant not found' })

    if (
      req.authKind === 'recording' &&
      req.recordingClaims.tid != null &&
      participant.tid !== req.recordingClaims.tid
    ) {
      return res.status(403).json({ error: 'Token does not match participant' })
    }

    const mimeType = file.mimetype || 'application/octet-stream'
    const ext = extFromMime(mimeType)
    const recordingId = randomUUID()
    const objectPath = `${testId}/${participantId}/${recordingId}.${ext}`

    let durationMs = null
    if (req.body?.duration_ms != null && req.body.duration_ms !== '') {
      const n = parseInt(String(req.body.duration_ms), 10)
      if (!Number.isNaN(n) && n >= 0) durationMs = n
    }

    // segment_index — present when the desktop app auto-splits long sessions.
    // null means the whole recording is a single file (legacy / short sessions).
    let segmentIndex = null
    if (req.body?.segment_index != null && req.body.segment_index !== '') {
      const n = parseInt(String(req.body.segment_index), 10)
      if (!Number.isNaN(n) && n >= 0) segmentIndex = n
    }

    const { error: upErr } = await adminDb.storage
      .from(BUCKET)
      .upload(objectPath, file.buffer, { contentType: mimeType, upsert: false })

    if (upErr) {
      console.error('participant-recordings upload:', upErr)
      return res.status(500).json({ error: upErr.message || 'Storage upload failed' })
    }

    const { data: row, error: insErr } = await adminDb
      .from('participant_recordings')
      .insert({
        id: recordingId,
        test_id: testId,
        participant_id: participantId,
        tid: participant.tid,
        audio_object_path: objectPath,
        mime_type: mimeType,
        byte_size: file.buffer.length,
        duration_ms: durationMs,
        segment_index: segmentIndex,
        created_by: req.user?.id ?? null
      })
      .select('id, participant_id, tid, mime_type, byte_size, duration_ms, created_at')
      .single()

    if (insErr) {
      console.error('participant_recordings insert:', insErr)
      await adminDb.storage.from(BUCKET).remove([objectPath]).catch(() => {})
      return res.status(500).json({ error: insErr.message })
    }

    res.status(201).json(row)

    // Fire-and-forget transcription — response already sent, so errors here only log
    transcribeRecording({
      id:                recordingId,
      test_id:           testId,
      tid:               participant.tid,
      audio_object_path: objectPath,
      mime_type:         mimeType,
      byte_size:         file.buffer.length,
    }).catch((err) => console.error('[transcription] unhandled error:', err))
  }
)

// GET /api/tests/:id/participants/:participantId/recordings
router.get('/:id/participants/:participantId/recordings', requireAuth, async (req, res) => {
  const { id: testId, participantId } = req.params

  const test = await loadTestForTeam(testId, req.teamId)
  if (!test) return res.status(404).json({ error: 'Test not found' })

  const participant = await loadParticipant(testId, participantId)
  if (!participant) return res.status(404).json({ error: 'Participant not found' })

  const { data, error } = await adminDb
    .from('participant_recordings')
    .select('id, participant_id, tid, mime_type, byte_size, duration_ms, created_at')
    .eq('test_id', testId)
    .eq('participant_id', participantId)
    .order('created_at', { ascending: false })

  if (error) return res.status(500).json({ error: error.message })
  res.json({ recordings: data || [] })
})

// GET /api/tests/:id/recordings/:recordingId/audio
router.get('/:id/recordings/:recordingId/audio', requireAuth, async (req, res) => {
  const { id: testId, recordingId } = req.params

  const test = await loadTestForTeam(testId, req.teamId)
  if (!test) return res.status(404).json({ error: 'Test not found' })

  const { data: row, error } = await adminDb
    .from('participant_recordings')
    .select('id, test_id, audio_object_path, mime_type')
    .eq('id', recordingId)
    .eq('test_id', testId)
    .single()

  if (error || !row) return res.status(404).json({ error: 'Recording not found' })

  const { data: file, error: dlErr } = await adminDb.storage.from(BUCKET).download(row.audio_object_path)
  if (dlErr || !file) {
    console.error('participant-recordings download:', dlErr)
    return res.status(404).json({ error: 'Audio file missing from storage' })
  }

  const buf = Buffer.from(await file.arrayBuffer())
  res.setHeader('Content-Type', row.mime_type || 'application/octet-stream')
  res.setHeader('Cache-Control', 'private, max-age=3600')
  res.send(buf)
})

export default router
