import { Router } from 'express'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { randomUUID } from 'crypto'
import db from '../db.js'
import adminDb from '../db-admin.js'
import { requireAuth } from '../middleware/auth.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SNIPPET_PATH = join(__dirname, '../../snippet/protopulse.js')

const router = Router()

const RESEARCH_INTENT_MAX = 2000

function normalizeResearchIntent(value) {
  if (value == null || value === '') return null
  const s = String(value).trim().slice(0, RESEARCH_INTENT_MAX)
  return s.length ? s : null
}

// POST /api/tests — create a new test
router.post('/', requireAuth, async (req, res) => {
  const { name, prototype_url, start_event, goal_event, test_type, research_intent } = req.body

  const resolvedType = ['single', 'scenario', 'observational'].includes(test_type) ? test_type : 'single'

  if (!name) {
    return res.status(400).json({ error: 'Missing required field: name' })
  }
  if (resolvedType !== 'observational' && !prototype_url) {
    return res.status(400).json({ error: 'Missing required field: prototype_url' })
  }

  const insertData = {
    name,
    test_type: resolvedType,
    research_intent: normalizeResearchIntent(research_intent),
    team_id: req.teamId,
    created_by: req.user.id
  }

  if (resolvedType !== 'observational') {
    insertData.prototype_url = prototype_url
    insertData.start_event = start_event ?? {}
    insertData.goal_event = goal_event ?? {}
  }

  const { data, error } = await db
    .from('tests')
    .insert(insertData)
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json(data)
})

// POST /api/tests/:id/auto-session — no auth; observational snippet creates a participant session
router.post('/:id/auto-session', async (req, res) => {
  const { id } = req.params
  const { tester_key, referrer, browser, device_type, tid: clientTid } = req.body

  if (!tester_key) return res.status(400).json({ error: 'tester_key is required' })

  // Use adminDb for public endpoints — bypasses RLS (tests table is protected)
  const { data: test } = await adminDb.from('tests').select('id, test_type').eq('id', id).single()
  if (!test) return res.status(404).json({ error: 'Test not found' })
  if (test.test_type !== 'observational') {
    return res.status(400).json({ error: 'This endpoint is only available for observational tests' })
  }

  // Extract IP — Railway sets X-Forwarded-For
  const forwarded = req.headers['x-forwarded-for']
  const ip = forwarded ? forwarded.split(',')[0].trim() : (req.ip || null)

  // Look up or create the tester (persistent identity across sessions)
  let testerId
  const { data: existingTester } = await adminDb
    .from('testers')
    .select('id, session_count')
    .eq('tester_key', tester_key)
    .maybeSingle()

  if (existingTester) {
    testerId = existingTester.id
    await adminDb
      .from('testers')
      .update({ last_seen: new Date().toISOString(), session_count: existingTester.session_count + 1 })
      .eq('id', testerId)
  } else {
    const { data: newTester, error: testerErr } = await adminDb
      .from('testers')
      .insert({ test_id: id, tester_key })
      .select('id')
      .single()
    if (testerErr) return res.status(500).json({ error: testerErr.message })
    testerId = newTester.id
  }

  // Create a new participant session using the client-provided tid so events already
  // sent under that tid are correctly associated with this participant record.
  const tid = (clientTid && clientTid.length > 4) ? clientTid : randomUUID()
  const { error: partErr } = await adminDb
    .from('participants')
    .insert({
      test_id: id,
      name: null,
      tid,
      tester_id: testerId,
      referrer: referrer || null,
      browser: browser || null,
      device_type: device_type || null,
      ip: ip || null
    })

  if (partErr) return res.status(500).json({ error: partErr.message })
  res.status(201).json({ tid })
})

// GET /api/tests — list tests for the current team
router.get('/', requireAuth, async (req, res) => {
  let query = db.from('tests').select('*').order('created_at', { ascending: false })

  if (req.teamId) {
    query = query.eq('team_id', req.teamId)
  } else {
    // User has no team yet — return empty list
    return res.json([])
  }

  const { data, error } = await query
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// GET /api/tests/:id/snippet.js — project-specific snippet (public — runs on prototype domain)
router.get('/:id/snippet.js', (req, res) => {
  const { id } = req.params
  // Railway (and most proxies) terminate TLS and forward as HTTP internally.
  // Use X-Forwarded-Proto to get the real external protocol.
  const proto = req.get('x-forwarded-proto') || req.protocol
  const apiUrl = `${proto}://${req.get('host')}`
  let source
  try {
    source = readFileSync(SNIPPET_PATH, 'utf8')
  } catch {
    return res.status(500).send('// Could not read snippet source')
  }
  const output = source
    .replace('__PRODUCT_PULSE_API_URL__', apiUrl)
    .replace('__PRODUCT_PULSE_TEST_ID__', id)
  res.setHeader('Content-Type', 'application/javascript')
  res.setHeader('Cache-Control', 'no-cache')
  res.send(output)
})

// GET /api/tests/:id/tasks — public endpoint for participant overlay
// Uses adminDb to bypass RLS — this is intentionally public (snippet calls it from any domain)
router.get('/:id/tasks', async (req, res) => {
  const { id } = req.params
  const { data: test } = await adminDb
    .from('tests')
    .select('test_type, goal_event')
    .eq('id', id)
    .single()

  if (!test) return res.status(404).json({ error: 'Test not found' })

  let steps = []
  if (test.test_type === 'scenario') {
    const { data } = await adminDb
      .from('steps')
      .select('order_index, title, task, goal_event')
      .eq('test_id', id)
      .order('order_index')
    steps = data || []
  }

  res.json({ test_type: test.test_type, goal_event: test.goal_event, steps })
})

// GET /api/tests/:id/heartbeat — public (snippet polling)
// Uses adminDb to bypass RLS — called from the dashboard without participant auth
router.get('/:id/heartbeat', async (req, res) => {
  const { id } = req.params
  const since = new Date(Date.now() - 60 * 1000).toISOString()

  const { data, error } = await adminDb
    .from('events')
    .select('timestamp')
    .eq('test_id', id)
    .gte('timestamp', since)
    .order('timestamp', { ascending: false })
    .limit(1)

  if (error) return res.status(500).json({ error: error.message })

  const lastEvent = data && data[0]
  const active = !!lastEvent
  const secondsAgo = lastEvent
    ? Math.round((Date.now() - new Date(lastEvent.timestamp).getTime()) / 1000)
    : null

  res.json({ active, last_event_at: lastEvent?.timestamp ?? null, seconds_ago: secondsAgo })
})

// PATCH /api/tests/:id — partial update
router.patch('/:id', requireAuth, async (req, res) => {
  const { id } = req.params
  const { goal_event, start_event, name, prototype_url, research_intent } = req.body
  const updates = {}
  if (goal_event !== undefined) updates.goal_event = goal_event
  if (start_event !== undefined) updates.start_event = start_event
  if (name !== undefined) updates.name = name
  if (prototype_url !== undefined) updates.prototype_url = prototype_url
  if (research_intent !== undefined) updates.research_intent = normalizeResearchIntent(research_intent)
  if (Object.keys(updates).length === 0)
    return res.status(400).json({ error: 'No fields to update' })

  let query = db.from('tests').update(updates).eq('id', id)
  if (req.teamId) query = query.eq('team_id', req.teamId)

  const { data, error } = await query.select().single()
  if (error) return res.status(500).json({ error: error.message })
  if (!data) return res.status(404).json({ error: 'Test not found' })
  res.json(data)
})

// ─── Steps (scenario tests only) ────────────────────────────────────────────

// POST /api/tests/:id/steps — add a step
router.post('/:id/steps', requireAuth, async (req, res) => {
  const { id } = req.params
  const { title = '', task = '', follow_up = '' } = req.body

  const { data: last } = await db
    .from('steps')
    .select('order_index')
    .eq('test_id', id)
    .order('order_index', { ascending: false })
    .limit(1)
    .single()

  const order_index = (last?.order_index ?? 0) + 1

  const { data, error } = await db
    .from('steps')
    .insert({ test_id: id, order_index, title, task, follow_up, goal_event: {} })
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json(data)
})

// PATCH /api/tests/:id/steps/:stepId — update a step
router.patch('/:id/steps/:stepId', requireAuth, async (req, res) => {
  const { id, stepId } = req.params
  const { title, task, follow_up, goal_event } = req.body
  const updates = {}
  if (title !== undefined) updates.title = title
  if (task !== undefined) updates.task = task
  if (follow_up !== undefined) updates.follow_up = follow_up
  if (goal_event !== undefined) updates.goal_event = goal_event
  if (Object.keys(updates).length === 0)
    return res.status(400).json({ error: 'No fields to update' })

  const { data, error } = await db
    .from('steps')
    .update(updates)
    .eq('id', stepId)
    .eq('test_id', id)
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// DELETE /api/tests/:id/steps/:stepId — remove and re-sequence
router.delete('/:id/steps/:stepId', requireAuth, async (req, res) => {
  const { id, stepId } = req.params

  const { data: deleted } = await db
    .from('steps')
    .select('order_index')
    .eq('id', stepId)
    .eq('test_id', id)
    .single()

  const { error } = await db
    .from('steps')
    .delete()
    .eq('id', stepId)
    .eq('test_id', id)

  if (error) return res.status(500).json({ error: error.message })

  if (deleted?.order_index) {
    const { data: later } = await db
      .from('steps')
      .select('id, order_index')
      .eq('test_id', id)
      .gt('order_index', deleted.order_index)
      .order('order_index')

    for (const step of later || []) {
      await db.from('steps').update({ order_index: step.order_index - 1 }).eq('id', step.id)
    }
  }

  res.status(204).end()
})

// GET /api/tests/:id — test detail (protected)
router.get('/:id', requireAuth, async (req, res) => {
  const { id } = req.params

  let query = db.from('tests').select('*').eq('id', id)
  if (req.teamId) query = query.eq('team_id', req.teamId)

  const { data: test, error: testError } = await query.single()
  if (testError || !test) return res.status(404).json({ error: 'Test not found' })

  const { data: participants, error: partError } = await db
    .from('participants')
    .select('*')
    .eq('test_id', id)
    .order('created_at', { ascending: false })

  if (partError) return res.status(500).json({ error: partError.message })

  let steps = []
  if (test.test_type === 'scenario') {
    const { data: stepsData } = await db
      .from('steps')
      .select('*')
      .eq('test_id', id)
      .order('order_index')
    steps = stepsData || []
  }

  // For observational tests, include tester count
  let testerCount = null
  if (test.test_type === 'observational') {
    const { count } = await db
      .from('testers')
      .select('id', { count: 'exact', head: true })
      .eq('test_id', id)
    testerCount = count ?? 0
  }

  res.json({ ...test, participants: participants || [], steps, tester_count: testerCount })
})

export default router
