import { createHash } from 'crypto'
import { adminDb } from './db.js'
import { logError } from './utils/log.js'

/**
 * Resolves an authentication token to a teamId.
 *
 * Two token types are supported:
 *   1. MCP Access Token  — starts with "pp_mcp_", validated by SHA-256 hash lookup
 *   2. Supabase JWT      — legacy / stdio dev flow, validated via Supabase Auth
 *
 * @param {string} token
 * @returns {{ userId: string|null, teamId: string }}
 * @throws on invalid, expired, or revoked token
 */
export async function resolveToken(token) {
  if (!token) throw new Error('Missing authentication token')

  // ── MCP Access Token path ──────────────────────────────────────────────────
  if (token.startsWith('pp_mcp_')) {
    const hash = createHash('sha256').update(token).digest('hex')

    const { data, error } = await adminDb
      .from('mcp_tokens')
      .select('team_id, revoked')
      .eq('token_hash', hash)
      .single()

    if (error || !data) {
      logError('auth', 'Invalid MCP token')
      throw new Error('Invalid or revoked MCP token')
    }

    if (data.revoked) {
      logError('auth', 'Revoked MCP token used')
      throw new Error('Invalid or revoked MCP token')
    }

    // Fire-and-forget: update last_used_at without blocking the request
    adminDb
      .from('mcp_tokens')
      .update({ last_used_at: new Date().toISOString() })
      .eq('token_hash', hash)
      .then(() => {})
      .catch(() => {})

    return { userId: null, teamId: data.team_id }
  }

  // ── Supabase JWT path (stdio dev / legacy) ─────────────────────────────────
  const { data: { user }, error } = await adminDb.auth.getUser(token)
  if (error || !user) {
    logError('auth', 'Invalid or expired token')
    throw new Error('Invalid or expired token')
  }

  const { data: profile, error: profileError } = await adminDb
    .from('profiles')
    .select('team_id')
    .eq('id', user.id)
    .single()

  if (profileError || !profile?.team_id) {
    logError('auth', `No team assigned for user ${user.id}`)
    throw new Error('User has no team assigned. Complete onboarding first.')
  }

  return { userId: user.id, teamId: profile.team_id }
}
