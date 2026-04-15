import { Router } from 'express'
import adminDb from '../db-admin.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()
const BUCKET = 'session-replays'
const MAX_CHUNKS = 600  // merge cap: ~30 min at 3s / ~10 min at 1s flush interval
const SIGNED_URL_TTL = 3600  // 1 hour
const MAX_MERGE_BYTES = 45 * 1024 * 1024  // 45 MB — Supabase storage object limit is ~50 MB
let activeMerges = 0
const MAX_CONCURRENT_MERGES = 2  // prevent simultaneous merges from exhausting heap

function storageKey(testId, tid, partIndex) {
  return `${testId}/${tid}/part_${String(partIndex).padStart(4, '0')}.json`
}

function mergedKey(testId, tid) {
  return `${testId}/${tid}/merged.json`
}

/** Participant row must be readable without a user JWT (snippet has no Supabase session). Use service role. */
async function loadParticipantForChunk(test_id, tid) {
  const attempts = 12
  const delayMs = 250
  for (let i = 0; i < attempts; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, delayMs))
    const { data } = await adminDb
      .from('participants')
      .select('id, tracking_stopped_at')
      .eq('tid', tid)
      .eq('test_id', test_id)
      .maybeSingle()
    if (data) return data
  }
  return null
}

// POST /api/replay/chunk — receive a batch of rrweb events from the snippet
router.post('/replay/chunk', async (req, res) => {
  const { tid, test_id, part_index, events } = req.body

  if (!tid || !test_id || part_index == null || !Array.isArray(events)) {
    return res.status(400).json({ error: 'Missing required fields: tid, test_id, part_index, events' })
  }

  // Try to find the participant. For observational tests the auto-session call may
  // still be in flight, so we retry for a few seconds. If the participant never
  // appears we still store the chunk — the session_replays row just gets a null
  // participant_id (which can be backfilled later).
  const participant = await loadParticipantForChunk(test_id, tid)

  // If moderator stopped tracking, signal the replay bundle to halt
  if (participant?.tracking_stopped_at) {
    return res.status(200).json({ stop: true })
  }

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

  // Upsert session_replays row
  const now = new Date().toISOString()
  const { error: dbError } = await adminDb
    .from('session_replays')
    .upsert({
      test_id,
      tid,
      participant_id: participant?.id ?? null,
      status: 'recording',
      chunk_count: part_index + 1,
      total_bytes: byteCount,
      format_version: 'rrweb@2',
      updated_at: now
    }, { onConflict: 'tid' })

  if (dbError) {
    console.error('DB upsert error:', dbError)
  }

  res.status(204).end()
})

// POST /api/replay/complete — mark session done and kick off background merge
router.post('/replay/complete', async (req, res) => {
  const { tid, test_id } = req.body
  if (!tid || !test_id) return res.status(400).json({ error: 'Missing tid or test_id' })

  const now = new Date().toISOString()
  await adminDb
    .from('session_replays')
    .update({ status: 'complete', completed_at: now, updated_at: now })
    .eq('tid', tid)
    .eq('test_id', test_id)

  // Respond immediately — merge happens in background
  res.status(204).end()

  // Fire-and-forget: concatenate chunks into a single merged.json string
  // without JSON.parse to keep memory minimal
  mergeChunksInBackground(test_id, tid).catch(err =>
    console.error(`Background merge failed for tid=${tid}:`, err)
  )
})

async function mergeChunksInBackground(testId, tid) {
  // Limit concurrent merges to avoid multiple large buffers in heap simultaneously
  if (activeMerges >= MAX_CONCURRENT_MERGES) {
    console.log(`Merge: deferred for tid=${tid} (${activeMerges} active merges)`)
    await new Promise(resolve => setTimeout(resolve, 5000 + Math.random() * 5000))
    if (activeMerges >= MAX_CONCURRENT_MERGES) {
      console.warn(`Merge: skipping tid=${tid} — too many concurrent merges`)
      return
    }
  }
  activeMerges++
  try {
    await _doMerge(testId, tid)
  } finally {
    activeMerges--
  }
}

async function _doMerge(testId, tid) {
  const { data: files } = await adminDb.storage
    .from(BUCKET)
    .list(`${testId}/${tid}`, { limit: 1000, sortBy: { column: 'name', order: 'asc' } })

  if (!files?.length) return

  const chunkFiles = files
    .filter(f => /^part_\d+\.json$/.test(f.name))
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, MAX_CHUNKS)

  if (chunkFiles.length === 0) return

  // Build merged JSON incrementally — never hold all chunks in memory simultaneously.
  // We stream-build the string and abort early if it would exceed storage limits.
  let merged = '{"events":['
  let first = true
  let actualChunks = 0

  for (const file of chunkFiles) {
    const key = `${testId}/${tid}/${file.name}`
    const { data, error } = await adminDb.storage.from(BUCKET).download(key)
    if (error || !data) {
      console.warn(`Merge: skipping missing chunk ${file.name} for tid=${tid}`)
      continue
    }

    const text = await data.text()
    // Each chunk is a JSON array: [event, event, ...]
    const inner = text.trim().slice(1, -1).trim()
    if (inner.length === 0) continue

    if (!first) merged += ','
    merged += inner
    first = false
    actualChunks++

    // Bail out if the merged content is already too large for Supabase storage
    if (Buffer.byteLength(merged, 'utf8') > MAX_MERGE_BYTES) {
      console.warn(`Merge: session for tid=${tid} exceeds ${MAX_MERGE_BYTES / 1024 / 1024}MB — skipping merge, chunks will be served individually`)
      return  // merged goes out of scope → GC can reclaim
    }

    // Yield between chunks so GC can run and other requests can be handled
    await new Promise(resolve => setImmediate(resolve))
  }

  if (actualChunks === 0) return

  merged += `],"chunk_count":${actualChunks},"truncated":${chunkFiles.length === MAX_CHUNKS}}`

  const { error: uploadErr } = await adminDb.storage
    .from(BUCKET)
    .upload(mergedKey(testId, tid), merged, {
      contentType: 'application/json',
      upsert: true
    })

  merged = null  // release before any async operations complete

  if (uploadErr) {
    console.error(`Merge upload failed for tid=${tid}:`, uploadErr)
  } else {
    console.log(`Merged ${actualChunks} chunks for tid=${tid}`)
  }
}

// GET /api/tests/:testId/replay/:tid — return signed URL(s); browser fetches data directly
// This endpoint never loads event data into Node memory.
router.get('/tests/:testId/replay/:tid', requireAuth, async (req, res) => {
  const { testId, tid } = req.params

  const { data: replay } = await adminDb
    .from('session_replays')
    .select('status, chunk_count')
    .eq('test_id', testId)
    .eq('tid', tid)
    .single()

  if (!replay) return res.status(404).json({ error: 'No replay found for this participant' })

  // List actual files in storage to discover what was successfully uploaded
  const { data: files, error: listError } = await adminDb.storage
    .from(BUCKET)
    .list(`${testId}/${tid}`, { limit: 1000, sortBy: { column: 'name', order: 'asc' } })

  if (listError || !files?.length) {
    return res.status(404).json({ error: 'Replay recording is empty or could not be listed' })
  }

  // Count total part files to detect whether any existing merged.json is truncated
  const totalPartFiles = files.filter(f => /^part_\d+\.json$/.test(f.name)).length
  const mergedIsTruncated = totalPartFiles > MAX_CHUNKS

  // Use the pre-merged file ONLY when it covers all chunks (short/normal sessions).
  // If the session exceeded MAX_CHUNKS during the merge, merged.json is incomplete —
  // skip it and fall through to serving all individual chunk URLs instead.
  const hasMerged = files.some(f => f.name === 'merged.json')
  if (hasMerged && !mergedIsTruncated) {
    const { data: signed, error: signErr } = await adminDb.storage
      .from(BUCKET)
      .createSignedUrl(mergedKey(testId, tid), SIGNED_URL_TTL)

    if (!signErr && signed?.signedUrl) {
      return res.json({
        tid,
        test_id: testId,
        status: replay.status,
        merged: true,
        url: signed.signedUrl,
      })
    }
    // Fall through to chunk URLs if signing failed
  }
  // If mergedIsTruncated, also fall through — serve all individual chunk URLs

  // Return signed URLs for ALL uploaded chunks (no cap — full session length)
  const chunkFiles = files
    .filter(f => /^part_\d+\.json$/.test(f.name))
    .sort((a, b) => a.name.localeCompare(b.name))

  if (chunkFiles.length === 0) {
    return res.status(404).json({ error: 'No replay chunks found' })
  }

  const paths = chunkFiles.map(f => `${testId}/${tid}/${f.name}`)
  const { data: signedUrls, error: bulkSignErr } = await adminDb.storage
    .from(BUCKET)
    .createSignedUrls(paths, SIGNED_URL_TTL)

  if (bulkSignErr || !signedUrls?.length) {
    return res.status(500).json({ error: 'Failed to generate signed URLs for replay chunks' })
  }

  const urls = signedUrls
    .filter(s => s.signedUrl)
    .map(s => s.signedUrl)

  res.json({
    tid,
    test_id: testId,
    status: replay.status,
    merged: false,
    chunks: urls,
  })
})

export default router
