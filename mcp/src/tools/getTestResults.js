import { z } from 'zod'
import { validateTestOwnership } from '../utils/validate.js'
import { log } from '../utils/log.js'
import { computeMedian, computeAverage, formatDuration, completionRate, pct, sortedTimes } from '../utils/stats.js'

const PARTICIPANT_CAP = 100

export function registerGetTestResults(server, db) {
  server.tool(
    'get_test_results',
    'Get aggregate completion statistics for a single-goal usability test: completion rate, average and median time-to-goal, and a per-participant summary. For multi-step/scenario tests use get_scenario_results instead.',
    {
      test_id: z.string().uuid().describe('The test ID'),
    },
    async ({ test_id }) => {
      const t0 = Date.now()
      await validateTestOwnership(db, test_id)

      const { data: test } = await db.tests('id, name, test_type, goal_event, start_event, research_intent')
        .eq('id', test_id)
        .single()

      if (test.test_type === 'scenario') {
        throw new Error(`"${test.name}" is a scenario test. Use get_scenario_results instead.`)
      }

      // Load participants (capped)
      const { data: participants } = await db.raw.participants()
        .select('id, name, tid')
        .eq('test_id', test_id)
        .order('created_at', { ascending: true })
        .limit(PARTICIPANT_CAP)

      if (!participants?.length) {
        log('get_test_results', db.teamId, Date.now() - t0)
        return {
          content: [{ type: 'text', text: JSON.stringify({
            test_id, test_name: test.name, test_type: 'single',
            research_intent: test.research_intent ?? null,
            total_participants: 0, completed_count: 0,
            completion_rate_pct: '0%', avg_time_formatted: '—',
            median_time_formatted: '—', participants: []
          }, null, 2) }]
        }
      }

      // Load persisted session_results
      const { data: sessionResultsRows } = await db.raw.session_results()
        .select('tid, completed, time_to_complete_ms, event_count')
        .eq('test_id', test_id)

      const persistedByTid = {}
      for (const r of sessionResultsRows || []) persistedByTid[r.tid] = r

      // Build per-participant summary
      const participantSummary = participants.map(p => {
        const persisted = persistedByTid[p.tid]
        return {
          name: p.name,
          tid: p.tid,
          completed: persisted?.completed ?? false,
          time_to_complete_ms: persisted?.time_to_complete_ms ?? null,
          time_to_complete_formatted: formatDuration(persisted?.time_to_complete_ms),
          event_count: persisted?.event_count ?? 0,
        }
      })

      const completedParticipants = participantSummary.filter(p => p.completed)
      const rate = completionRate(completedParticipants.length, participants.length)
      const times = sortedTimes(completedParticipants)

      const result = {
        test_id,
        test_name: test.name,
        test_type: 'single',
        research_intent: test.research_intent ?? null,
        total_participants: participants.length,
        completed_count: completedParticipants.length,
        completion_rate: rate,
        completion_rate_pct: pct(rate),
        avg_time_ms: computeAverage(times),
        median_time_ms: computeMedian(times),
        avg_time_formatted: formatDuration(computeAverage(times)),
        median_time_formatted: formatDuration(computeMedian(times)),
        participants: participantSummary,
      }

      log('get_test_results', db.teamId, Date.now() - t0)
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
      }
    }
  )
}
