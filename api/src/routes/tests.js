import { Router } from 'express'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import db from '../db.js'
import { requireAuth } from '../middleware/auth.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SNIPPET_PATH = join(__dirname, '../../snippet/protopulse.js')

const router = Router()

// POST /api/tests — create a new test
router.post('/', requireAuth, async (req, res) => {
  const { name, prototype_url, start_event, goal_event, test_type } = req.body

  if (!name || !prototype_url) {
    return res.status(400).json({ error: 'Missing required fields: name, prototype_url' })
  }

  const { data, error } = await db
    .from('tests')
    .insert({
      name,
      prototype_url,
      start_event: start_event ?? {},
      goal_event: goal_event ?? {},
      test_type: test_type === 'scenario' ? 'scenario' : 'single',
      team_id: req.teamId,
      created_by: req.user.id
    })
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json(data)
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
  const apiUrl = `${req.protocol}://${req.get('host')}`
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
router.get('/:id/tasks', async (req, res) => {
  const { id } = req.params
  const { data: test } = await db
    .from('tests')
    .select('test_type, goal_event')
    .eq('id', id)
    .single()

  if (!test) return res.status(404).json({ error: 'Test not found' })

  let steps = []
  if (test.test_type === 'scenario') {
    const { data } = await db
      .from('steps')
      .select('order_index, title, task, goal_event')
      .eq('test_id', id)
      .order('order_index')
    steps = data || []
  }

  res.json({ test_type: test.test_type, goal_event: test.goal_event, steps })
})

// GET /api/tests/:id/heartbeat — public (snippet polling)
router.get('/:id/heartbeat', async (req, res) => {
  const { id } = req.params
  const since = new Date(Date.now() - 60 * 1000).toISOString()

  const { data, error } = await db
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
  const { goal_event, start_event, name, prototype_url } = req.body
  const updates = {}
  if (goal_event !== undefined) updates.goal_event = goal_event
  if (start_event !== undefined) updates.start_event = start_event
  if (name !== undefined) updates.name = name
  if (prototype_url !== undefined) updates.prototype_url = prototype_url
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
    .order('created_at', { ascending: true })

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

  res.json({ ...test, participants, steps })
})

export default router
