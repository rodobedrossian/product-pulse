import { createClient } from '@supabase/supabase-js'

// Service-role client — bypasses RLS. Used ONLY by auth.js for JWT validation.
// Tools must never import this directly — use createScopedDb() instead.
const adminDb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export { adminDb }

/**
 * Creates a query helper scoped to a specific team.
 *
 * The `tests()` builder always applies `.eq('team_id', teamId)` — the
 * team_id filter cannot be omitted. Child tables (events, participants,
 * etc.) are accessible via `.raw.*` but MUST be gated by validateOwnership
 * helpers before use.
 *
 * @param {string} teamId - The authenticated user's team ID
 */
export function createScopedDb(teamId) {
  return {
    teamId, // exposed for logging

    // Team-scoped query builder for tests.
    // Always applies .eq('team_id', teamId) — the team filter cannot be omitted.
    // Usage: db.tests('id, name').eq('id', testId).single()
    //        db.tests('id', { count: 'exact', head: true })
    tests: (columns = '*', options) => adminDb.from('tests').select(columns, options).eq('team_id', teamId),

    // Child tables — only accessible after validateOwnership() checks
    raw: {
      participants: () => adminDb.from('participants'),
      events: () => adminDb.from('events'),
      session_results: () => adminDb.from('session_results'),
      steps: () => adminDb.from('steps'),
      step_results: () => adminDb.from('step_results'),
      session_replays: () => adminDb.from('session_replays'),
      profiles: () => adminDb.from('profiles'),
      teams: () => adminDb.from('teams'),
    }
  }
}
