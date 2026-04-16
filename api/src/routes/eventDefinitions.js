import { Router } from 'express'
import db from '../db.js'
import adminDb from '../db-admin.js'
import { requireAuth } from '../middleware/auth.js'
import { generateEventTaxonomy } from '../services/eventTaxonomy.js'
import { fetchAllPages } from '../lib/supabasePaginate.js'

const router = Router()

// ── Matching algorithm ─────────────────────────────────────────────────────────
function matchesEventDefinition(event, def) {
  if (event.type !== def.type) return false
  const hasText     = def.text_pattern?.trim()
  const hasSelector = def.selector_pattern?.trim()
  const hasUrl      = def.url_pattern?.trim()
  if (!hasText && !hasSelector && !hasUrl) return false
  if (hasText && !(event.metadata?.text || '').toLowerCase().includes(hasText.toLowerCase())) return false
  if (hasSelector && !(event.selector || '').toLowerCase().includes(hasSelector.toLowerCase())) return false
  if (hasUrl && !(event.url || '').toLowerCase().includes(hasUrl.toLowerCase())) return false
  return true
}

// ── Ownership check helper ─────────────────────────────────────────────────────
async function verifyTestOwnership(testId, teamId) {
  let query = adminDb.from('tests').select('id').eq('id', testId)
  if (teamId) query = query.eq('team_id', teamId)
  const { data } = await query.single()
  return !!data
}

// ── Fetch events for a test and attach counts to definitions ──────────────────
async function attachCounts(testId, definitions) {
  const { data: events } = await fetchAllPages((from, to) =>
    adminDb
      .from('events')
      .select('type, selector, url, metadata')
      .eq('test_id', testId)
      .in('type', ['click', 'input_change'])
      .range(from, to)
  )

  const allEvents = events || []
  return definitions.map((def) => ({
    ...def,
    count: allEvents.filter((e) => matchesEventDefinition(e, def)).length
  }))
}

// ── POST /:testId/event-definitions/generate ──────────────────────────────────
router.post('/:testId/event-definitions/generate', requireAuth, async (req, res) => {
  const { testId } = req.params

  const owned = await verifyTestOwnership(testId, req.teamId)
  if (!owned) return res.status(404).json({ error: 'Test not found' })

  // Fetch all click + input_change events
  const { data: events, error: evErr } = await fetchAllPages((from, to) =>
    adminDb
      .from('events')
      .select('type, selector, url, metadata')
      .eq('test_id', testId)
      .in('type', ['click', 'input_change'])
      .range(from, to)
  )

  if (evErr) return res.status(500).json({ error: evErr.message })

  // Aggregate: group by { type, text, url }, count, sort desc, take top 40
  const buckets = {}
  for (const e of events || []) {
    const text = e.metadata?.text || ''
    const key = `${e.type}|||${text}|||${e.url || ''}`
    if (!buckets[key]) buckets[key] = { type: e.type, text, selector: e.selector || '', url: e.url || '', count: 0 }
    buckets[key].count++
  }

  const top40 = Object.values(buckets)
    .sort((a, b) => b.count - a.count)
    .slice(0, 40)
    .map((b, i) => ({ rank: i + 1, type: b.type, text: b.text, selector: b.selector, url: b.url, count: b.count }))

  if (top40.length === 0) {
    return res.json([])
  }

  // Generate taxonomy via GPT
  let newDefs
  try {
    newDefs = await generateEventTaxonomy({ interactions: top40 })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }

  // Delete existing definitions
  await adminDb.from('event_definitions').delete().eq('test_id', testId)

  // Insert new definitions
  if (newDefs.length > 0) {
    const rows = newDefs.map((d, i) => ({ ...d, test_id: testId, order_index: i }))
    const { data: inserted, error: insErr } = await adminDb
      .from('event_definitions')
      .insert(rows)
      .select()
    if (insErr) return res.status(500).json({ error: insErr.message })

    // Mark taxonomy as done
    await adminDb.from('tests').update({ taxonomy_status: 'done' }).eq('id', testId)

    // Return with live counts
    const withCounts = await attachCounts(testId, inserted)
    return res.json(withCounts)
  }

  await adminDb.from('tests').update({ taxonomy_status: 'done' }).eq('id', testId)
  return res.json([])
})

// ── GET /:testId/event-definitions ────────────────────────────────────────────
router.get('/:testId/event-definitions', requireAuth, async (req, res) => {
  const { testId } = req.params

  const owned = await verifyTestOwnership(testId, req.teamId)
  if (!owned) return res.status(404).json({ error: 'Test not found' })

  const { data: definitions, error } = await adminDb
    .from('event_definitions')
    .select('*')
    .eq('test_id', testId)
    .order('order_index')

  if (error) return res.status(500).json({ error: error.message })
  if (!definitions?.length) return res.json([])

  const withCounts = await attachCounts(testId, definitions)
  res.json(withCounts)
})

// ── PATCH /:testId/event-definitions/:id ──────────────────────────────────────
router.patch('/:testId/event-definitions/:id', requireAuth, async (req, res) => {
  const { testId, id } = req.params

  const owned = await verifyTestOwnership(testId, req.teamId)
  if (!owned) return res.status(404).json({ error: 'Test not found' })

  const allowed = ['name', 'description', 'selector_pattern', 'text_pattern', 'url_pattern']
  const updates = {}
  for (const key of allowed) {
    if (key in req.body) updates[key] = req.body[key]
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No valid fields to update' })
  }

  const { data: updated, error } = await adminDb
    .from('event_definitions')
    .update(updates)
    .eq('id', id)
    .eq('test_id', testId)
    .select()
    .single()

  if (error || !updated) return res.status(404).json({ error: 'Definition not found' })
  res.json(updated)
})

// ── DELETE /:testId/event-definitions/:id ────────────────────────────────────
router.delete('/:testId/event-definitions/:id', requireAuth, async (req, res) => {
  const { testId, id } = req.params

  const owned = await verifyTestOwnership(testId, req.teamId)
  if (!owned) return res.status(404).json({ error: 'Test not found' })

  const { error } = await adminDb
    .from('event_definitions')
    .delete()
    .eq('id', id)
    .eq('test_id', testId)

  if (error) return res.status(500).json({ error: error.message })
  res.json({ deleted: true })
})

export default router
