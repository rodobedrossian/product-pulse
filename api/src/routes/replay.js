import { Router } from 'express'
import db from '../db.js'
import adminDb from '../db-admin.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()
const BUCKET = 'session-replays'

function storageKey(testId, tid, partIndex) {
  return `${testId}/${tid}/part_${String(partIndex).padStart(4, '0')}.json`
}

// POST /api/replay/chunk — receive a batch of rrweb events from the snippet
router.post('/replay/chunk', async (req, res) => {
  const { tid, test_id, part_index, events } = req.body

  if (!tid || !test_id || part_index == null || !Array.isArray(events)) {
    return res.status(400).json({ error: 'Missing required fields: tid, test_id, part_index, events' })
  }

  // Validate participant
  const { data: participant } = await db
    .from('participants')
    .select('id')
    .eq('tid', tid)
    .eq('test_id', test_id)
    .single()

  if (!participant) return res.status(404).json({ error: 'Participant not found' })

  // Upload chunk to Storage
  const key = storageKey(test_id, tid, part_index)
  const payload = JSON.stringify(events)
  const byteCount = Buffer.byteLength(payload, 'utf8')

  const { error: uploadError } = await adminDb.storage
    .from(BUCKET)
    .upload(key, payload, { contentType: 'application/json', upsert: true })

  if (uploadError) {
    console.error('Storage upload error:', uploadError)
    return res.status(500).json({ error: 'Failed to store chunk' })
  }

  // Upsert session_replays row — chunks are sequential so chunk_count = part_index + 1 is safe
  const now = new Date().toISOString()
  const { error: dbError } = await adminDb
    .from('session_replays')
    .upsert({
      test_id,
      tid,
      participant_id: participant.id,
      status: 'recording',
      chunk_count: part_index + 1,
      total_bytes: byteCount,
      format_version: 'rrweb@2',
      updated_at: now
    }, { onConflict: 'tid' })

  if (dbError) {
    console.error('DB upsert error:', dbError)
    // Non-fatal — chunk is already in storage
  }

  res.status(204).end()
})

// POST /api/replay/complete — mark the session as fully recorded
router.post('/replay/complete', async (req, res) => {
  const { tid, test_id } = req.body
  if (!tid || !test_id) return res.status(400).json({ error: 'Missing tid or test_id' })

  const now = new Date().toISOString()
  await adminDb
    .from('session_replays')
    .update({ status: 'complete', completed_at: now, updated_at: now })
    .eq('tid', tid)
    .eq('test_id', test_id)

  res.status(204).end()
})

const CHUNK_BATCH_SIZE = 20  // parallel downloads per batch — limits peak memory
const MAX_CHUNKS = 150        // hard cap (~7.5 min at 3s flush interval)

// GET /api/tests/:testId/replay/:tid — load and merge all chunks (protected)
router.get('/tests/:testId/replay/:tid', requireAuth, async (req, res) => {
  const { testId, tid } = req.params

  const { data: replay } = await adminDb
    .from('session_replays')
    .select('*')
    .eq('test_id', testId)
    .eq('tid', tid)
    .single()

  if (!replay) return res.status(404).json({ error: 'No replay found for this participant' })

  // List actual files in storage — avoids "Object not found" when chunk_count is
  // ahead of what was successfully uploaded (e.g. last chunk upload failed).
  const { data: files, error: listError } = await adminDb.storage
    .from(BUCKET)
    .list(`${testId}/${tid}`, { limit: 1000, sortBy: { column: 'name', order: 'asc' } })

  if (listError || !files?.length) {
    return res.status(404).json({ error: 'Replay recording is empty or could not be listed' })
  }

  const chunkFiles = files
    .filter(f => /^part_\d+\.json$/.test(f.name))
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, MAX_CHUNKS)

  if (chunkFiles.length === 0) {
    return res.status(404).json({ error: 'No replay chunks found' })
  }

  // Download in sequential batches to keep memory bounded.
  // Each batch is parallel within itself; batches run one at a time.
  const allEvents = []

  for (let i = 0; i < chunkFiles.length; i += CHUNK_BATCH_SIZE) {
    const batch = chunkFiles.slice(i, i + CHUNK_BATCH_SIZE)

    const results = await Promise.all(
      batch.map(async (file) => {
        const key = `${testId}/${tid}/${file.name}`
        const { data: fileData, error } = await adminDb.storage
          .from(BUCKET)
          .download(key)

        if (error || !fileData) {
          console.error(`Failed to download ${file.name} for ${tid}:`, error)
          return null
        }

        try {
          const text = await fileData.text()
          return JSON.parse(text)
        } catch (parseErr) {
          console.error(`Failed to parse ${file.name}:`, parseErr)
          return null
        }
      })
    )

    for (const chunk of results) {
      if (chunk) allEvents.push(...chunk)
    }

    // Yield to the event loop between batches so GC can run
    await new Promise(resolve => setImmediate(resolve))
  }

  if (allEvents.length === 0) {
    return res.status(404).json({ error: 'Replay data could not be loaded' })
  }

  // Sort by timestamp to handle any out-of-order delivery
  allEvents.sort((a, b) => a.timestamp - b.timestamp)

  const truncated = chunkFiles.length === MAX_CHUNKS && files.length > MAX_CHUNKS

  res.json({
    tid,
    test_id: testId,
    status: replay.status,
    chunk_count: chunkFiles.length,
    truncated,
    events: allEvents
  })
})

export default router
