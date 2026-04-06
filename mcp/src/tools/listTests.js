import { z } from 'zod'
import { log } from '../utils/log.js'

export function registerListTests(server, db) {
  server.tool(
    'list_tests',
    'List all usability tests for your team, ordered by most recent. Returns test names, types (single-goal or scenario), IDs, and prototype URLs.',
    {
      limit: z.number().int().min(1).max(100).default(50).optional()
        .describe('Maximum number of tests to return (default 50, max 100)'),
    },
    async ({ limit = 50 }) => {
      const t0 = Date.now()

      const { data, error } = await db.tests('id, name, test_type, prototype_url, created_at')
        .order('created_at', { ascending: false })
        .limit(limit)

      if (error) throw new Error(`Database error: ${error.message}`)

      log('list_tests', db.teamId, Date.now() - t0)
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ tests: data, count: data.length }, null, 2)
        }]
      }
    }
  )
}
