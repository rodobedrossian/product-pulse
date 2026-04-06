import { z } from 'zod'
import { validateTestOwnership } from '../utils/validate.js'
import { log } from '../utils/log.js'
import { computeMedian, formatDuration, completionRate, pct, sortedTimes } from '../utils/stats.js'

const PARTICIPANT_CAP = 100

export function registerGetScenarioResults(server, db) {
  server.tool(
    'get_scenario_results',
    'Get per-step completion funnel and drop-off analysis for a multi-step (scenario) usability test. Shows where participants are getting stuck or dropping off. For single-goal tests use get_test_results instead.',
    {
      test_id: z.string().uuid().describe('The scenario test ID'),
    },
    async ({ test_id }) => {
      const t0 = Date.now()
      await validateTestOwnership(db, test_id)

      const { data: test } = await db.tests('id, name, test_type, research_intent')
        .eq('id', test_id)
        .single()

      if (test.test_type !== 'scenario') {
        throw new Error(`"${test.name}" is a single-goal test. Use get_test_results instead.`)
      }

      // Load steps
      const { data: steps } = await db.raw.steps()
        .select('id, order_index, title, task')
        .eq('test_id', test_id)
        .order('order_index', { ascending: true })

      if (!steps?.length) {
        throw new Error(`No steps found for test "${test.name}"`)
      }

      // Load participants (capped)
      const { data: participants } = await db.raw.participants()
        .select('id, name, tid')
        .eq('test_id', test_id)
        .order('created_at', { ascending: true })
        .limit(PARTICIPANT_CAP)

      if (!participants?.length) {
        log('get_scenario_results', db.teamId, Date.now() - t0)
        return {
          content: [{ type: 'text', text: JSON.stringify({
            test_id, test_name: test.name, research_intent: test.research_intent ?? null, total_participants: 0,
            funnel: steps.map(s => ({ ...s, completion_count: 0, completion_rate_pct: '0%', median_time_formatted: '—', drop_off_count: 0 })),
            participants: []
          }, null, 2) }]
        }
      }

      // Load all step_results for this test
      const { data: allStepResults } = await db.raw.step_results()
        .select('step_id, tid, completed, time_to_complete_ms')
        .eq('test_id', test_id)

      // Index: stepId → tid → result
      const resultsByStep = {}
      for (const sr of allStepResults || []) {
        if (!resultsByStep[sr.step_id]) resultsByStep[sr.step_id] = {}
        resultsByStep[sr.step_id][sr.tid] = sr
      }

      const totalParticipants = participants.length

      // Funnel: per-step stats
      const funnel = steps.map((step, i) => {
        const completions = (allStepResults || []).filter(
          sr => sr.step_id === step.id && sr.completed
        )
        const times = sortedTimes(completions)
        const rate = completionRate(completions.length, totalParticipants)

        // Drop-off: how many fewer completed this step vs. previous
        const prevCompletions = i === 0 ? totalParticipants : (
          (allStepResults || []).filter(sr => sr.step_id === steps[i - 1].id && sr.completed).length
        )

        return {
          order_index: step.order_index,
          title: step.title,
          task: step.task,
          completion_count: completions.length,
          completion_rate: rate,
          completion_rate_pct: pct(rate),
          median_time_ms: computeMedian(times),
          median_time_formatted: formatDuration(computeMedian(times)),
          drop_off_count: prevCompletions - completions.length,
        }
      })

      // Per-participant step breakdown
      const participantBreakdown = participants.map(p => ({
        name: p.name,
        tid: p.tid,
        steps: steps.map(s => {
          const sr = resultsByStep[s.id]?.[p.tid]
          return {
            order_index: s.order_index,
            title: s.title,
            completed: sr?.completed ?? false,
            time_to_complete_ms: sr?.time_to_complete_ms ?? null,
            time_to_complete_formatted: formatDuration(sr?.time_to_complete_ms ?? null),
          }
        }),
        steps_completed: steps.filter(s => resultsByStep[s.id]?.[p.tid]?.completed).length,
        fully_completed: steps.every(s => resultsByStep[s.id]?.[p.tid]?.completed),
      }))

      const result = {
        test_id,
        test_name: test.name,
        research_intent: test.research_intent ?? null,
        total_participants: totalParticipants,
        funnel,
        participants: participantBreakdown,
      }

      log('get_scenario_results', db.teamId, Date.now() - t0)
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
      }
    }
  )
}
