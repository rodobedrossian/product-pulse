import { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Replayer } from 'rrweb'
import 'rrweb/dist/style.css'
import { apiFetch } from '../api.js'

const INITIAL_CHUNKS = 5   // chunks to fetch before starting playback (~15s)
const STREAM_BATCH   = 10  // parallel chunk fetches per streaming batch
const POLL_MS        = 250 // playhead poll interval

function fmtTime(ms) {
  if (!ms || ms < 0) return '0:00'
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
}

async function fetchChunk(url) {
  const r = await fetch(url)
  if (!r.ok) return []
  const data = await r.json()
  return Array.isArray(data) ? data : []
}

export default function SessionReplay() {
  const { id, tid } = useParams()

  // ── UI state ──────────────────────────────────────────────────────────────
  const [phase, setPhase] = useState('idle')  // idle|loading|ready|error
  const [statusMsg, setStatusMsg] = useState('Loading replay…')
  const [error, setError] = useState(null)

  // ── Player state ─────────────────────────────────────────────────────────
  const [isPlaying, setIsPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [currentTime, setCurrentTime] = useState(0)   // ms from session start
  const [totalTime, setTotalTime] = useState(0)        // ms
  const [loadedPct, setLoadedPct] = useState(0)        // 0–1
  const [isBuffering, setIsBuffering] = useState(false)

  // ── Refs ─────────────────────────────────────────────────────────────────
  const containerRef = useRef(null)
  const replayerRef  = useRef(null)   // rrweb Replayer instance
  const cancelRef    = useRef(false)  // abort streaming on unmount/nav
  const pollRef      = useRef(null)   // setInterval handle
  const loadedMsRef  = useRef(0)      // tracks end-timestamp of loaded events
  const totalMsRef   = useRef(0)      // filled after metadata available

  // ── Helpers ───────────────────────────────────────────────────────────────

  const startPoll = useCallback(() => {
    if (pollRef.current) return
    pollRef.current = setInterval(() => {
      const r = replayerRef.current
      if (!r) return
      const t = r.getCurrentTime()
      setCurrentTime(t)
      // Detect if playhead has caught up to buffered content
      if (loadedMsRef.current > 0 && t >= loadedMsRef.current - 500) {
        setIsBuffering(true)
      } else {
        setIsBuffering(false)
      }
    }, POLL_MS)
  }, [])

  const stopPoll = useCallback(() => {
    clearInterval(pollRef.current)
    pollRef.current = null
  }, [])

  const destroyReplayer = useCallback(() => {
    stopPoll()
    if (replayerRef.current) {
      try { replayerRef.current.destroy() } catch (_) {}
      replayerRef.current = null
    }
    if (containerRef.current) containerRef.current.innerHTML = ''
  }, [stopPoll])

  // ── Controls ──────────────────────────────────────────────────────────────

  function togglePlay() {
    const r = replayerRef.current
    if (!r) return
    if (isPlaying) {
      r.pause()
      setIsPlaying(false)
      stopPoll()
    } else {
      r.play(currentTime)
      setIsPlaying(true)
      startPoll()
    }
  }

  function changeSpeed(s) {
    setSpeed(s)
    replayerRef.current?.setConfig({ speed: s })
  }

  function handleSeek(e) {
    const r = replayerRef.current
    if (!r || !totalTime) return
    const rect = e.currentTarget.getBoundingClientRect()
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    const targetMs = pct * totalTime
    setCurrentTime(targetMs)
    if (isPlaying) {
      r.play(targetMs)
    } else {
      r.pause(targetMs)
    }
  }

  // ── Core load logic ───────────────────────────────────────────────────────

  function initReplayer(events) {
    if (!containerRef.current || cancelRef.current) return null
    destroyReplayer()

    const r = new Replayer(events, {
      root: containerRef.current,
      speed: 1,
      skipInactive: true,
      showWarning: false,
      triggerFocus: false,
    })

    replayerRef.current = r

    // Get total time once we have a full snapshot + some events
    try {
      const meta = r.getMetaData()
      if (meta?.totalTime > 0) {
        totalMsRef.current = meta.totalTime
        setTotalTime(meta.totalTime)
      }
    } catch (_) {}

    // Listen for finish
    r.on('finish', () => {
      setIsPlaying(false)
      stopPoll()
    })

    return r
  }

  async function streamRemaining(chunkUrls, replayer, startChunkIndex) {
    let loaded = startChunkIndex
    const total = startChunkIndex + chunkUrls.length

    for (let i = 0; i < chunkUrls.length; i += STREAM_BATCH) {
      if (cancelRef.current) return

      const batch = chunkUrls.slice(i, i + STREAM_BATCH)
      const results = await Promise.all(batch.map(url => fetchChunk(url)))

      if (cancelRef.current) return

      let lastTs = 0
      for (const chunk of results) {
        for (const event of chunk) {
          replayer.addEvent(event)
          if (event.timestamp > lastTs) lastTs = event.timestamp
        }
      }

      loaded += batch.length
      setLoadedPct(loaded / total)
      if (lastTs > 0) loadedMsRef.current = lastTs

      // Update totalTime from meta once more data is loaded
      try {
        const meta = replayer.getMetaData()
        if (meta?.totalTime > totalMsRef.current) {
          totalMsRef.current = meta.totalTime
          setTotalTime(meta.totalTime)
        }
      } catch (_) {}

      // Yield — let GC run and browser render between batches
      await new Promise(resolve => setTimeout(resolve, 0))
    }

    setIsBuffering(false)
    setLoadedPct(1)
  }

  // ── Main effect ───────────────────────────────────────────────────────────

  useEffect(() => {
    cancelRef.current = false

    async function load() {
      setPhase('loading')
      setStatusMsg('Loading replay…')
      setError(null)
      setCurrentTime(0)
      setTotalTime(0)
      setLoadedPct(0)
      setIsPlaying(false)
      setIsBuffering(false)

      try {
        // Step 1: get metadata + signed URLs from API
        const meta = await apiFetch(`/api/tests/${id}/replay/${tid}`)
        if (cancelRef.current) return

        // ── Merged path: single CDN file ────────────────────────────────
        if (meta.merged && meta.url) {
          setStatusMsg('Preparing replay…')
          const res = await fetch(meta.url)
          if (!res.ok) throw new Error(`Failed to fetch replay (${res.status})`)
          const data = await res.json()
          const events = Array.isArray(data) ? data : (data.events ?? [])
          if (cancelRef.current) return

          events.sort((a, b) => a.timestamp - b.timestamp)
          setLoadedPct(1)

          const r = initReplayer(events)
          if (!r) return
          r.play()
          setIsPlaying(true)
          startPoll()
          setPhase('ready')
          return
        }

        // ── Chunk path: stream from signed URLs ──────────────────────────
        const allUrls = meta.chunks ?? []
        if (allUrls.length === 0) throw new Error('No replay data found')

        // Fetch first N chunks to start playback immediately
        const initialUrls = allUrls.slice(0, INITIAL_CHUNKS)
        const restUrls    = allUrls.slice(INITIAL_CHUNKS)

        setStatusMsg(`Loading first ${INITIAL_CHUNKS} chunks…`)
        const initialResults = await Promise.all(initialUrls.map(url => fetchChunk(url)))
        if (cancelRef.current) return

        const initialEvents = initialResults.flat().sort((a, b) => a.timestamp - b.timestamp)
        if (initialEvents.length < 2) throw new Error('Not enough events to replay')

        setLoadedPct(INITIAL_CHUNKS / allUrls.length)

        // Track last timestamp of initially loaded events
        if (initialEvents.length > 0) {
          loadedMsRef.current = initialEvents[initialEvents.length - 1].timestamp
        }

        // Init replayer and start playing immediately
        const r = initReplayer(initialEvents)
        if (!r) return
        r.play()
        setIsPlaying(true)
        startPoll()
        setPhase('ready')

        // Stream remaining chunks in background without blocking
        if (restUrls.length > 0) {
          streamRemaining(restUrls, r, INITIAL_CHUNKS)
        } else {
          setLoadedPct(1)
        }

      } catch (e) {
        if (!cancelRef.current) {
          setError(e.message)
          setPhase('error')
        }
      }
    }

    load()

    return () => {
      cancelRef.current = true
      destroyReplayer()
    }
  }, [id, tid]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Container resize observer ─────────────────────────────────────────────
  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    // rrweb Replayer sizes itself; no manual resize needed
    // but we keep the ref stable for re-mounts
  }, [phase])

  // ── Derived values ────────────────────────────────────────────────────────
  const playedPct = totalTime > 0 ? Math.min(1, currentTime / totalTime) : 0

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="pp-page">
      <Link to={`/tests/${id}/results`} className="pp-back-link">
        ← Results
      </Link>
      <h1 className="pp-page-title" style={{ marginBottom: '1.5rem' }}>Session replay</h1>

      {phase === 'loading' && (
        <p className="pp-loading">{statusMsg}</p>
      )}

      {phase === 'error' && (
        <div className="pp-card" style={{ borderColor: 'var(--color-danger-border)', background: 'var(--color-danger-bg)' }}>
          <p className="error" style={{ margin: 0 }}>{error}</p>
        </div>
      )}

      {(phase === 'ready' || phase === 'loading') && !error && (
        <div className="pp-card pp-replay-card" style={{ padding: 0, overflow: 'hidden' }}>

          {/* Player area — rrweb Replayer mounts here */}
          <div className="pp-replay-player" ref={containerRef} />

          {/* Custom controls */}
          {phase === 'ready' && (
            <div className="pp-replay-controls">

              {/* Play / Pause */}
              <button
                type="button"
                className="pp-replay-btn"
                onClick={togglePlay}
                aria-label={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? '⏸' : '▶'}
              </button>

              {/* Time */}
              <span className="pp-replay-time">
                {fmtTime(currentTime)} / {fmtTime(totalTime || loadedMsRef.current)}
              </span>

              {/* Progress bar */}
              <div
                className="pp-replay-progress-wrap"
                onClick={handleSeek}
                role="slider"
                aria-label="Seek"
                aria-valuenow={Math.round(playedPct * 100)}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div className="pp-replay-progress-inner">
                  {/* Loaded/buffered */}
                  <div
                    className="pp-replay-progress-loaded"
                    style={{ width: `${loadedPct * 100}%` }}
                  />
                  {/* Played */}
                  <div
                    className="pp-replay-progress-played"
                    style={{ width: `${playedPct * 100}%` }}
                  />
                </div>
                {/* Thumb */}
                <div
                  className="pp-replay-progress-thumb"
                  style={{ left: `${playedPct * 100}%` }}
                />
              </div>

              {/* Buffering indicator */}
              {isBuffering && (
                <span className="pp-replay-buffer-label">Buffering…</span>
              )}

              {/* Speed */}
              <div className="pp-replay-speeds">
                {[1, 1.5, 2].map(s => (
                  <button
                    key={s}
                    type="button"
                    className={`pp-replay-speed-btn${speed === s ? ' active' : ''}`}
                    onClick={() => changeSpeed(s)}
                  >
                    {s}×
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
