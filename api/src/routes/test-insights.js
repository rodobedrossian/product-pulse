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

// GET /api/tests/:testId/insights
// Aggregates insight annotations across all participant recordings for a test
router.get('/:testId/insights', requireAuth, async (req, res) => {
  const { testId } = req.params

  const test = await loadTestForTeam(testId, req.teamId)
  if (!test) return res.status(404).json({ error: 'Test not found' })

  // Fetch all completed transcripts for this test that have insights
  const { data: transcripts, error } = await adminDb
    .from('transcripts')
    .select('id, tid, recording_id, insights, insights_status')
    .eq('test_id', testId)
    .eq('insights_status', 'done')
    .not('insights', 'is', null)

  if (error) return res.status(500).json({ error: error.message })
  if (!transcripts?.length) {
    return res.json({
      total_participants_with_insights: 0,
      type_counts: {},
      by_type: {},
    })
  }

  // Fetch participant names via recording_id → participant_recordings → participants
  const recordingIds = transcripts.map((t) => t.recording_id)
  const { data: recordings } = await adminDb
    .from('participant_recordings')
    .select('id, participant_id')
    .in('id', recordingIds)

  const participantIds = [...new Set((recordings || []).map((r) => r.participant_id).filter(Boolean))]
  const { data: participants } = await adminDb
    .from('participants')
    .select('id, name')
    .in('id', participantIds)

  // Build lookup maps
  const recToParticipant = {}
  for (const rec of (recordings || [])) {
    recToParticipant[rec.id] = rec.participant_id
  }
  const participantById = {}
  for (const p of (participants || [])) {
    participantById[p.id] = p
  }

  // Aggregate insights across all transcripts
  const type_counts = {}
  const by_type = {}
  const participantSet = new Set()

  for (const transcript of transcripts) {
    if (!Array.isArray(transcript.insights)) continue

    const participantId = recToParticipant[transcript.recording_id]
    const participant = participantId ? participantById[participantId] : null
    if (participantId) participantSet.add(participantId)

    for (const insight of transcript.insights) {
      const { type, start, end, quote, label } = insight
      if (!type) continue

      type_counts[type] = (type_counts[type] || 0) + 1

      if (!by_type[type]) by_type[type] = []
      by_type[type].push({
        participant_name: participant?.name || 'Participant',
        participant_id:   participantId || null,
        recording_id:     transcript.recording_id,
        start:            start ?? null,
        end:              end ?? null,
        quote:            quote || '',
        label:            label || '',
      })
    }
  }

  // Sort each type's list by start time
  for (const type of Object.keys(by_type)) {
    by_type[type].sort((a, b) => (a.start ?? 0) - (b.start ?? 0))
  }

  res.json({
    total_participants_with_insights: participantSet.size,
    type_counts,
    by_type,
  })
})

export default router
