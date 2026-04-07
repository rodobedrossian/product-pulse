import jwt from 'jsonwebtoken'

export const RECORDING_JWT_AUD = 'recording-upload'
const DEFAULT_TTL_SEC = 120

function getSecret() {
  return process.env.RECORDING_JWT_SECRET || ''
}

/**
 * Mint a short-lived JWT for native/desktop recorder deep link + upload (Authorization: Bearer).
 * Server-only; never embed the secret in clients.
 */
export function mintRecordingToken({
  userId,
  testId,
  participantId,
  tid,
  teamId,
  ttlSec = DEFAULT_TTL_SEC
}) {
  const secret = getSecret()
  if (!secret) {
    throw new Error('RECORDING_JWT_SECRET is not configured')
  }
  const token = jwt.sign(
    {
      aud: RECORDING_JWT_AUD,
      sub: userId,
      test_id: testId,
      participant_id: participantId,
      tid,
      team_id: teamId ?? null
    },
    secret,
    { algorithm: 'HS256', expiresIn: ttlSec }
  )
  const decoded = jwt.decode(token)
  const exp = typeof decoded?.exp === 'number' ? decoded.exp : Math.floor(Date.now() / 1000) + ttlSec
  return { token, expires_at: new Date(exp * 1000).toISOString() }
}

export function verifyRecordingToken(token) {
  const secret = getSecret()
  if (!secret || !token) return null
  try {
    const payload = jwt.verify(token, secret, {
      algorithms: ['HS256'],
      audience: RECORDING_JWT_AUD
    })
    if (!payload.test_id || !payload.participant_id) return null
    return payload
  } catch {
    return null
  }
}

export function recordingTokenTtlSeconds() {
  return parseInt(process.env.RECORDING_JWT_TTL_SEC || String(DEFAULT_TTL_SEC), 10) || DEFAULT_TTL_SEC
}
