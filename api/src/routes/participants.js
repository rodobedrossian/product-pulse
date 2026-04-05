import { Router } from 'express'
import { randomUUID } from 'crypto'
import db from '../db.js'
import adminDb from '../db-admin.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()

// POST /api/tests/:id/participants — add participant, return sharable link
router.post('/:id/participants', async (req, res) => {
  const { id } = req.params
  const { name } = req.body

  if (!name) return res.status(400).json({ error: 'name is required' })

  const { data: test, error: testError } = await db
    .from('tests')
    .select('id, prototype_url')
    .eq('id', id)
    .single()

  if (testError || !test) return res.status(404).json({ error: 'Test not found' })

  const tid = randomUUID()

  const { data: participant, error } = await db
    .from('participants')
    .insert({ test_id: id, name, tid })
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })

  const protoUrl = new URL(test.prototype_url)
  protoUrl.searchParams.set('__tid', tid)
  protoUrl.searchParams.set('__test_id', id)

  res.status(201).json({ ...participant, link: protoUrl.toString() })
})

// GET /api/tests/:id/results — results per participant (protected)
router.get('/:id/results', requireAuth, async (req, res) => {
  const { id } = req.params

  // 1. Load the test (verify team ownership)
  let testQuery = db.from('tests').select('*').eq('id', id)
  if (req.teamId) testQuery = testQuery.eq('team_id', req.teamId)
  const { data: test, error: testError } = await testQuery.single()

  if (testError || !test) return res.status(404).json({ error: 'Test not found' })

  // 2. Load all participants
  const { data: participants, error: partError } = await db
    .from('participants')
    .select('*')
    .eq('test_id', id)
    .order('created_at', { ascending: true })

  if (partError) return res.status(500).json({ error: partError.message })

  // 3. Load ALL events for this test in one query (avoids N+1)
  const { data: allEvents, error: eventsError } = await db
    .from('events')
    .select('*')
    .eq('test_id', id)
    .order('timestamp', { ascending: true })

  if (eventsError) return res.status(500).json({ error: eventsError.message })

  // 4. Group events by tid for O(n) lookup
  const eventsByTid = {}
  for (const event of allEvents) {
    if (!eventsByTid[event.tid]) eventsByTid[event.tid] = []
    eventsByTid[event.tid].push(event)
  }

  // 5. Load session_replays to surface replay availability
  const { data: replayRows } = await adminDb
    .from('session_replays')
    .select('tid, status, chunk_count')
    .eq('test_id', id)

  const replayByTid = {}
  for (const r of replayRows || []) replayByTid[r.tid] = r

  // ─── Scenario results ──────────────────────────────────────────────────────
  if (test.test_type === 'scenario') {
    const { data: steps } = await db
      .from('steps')
      .select('*')
      .eq('test_id', id)
      .order('order_index')

    const { data: allStepResults } = await db
      .from('step_results')
      .select('*')
      .eq('test_id', id)

    // Group step_results by step_id → tid
    const resultsByStep = {}
    for (const sr of allStepResults || []) {
      if (!resultsByStep[sr.step_id]) resultsByStep[sr.step_id] = {}
      resultsByStep[sr.step_id][sr.tid] = sr
    }

    const results = participants.map((p) => {
      const events = eventsByTid[p.tid] || []
      const startTs = events[0] ? new Date(events[0].timestamp).getTime() : null

      const stepSummary = (steps || []).map((s) => {
        const sr = resultsByStep[s.id]?.[p.tid]
        return {
          step_id: s.id,
          order_index: s.order_index,
          title: s.title,
          completed: sr?.completed ?? false,
          completed_at: sr?.completed_at ?? null,
          time_to_complete_ms: sr?.time_to_complete_ms ?? null
        }
      })

      const completedCount = stepSummary.filter((s) => s.completed).length

      const eventsWithRelative = events.map((e) => ({
        ...e,
        relative_ms: startTs ? new Date(e.timestamp).getTime() - startTs : null
      }))

      return {
        participant_id: p.id,
        name: p.name,
        tid: p.tid,
        steps_completed: completedCount,
        total_steps: (steps || []).length,
        completed: completedCount === (steps || []).length && (steps || []).length > 0,
        has_replay: !!(replayByTid[p.tid]?.chunk_count > 0),
        event_count: events.length,
        steps: stepSummary,
        events: eventsWithRelative
      }
    })

    // Per-step funnel stats
    const funnel = (steps || []).map((s) => {
      const completions = (allStepResults || []).filter(
        (sr) => sr.step_id === s.id && sr.completed
      )
      const times = completions.map((sr) => sr.time_to_complete_ms).filter(Boolean)
      const sorted = [...times].sort((a, b) => a - b)
      return {
        step_id: s.id,
        order_index: s.order_index,
        title: s.title,
        task: s.task,
        follow_up: s.follow_up,
        goal_event: s.goal_event,
        completion_count: completions.length,
        completion_rate: participants.length > 0 ? completions.length / participants.length : 0,
        median_time_ms: sorted.length ? sorted[Math.floor(sorted.length / 2)] : null
      }
    })

    return res.json({ test_id: id, test_type: 'scenario', funnel, results })
  }

  // ─── Single-goal results (existing logic) ─────────────────────────────────

  // Load persisted session_results (written in real-time by POST /api/events)
  const { data: sessionResultsRows } = await db
    .from('session_results')
    .select('*')
    .eq('test_id', id)

  const persistedByTid = {}
  for (const r of sessionResultsRows || []) persistedByTid[r.tid] = r

  function matchesEventDef(event, def) {
    if (!def || !def.type) return false
    if (event.type !== def.type) return false
    const hasSelector = def.selector != null && def.selector !== ''
    const hasUrlPattern = def.url_pattern != null && def.url_pattern !== ''
    if (!hasSelector && !hasUrlPattern) return true
    if (hasSelector && hasUrlPattern) {
      return event.selector === def.selector && !!event.url && event.url.includes(def.url_pattern)
    }
    if (hasSelector) return event.selector === def.selector
    return !!event.url && event.url.includes(def.url_pattern)
  }

  const results = participants.map((participant) => {
    const events = eventsByTid[participant.tid] || []
    const persisted = persistedByTid[participant.tid]

    const hasStartDef = test.start_event && test.start_event.type
    const startMatch = hasStartDef
      ? events.find((e) => matchesEventDef(e, test.start_event))
      : events[0] || null

    const goalMatch = startMatch
      ? events.find(
          (e) =>
            matchesEventDef(e, test.goal_event) &&
            new Date(e.timestamp) >= new Date(startMatch.timestamp)
        )
      : null

    const completed = persisted?.completed ?? goalMatch != null

    const startTs = startMatch ? new Date(startMatch.timestamp).getTime() : null
    const goalTs = goalMatch
      ? new Date(goalMatch.timestamp).getTime()
      : persisted?.completed_at
        ? new Date(persisted.completed_at).getTime()
        : null

    const total_time_ms = persisted?.time_to_complete_ms
      ?? (startTs && goalTs ? goalTs - startTs : null)

    const eventsWithRelative = events.map((e) => ({
      ...e,
      relative_ms: startTs ? new Date(e.timestamp).getTime() - startTs : null
    }))

    const replayMeta = replayByTid[participant.tid]
    const has_replay = !!(
      replayMeta &&
      replayMeta.chunk_count > 0 &&
      (replayMeta.status === 'complete' || replayMeta.status === 'recording')
    )

    return {
      participant_id: participant.id,
      name: participant.name,
      tid: participant.tid,
      completed,
      total_time_ms,
      event_count: events.length,
      has_replay,
      events: eventsWithRelative
    }
  })

  res.json({ test_id: id, test_type: 'single', results })
})

export default router
