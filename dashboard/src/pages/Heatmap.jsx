import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { apiFetch } from '../api.js'
import { getApiBase } from '../lib/publicEnv.js'

const API_BASE = getApiBase()

const HEATMAP_PREFS_KEY = (testId) => `pp_heatmap_prefs_${testId}`

const DEFAULT_SPREAD = 100
const DEFAULT_INTENSITY = 50
const DEFAULT_OVERLAY = 55
const DEFAULT_SMOOTH = 60

function loadHeatmapPrefs(testId) {
  try {
    const raw = sessionStorage.getItem(HEATMAP_PREFS_KEY(testId))
    if (!raw) return null
    const o = JSON.parse(raw)
    if (typeof o.spread !== 'number' || typeof o.intensity !== 'number' || typeof o.overlay !== 'number') return null
    const smooth =
      typeof o.smooth === 'number' ? Math.min(100, Math.max(0, o.smooth)) : DEFAULT_SMOOTH
    return {
      spread: Math.min(150, Math.max(50, o.spread)),
      intensity: Math.min(100, Math.max(0, o.intensity)),
      overlay: Math.min(90, Math.max(35, o.overlay)),
      smooth
    }
  } catch {
    return null
  }
}

function saveHeatmapPrefs(testId, prefs) {
  try {
    sessionStorage.setItem(HEATMAP_PREFS_KEY(testId), JSON.stringify(prefs))
  } catch {
    /* ignore */
  }
}

/**
 * Copy accumulated heat to a new canvas with Gaussian-like blur (CSS filter) for smooth “liquid” regions.
 */
function blurIntensityCanvas(source, W, H, blurPx) {
  const out = document.createElement('canvas')
  out.width = W
  out.height = H
  const bc = out.getContext('2d')
  bc.fillStyle = '#000'
  bc.fillRect(0, 0, W, H)
  if (blurPx >= 0.5) {
    bc.filter = `blur(${blurPx}px)`
    bc.drawImage(source, 0, 0)
    bc.filter = 'none'
  } else {
    bc.drawImage(source, 0, 0)
  }
  return out
}

/**
 * Accumulate radial blobs into offscreen canvas, optional blur, then colourise with percentile-based LUT.
 */
function renderHeatmap(canvas, options) {
  const {
    mode,
    clicks = [],
    moves = [],
    spreadMul = 1,
    intensity = 50,
    gamma = 0.82,
    smooth = DEFAULT_SMOOTH
  } = options

  if (!canvas) return
  const W = canvas.width
  const H = canvas.height
  const ctx = canvas.getContext('2d')
  const minDim = Math.min(W, H)

  const rClicks = Math.max(6, minDim * 0.016 * spreadMul)
  const rMoves = Math.max(4, minDim * 0.009 * spreadMul)

  const off = document.createElement('canvas')
  off.width = W
  off.height = H
  const oc = off.getContext('2d')
  oc.clearRect(0, 0, W, H)
  oc.globalCompositeOperation = 'lighter'

  const drawLayer = (pts, radius, centerA, midA) => {
    for (const pt of pts) {
      const px = pt.x * W
      const py = pt.y * H
      const grad = oc.createRadialGradient(px, py, 0, px, py, radius)
      grad.addColorStop(0, `rgba(255,255,255,${centerA})`)
      grad.addColorStop(0.45, `rgba(255,255,255,${midA})`)
      grad.addColorStop(1, 'rgba(255,255,255,0)')
      oc.fillStyle = grad
      oc.beginPath()
      oc.arc(px, py, radius, 0, Math.PI * 2)
      oc.fill()
    }
  }

  if (mode === 'clicks') {
    drawLayer(clicks, rClicks, 0.038, 0.014)
  } else if (mode === 'moves') {
    drawLayer(moves, rMoves, 0.022, 0.008)
  } else {
    drawLayer(moves, rMoves * 0.95, 0.018, 0.006)
    drawLayer(clicks, rClicks, 0.032, 0.012)
  }

  const maxBlur = Math.min(20, Math.max(8, minDim * 0.032))
  const blurPx = (smooth / 100) * maxBlur
  const imgData =
    smooth <= 0 || blurPx < 0.35
      ? oc.getImageData(0, 0, W, H)
      : blurIntensityCanvas(off, W, H, blurPx).getContext('2d').getImageData(0, 0, W, H)
  const data = imgData.data

  for (let i = 0; i < data.length; i += 4) {
    let v = data[i]
    if (v === 0) continue
    v = Math.min(255, Math.sqrt(v / 255) * 255)
    data[i] = Math.round(v)
  }

  const hist = new Uint32Array(256)
  let nz = 0
  for (let i = 0; i < data.length; i += 4) {
    const v = data[i]
    if (v > 0) {
      hist[v]++
      nz++
    }
  }

  if (nz === 0) {
    ctx.clearRect(0, 0, W, H)
    return
  }

  const hiPercentile = 98 - (intensity / 100) * 10
  const target = Math.max(1, Math.ceil(nz * (hiPercentile / 100)))
  let cum = 0
  let hi = 255
  for (let v = 1; v <= 255; v++) {
    cum += hist[v]
    if (cum >= target) {
      hi = v
      break
    }
  }

  const lo = 0
  let maxFallback = 0
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] > maxFallback) maxFallback = data[i]
  }

  const lut = buildLut()
  const useMax = hi <= lo + 1 || maxFallback === 0

  for (let i = 0; i < data.length; i += 4) {
    let raw = data[i]
    if (raw === 0) {
      data[i + 3] = 0
      continue
    }
    raw = Math.min(raw, 252)
    let t
    if (useMax) {
      t = maxFallback > 0 ? raw / maxFallback : 0
    } else {
      t = (raw - lo) / (hi - lo)
    }
    t = Math.max(0, Math.min(1, t))
    t = Math.pow(t, gamma)
    const idx = Math.min(255, Math.round(t * 255))
    const c = lut[idx]
    data[i] = c[0]
    data[i + 1] = c[1]
    data[i + 2] = c[2]
    data[i + 3] = c[3]
  }

  oc.putImageData(imgData, 0, 0)
  ctx.clearRect(0, 0, W, H)
  ctx.drawImage(off, 0, 0)
}

function buildLut() {
  const lut = new Array(256)
  for (let i = 0; i < 256; i++) {
    const t = i / 255
    let r, g, b, a
    if (t < 0.25) {
      const s = t / 0.25
      r = 0; g = Math.round(s * 120); b = 255; a = Math.round(s * 180)
    } else if (t < 0.5) {
      const s = (t - 0.25) / 0.25
      r = 0; g = Math.round(120 + s * 135); b = Math.round(255 * (1 - s)); a = 200
    } else if (t < 0.75) {
      const s = (t - 0.5) / 0.25
      r = Math.round(s * 255); g = 255; b = 0; a = 215
    } else {
      const s = (t - 0.75) / 0.25
      r = 255; g = Math.round(255 * (1 - s)); b = 0; a = 230
    }
    lut[i] = [r, g, b, a]
  }
  return lut
}

export default function Heatmap() {
  const { id } = useParams()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [pages, setPages] = useState([])
  const [selected, setSelected] = useState(null)
  const [mode, setMode] = useState('clicks')
  const [bgUrl, setBgUrl] = useState(null)

  const [spread, setSpread] = useState(DEFAULT_SPREAD)
  const [intensity, setIntensity] = useState(DEFAULT_INTENSITY)
  const [overlay, setOverlay] = useState(DEFAULT_OVERLAY)
  const [smooth, setSmooth] = useState(DEFAULT_SMOOTH)

  const canvasRef = useRef(null)
  const wrapRef = useRef(null)

  useEffect(() => {
    const p = loadHeatmapPrefs(id)
    if (p) {
      setSpread(p.spread)
      setIntensity(p.intensity)
      setOverlay(p.overlay)
      setSmooth(p.smooth ?? DEFAULT_SMOOTH)
    }
  }, [id])

  useEffect(() => {
    saveHeatmapPrefs(id, { spread, intensity, overlay, smooth })
  }, [id, spread, intensity, overlay, smooth])

  useEffect(() => {
    apiFetch(`/api/tests/${id}/heatmap`)
      .then((d) => {
        setPages(d.pages || [])
        if (d.pages?.length) setSelected(d.pages[0])
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => {
    setBgUrl(null)
    if (!selected?.background_path) return
    const parts = selected.background_path.split('/')
    const eventFile = parts[2]
    if (!eventFile) return
    const eventId = eventFile.split('.')[0]
    fetch(`${API_BASE}/api/tests/${id}/events/${eventId}/screenshot`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('pp_token') || ''}` }
    })
      .then((r) => (r.ok ? r.blob() : null))
      .then((b) => (b ? setBgUrl(URL.createObjectURL(b)) : null))
      .catch(() => {})
  }, [selected?.background_path, id])

  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !selected) return

    const W = wrap?.clientWidth || 800
    const H = wrap?.clientHeight || Math.round((W * 9) / 16)
    canvas.width = W
    canvas.height = H

    const clicks = selected.clicks || []
    const moves = selected.moves || []
    const hasClicks = clicks.length > 0
    const hasMoves = moves.length > 0

    if (!hasClicks && !hasMoves) return

    let renderMode = mode
    if (mode === 'clicks' && !hasClicks && hasMoves) renderMode = 'moves'
    if (mode === 'moves' && !hasMoves && hasClicks) renderMode = 'clicks'

    renderHeatmap(canvas, {
      mode: renderMode,
      clicks,
      moves,
      spreadMul: spread / 100,
      intensity,
      gamma: 0.82,
      smooth
    })
  }, [selected, mode, spread, intensity, smooth])

  useEffect(() => {
    redraw()
  }, [redraw])

  useEffect(() => {
    window.addEventListener('resize', redraw)
    return () => window.removeEventListener('resize', redraw)
  }, [redraw])

  if (loading) return <p className="pp-loading">Loading heatmap…</p>
  if (error) return <p className="error">Error: {error}</p>

  const pointCount = selected
    ? mode === 'clicks'
      ? selected.clicks?.length || 0
      : mode === 'moves'
        ? selected.moves?.length || 0
        : (selected.clicks?.length || 0) + (selected.moves?.length || 0)
    : 0

  const hiPercentileLabel = Math.round(98 - (intensity / 100) * 10)
  const hotFractionPct = Math.max(1, 100 - hiPercentileLabel)

  return (
    <div className="pp-heatmap-layout">
      <aside className="pp-heatmap-sidebar">
        <div className="pp-heatmap-sidebar-head">
          <Link
            to={`/tests/${id}/results`}
            className="pp-back-link"
            style={{ display: 'block', marginBottom: '0.75rem' }}
          >
            ← Results
          </Link>
          <p className="pp-kicker" style={{ marginBottom: '0.25rem' }}>Pages</p>
        </div>

        {pages.length === 0 ? (
          <p className="pp-muted" style={{ padding: '0 1.25rem', fontSize: '0.8125rem' }}>
            No data yet
          </p>
        ) : (
          pages.map((page) => (
            <button
              key={page.path}
              type="button"
              className={`pp-heatmap-page-btn${selected?.path === page.path ? ' is-active' : ''}`}
              onClick={() => setSelected(page)}
            >
              <span className="pp-heatmap-page-path" title={page.path}>{page.path}</span>
              <span className="pp-heatmap-page-meta">
                {page.click_count > 0 && <span>{page.click_count} clicks</span>}
                {page.move_count > 0 && <span>{page.move_count} moves</span>}
              </span>
            </button>
          ))
        )}
      </aside>

      <main className="pp-heatmap-main">
        <div className="pp-heatmap-controls">
          <div style={{ minWidth: 0 }}>
            <span className="pp-kicker" style={{ marginBottom: '0.1rem', display: 'block' }}>Heatmap</span>
            <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text)' }}>
              {selected ? selected.path : '—'}
            </span>
          </div>

          <div className="pp-inline pp-heatmap-mode-row" style={{ gap: '0.4rem', flexWrap: 'wrap' }}>
            {['clicks', 'moves', 'all'].map((m) => (
              <button
                key={m}
                type="button"
                className={`pp-btn-sm${mode === m ? ' primary' : ''}`}
                onClick={() => setMode(m)}
              >
                {m === 'clicks' ? '👆 Clicks' : m === 'moves' ? '🖱 Movement' : '⬡ All'}
              </button>
            ))}
          </div>

          <div className="pp-heatmap-tuners">
            <label className="pp-heatmap-tuner">
              <span>Spread</span>
              <input
                type="range"
                min={50}
                max={150}
                value={spread}
                onChange={(e) => setSpread(Number(e.target.value))}
              />
            </label>
            <label className="pp-heatmap-tuner">
              <span>Contrast</span>
              <input
                type="range"
                min={0}
                max={100}
                value={intensity}
                onChange={(e) => setIntensity(Number(e.target.value))}
              />
            </label>
            <label className="pp-heatmap-tuner">
              <span>Smooth</span>
              <input
                type="range"
                min={0}
                max={100}
                value={smooth}
                onChange={(e) => setSmooth(Number(e.target.value))}
              />
            </label>
            <label className="pp-heatmap-tuner">
              <span>Overlay</span>
              <input
                type="range"
                min={35}
                max={90}
                value={overlay}
                onChange={(e) => setOverlay(Number(e.target.value))}
              />
            </label>
          </div>

          <span className="pp-muted" style={{ fontSize: '0.8125rem', whiteSpace: 'nowrap' }}>
            {pointCount.toLocaleString()} point{pointCount !== 1 ? 's' : ''}
          </span>
        </div>

        {!selected || ((selected.clicks?.length ?? 0) === 0 && (selected.moves?.length ?? 0) === 0) ? (
          <div className="pp-heatmap-empty">
            <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>🔥</div>
            <p style={{ fontWeight: 600, margin: '0 0 0.35rem' }}>No heatmap data yet</p>
            <p className="pp-muted" style={{ margin: 0, fontSize: '0.875rem', maxWidth: 380, textAlign: 'center' }}>
              Make sure the snippet is installed on your prototype and participants have visited this page.
            </p>
          </div>
        ) : (
          <>
            <div className="pp-heatmap-canvas-wrap" ref={wrapRef}>
              {bgUrl && (
                <img
                  src={bgUrl}
                  alt="Page screenshot"
                  className="pp-heatmap-bg"
                  onLoad={redraw}
                />
              )}
              <canvas
                ref={canvasRef}
                className="pp-heatmap-canvas"
                style={{ opacity: overlay / 100 }}
              />
            </div>

            <div className="pp-heatmap-legend-block">
              <div className="pp-heatmap-legend">
                <span className="pp-muted" style={{ fontSize: '0.75rem' }}>Low</span>
                <div className="pp-heatmap-gradient" />
                <span className="pp-muted" style={{ fontSize: '0.75rem' }}>High</span>
              </div>
              <p className="pp-heatmap-legend-note">
                Relative activity on this page. The red end highlights roughly the hottest {hotFractionPct}% (Contrast).
                Smooth blends nearby activity for a softer overlay; set to 0 for crisp blobs.
              </p>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
