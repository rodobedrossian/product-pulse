import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { apiFetch } from '../api.js'
import { getApiBase } from '../lib/publicEnv.js'

const API_BASE = getApiBase()

// ─── Canvas heatmap renderer ─────────────────────────────────────────────────

/**
 * Draws a radial-gradient intensity map then colourises it with a
 * blue → cyan → green → yellow → red lookup table.
 *
 * points:  [{ x, y }]  — normalised 0–1 coords
 * radius:  spread in canvas pixels per point
 * canvas:  HTMLCanvasElement
 */
function renderHeatmap(canvas, points, radius) {
  if (!canvas || !points.length) return
  const W = canvas.width
  const H = canvas.height
  const ctx = canvas.getContext('2d')

  // ── 1. Intensity layer (offscreen) ────────────────────────────────────────
  const off = document.createElement('canvas')
  off.width  = W
  off.height = H
  const oc = off.getContext('2d')
  oc.clearRect(0, 0, W, H)

  // Each point adds a radial gradient blob; 'lighter' accumulates intensity.
  oc.globalCompositeOperation = 'lighter'
  for (const pt of points) {
    const px = pt.x * W
    const py = pt.y * H
    const grad = oc.createRadialGradient(px, py, 0, px, py, radius)
    grad.addColorStop(0,   'rgba(255,255,255,1)')
    grad.addColorStop(0.3, 'rgba(255,255,255,0.5)')
    grad.addColorStop(0.7, 'rgba(255,255,255,0.15)')
    grad.addColorStop(1,   'rgba(255,255,255,0)')
    oc.fillStyle = grad
    oc.beginPath()
    oc.arc(px, py, radius, 0, Math.PI * 2)
    oc.fill()
  }

  // ── 2. Colourise using pixel-level lookup table ───────────────────────────
  const imgData = oc.getImageData(0, 0, W, H)
  const data    = imgData.data

  // Find the maximum intensity so we can normalize the full range.
  // Without this, a sparse heatmap clusters at the bottom of the LUT
  // and everything looks uniformly blue/transparent with no red hot spots.
  let maxIntensity = 0
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] > maxIntensity) maxIntensity = data[i]
  }
  if (maxIntensity === 0) return  // nothing to draw

  // LUT: intensity (0–255) → [r, g, b, a]
  const lut = buildLut()
  const scale = 255 / maxIntensity  // stretch hottest pixel to LUT[255] (red)

  for (let i = 0; i < data.length; i += 4) {
    const raw = data[i]   // red channel = brightness from 'lighter' blend
    if (raw === 0) { data[i + 3] = 0; continue }
    // Normalize then apply a mild power curve so mid-density areas show green/yellow
    const normalized = Math.min(255, Math.round(Math.pow(raw * scale / 255, 0.6) * 255))
    const c = lut[normalized]
    data[i]     = c[0]
    data[i + 1] = c[1]
    data[i + 2] = c[2]
    data[i + 3] = c[3]
  }
  oc.putImageData(imgData, 0, 0)

  // ── 3. Composite onto main canvas ────────────────────────────────────────
  ctx.clearRect(0, 0, W, H)
  ctx.drawImage(off, 0, 0)
}

/** Transparent → blue → cyan → green → yellow → red colour ramp */
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

// ─── Page component ──────────────────────────────────────────────────────────

export default function Heatmap() {
  const { id } = useParams()
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)
  const [pages, setPages]       = useState([])
  const [selected, setSelected] = useState(null)   // page object
  const [mode, setMode]         = useState('clicks') // 'clicks' | 'moves' | 'all'
  const [bgUrl, setBgUrl]       = useState(null)

  const canvasRef  = useRef(null)
  const wrapRef    = useRef(null)

  // ── Load heatmap data ──────────────────────────────────────────────────────
  useEffect(() => {
    apiFetch(`/api/tests/${id}/heatmap`)
      .then(d => {
        setPages(d.pages || [])
        if (d.pages?.length) setSelected(d.pages[0])
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [id])

  // ── Fetch signed screenshot URL when selected page changes ────────────────
  useEffect(() => {
    setBgUrl(null)
    if (!selected?.background_path) return
    // Find the event id from the path: {test_id}/{tid}/{event_id}.ext
    const parts = selected.background_path.split('/')
    const eventFile = parts[2]
    if (!eventFile) return
    const eventId = eventFile.split('.')[0]
    // Use the existing screenshot proxy endpoint
    fetch(`${API_BASE}/api/tests/${id}/events/${eventId}/screenshot`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('pp_token') || ''}` }
    })
      .then(r => r.ok ? r.blob() : null)
      .then(b => b ? setBgUrl(URL.createObjectURL(b)) : null)
      .catch(() => {})
  }, [selected?.background_path, id])

  // ── Redraw canvas whenever data or mode changes ────────────────────────────
  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    const wrap   = wrapRef.current
    if (!canvas || !selected) return

    // Size canvas to match wrapper (or a 16:9 fallback)
    const W = wrap?.clientWidth  || 800
    const H = wrap?.clientHeight || Math.round(W * 9 / 16)
    canvas.width  = W
    canvas.height = H

    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, W, H)

    let points = []
    if (mode === 'clicks' || mode === 'all') points = points.concat(selected.clicks || [])
    if (mode === 'moves'  || mode === 'all') points = points.concat(selected.moves  || [])

    const radius = mode === 'moves' ? 18 : 32
    renderHeatmap(canvas, points, radius)
  }, [selected, mode])

  useEffect(() => { redraw() }, [redraw])

  // Redraw on window resize
  useEffect(() => {
    window.addEventListener('resize', redraw)
    return () => window.removeEventListener('resize', redraw)
  }, [redraw])

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading) return <p className="pp-loading">Loading heatmap…</p>
  if (error)   return <p className="error">Error: {error}</p>

  const points = selected
    ? (mode === 'clicks' ? selected.clicks : mode === 'moves' ? selected.moves
        : [...(selected.clicks || []), ...(selected.moves || [])]).length
    : 0

  return (
    <div className="pp-heatmap-layout">

      {/* ── Sidebar: page list ─────────────────────────────────────────── */}
      <aside className="pp-heatmap-sidebar">
        <div className="pp-heatmap-sidebar-head">
          <Link to={`/tests/${id}/results`} className="pp-back-link" style={{ display: 'block', marginBottom: '0.75rem' }}>
            ← Results
          </Link>
          <p className="pp-kicker" style={{ marginBottom: '0.25rem' }}>Pages</p>
        </div>

        {pages.length === 0 ? (
          <p className="pp-muted" style={{ padding: '0 1.25rem', fontSize: '0.8125rem' }}>
            No data yet
          </p>
        ) : (
          pages.map(page => (
            <button
              key={page.path}
              type="button"
              className={`pp-heatmap-page-btn${selected?.path === page.path ? ' is-active' : ''}`}
              onClick={() => setSelected(page)}
            >
              <span className="pp-heatmap-page-path" title={page.path}>{page.path}</span>
              <span className="pp-heatmap-page-meta">
                {page.click_count > 0 && <span>{page.click_count} clicks</span>}
                {page.move_count  > 0 && <span>{page.move_count} moves</span>}
              </span>
            </button>
          ))
        )}
      </aside>

      {/* ── Main: canvas heatmap ───────────────────────────────────────── */}
      <main className="pp-heatmap-main">

        {/* Controls */}
        <div className="pp-heatmap-controls">
          <div style={{ minWidth: 0 }}>
            <span className="pp-kicker" style={{ marginBottom: '0.1rem', display: 'block' }}>Heatmap</span>
            <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text)' }}>
              {selected ? selected.path : '—'}
            </span>
          </div>

          <div className="pp-inline" style={{ gap: '0.4rem' }}>
            {['clicks', 'moves', 'all'].map(m => (
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

          <span className="pp-muted" style={{ fontSize: '0.8125rem', whiteSpace: 'nowrap' }}>
            {points.toLocaleString()} point{points !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Canvas area */}
        {!selected || (selected.clicks.length === 0 && selected.moves.length === 0) ? (
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
              <canvas ref={canvasRef} className="pp-heatmap-canvas" />
            </div>

            {/* Legend */}
            <div className="pp-heatmap-legend">
              <span className="pp-muted" style={{ fontSize: '0.75rem' }}>Low</span>
              <div className="pp-heatmap-gradient" />
              <span className="pp-muted" style={{ fontSize: '0.75rem' }}>High</span>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
