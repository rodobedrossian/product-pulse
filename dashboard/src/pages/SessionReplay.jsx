import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import Player from 'rrweb-player'
import 'rrweb-player/dist/style.css'
import { apiFetch } from '../api.js'

function measurePlayerSize(el) {
  const w = el.clientWidth
  if (w < 80) return null
  const frameH = Math.max(360, Math.round((w * 9) / 16))
  return { width: w, height: frameH }
}

export default function SessionReplay() {
  const { id, tid } = useParams()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [replayData, setReplayData] = useState(null)
  const [playerSize, setPlayerSize] = useState({ width: 1024, height: 576 })
  const containerRef = useRef(null)
  const playerRef = useRef(null)

  useEffect(() => {
    apiFetch(`/api/tests/${id}/replay/${tid}`)
      .then(setReplayData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [id, tid])

  // Keep rrweb-player width/height in sync with the card — matches fullscreen behavior
  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return

    const apply = () => {
      const next = measurePlayerSize(el)
      if (!next) return
      setPlayerSize((prev) =>
        Math.abs(next.width - prev.width) < 4 && Math.abs(next.height - prev.height) < 4
          ? prev
          : next
      )
    }

    apply()
    let t
    const ro = new ResizeObserver(() => {
      clearTimeout(t)
      t = setTimeout(apply, 120)
    })
    ro.observe(el)
    return () => {
      clearTimeout(t)
      ro.disconnect()
    }
  }, [id, tid, replayData?.events?.length])

  useEffect(() => {
    if (!replayData?.events || replayData.events.length < 2 || !containerRef.current) return
    if (playerSize.width < 80) return

    // Destroy previous player instance if any
    if (playerRef.current) {
      try { playerRef.current.$destroy() } catch (_) {}
      playerRef.current = null
    }
    containerRef.current.innerHTML = ''

    playerRef.current = new Player({
      target: containerRef.current,
      props: {
        events: replayData.events,
        width: playerSize.width,
        height: playerSize.height,
        maxScale: 10,
        speed: 1,
        speedOption: [0.5, 1, 1.5, 2],
      }
    })
  }, [replayData, playerSize.width, playerSize.height])

  // Clean up player on unmount
  useEffect(() => {
    return () => {
      if (playerRef.current) {
        try { playerRef.current.$destroy() } catch (_) {}
      }
    }
  }, [])

  return (
    <div className="pp-page">
      <Link to={`/tests/${id}/results`} className="pp-back-link">
        ← Results
      </Link>
      <h1 className="pp-page-title" style={{ marginBottom: '1.5rem' }}>Session replay</h1>

      {loading && <p className="pp-loading">Loading replay…</p>}

      {error && (
        <div className="pp-card" style={{ borderColor: 'var(--color-danger-border)', background: 'var(--color-danger-bg)' }}>
          <p className="error" style={{ margin: 0 }}>{error}</p>
        </div>
      )}

      {replayData && !error && (
        <div className="pp-card pp-replay-card">
          {replayData.events.length < 2 ? (
            <p className="pp-muted" style={{ margin: 0, fontSize: '0.875rem' }}>
              This recording is too short to replay — the session ended before enough data was captured.
            </p>
          ) : (
            <div className="pp-replay-player" ref={containerRef} />
          )}
        </div>
      )}
    </div>
  )
}
