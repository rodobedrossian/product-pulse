import { z } from 'zod'
import { validateTestOwnership } from '../utils/validate.js'
import { log } from '../utils/log.js'

export function registerGetTest(server, db) {
  server.tool(
    'get_test',
    'Get full details of a single usability test including its goal definition, participant count, and steps (for scenario/multi-step tests).',
    {
      test_id: z.string().uuid().describe('The test ID'),
    },
    async ({ test_id }) => {
      const t0 = Date.now()
      await validateTestOwnership(db, test_id)

      // Load full test details
      const { data: test, error } = await db.tests('id, name, test_type, prototype_url, start_event, goal_event, research_intent, context, created_at')
        .eq('id', test_id)
        .single()
      if (error) throw new Error(`Database error: ${error.message}`)

      // Participant count
      const { count: participantCount } = await db.raw.participants()
        .select('id', { count: 'exact', head: true })
        .eq('test_id', test_id)

      // Steps (scenario tests only)
      let steps = []
      if (test.test_type === 'scenario') {
        const { data: stepsData } = await db.raw.steps()
          .select('id, order_index, title, task, goal_event')
          .eq('test_id', test_id)
          .order('order_index', { ascending: true })
        steps = stepsData || []
      }

      const result = {
        ...test,
        participant_count: participantCount ?? 0,
        steps,
      }

      log('get_test', db.teamId, Date.now() - t0)
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
      }
    }
  )
}
