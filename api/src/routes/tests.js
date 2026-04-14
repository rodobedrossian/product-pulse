import { Router } from 'express'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { randomUUID } from 'crypto'
import db from '../db.js'
import adminDb from '../db-admin.js'
import { requireAuth } from '../middleware/auth.js'
import { fetchAllPages } from '../lib/supabasePaginate.js'

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

  // Blank tester_key (e.g. localStorage cleared) must not block registration — events still use tid.
  const effectiveTesterKey =
    typeof tester_key === 'string' && tester_key.trim().length > 0
      ? tester_key.trim()
      : `pp_${randomUUID().replace(/-/g, '').slice(0, 16)}`

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
    .eq('tester_key', effectiveTesterKey)
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
      .insert({ test_id: id, tester_key: effectiveTesterKey })
      .select('id')
      .single()
    if (testerErr) return res.status(500).json({ error: testerErr.message })
    testerId = newTester.id
  }

  // Create a new participant session using the client-provided tid so events already
  // sent under that tid are correctly associated with this participant record.
  const tid = (clientTid && clientTid.length > 4) ? clientTid : randomUUID()

  const { data: existingParticipant } = await adminDb
    .from('participants')
    .select('id, tid')
    .eq('test_id', id)
    .eq('tid', tid)
    .maybeSingle()

  if (existingParticipant) {
    return res.status(200).json({ tid: existingParticipant.tid })
  }

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
// Optional ?tid= query param: if supplied and that participant's tracking is stopped,
// returns { stop: true } so the tracker never starts capturing.
router.get('/:id/tasks', async (req, res) => {
  const { id } = req.params
  const { tid } = req.query

  const { data: test } = await adminDb
    .from('tests')
    .select('test_type, goal_event')
    .eq('id', id)
    .single()

  if (!test) return res.status(404).json({ error: 'Test not found' })

  // If a specific participant tid is provided, check whether the moderator
  // has stopped tracking for them before we bother loading anything else.
  if (tid) {
    const { data: p } = await adminDb
      .from('participants')
      .select('tracking_stopped_at')
      .eq('tid', tid)
      .eq('test_id', id)
      .maybeSingle()

    if (p?.tracking_stopped_at) {
      return res.json({ test_type: test.test_type, goal_event: test.goal_event, steps: [], stop: true })
    }
  }

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
  const { goal_event, start_event, name, prototype_url, research_intent, context } = req.body
  const updates = {}
  if (goal_event !== undefined) updates.goal_event = goal_event
  if (start_event !== undefined) updates.start_event = start_event
  if (name !== undefined) updates.name = name
  if (prototype_url !== undefined) updates.prototype_url = prototype_url
  if (research_intent !== undefined) updates.research_intent = normalizeResearchIntent(research_intent)
  if (context !== undefined) updates.context = context === '' ? null : String(context)
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

// Tallest observed document dimensions for this path (capped) — aligns heatmap stage
// with long pages and reduces gray gaps vs median-of-mixed sessions.
const HEATMAP_DOC_PX_CAP = 50000

function maxCapped(arr, cap) {
  if (!arr.length) return null
  const m = Math.max(...arr)
  if (cap != null && m > cap) return cap
  return m
}

// GET /api/tests/:id/heatmap — aggregated click + mousemove coords grouped by page path
router.get('/:id/heatmap', requireAuth, async (req, res) => {
  const { id } = req.params

  // Auth: test must belong to the caller's team
  let query = adminDb.from('tests').select('id').eq('id', id)
  if (req.teamId) query = query.eq('team_id', req.teamId)
  const { data: test } = await query.single()
  if (!test) return res.status(404).json({ error: 'Test not found' })

  // Pull all pointer events that carry coordinate data (paginate — default max 1000 rows)
  const { data: events, error } = await fetchAllPages((from, to) =>
    adminDb
      .from('events')
      .select(
        'id, type, x, y, vw, vh, doc_x, doc_y, doc_w_px, doc_h_px, scroll_y, url, metadata, screenshot_object_path, timestamp'
      )
      .eq('test_id', id)
      .in('type', ['click', 'mousemove_batch'])
      .not('url', 'is', null)
      .order('timestamp', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to)
  )

  if (error) return res.status(500).json({ error: error.message })
  if (!events?.length) return res.json({ pages: [] })

  // Group by normalised pathname (strip query string / hash)
  const pageMap = new Map()
  for (const ev of events) {
    let path = ev.url
    try { path = new URL(ev.url).pathname } catch { /* keep raw url */ }

    if (!pageMap.has(path)) {
      pageMap.set(path, {
        url: ev.url,
        path,
        clicks: [],
        moves: [],
        clicks_doc: [],
        moves_doc: [],
        doc_h_px_values: [],
        doc_w_px_values: [],
        background: null,
        // Scroll-section tiles: latest screenshot per scroll band (chronological merge)
        screenshotBands: new Map() // band_index → { path, scroll_y, vh }
      })
    }
    const page = pageMap.get(path)

    if (ev.type === 'click' && ev.x != null) {
      page.clicks.push({ x: ev.x, y: ev.y })
      if (ev.doc_x != null && ev.doc_y != null) {
        page.clicks_doc.push({ x: ev.doc_x, y: ev.doc_y })
        if (ev.doc_h_px != null) page.doc_h_px_values.push(ev.doc_h_px)
        if (ev.doc_w_px != null) page.doc_w_px_values.push(ev.doc_w_px)
      }
      // Use the first screenshot captured on this page as the viewport-mode background
      if (!page.background && ev.screenshot_object_path) {
        page.background = ev.screenshot_object_path
      }
      // Collect scroll-section screenshots for document-mode tiling.
      // Derive scroll_y from stored column, or from doc coords: scrollY ≈ doc_y*doc_h - y*vh
      if (ev.screenshot_object_path && ev.vh) {
        let scrollY = ev.scroll_y
        if (scrollY == null && ev.doc_y != null && ev.doc_h_px && ev.y != null) {
          scrollY = Math.round(ev.doc_y * ev.doc_h_px - ev.y * ev.vh)
        }
        if (scrollY != null && scrollY >= 0) {
          const band = Math.floor(scrollY / ev.vh)
          page.screenshotBands.set(band, {
            path: ev.screenshot_object_path,
            scroll_y: scrollY,
            vh: ev.vh
          })
        }
      }
    }

    if (ev.type === 'mousemove_batch' && Array.isArray(ev.metadata?.points)) {
      for (const pt of ev.metadata.points) {
        if (pt.x != null && pt.y != null) page.moves.push({ x: pt.x, y: pt.y })
        if (pt.dx != null && pt.dy != null) {
          page.moves_doc.push({ x: pt.dx, y: pt.dy })
          if (pt.dh != null) page.doc_h_px_values.push(pt.dh)
          if (pt.dw != null) page.doc_w_px_values.push(pt.dw)
        }
      }
      // Mousemove batches: tile from row scroll_y, or mean of per-point sy when present
      if (ev.screenshot_object_path && ev.vh) {
        let scrollYBatch = ev.scroll_y
        if ((scrollYBatch == null || scrollYBatch < 0) && Array.isArray(ev.metadata.points)) {
          const sys = ev.metadata.points
            .map((pt) => pt.sy)
            .filter((n) => typeof n === 'number' && !Number.isNaN(n))
          if (sys.length) {
            scrollYBatch = Math.round(sys.reduce((a, b) => a + b, 0) / sys.length)
          }
        }
        if (scrollYBatch != null && scrollYBatch >= 0) {
          const band = Math.floor(scrollYBatch / ev.vh)
          page.screenshotBands.set(band, {
            path: ev.screenshot_object_path,
            scroll_y: scrollYBatch,
            vh: ev.vh
          })
        }
      }
    }
  }

  const pages = Array.from(pageMap.values()).map((p) => {
    const docH = maxCapped(p.doc_h_px_values, HEATMAP_DOC_PX_CAP)
    const docW = maxCapped(p.doc_w_px_values, HEATMAP_DOC_PX_CAP)

    // Build sorted tile array from scroll-section screenshots
    const tiles = Array.from(p.screenshotBands.values())
      .sort((a, b) => a.scroll_y - b.scroll_y)
      .slice(0, 40) // cap payload; inner-scroll + flush-on-scroll yields more bands
      .map((t) => ({
        path: t.path,
        scroll_y_frac: docH ? t.scroll_y / docH : 0,
        height_frac: docH ? t.vh / docH : 1
      }))

    const tileHeightFracSum = tiles.reduce((s, t) => s + (t.height_frac || 0), 0)

    return {
      path: p.path,
      url: p.url,
      click_count: p.clicks.length,
      move_count: p.moves.length,
      clicks: p.clicks,
      moves: p.moves,
      clicks_doc: p.clicks_doc,
      moves_doc: p.moves_doc,
      max_doc_h_px: docH,
      max_doc_w_px: docW,
      background_path: p.background ?? null,
      background_tiles: tiles.length > 0 ? tiles : null,
      tile_height_frac_sum: tileHeightFracSum
    }
  })

  // Sort by total activity descending
  pages.sort((a, b) => (b.click_count + b.move_count) - (a.click_count + a.move_count))

  res.json({ pages })
})

export default router
