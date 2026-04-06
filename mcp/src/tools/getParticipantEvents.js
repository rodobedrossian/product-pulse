import { z } from 'zod'
import { validateTestOwnership, validateParticipantOwnership } from '../utils/validate.js'
import { log } from '../utils/log.js'

export function registerGetParticipantEvents(server, db) {
  server.tool(
    'get_participant_events',
    'Get the full event timeline for a specific participant session, showing every click, page navigation, and input interaction in chronological order with relative timestamps.',
    {
      test_id: z.string().uuid().describe('The test ID'),
      tid: z.string().describe('The participant tracking ID (tid) — available in get_test_results or get_scenario_results'),
      limit: z.number().int().min(1).max(500).default(200).optional()
        .describe('Maximum events to return (default 200, max 500)'),
    },
    async ({ test_id, tid, limit = 200 }) => {
      const t0 = Date.now()

      // Security: validate full ownership chain before loading any data
      await validateTestOwnership(db, test_id)
      await validateParticipantOwnership(db, tid, test_id)

      // Load participant name
      const { data: participant } = await db.raw.participants()
        .select('name')
        .eq('tid', tid)
        .eq('test_id', test_id)
        .single()

      // Load events
      const { data: events, error } = await db.raw.events()
        .select('id, type, selector, url, metadata, timestamp')
        .eq('tid', tid)
        .eq('test_id', test_id)
        .order('timestamp', { ascending: true })
        .limit(limit)

      if (error) throw new Error(`Database error: ${error.message}`)

      const firstTs = events[0] ? new Date(events[0].timestamp).getTime() : 0

      const result = {
        tid,
        test_id,
        participant_name: participant?.name ?? null,
        event_count: events.length,
        truncated: events.length === limit,
        events: events.map(e => ({
          id: e.id,
          type: e.type,
          selector: e.selector,
          url: e.url,
          metadata: e.metadata,
          timestamp: e.timestamp,
          relative_ms: new Date(e.timestamp).getTime() - firstTs,
          relative_formatted: formatRelative(new Date(e.timestamp).getTime() - firstTs),
        }))
      }

      log('get_participant_events', db.teamId, Date.now() - t0)
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
      }
    }
  )
}

function formatRelative(ms) {
  const s = Math.round(ms / 1000)
  const m = Math.floor(s / 60)
  const sec = s % 60
  if (m === 0) return `+${sec}s`
  return `+${m}m ${sec}s`
}
