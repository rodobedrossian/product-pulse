import { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Replayer } from 'rrweb'
import 'rrweb/dist/style.css'
import { apiFetch } from '../api.js'

const INITIAL_CHUNKS  = 5
const STREAM_BATCH    = 10
const POLL_MS         = 250
const CONTROLS_H      = 52   // approx controls bar height for fullscreen calc

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

// ── Icons (Feather-style, 24×24 viewBox) ──────────────────────────────────────
function IconExpand() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 3H5a2 2 0 0 0-2 2v3" />
      <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
      <path d="M3 16v3a2 2 0 0 0 2 2h3" />
      <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
    </svg>
  )
}
function IconCompress() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 3v3a2 2 0 0 1-2 2H3" />
      <path d="M21 8h-3a2 2 0 0 1-2-2V3" />
      <path d="M3 16h3a2 2 0 0 1 2 2v3" />
      <path d="M16 21v-3a2 2 0 0 1 2-2h3" />
    </svg>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

export default function SessionReplay() {
  const { id, tid } = useParams()

  // ── UI state ──────────────────────────────────────────────────────────────
  const [phase, setPhase]       = useState('idle')   // idle|loading|ready|error
  const [statusMsg, setStatusMsg] = useState('Loading replay…')
  const [error, setError]       = useState(null)

  // ── Player state ─────────────────────────────────────────────────────────
  const [isPlaying, setIsPlaying]   = useState(false)
  const [speed, setSpeed]           = useState(1)
  const [currentTime, setCurrentTime] = useState(0)   // ms
  const [totalTime, setTotalTime]   = useState(0)      // ms
  const [loadedPct, setLoadedPct]   = useState(0)      // 0–1
  const [isBuffering, setIsBuffering] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)

  // ── Recorded / layout state ───────────────────────────────────────────────
  const [recordedSize, setRecordedSize] = useState({ width: 1280, height: 800 })
  const [outerWidth, setOuterWidth]     = useState(0)

  // ── Refs ──────────────────────────────────────────────────────────────────
  const outerRef      = useRef(null)   // outer container (visual bounds)
  const containerRef  = useRef(null)   // rrweb Replayer mounts here (recorded size)
  const cardRef       = useRef(null)   // pp-replay-card — fullscreened element
  const replayerRef   = useRef(null)
  const cancelRef     = useRef(false)
  const pollRef       = useRef(null)
  const loadedMsRef   = useRef(0)
  const totalMsRef    = useRef(0)

  // ── Scale calculation ─────────────────────────────────────────────────────
  const scale = (() => {
    if (!recordedSize.width || !outerWidth) return 1
    if (isFullscreen) {
      const scaleW = outerWidth / recordedSize.width
      const scaleH = (window.innerHeight - CONTROLS_H) / recordedSize.height
      return Math.min(scaleW, scaleH)
    }
    return outerWidth / recordedSize.width
  })()

  const scaledW = Math.round(recordedSize.width  * scale)
  const scaledH = Math.round(recordedSize.height * scale)

  // Centering offsets (for fullscreen letterboxing)
  const offsetX = isFullscreen ? Math.max(0, Math.round((outerWidth - scaledW) / 2)) : 0
  const offsetY = isFullscreen
    ? Math.max(0, Math.round(((window.innerHeight - CONTROLS_H) - scaledH) / 2))
    : 0

  // ── Helpers ───────────────────────────────────────────────────────────────

  const startPoll = useCallback(() => {
    if (pollRef.current) return
    pollRef.current = setInterval(() => {
      const r = replayerRef.current
      if (!r) return
      const t = r.getCurrentTime()
      setCurrentTime(t)
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
    const pct  = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    const targetMs = pct * totalTime
    setCurrentTime(targetMs)
    if (isPlaying) {
      r.play(targetMs)
    } else {
      r.pause(targetMs)
    }
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      cardRef.current?.requestFullscreen?.()
    } else {
      document.exitFullscreen?.()
    }
  }

  // ── Core load logic ───────────────────────────────────────────────────────

  function initReplayer(events) {
    if (!containerRef.current || cancelRef.current) return null
    destroyReplayer()

    const r = new Replayer(events, {
      root:          containerRef.current,
      speed:         1,
      skipInactive:  true,
      showWarning:   false,
      triggerFocus:  false,
    })

    replayerRef.current = r

    // ── Apply correct dimensions to DOM BEFORE r.play() ────────────────────
    // rrweb reads container.clientWidth/clientHeight during play() to position
    // .replayer-wrapper. If the container has the wrong (default) size at that
    // moment, the wrapper gets a non-zero offset and only part of the recording
    // is visible. We must set the correct dimensions synchronously here.
    let rW = recordedSize.width
    let rH = recordedSize.height
    try {
      const meta = r.getMetaData()
      if (meta?.width > 0 && meta?.height > 0) {
        rW = meta.width
        rH = meta.height
      }
      if (meta?.totalTime > 0) {
        totalMsRef.current = meta.totalTime
        setTotalTime(meta.totalTime)
      }
    } catch (_) {}

    // Direct DOM write (synchronous) — React state update would be too late
    const outerW = outerRef.current?.clientWidth || 960
    const sc     = rW > 0 ? outerW / rW : 1
    Object.assign(containerRef.current.style, {
      position:        'absolute',
      top:             '0',
      left:            '0',
      width:           `${rW}px`,
      height:          `${rH}px`,
      transform:       `scale(${sc})`,
      transformOrigin: 'top left',
    })
    // Sync outer aspect-ratio so it sizes to the correct height
    if (outerRef.current) {
      outerRef.current.style.aspectRatio = `${rW} / ${rH}`
    }
    // Sync React state (next render will write matching inline styles)
    setRecordedSize({ width: rW, height: rH })
    // ──────────────────────────────────────────────────────────────────────

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

      try {
        const meta = replayer.getMetaData()
        if (meta?.totalTime > totalMsRef.current) {
          totalMsRef.current = meta.totalTime
          setTotalTime(meta.totalTime)
        }
      } catch (_) {}

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
        const meta = await apiFetch(`/api/tests/${id}/replay/${tid}`)
        if (cancelRef.current) return

        // ── Merged path ─────────────────────────────────────────────────
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

        // ── Chunk path ──────────────────────────────────────────────────
        const allUrls = meta.chunks ?? []
        if (allUrls.length === 0) throw new Error('No replay data found')

        const initialUrls = allUrls.slice(0, INITIAL_CHUNKS)
        const restUrls    = allUrls.slice(INITIAL_CHUNKS)

        setStatusMsg(`Loading first ${INITIAL_CHUNKS} chunks…`)
        const initialResults = await Promise.all(initialUrls.map(url => fetchChunk(url)))
        if (cancelRef.current) return

        const initialEvents = initialResults.flat().sort((a, b) => a.timestamp - b.timestamp)
        if (initialEvents.length < 2) throw new Error('Not enough events to replay')

        setLoadedPct(INITIAL_CHUNKS / allUrls.length)

        if (initialEvents.length > 0) {
          loadedMsRef.current = initialEvents[initialEvents.length - 1].timestamp
        }

        const r = initReplayer(initialEvents)
        if (!r) return
        r.play()
        setIsPlaying(true)
        startPoll()
        setPhase('ready')

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

  // ── Measure outer container width (drives scale) ──────────────────────────
  useLayoutEffect(() => {
    const el = outerRef.current
    if (!el) return
    // Set immediately (synchronous, before paint)
    setOuterWidth(el.clientWidth || 0)
    // Keep updated on resize — also directly update the inner container's
    // transform so the scale changes without waiting for a React render cycle
    const ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width
      if (!w) return
      setOuterWidth(w)
      // Direct DOM update for instant scale correction on resize
      const inner = containerRef.current
      if (inner && replayerRef.current) {
        try {
          const meta = replayerRef.current.getMetaData()
          const rW = meta?.width || recordedSize.width
          if (rW > 0) inner.style.transform = `scale(${w / rW})`
        } catch (_) {}
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fullscreen change listener ────────────────────────────────────────────
  useEffect(() => {
    function onFsChange() {
      setIsFullscreen(!!document.fullscreenElement)
    }
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
  }, [])

  // ── Derived values ────────────────────────────────────────────────────────
  const playedPct = totalTime > 0 ? Math.min(1, currentTime / totalTime) : 0

  // ── Outer container style ─────────────────────────────────────────────────
  // Normal mode: aspect-ratio drives the height automatically
  // Fullscreen: height fills the viewport minus the controls bar
  const outerStyle = isFullscreen
    ? { height: `calc(100vh - ${CONTROLS_H}px)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }
    : { aspectRatio: `${recordedSize.width} / ${recordedSize.height}` }

  // ── Inner container style (rrweb mounts here) ─────────────────────────────
  // Exact recorded dimensions, scaled down to fit outer.
  // rrweb will set left:0, top:0 on .replayer-wrapper since container == recorded size.
  const innerStyle = phase === 'ready' ? {
    position:        'absolute',
    top:             `${offsetY}px`,
    left:            `${offsetX}px`,
    width:           `${recordedSize.width}px`,
    height:          `${recordedSize.height}px`,
    transform:       `scale(${scale})`,
    transformOrigin: 'top left',
  } : {}

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
        <div className="pp-card pp-replay-card" ref={cardRef} style={{ padding: 0, overflow: 'hidden' }}>

          {/* Outer: clips to scaled size, provides background */}
          <div className="pp-replay-outer" ref={outerRef} style={outerStyle}>
            {/* Inner: exact recorded dimensions — rrweb Replayer mounts here */}
            <div className="pp-replay-player" ref={containerRef} style={innerStyle} />
          </div>

          {/* Controls */}
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
                  <div className="pp-replay-progress-loaded" style={{ width: `${loadedPct * 100}%` }} />
                  <div className="pp-replay-progress-played" style={{ width: `${playedPct * 100}%` }} />
                </div>
                <div className="pp-replay-progress-thumb" style={{ left: `${playedPct * 100}%` }} />
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

              {/* Fullscreen */}
              <button
                type="button"
                className="pp-replay-btn pp-replay-fullscreen-btn"
                onClick={toggleFullscreen}
                aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
              >
                {isFullscreen ? <IconCompress /> : <IconExpand />}
              </button>

            </div>
          )}
        </div>
      )}
    </div>
  )
}
