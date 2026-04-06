/**
 * Ownership validation helpers.
 *
 * Every tool that accepts test_id as input MUST call validateTestOwnership first.
 * Tools that also accept tid MUST additionally call validateParticipantOwnership.
 *
 * These helpers are the security boundary for child-table access — they ensure
 * that resources belong to the authenticated team before any data is returned.
 */

/**
 * Verifies a test belongs to the authenticated team.
 * Uses db.tests() which has team_id baked in — cross-team access is impossible.
 *
 * @param {ReturnType<import('../db.js').createScopedDb>} db
 * @param {string} testId
 * @throws if test not found or not owned by team
 */
export async function validateTestOwnership(db, testId) {
  const { data, error } = await db.tests('id').eq('id', testId).single()
  if (error || !data) throw new Error(`Test not found or access denied`)
  return data
}

/**
 * Verifies a participant (tid) belongs to a specific test.
 * Call this AFTER validateTestOwnership — the testId is already team-verified.
 *
 * @param {ReturnType<import('../db.js').createScopedDb>} db
 * @param {string} tid - participant tracking ID
 * @param {string} testId - must already be verified as team-owned
 * @throws if participant not found in this test
 */
export async function validateParticipantOwnership(db, tid, testId) {
  const { data, error } = await db.raw.participants()
    .select('tid')
    .eq('tid', tid)
    .eq('test_id', testId)
    .single()
  if (error || !data) throw new Error(`Participant not found or access denied`)
  return data
}
