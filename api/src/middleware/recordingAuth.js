import adminDb from '../db-admin.js'
import { verifyRecordingToken } from '../lib/recordingJwt.js'

/**
 * Accept either a short-lived recording upload JWT (native app) or a normal Supabase session token (dashboard).
 */
export async function authenticateRecordingOrUser(req, res, next) {
  const raw = req.headers.authorization?.replace(/^Bearer\s+/i, '')
  if (!raw) return res.status(401).json({ error: 'Unauthorized' })

  const recordingPayload = verifyRecordingToken(raw)
  if (recordingPayload) {
    req.authKind = 'recording'
    req.recordingClaims = recordingPayload
    req.teamId = recordingPayload.team_id ?? null
    req.user = { id: recordingPayload.sub }
    req.profile = null
    return next()
  }

  const { data: { user }, error } = await adminDb.auth.getUser(raw)
  if (error || !user) return res.status(401).json({ error: 'Unauthorized' })

  const { data: profile } = await adminDb
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  req.authKind = 'user'
  req.recordingClaims = null
  req.user = user
  req.profile = profile
  req.teamId = profile?.team_id ?? null
  next()
}
