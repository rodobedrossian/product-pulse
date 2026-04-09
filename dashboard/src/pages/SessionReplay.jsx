import { useEffect, useLayoutEffect, useRef, useState, useCallback, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Replayer } from 'rrweb'
import 'rrweb/dist/style.css'
import { apiFetch } from '../api.js'

const INITIAL_CHUNKS  = 5
const STREAM_BATCH    = 10
const POLL_MS         = 250
const CONTROLS_H      = 52   // approx controls bar height for fullscreen calc
/** Min gap between consecutive rrweb event timestamps to treat as “no recording” (idle). */
const MIN_INACTIVITY_GAP_MS = 2500

function fmtTime(ms) {
  if (!ms || ms < 0) return '0:00'
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
}

function fmtDurationShort(ms) {
  if (ms == null || ms < 0) return '0s'
  if (ms < 60000) return `${Math.max(1, Math.round(ms / 1000))}s`
  const m = Math.floor(ms / 60000)
  const s = Math.round((ms % 60000) / 1000)
  return s > 0 ? `${m}m ${s}s` : `${m}m`
}

/**
 * @param {number[]} sortedTs ascending epoch ms
 * @param {number} firstTs first event epoch (anchor)
 * @returns {{ startRel: number, endRel: number, durationMs: number }[]}
 */
function buildInactivityGaps(sortedTs, firstTs) {
  if (!sortedTs.length || !firstTs) return []
  const gaps = []
  for (let i = 0; i < sortedTs.length - 1; i++) {
    const dt = sortedTs[i + 1] - sortedTs[i]
    if (dt >= MIN_INACTIVITY_GAP_MS) {
      gaps.push({
        startRel: sortedTs[i] - firstTs,
        endRel: sortedTs[i + 1] - firstTs,
        durationMs: dt,
      })
    }
  }
  return gaps
}

function findGapAtReplayTime(t, gaps) {
  for (const g of gaps) {
    if (t > g.startRel && t < g.endRel) return g
  }
  return null
}

async function fetchChunk(url) {
  const r = await fetch(url)
  if (!r.ok) return []
  const data = await r.json()
  return Array.isArray(data) ? data : []
}

function inferRecordedSizeFromEvents(events, fallback = { width: 1280, height: 800 }) {
  if (!Array.isArray(events)) return fallback
  for (const e of events) {
    const w = e?.data?.width
    const h = e?.data?.height
    if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
      return { width: w, height: h }
    }
  }
  return fallback
}

// ── Icons (stroke uses currentColor — see .pp-replay-btn svg in CSS) ─────────
function IconExpand() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden
      stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 3H5a2 2 0 0 0-2 2v3" />
      <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
      <path d="M3 16v3a2 2 0 0 0 2 2h3" />
      <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
    </svg>
  )
}
function IconCompress() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden
      stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
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
  const [totalTime, setTotalTime]   = useState(0)      // ms (max span seen from events / meta)
  /** Timeline ms covered by events fetched so far (matches loadedMsRef). */
  const [loadedDurationMs, setLoadedDurationMs] = useState(0)
  /** Chunk counts for extrapolating total duration while streaming. */
  const [chunksLoadedCount, setChunksLoadedCount] = useState(0)
  const [totalChunksCount, setTotalChunksCount] = useState(0)
  const [replayComplete, setReplayComplete] = useState(false)
  const [isBuffering, setIsBuffering] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  /** Gaps between consecutive event timestamps ≥ MIN_INACTIVITY_GAP_MS (replay-time offsets). */
  const [inactivityGaps, setInactivityGaps] = useState([])
  const [inactivityTotalMs, setInactivityTotalMs] = useState(0)

  // ── Recorded / layout state ───────────────────────────────────────────────
  const [recordedSize, setRecordedSize] = useState({ width: 1280, height: 800 })
  const recordedSizeRef = useRef({ width: 1280, height: 800 })
  /** Measured .pp-replay-outer box — both axes; drives scale + centering in fullscreen. */
  const [outerBox, setOuterBox] = useState({ width: 0, height: 0 })

  // ── Refs ──────────────────────────────────────────────────────────────────
  const outerRef      = useRef(null)   // outer container (visual bounds)
  const containerRef  = useRef(null)   // rrweb Replayer mounts here (recorded size)
  const cardRef       = useRef(null)   // pp-replay-card — fullscreened element
  const replayerRef   = useRef(null)
  const cancelRef     = useRef(false)
  const pollRef       = useRef(null)
  const loadedMsRef        = useRef(0)
  const totalMsRef         = useRef(0)
  const firstEventTsRef    = useRef(0)     // epoch ms of first event — anchor for relative offset
  const allChunksLoadedRef = useRef(false) // true once all chunks have been streamed
  const stoppedEarlyRef    = useRef(false) // true if rrweb 'finish' fired before all chunks loaded
  /** Sorted epoch timestamps for all loaded events — drives inactivity gap detection. */
  const eventTimestampsRef = useRef([])

  // ── Scale calculation ─────────────────────────────────────────────────────
  const ow =
    outerBox.width ||
    outerRef.current?.clientWidth ||
    0
  const ohFs =
    isFullscreen
      ? (outerBox.height ||
          outerRef.current?.clientHeight ||
          Math.max(1, window.innerHeight - CONTROLS_H))
      : 0

  const scale = (() => {
    if (!recordedSize.width || !ow) return 1
    if (isFullscreen) {
      const scaleW = ow / recordedSize.width
      const scaleH = ohFs / recordedSize.height
      return Math.min(scaleW, scaleH)
    }
    return ow / recordedSize.width
  })()

  const scaledW = Math.round(recordedSize.width * scale)
  const scaledH = Math.round(recordedSize.height * scale)

  // Centering offsets (for fullscreen letterboxing)
  const offsetX = isFullscreen ? Math.max(0, Math.round((ow - scaledW) / 2)) : 0
  const offsetY = isFullscreen ? Math.max(0, Math.round((ohFs - scaledH) / 2)) : 0

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

  function timelineDenominatorMs() {
    const loadedD = loadedMsRef.current
    const metaTotal = Math.max(totalMsRef.current, totalTime)
    if (allChunksLoadedRef.current) {
      return Math.max(metaTotal, loadedD, 1)
    }
    const n = totalChunksCount
    const k = Math.max(chunksLoadedCount, 1)
    const extrapolated = n > 0 ? (loadedD * n) / k : loadedD
    return Math.max(metaTotal, extrapolated, loadedD, currentTime, 1)
  }

  function handleSeek(e) {
    const r = replayerRef.current
    if (!r) return
    const denom = timelineDenominatorMs()
    if (denom <= 0) return
    const rect = e.currentTarget.getBoundingClientRect()
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    const rawTarget = pct * denom
    // Never seek past loaded events while chunks are still streaming (avoids rrweb thrash).
    const seekMax = allChunksLoadedRef.current ? denom : loadedMsRef.current
    const targetMs = Math.max(0, Math.min(rawTarget, seekMax))
    const wasPlaying = isPlaying
    r.pause(targetMs)
    setCurrentTime(targetMs)
    if (wasPlaying) {
      r.play(targetMs)
      setIsPlaying(true)
      startPoll()
    } else {
      setIsPlaying(false)
    }
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      cardRef.current?.requestFullscreen?.()
    } else {
      document.exitFullscreen?.()
    }
  }

  function refreshInactivityGaps() {
    const ts = eventTimestampsRef.current
    const t0 = firstEventTsRef.current
    const gaps = buildInactivityGaps(ts, t0)
    setInactivityGaps(gaps)
    setInactivityTotalMs(gaps.reduce((s, g) => s + g.durationMs, 0))
  }

  function skipInactivityGap() {
    const r = replayerRef.current
    if (!r) return
    const t = r.getCurrentTime()
    const g = findGapAtReplayTime(t, inactivityGaps)
    if (!g) return
    const denom = timelineDenominatorMs()
    const seekMax = allChunksLoadedRef.current ? denom : loadedMsRef.current
    const targetMs = Math.max(0, Math.min(g.endRel, seekMax))
    const wasPlaying = isPlaying
    r.pause(targetMs)
    setCurrentTime(targetMs)
    if (wasPlaying) {
      r.play(targetMs)
      setIsPlaying(true)
      startPoll()
    } else {
      setIsPlaying(false)
    }
  }

  // ── Core load logic ───────────────────────────────────────────────────────

  function initReplayer(events) {
    if (!containerRef.current || cancelRef.current) return null
    destroyReplayer()

    const r = new Replayer(events, {
      root:          containerRef.current,
      speed:         1,
      // Must be false so replay clock matches raw gaps between events; we surface
      // idle periods and let the user skip with the control (rrweb’s skip only targets “inactive” interaction gaps).
      skipInactive:  false,
      showWarning:   false,
      triggerFocus:  false,
    })

    replayerRef.current = r

    // ── Apply correct dimensions to DOM BEFORE r.play() ────────────────────
    // rrweb reads container.clientWidth/clientHeight during play() to position
    // .replayer-wrapper. If the container has the wrong (default) size at that
    // moment, the wrapper gets a non-zero offset and only part of the recording
    // is visible. We must set the correct dimensions synchronously here.
    const inferred = inferRecordedSizeFromEvents(events, recordedSizeRef.current)
    let rW = inferred.width
    let rH = inferred.height
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
    recordedSizeRef.current = { width: rW, height: rH }
    setRecordedSize({ width: rW, height: rH })
    // ──────────────────────────────────────────────────────────────────────

    r.on('finish', () => {
      if (!allChunksLoadedRef.current) {
        // rrweb exhausted currently-loaded events but more chunks are still incoming.
        // Mark early stop — streamRemaining will resume playback once the next batch lands.
        stoppedEarlyRef.current = true
      }
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
      const newTs = []
      for (const chunk of results) {
        for (const event of chunk) {
          replayer.addEvent(event)
          if (event.timestamp > lastTs) lastTs = event.timestamp
          if (Number.isFinite(event.timestamp)) newTs.push(event.timestamp)
        }
      }

      if (newTs.length) {
        eventTimestampsRef.current.push(...newTs)
        eventTimestampsRef.current.sort((a, b) => a - b)
        refreshInactivityGaps()
      }

      loaded += batch.length
      setChunksLoadedCount(loaded)

      // Store relative offset (subtract first event's epoch timestamp) so the
      // buffering comparison against r.getCurrentTime() (which is also relative) is valid
      if (lastTs > 0 && firstEventTsRef.current > 0) {
        loadedMsRef.current = lastTs - firstEventTsRef.current
      }

      // If rrweb fired 'finish' early because it ran out of loaded events,
      // resume playback now that a new batch has been added
      if (stoppedEarlyRef.current) {
        stoppedEarlyRef.current = false
        const r = replayerRef.current
        if (r) {
          r.play(r.getCurrentTime())
          setIsPlaying(true)
          startPoll()
        }
      }

      // rrweb v2-alpha getMetaData().totalTime doesn't update after addEvent() calls.
      // Calculate total duration directly from raw event timestamps instead.
      if (loadedMsRef.current > totalMsRef.current) {
        totalMsRef.current = loadedMsRef.current
        setTotalTime(loadedMsRef.current)
      }

      setLoadedDurationMs(loadedMsRef.current)

      await new Promise(resolve => setTimeout(resolve, 0))
    }

    allChunksLoadedRef.current = true
    setReplayComplete(true)
    setIsBuffering(false)
    setLoadedDurationMs(loadedMsRef.current)
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
      recordedSizeRef.current = { width: 1280, height: 800 }
      setRecordedSize(recordedSizeRef.current)
      setLoadedDurationMs(0)
      setChunksLoadedCount(0)
      setTotalChunksCount(0)
      setReplayComplete(false)
      setIsPlaying(false)
      setIsBuffering(false)
      firstEventTsRef.current    = 0
      allChunksLoadedRef.current = false
      stoppedEarlyRef.current    = false
      loadedMsRef.current        = 0
      totalMsRef.current         = 0
      eventTimestampsRef.current = []
      setInactivityGaps([])
      setInactivityTotalMs(0)

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
          if (events.length > 0) {
            firstEventTsRef.current = events[0].timestamp
            loadedMsRef.current = events[events.length - 1].timestamp - firstEventTsRef.current
            setLoadedDurationMs(loadedMsRef.current)
            eventTimestampsRef.current = events
              .map(e => e.timestamp)
              .filter(Number.isFinite)
              .sort((a, b) => a - b)
            refreshInactivityGaps()
          }
          setChunksLoadedCount(1)
          setTotalChunksCount(1)
          setReplayComplete(true)

          const r = initReplayer(events)
          if (!r) return
          allChunksLoadedRef.current = true  // all events loaded upfront; 'finish' = genuine end
          r.play()
          setIsPlaying(true)
          startPoll()
          setPhase('ready')
          return
        }

        // ── Chunk path ──────────────────────────────────────────────────
        const allUrls = meta.chunks ?? []
        if (allUrls.length === 0) throw new Error('No replay data found')

        setTotalChunksCount(allUrls.length)

        const initialUrls = allUrls.slice(0, INITIAL_CHUNKS)
        const restUrls    = allUrls.slice(INITIAL_CHUNKS)

        setStatusMsg(`Loading first ${INITIAL_CHUNKS} chunks…`)
        const initialResults = await Promise.all(initialUrls.map(url => fetchChunk(url)))
        if (cancelRef.current) return

        const initialEvents = initialResults.flat().sort((a, b) => a.timestamp - b.timestamp)
        if (initialEvents.length < 2) throw new Error('Not enough events to replay')

        setChunksLoadedCount(initialUrls.length)

        if (initialEvents.length > 0) {
          // Anchor for relative-offset calculations in streamRemaining
          firstEventTsRef.current = initialEvents[0].timestamp
          // Store relative ms (not absolute epoch) so buffering check is valid
          loadedMsRef.current = initialEvents[initialEvents.length - 1].timestamp - firstEventTsRef.current
          setLoadedDurationMs(loadedMsRef.current)
          eventTimestampsRef.current = initialEvents
            .map(e => e.timestamp)
            .filter(Number.isFinite)
            .sort((a, b) => a - b)
          refreshInactivityGaps()
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
          allChunksLoadedRef.current = true
          setReplayComplete(true)
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

  // ── Measure outer container (width + height) — drives scale / fullscreen fit ─
  useLayoutEffect(() => {
    const el = outerRef.current
    if (!el) return
    const push = (w, h) => {
      setOuterBox(prev =>
        prev.width === w && prev.height === h ? prev : { width: w, height: h },
      )
    }
    push(el.clientWidth || 0, el.clientHeight || 0)
    const ro = new ResizeObserver(entries => {
      const cr = entries[0]?.contentRect
      if (!cr) return
      const w = Math.max(0, Math.round(cr.width))
      const h = Math.max(0, Math.round(cr.height))
      if (w === 0 && h === 0) return
      push(w, h)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Fullscreen: listen in layout phase and remeasure outer immediately so scale /
  // offsets use the new viewport (stale width kept the replay small on the left).
  useLayoutEffect(() => {
    function onFsChange() {
      setIsFullscreen(!!document.fullscreenElement)
      const el = outerRef.current
      if (!el) return
      const apply = () => {
        const w = el.clientWidth || 0
        const h = el.clientHeight || 0
        setOuterBox(prev =>
          prev.width === w && prev.height === h ? prev : { width: w, height: h },
        )
      }
      apply()
      requestAnimationFrame(apply)
    }
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
  }, [])

  // ── Derived values ────────────────────────────────────────────────────────
  const timelineEndMs = (() => {
    const loadedD = loadedDurationMs
    const metaTotal = totalTime
    if (replayComplete) {
      return Math.max(metaTotal, loadedD, currentTime, 1)
    }
    const n = totalChunksCount
    const k = Math.max(chunksLoadedCount, 1)
    const extrapolated = n > 0 ? (loadedD * n) / k : loadedD
    return Math.max(metaTotal, extrapolated, loadedD, currentTime, 1)
  })()
  const loadedPct = timelineEndMs > 0 ? Math.min(1, loadedDurationMs / timelineEndMs) : 0
  const playedPct = timelineEndMs > 0 ? Math.min(1, currentTime / timelineEndMs) : 0
  const playedVisualPct = Math.min(playedPct, loadedPct, 1)

  const activeInactivityGap = useMemo(
    () => findGapAtReplayTime(currentTime, inactivityGaps),
    [currentTime, inactivityGaps],
  )

  // ── Outer container style ─────────────────────────────────────────────────
  // Normal mode: aspect-ratio drives the height automatically
  // Fullscreen: .pp-replay-card:fullscreen uses flex column + flex:1 on outer — no
  // duplicate height here (avoids wrong box vs CONTROLS_H and flex fighting).
  const outerStyle = isFullscreen
    ? { minHeight: 0 }
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
            {phase === 'ready' && activeInactivityGap && (
              <div className="pp-replay-inactivity-badge" role="status" aria-live="polite">
                <span className="pp-replay-inactivity-badge-title">Inactivity</span>
                <span className="pp-replay-inactivity-badge-detail">
                  Gap {fmtDurationShort(activeInactivityGap.durationMs)}
                  {activeInactivityGap.endRel > currentTime && (
                    <> · {fmtDurationShort(activeInactivityGap.endRel - currentTime)} left</>
                  )}
                </span>
              </div>
            )}
            {phase === 'loading' && (
              <div className="pp-replay-loader" role="status" aria-live="polite">
                <span className="pp-replay-loader-spinner" aria-hidden />
                <p className="pp-replay-loader-title">Preparing replay</p>
                <p className="pp-replay-loader-subtitle">{statusMsg}</p>
                <div className="pp-replay-loader-bars" aria-hidden>
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            )}
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
                {fmtTime(currentTime)} / {fmtTime(timelineEndMs)}
              </span>

              {inactivityTotalMs > 0 && (
                <span className="pp-replay-inactivity-summary" title="Time between recorded events (no DOM / input activity in the capture)">
                  {fmtDurationShort(inactivityTotalMs)} idle
                </span>
              )}

              {/* Progress bar */}
              <div
                className="pp-replay-progress-wrap"
                onClick={handleSeek}
                role="slider"
                aria-label="Seek"
                aria-valuenow={Math.round(currentTime / 1000)}
                aria-valuemin={0}
                aria-valuemax={Math.round(timelineEndMs / 1000)}
              >
                <div className="pp-replay-progress-inner">
                  {timelineEndMs > 0 &&
                    inactivityGaps.map((g, i) => (
                      <div
                        key={`${g.startRel}-${g.endRel}-${i}`}
                        className="pp-replay-progress-inactive-seg"
                        style={{
                          left: `${(g.startRel / timelineEndMs) * 100}%`,
                          width: `${((g.endRel - g.startRel) / timelineEndMs) * 100}%`,
                        }}
                        aria-hidden
                      />
                    ))}
                  <div className="pp-replay-progress-loaded" style={{ width: `${loadedPct * 100}%` }} />
                  <div
                    className="pp-replay-progress-played"
                    style={{ width: `${playedVisualPct * 100}%` }}
                  />
                </div>
                <div className="pp-replay-progress-thumb" style={{ left: `${playedVisualPct * 100}%` }} />
              </div>

              <button
                type="button"
                className="pp-replay-skip-inactivity-btn"
                disabled={!activeInactivityGap}
                onClick={skipInactivityGap}
                title={activeInactivityGap ? 'Jump to the next recorded event' : 'Only available during idle gaps (no events captured)'}
              >
                Skip gap
              </button>

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
