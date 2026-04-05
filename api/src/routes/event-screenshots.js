import { Router } from 'express'
import db from '../db.js'
import adminDb from '../db-admin.js'

const router = Router()
const BUCKET = 'event-screenshots'

// GET /api/tests/:testId/events/:eventId/screenshot
router.get('/tests/:testId/events/:eventId/screenshot', async (req, res) => {
  const { testId, eventId } = req.params

  const { data: row, error } = await db
    .from('events')
    .select('id, test_id, screenshot_object_path')
    .eq('id', eventId)
    .single()

  if (error || !row || row.test_id !== testId || !row.screenshot_object_path) {
    return res.status(404).json({ error: 'Screenshot not found' })
  }

  const { data: file, error: dlErr } = await adminDb.storage
    .from(BUCKET)
    .download(row.screenshot_object_path)

  if (dlErr || !file) {
    console.error('Screenshot download error:', dlErr)
    return res.status(404).json({ error: 'Screenshot file missing from storage' })
  }

  const buf = Buffer.from(await file.arrayBuffer())
  const isJpeg = row.screenshot_object_path.endsWith('.jpg')
  res.setHeader('Content-Type', isJpeg ? 'image/jpeg' : 'image/png')
  res.setHeader('Cache-Control', 'private, max-age=3600')
  res.send(buf)
})

export default router
