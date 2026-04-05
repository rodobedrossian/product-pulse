import { Router } from 'express'
import db from '../db.js'
import adminDb from '../db-admin.js'

const router = Router()
const SCREENSHOT_BUCKET = 'event-screenshots'
const MAX_SCREENSHOT_BYTES = 4 * 1024 * 1024 // 4 MB — room for full-viewport JPEG at scale 1

function matchesGoal(event, def) {
  if (!def || !def.type) return false
  if (event.type !== def.type) return false
  const hasSelector = def.selector && def.selector !== ''
  const hasUrlPattern = def.url_pattern && def.url_pattern !== ''
  if (!hasSelector && !hasUrlPattern) return true
  // When both constraints are present, BOTH must match (AND).
  // OR logic caused false positives: url_pattern='/' matches every URL,
  // so any click completed the goal even when the selector didn't match.
  if (hasSelector && hasUrlPattern) {
    return event.selector === def.selector && !!event.url && event.url.includes(def.url_pattern)
  }
  if (hasSelector) return event.selector === def.selector
  return !!event.url && event.url.includes(def.url_pattern)
}

// POST /api/events — receive events from the snippet
router.post('/', async (req, res) => {
  const { tid, test_id, type, selector, url, metadata, timestamp, screenshot } = req.body

  if (!tid || !test_id || !type || !timestamp) {
    return res.status(400).json({ error: 'Missing required fields: tid, test_id, type, timestamp' })
  }

  // Insert event (return id so we can link the screenshot)
  const { data: inserted, error } = await db
    .from('events')
    .insert({ tid, test_id, type, selector, url, metadata, timestamp })
    .select('id')
    .single()

  if (error) return res.status(500).json({ error: error.message })

  // Respond immediately — screenshot upload + goal detection run async
  res.status(204).end()

  // ─── Screenshot upload (fire-and-forget) ───────────────────────────────────
  if (screenshot && inserted?.id) {
    try {
      const match = screenshot.match(/^data:image\/(\w+);base64,(.+)$/)
      if (match) {
        const buf = Buffer.from(match[2], 'base64')
        if (buf.length <= MAX_SCREENSHOT_BYTES) {
          const ext = match[1] === 'jpeg' || match[1] === 'jpg' ? 'jpg' : 'png'
          const key = `${test_id}/${tid}/${inserted.id}.${ext}`
          const { error: upErr } = await adminDb.storage
            .from(SCREENSHOT_BUCKET)
            .upload(key, buf, { contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}`, upsert: true })
          if (!upErr) {
            await adminDb.from('events').update({ screenshot_object_path: key }).eq('id', inserted.id)
          } else {
            console.error('Screenshot upload error:', upErr)
          }
        }
      }
    } catch (e) {
      console.error('Screenshot processing error:', e)
    }
  }

  // Load test to determine type and goal definition
  const { data: test } = await db
    .from('tests')
    .select('test_type, goal_event')
    .eq('id', test_id)
    .single()

  if (!test) return

  // ─── Scenario: per-step sequential goal detection ────────────────────────
  if (test.test_type === 'scenario') {
    const { data: steps } = await db
      .from('steps')
      .select('*')
      .eq('test_id', test_id)
      .order('order_index')

    if (!steps?.length) return

    for (const step of steps) {
      if (!step.goal_event?.type) continue
      if (!matchesGoal({ type, selector, url }, step.goal_event)) continue

      // Sequential gate: previous step must be completed first
      const prevStep = steps[step.order_index - 2] // order_index is 1-based
      if (prevStep) {
        const { data: prevResult } = await db
          .from('step_results')
          .select('completed')
          .eq('step_id', prevStep.id)
          .eq('tid', tid)
          .single()
        if (!prevResult?.completed) continue
      }

      // Already completed this step?
      const { data: existing } = await db
        .from('step_results')
        .select('completed')
        .eq('step_id', step.id)
        .eq('tid', tid)
        .single()
      if (existing?.completed) continue

      // Step start time: when previous step completed, or participant's first event
      let stepStartTs = null
      if (prevStep) {
        const { data: prevResult } = await db
          .from('step_results')
          .select('completed_at')
          .eq('step_id', prevStep.id)
          .eq('tid', tid)
          .single()
        if (prevResult?.completed_at) stepStartTs = new Date(prevResult.completed_at).getTime()
      }
      if (!stepStartTs) {
        const { data: firstEvents } = await db
          .from('events')
          .select('timestamp')
          .eq('tid', tid)
          .eq('test_id', test_id)
          .order('timestamp', { ascending: true })
          .limit(1)
        if (firstEvents?.[0]) stepStartTs = new Date(firstEvents[0].timestamp).getTime()
      }

      const now = new Date().toISOString()
      const goalTs = new Date(timestamp).getTime()
      const time_to_complete_ms = stepStartTs ? goalTs - stepStartTs : null

      const { data: participant } = await db
        .from('participants')
        .select('id')
        .eq('tid', tid)
        .eq('test_id', test_id)
        .single()

      await db.from('step_results').upsert({
        test_id,
        step_id: step.id,
        tid,
        participant_id: participant?.id ?? null,
        completed: true,
        completed_at: now,
        time_to_complete_ms,
        updated_at: now
      }, { onConflict: 'step_id,tid' })

      // Complete the replay when the final step is done
      if (step.order_index === steps.length) {
        await adminDb.from('session_replays')
          .update({ status: 'complete', completed_at: now, updated_at: now })
          .eq('tid', tid)
          .eq('test_id', test_id)
      }

      break // only one step can be completed per event
    }
    return // don't fall through to single-goal detection
  }

  // ─── Single goal detection ───────────────────────────────────────────────
  if (!test?.goal_event?.type) return
  if (!matchesGoal({ type, selector, url }, test.goal_event)) return

  // Already flagged as completed?
  const { data: existing } = await db
    .from('session_results')
    .select('completed')
    .eq('tid', tid)
    .single()

  if (existing?.completed) return

  // Time to complete: first event for this tid → this event
  const { data: firstEvents } = await db
    .from('events')
    .select('timestamp')
    .eq('tid', tid)
    .eq('test_id', test_id)
    .order('timestamp', { ascending: true })
    .limit(1)

  const firstTs = firstEvents?.[0]?.timestamp
  const time_to_complete_ms = firstTs
    ? new Date(timestamp).getTime() - new Date(firstTs).getTime()
    : null

  const { count } = await db
    .from('events')
    .select('id', { count: 'exact', head: true })
    .eq('tid', tid)
    .eq('test_id', test_id)

  const { data: participant } = await db
    .from('participants')
    .select('id')
    .eq('tid', tid)
    .single()

  const completedAt = new Date().toISOString()

  await db.from('session_results').upsert({
    test_id,
    participant_id: participant?.id ?? null,
    tid,
    completed: true,
    completed_at: timestamp,
    time_to_complete_ms,
    event_count: count ?? 0,
    updated_at: completedAt
  }, { onConflict: 'tid' })

  // Complete the replay on goal hit
  await adminDb.from('session_replays')
    .update({ status: 'complete', completed_at: completedAt, updated_at: completedAt })
    .eq('tid', tid)
    .eq('test_id', test_id)
})

export default router
