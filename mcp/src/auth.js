import { adminDb } from './db.js'
import { logError } from './utils/log.js'

/**
 * Validates a Supabase JWT and returns the authenticated user's teamId.
 * Throws a plain Error on failure — MCP SDK converts it to a proper error response.
 *
 * @param {string} token - Supabase access token (Bearer JWT)
 * @returns {{ userId: string, teamId: string }}
 */
export async function resolveToken(token) {
  if (!token) throw new Error('Missing authentication token')

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
