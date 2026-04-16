import { Router } from 'express'
import { randomUUID } from 'crypto'
import db from '../db.js'
import adminDb from '../db-admin.js'
import { fetchAllPages } from '../lib/supabasePaginate.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()

// POST /api/tests/:id/participants — add participant, return sharable link (directed tests only)
router.post('/:id/participants', async (req, res) => {
  const { id } = req.params
  const { name } = req.body

  if (!name) return res.status(400).json({ error: 'name is required' })

  const { data: test, error: testError } = await db
    .from('tests')
    .select('id, test_type, prototype_url')
    .eq('id', id)
    .single()

  if (testError || !test) return res.status(404).json({ error: 'Test not found' })
  if (test.test_type === 'observational') {
    return res.status(400).json({ error: 'Observational tests use auto-session — use POST /auto-session instead' })
  }

  const tid = randomUUID()

  const { data: participant, error } = await db
    .from('participants')
    .insert({ test_id: id, name, tid })
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })

  let link = ''
  try {
    const protoUrl = new URL(test.prototype_url)
    protoUrl.searchParams.set('__tid', tid)
    protoUrl.searchParams.set('__test_id', id)
    link = protoUrl.toString()
  } catch {
    link = ''
  }

  res.status(201).json({ ...participant, link })
})

// PATCH /api/tests/:testId/participants/:participantId/tracking — stop or resume event capture
// Body: { stopped: true } to halt, { stopped: false } to resume.
// Moderator only — requires auth.
router.patch('/:testId/participants/:participantId/tracking', requireAuth, async (req, res) => {
  const { testId, participantId } = req.params
  const { stopped } = req.body

  if (typeof stopped !== 'boolean') {
    return res.status(400).json({ error: '"stopped" must be a boolean' })
  }

  // Verify the test belongs to this team
  let testQuery = db.from('tests').select('id').eq('id', testId)
  if (req.teamId) testQuery = testQuery.eq('team_id', req.teamId)
  const { data: test } = await testQuery.single()
  if (!test) return res.status(404).json({ error: 'Test not found' })

  const tracking_stopped_at = stopped ? new Date().toISOString() : null

  const { data: updated, error } = await db
    .from('participants')
    .update({ tracking_stopped_at })
    .eq('id', participantId)
    .eq('test_id', testId)
    .select('id, tid, name, tracking_stopped_at')
    .single()

  if (error || !updated) return res.status(404).json({ error: 'Participant not found' })

  res.json(updated)
})

// DELETE /api/tests/:testId/participants/:participantId — permanently remove a participant
// and all their associated data (events, step_results, session_results, replay, screenshots).
router.delete('/:testId/participants/:participantId', requireAuth, async (req, res) => {
  const { testId, participantId } = req.params

  // Verify the test belongs to this team
  let testQuery = db.from('tests').select('id').eq('id', testId)
  if (req.teamId) testQuery = testQuery.eq('team_id', req.teamId)
  const { data: test } = await testQuery.single()
  if (!test) return res.status(404).json({ error: 'Test not found' })

  // Get the participant (need tid + tester_id for cascade deletes)
  const { data: participant, error: pErr } = await adminDb
    .from('participants')
    .select('id, tid, tester_id')
    .eq('id', participantId)
    .eq('test_id', testId)
    .single()

  if (pErr || !participant) return res.status(404).json({ error: 'Participant not found' })

  const { tid, tester_id } = participant

  // ── 1. Collect screenshot storage paths before deleting events ──
  const { data: eventsWithScreenshots } = await adminDb
    .from('events')
    .select('screenshot_object_path')
    .eq('test_id', testId)
    .eq('tid', tid)
    .not('screenshot_object_path', 'is', null)

  // ── 2. Delete DB rows (order respects FK dependencies) ──
  await adminDb.from('events').delete().eq('test_id', testId).eq('tid', tid)
  await adminDb.from('step_results').delete().eq('test_id', testId).eq('tid', tid)
  await adminDb.from('session_results').delete().eq('test_id', testId).eq('tid', tid)

  // session_replays uses tid as unique key
  await adminDb.from('session_replays').delete().eq('test_id', testId).eq('tid', tid)

  // ── 3. Delete the participant row ──
  await adminDb.from('participants').delete().eq('id', participantId)

  // ── 4. Delete tester row if no other participants reference it ──
  if (tester_id) {
    const { count } = await adminDb
      .from('participants')
      .select('id', { count: 'exact', head: true })
      .eq('tester_id', tester_id)
    if (count === 0) {
      await adminDb.from('testers').delete().eq('id', tester_id)
    }
  }

  // ── 5. Delete storage objects (fire-and-forget; non-fatal) ──
  setImmediate(async () => {
    try {
      // Session replay chunks + merged file
      const REPLAY_BUCKET = 'session-replays'
      const { data: replayFiles } = await adminDb.storage
        .from(REPLAY_BUCKET)
        .list(`${testId}/${tid}`, { limit: 1000 })
      if (replayFiles?.length) {
        const paths = replayFiles.map(f => `${testId}/${tid}/${f.name}`)
        await adminDb.storage.from(REPLAY_BUCKET).remove(paths)
      }
    } catch (e) {
      console.error(`[delete-participant] Replay storage cleanup failed for tid=${tid}:`, e?.message)
    }

    try {
      // Event screenshots
      const SCREENSHOT_BUCKET = 'event-screenshots'
      const screenshotPaths = (eventsWithScreenshots || [])
        .map(e => e.screenshot_object_path)
        .filter(Boolean)
      if (screenshotPaths.length > 0) {
        await adminDb.storage.from(SCREENSHOT_BUCKET).remove(screenshotPaths)
      }
    } catch (e) {
      console.error(`[delete-participant] Screenshot storage cleanup failed for tid=${tid}:`, e?.message)
    }
  })

  res.status(200).json({ deleted: true, tid })
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

  // 3. Load ALL events for this test (paginate — PostgREST caps at 1000 rows per request)
  const { data: allEvents, error: eventsError } = await fetchAllPages((from, to) =>
    db
      .from('events')
      .select('*')
      .eq('test_id', id)
      .order('timestamp', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to)
  )

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

  // ─── Observational results ─────────────────────────────────────────────────
  if (test.test_type === 'observational') {
    // Load IP blocklist for this team
    let blockedIps = []
    if (req.teamId) {
      const { data: teamRow } = await adminDb
        .from('teams')
        .select('blocked_ips')
        .eq('id', req.teamId)
        .single()
      blockedIps = teamRow?.blocked_ips || []
    }

    const blockedSet = new Set(blockedIps)
    const filteredParticipants = blockedSet.size > 0
      ? participants.filter((p) => !p.ip || !blockedSet.has(p.ip))
      : participants

    const { data: testers } = await db
      .from('testers')
      .select('id, tester_key, first_seen, last_seen, session_count')
      .eq('test_id', id)
      .order('first_seen', { ascending: false })

    const results = filteredParticipants.map((p) => {
      const events = eventsByTid[p.tid] || []
      const startTs = events.length ? new Date(events[0].timestamp).getTime() : null
      const endTs = events.length ? new Date(events[events.length - 1].timestamp).getTime() : null
      const duration_ms = startTs && endTs ? endTs - startTs : null
      const replayMeta = replayByTid[p.tid]
      const has_replay = !!(replayMeta && replayMeta.chunk_count > 0)
      return {
        participant_id: p.id,
        tid: p.tid,
        tester_id: p.tester_id,
        referrer: p.referrer || null,
        browser: p.browser || null,
        device_type: p.device_type || null,
        ip: p.ip || null,
        country: p.country || null,
        region: p.region || null,
        created_at: p.created_at,
        event_count: events.length,
        duration_ms,
        has_replay,
        events
      }
    })

    // Referrer domain breakdown
    const referrerCounts = {}
    for (const r of results) {
      let domain = 'Direct'
      if (r.referrer) {
        try { domain = new URL(r.referrer).hostname } catch { domain = r.referrer }
      }
      referrerCounts[domain] = (referrerCounts[domain] || 0) + 1
    }
    const referrers = Object.entries(referrerCounts)
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count)

    const uniqueTesters = (testers || []).length
    const returningTesters = (testers || []).filter((t) => t.session_count > 1).length

    return res.json({
      test_id: id,
      test_type: 'observational',
      research_intent: test.research_intent ?? null,
      context: test.context ?? null,
      total_sessions: participants.length,
      unique_testers: uniqueTesters,
      returning_testers: returningTesters,
      referrers,
      results
    })
  }

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

    return res.json({
      test_id: id,
      test_type: 'scenario',
      research_intent: test.research_intent ?? null,
      context: test.context ?? null,
      funnel,
      results
    })
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

  res.json({
    test_id: id,
    test_type: 'single',
    research_intent: test.research_intent ?? null,
    context: test.context ?? null,
    results
  })
})

export default router
