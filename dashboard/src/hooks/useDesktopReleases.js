import { useEffect, useState } from 'react'
import { apiFetch } from '../api.js'

/**
 * Latest desktop build metadata from GET /api/desktop/releases/latest (authenticated).
 */
export function useDesktopReleases() {
  const [mac, setMac] = useState(null)
  const [win, setWin] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [m, w] = await Promise.all([
          apiFetch('/api/desktop/releases/latest?platform=darwin'),
          apiFetch('/api/desktop/releases/latest?platform=win32')
        ])
        if (!cancelled) {
          setMac(m)
          setWin(w)
          setError(null)
        }
      } catch (e) {
        if (!cancelled) {
          setMac(null)
          setWin(null)
          setError(e.message || 'Could not load release info')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return { mac, win, error, loading }
}
