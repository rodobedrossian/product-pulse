import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'

const router = Router()

/**
 * Latest desktop recorder build metadata (authenticated).
 * Set DESKTOP_*_DOWNLOAD_URL to a direct or signed URL to your .dmg / .exe in storage.
 */
router.get('/releases/latest', requireAuth, (req, res) => {
  const platform = String(req.query.platform || 'darwin').toLowerCase()

  if (platform === 'darwin' || platform === 'macos') {
    return res.json({
      platform: 'darwin',
      version: process.env.DESKTOP_MAC_VERSION || '0.1.0',
      download_url: process.env.DESKTOP_MAC_DOWNLOAD_URL || null,
      filename: process.env.DESKTOP_MAC_FILENAME || 'ProductPulseRecorder.dmg'
    })
  }

  if (platform === 'win32' || platform === 'windows') {
    return res.json({
      platform: 'win32',
      version: process.env.DESKTOP_WIN_VERSION || '0.1.0',
      download_url: process.env.DESKTOP_WIN_DOWNLOAD_URL || null,
      filename: process.env.DESKTOP_WIN_FILENAME || 'ProductPulseRecorderSetup.exe'
    })
  }

  res.status(400).json({ error: 'Unsupported platform. Use darwin or win32.' })
})

export default router
