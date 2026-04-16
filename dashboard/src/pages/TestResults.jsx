import { Fragment, useEffect, useMemo, useState, useCallback } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { apiFetch } from '../api.js'
import { getApiBase } from '../lib/publicEnv.js'
import ContextMarkdownPreview from '../components/ContextMarkdownPreview.jsx'

function formatMs(ms) {
  if (ms == null) return '—'
  if (ms < 1000) return ms + 'ms'
  if (ms < 60000) return (ms / 1000).toFixed(1) + 's'
  const m = Math.floor(ms / 60000)
  const s = ((ms % 60000) / 1000).toFixed(0)
  return `${m}m ${s}s`
}

const API_BASE = getApiBase()

function DeleteParticipantModal({ participant, testId, onConfirm, onCancel }) {
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState(null)

  async function handleDelete() {
    setDeleting(true)
    setError(null)
    try {
      await apiFetch(`/api/tests/${testId}/participants/${participant.participant_id}`, { method: 'DELETE' })
      onConfirm(participant.tid)
    } catch (e) {
      setError(e.message || 'Failed to delete participant')
      setDeleting(false)
    }
  }

  return (
    <div className="pp-modal-overlay" onClick={onCancel}>
      <div className="pp-modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="pp-modal-title">Remove participant?</h2>
        <p className="pp-modal-body">
          This will permanently delete <strong>{participant.name}</strong> and all their data —
          events, session replay, and any recorded interactions. This cannot be undone.
        </p>
        {error && <p className="pp-modal-error">{error}</p>}
        <div className="pp-modal-actions">
          <button type="button" className="pp-btn pp-btn-secondary" onClick={onCancel} disabled={deleting}>
            Cancel
          </button>
          <button type="button" className="pp-btn pp-btn-danger" onClick={handleDelete} disabled={deleting}>
            {deleting ? 'Removing…' : 'Remove participant'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ScreenshotLightbox({ src, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="pp-lightbox-backdrop" onClick={onClose}>
      <div className="pp-lightbox" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="pp-lightbox-close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <img src={src} alt="Event screenshot" className="pp-lightbox-img" />
      </div>
    </div>
  )
}

function EventTimeline({ events, testId }) {
  const [lightbox, setLightbox] = useState(null)

  if (!events || events.length === 0) {
    return (
      <p className="pp-muted" style={{ margin: '0.5rem 0', fontSize: '0.8125rem' }}>
        No events recorded.
      </p>
    )
  }
  return (
    <>
      {lightbox && <ScreenshotLightbox src={lightbox} onClose={() => setLightbox(null)} />}
      <div className="pp-table-wrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: 90 }}>Time</th>
              <th style={{ width: 100 }}>Type</th>
              <th style={{ width: 180 }}>Text / selector</th>
              <th>URL</th>
              <th style={{ width: 48 }}>View</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => {
              const hasScreenshot = !!e.screenshot_object_path
              const screenshotUrl = hasScreenshot
                ? `${API_BASE}/api/tests/${testId}/events/${e.id}/screenshot`
                : null
              return (
                <tr key={e.id}>
                  <td className="pp-muted" style={{ fontVariantNumeric: 'tabular-nums', fontSize: '0.8125rem' }}>
                    {e.relative_ms != null ? (e.relative_ms >= 0 ? '+' : '') + formatMs(e.relative_ms) : '—'}
                  </td>
                  <td><code>{e.type}</code></td>
                  <td style={{ maxWidth: 180 }}>
                    {e.metadata?.text ? (
                      <span style={{ fontSize: '0.8125rem', color: 'var(--color-text)' }} title={e.metadata.text}>
                        "{e.metadata.text.length > 40 ? e.metadata.text.slice(0, 40) + '…' : e.metadata.text}"
                      </span>
                    ) : (
                      <code style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}>{e.selector || '—'}</code>
                    )}
                  </td>
                  <td
                    className="pp-muted"
                    style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.75rem' }}
                  >
                    {e.url || '—'}
                  </td>
                  <td>
                    {hasScreenshot ? (
                      <button
                        type="button"
                        className="pp-btn-icon"
                        title="View screenshot"
                        onClick={() => setLightbox(screenshotUrl)}
                      >
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="2" y="3" width="12" height="10" rx="1.5" />
                          <circle cx="5.5" cy="6.5" r="1" />
                          <path d="M14 10l-3-3-5 5" />
                          <path d="M14 13H2l4-4" />
                        </svg>
                      </button>
                    ) : (
                      <span className="pp-muted" style={{ fontSize: '0.75rem' }}>—</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}

function StatCard({ label, value, highlight }) {
  const valueClass =
    highlight === 'green' ? 'pp-stat-value pp-stat-value--success'
    : highlight === 'yellow' ? 'pp-stat-value pp-stat-value--warn'
    : highlight === 'red' ? 'pp-stat-value pp-stat-value--danger'
    : 'pp-stat-value'
  return (
    <div className="pp-stat-card">
      <div className="pp-stat-label">{label}</div>
      <div className={valueClass}>{value}</div>
    </div>
  )
}

function median(values) {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid]
}

function NamedEventsTaxonomy({ testId }) {
  const [definitions, setDefinitions] = useState(null) // null = loading, [] = empty
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')

  useEffect(() => {
    apiFetch(`/api/tests/${testId}/event-definitions`)
      .then((data) => setDefinitions(Array.isArray(data) ? data : []))
      .catch(() => setDefinitions([]))
  }, [testId])

  async function handleGenerate() {
    setGenerating(true)
    setGenError(null)
    try {
      const result = await apiFetch(`/api/tests/${testId}/event-definitions/generate`, {
        method: 'POST',
        signal: AbortSignal.timeout(60000),
      })
      setDefinitions(Array.isArray(result) ? result : [])
    } catch (e) {
      setGenError(e.message || 'Generation failed')
    } finally {
      setGenerating(false)
    }
  }

  async function handleSaveName(def) {
    const trimmed = editName.trim()
    if (!trimmed || trimmed === def.name) { setEditingId(null); return }
    try {
      await apiFetch(`/api/tests/${testId}/event-definitions/${def.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: trimmed }),
      })
      setDefinitions((prev) => prev.map((d) => d.id === def.id ? { ...d, name: trimmed } : d))
    } catch { /* silent — revert */ }
    setEditingId(null)
  }

  async function handleDelete(defId) {
    try {
      await apiFetch(`/api/tests/${testId}/event-definitions/${defId}`, { method: 'DELETE' })
      setDefinitions((prev) => prev.filter((d) => d.id !== defId))
    } catch { /* silent */ }
  }

  const hasDefinitions = definitions && definitions.length > 0

  return (
    <div className="pp-card pp-table-card" style={{ padding: 0, overflow: 'hidden', marginBottom: '1rem' }}>
      <div style={{ padding: '1rem 1.35rem 0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
        <div>
          <h2 className="pp-section-title" style={{ margin: 0 }}>Named events</h2>
          <p className="pp-muted" style={{ margin: '0.25rem 0 0', fontSize: '0.8125rem' }}>AI-generated semantic event definitions matched against raw interaction data</p>
        </div>
        <button
          type="button"
          className="pp-btn pp-btn-secondary"
          style={{ whiteSpace: 'nowrap', flexShrink: 0 }}
          onClick={handleGenerate}
          disabled={generating}
        >
          {generating ? 'Generating…' : hasDefinitions ? '↺ Regenerate' : '✦ Generate'}
        </button>
      </div>
      {genError && (
        <p className="pp-muted" style={{ margin: '0 1.35rem 0.75rem', color: 'var(--color-danger, #dc2626)', fontSize: '0.8125rem' }}>{genError}</p>
      )}
      {definitions === null ? (
        <p className="pp-muted" style={{ margin: '0 1.35rem 1rem', fontSize: '0.8125rem' }}>Loading…</p>
      ) : definitions.length === 0 ? (
        <p className="pp-muted" style={{ margin: '0 1.35rem 1rem', fontSize: '0.8125rem' }}>
          No named events yet. Click <strong>✦ Generate</strong> to auto-detect semantic events from your interaction data.
        </p>
      ) : (
        <div className="pp-table-wrap" style={{ margin: 0, padding: 0 }}>
          <table>
            <thead>
              <tr>
                <th>Event name</th>
                <th>Type</th>
                <th style={{ textAlign: 'right' }}>Count</th>
                <th style={{ width: 64 }}></th>
              </tr>
            </thead>
            <tbody>
              {definitions.map((def) => (
                <tr key={def.id}>
                  <td>
                    {editingId === def.id ? (
                      <input
                        style={{ width: '100%', font: 'inherit', padding: '2px 4px', border: '1px solid var(--color-border, #e2e8f0)', borderRadius: 4 }}
                        value={editName}
                        autoFocus
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleSaveName(def); if (e.key === 'Escape') setEditingId(null) }}
                        onBlur={() => handleSaveName(def)}
                      />
                    ) : (
                      <span
                        style={{ cursor: 'pointer' }}
                        title="Double-click to rename"
                        onDoubleClick={() => { setEditingId(def.id); setEditName(def.name) }}
                      >
                        {def.name}
                      </span>
                    )}
                    {def.description && <span className="pp-muted" style={{ display: 'block', fontSize: '0.75rem', marginTop: 2 }}>{def.description}</span>}
                  </td>
                  <td><span className={`pp-interaction-type pp-interaction-type--${def.type}`}>{def.type}</span></td>
                  <td style={{ textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{def.count ?? 0}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button
                      type="button"
                      className="pp-btn pp-btn-secondary"
                      style={{ padding: '2px 8px', fontSize: '0.75rem', marginRight: 4 }}
                      onClick={() => { setEditingId(def.id); setEditName(def.name) }}
                      title="Rename"
                    >✎</button>
                    <button
                      type="button"
                      className="pp-btn pp-btn-danger"
                      style={{ padding: '2px 8px', fontSize: '0.75rem' }}
                      onClick={() => handleDelete(def.id)}
                      title="Delete"
                    >✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function ObservationalResults({ data, testId, navigate }) {
  const [tab, setTab] = useState('overview')
  const [sessionDevice, setSessionDevice] = useState('all')
  const [sessionReplay, setSessionReplay] = useState('all')
  const [sessionReferrer, setSessionReferrer] = useState('all')
  const [eventType, setEventType] = useState('all')
  const [eventUrl, setEventUrl] = useState('')
  const [eventText, setEventText] = useState('')
  const [eventTid, setEventTid] = useState('')
  const [lightbox, setLightbox] = useState(null)

  const sessions = data.results || []
  const totalSessions = data.total_sessions ?? sessions.length
  const uniqueVisitors = data.unique_testers ?? 0
  const returningVisitors = data.returning_testers ?? 0
  const replaySessions = sessions.filter((s) => s.has_replay).length
  const replayCoverage = totalSessions > 0 ? Math.round((replaySessions / totalSessions) * 100) : 0
  const avgEventsPerSession = totalSessions > 0
    ? (sessions.reduce((sum, s) => sum + (s.event_count || 0), 0) / totalSessions).toFixed(1)
    : '0.0'
  const durationValues = sessions.map((s) => s.duration_ms).filter((v) => Number.isFinite(v) && v > 0)
  const medianDurationMs = median(durationValues)

  const sessionsByDay = useMemo(() => {
    const map = {}
    sessions.forEach((s) => {
      const d = new Date(s.created_at)
      if (Number.isNaN(d.getTime())) return
      const key = d.toISOString().slice(0, 10)
      map[key] = (map[key] || 0) + 1
    })
    return Object.entries(map)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([date, count]) => ({ date, count }))
  }, [sessions])

  const maxSessionDay = Math.max(1, ...sessionsByDay.map((d) => d.count))

  const referrers = (data.referrers || []).slice(0, 8)
  const maxReferrerCount = Math.max(1, ...referrers.map((r) => r.count))

  const countryCounts = useMemo(() => {
    const map = {}
    sessions.forEach((s) => {
      const key = s.country || 'Unknown'
      map[key] = (map[key] || 0) + 1
    })
    return Object.entries(map)
      .map(([country, count]) => ({ country, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8)
  }, [sessions])
  const maxCountryCount = Math.max(1, ...countryCounts.map((c) => c.count))

  const allEvents = useMemo(() => {
    const flat = []
    sessions.forEach((s) => {
      ;(s.events || []).forEach((e) => {
        flat.push({
          ...e,
          tid: s.tid,
          browser: s.browser,
          device_type: s.device_type,
          created_at: s.created_at
        })
      })
    })
    return flat.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
  }, [sessions])

  const eventTypeCounts = useMemo(() => {
    const map = {}
    allEvents.forEach((e) => {
      map[e.type] = (map[e.type] || 0) + 1
    })
    return Object.entries(map)
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count)
  }, [allEvents])
  const maxEventTypeCount = Math.max(1, ...eventTypeCounts.map((e) => e.count))

  const topUrls = useMemo(() => {
    const map = {}
    allEvents.forEach((e) => {
      if (!e.url) return
      map[e.url] = (map[e.url] || 0) + 1
    })
    return Object.entries(map)
      .map(([url, count]) => ({ url, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
  }, [allEvents])
  const maxUrlCount = Math.max(1, ...topUrls.map((u) => u.count))

  const topInteractions = useMemo(() => {
    const map = {}
    allEvents
      .filter((e) => e.type === 'click' || e.type === 'input_change')
      .forEach((e) => {
        const label = (e.metadata?.text?.trim() || e.selector || '').slice(0, 80) || '(unknown)'
        const url = e.url || ''
        const key = `${e.type}|||${label}|||${url}`
        if (!map[key]) map[key] = { type: e.type, label, url, count: 0 }
        map[key].count++
      })
    return Object.values(map).sort((a, b) => b.count - a.count).slice(0, 20)
  }, [allEvents])

  const sessionReferrerOptions = useMemo(() => {
    const sources = new Set()
    sessions.forEach((s) => {
      let source = 'Direct'
      if (s.referrer) {
        try { source = new URL(s.referrer).hostname } catch { source = s.referrer }
      }
      sources.add(source)
    })
    return [...sources].sort((a, b) => a.localeCompare(b))
  }, [sessions])

  const filteredSessions = sessions.filter((s) => {
    const device = s.device_type || 'unknown'
    if (sessionDevice !== 'all' && device !== sessionDevice) return false
    if (sessionReplay === 'with' && !s.has_replay) return false
    if (sessionReplay === 'without' && s.has_replay) return false
    let source = 'Direct'
    if (s.referrer) {
      try { source = new URL(s.referrer).hostname } catch { source = s.referrer }
    }
    if (sessionReferrer !== 'all' && source !== sessionReferrer) return false
    return true
  })

  const filteredEvents = allEvents.filter((e) => {
    if (eventType !== 'all' && e.type !== eventType) return false
    if (eventTid.trim() && !String(e.tid || '').toLowerCase().includes(eventTid.trim().toLowerCase())) return false
    if (eventUrl.trim() && !String(e.url || '').toLowerCase().includes(eventUrl.trim().toLowerCase())) return false
    if (eventText.trim()) {
      const text = String(e.metadata?.text || e.selector || '').toLowerCase()
      if (!text.includes(eventText.trim().toLowerCase())) return false
    }
    return true
  })

  return (
    <div className="pp-observational-results">
      {lightbox && <ScreenshotLightbox src={lightbox} onClose={() => setLightbox(null)} />}
      <div className="pp-results-tabs">
        <button type="button" className={tab === 'overview' ? 'is-active' : ''} onClick={() => setTab('overview')}>Overview</button>
        <button type="button" className={tab === 'sessions' ? 'is-active' : ''} onClick={() => setTab('sessions')}>Sessions</button>
        <button type="button" className={tab === 'events' ? 'is-active' : ''} onClick={() => setTab('events')}>Events</button>
      </div>

      {tab === 'overview' && (
        <>
          <div className="pp-stat-grid pp-stat-grid--obs">
            <StatCard label="Sessions" value={totalSessions} />
            <StatCard label="Unique visitors" value={uniqueVisitors} />
            <StatCard label="Returning visitors" value={returningVisitors} />
            <StatCard label="Replay coverage" value={`${replayCoverage}%`} highlight={replayCoverage >= 60 ? 'green' : replayCoverage >= 30 ? 'yellow' : 'red'} />
          </div>

          <div className="pp-stat-grid pp-stat-grid--obs" style={{ marginTop: '-0.5rem' }}>
            <StatCard label="Median session duration" value={formatMs(medianDurationMs)} />
            <StatCard label="Avg events / session" value={avgEventsPerSession} />
            <StatCard label="Total events" value={allEvents.length} />
          </div>

          <div className="pp-card" style={{ marginBottom: '1rem' }}>
            <h2 className="pp-section-title" style={{ marginBottom: '0.75rem' }}>Sessions over time</h2>
            {sessionsByDay.length === 0 ? (
              <p className="pp-muted" style={{ margin: 0 }}>No sessions yet.</p>
            ) : (
              <div className="pp-mini-bars">
                {sessionsByDay.map((d) => (
                  <div key={d.date} className="pp-mini-bar-row">
                    <span className="pp-mini-bar-label">{new Date(d.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                    <div className="pp-mini-bar-track">
                      <div className="pp-mini-bar-fill" style={{ width: `${(d.count / maxSessionDay) * 100}%` }} />
                    </div>
                    <span className="pp-mini-bar-value">{d.count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="pp-results-chart-grid">
            <div className="pp-card">
              <h2 className="pp-section-title" style={{ marginBottom: '0.75rem' }}>Top referrers</h2>
              {referrers.length === 0 ? (
                <p className="pp-muted" style={{ margin: 0 }}>No referrer data yet.</p>
              ) : (
                <div className="pp-mini-bars">
                  {referrers.map((r) => (
                    <div key={r.source} className="pp-mini-bar-row">
                      <span className="pp-mini-bar-label" title={r.source}>{r.source}</span>
                      <div className="pp-mini-bar-track">
                        <div className="pp-mini-bar-fill pp-mini-bar-fill--alt" style={{ width: `${(r.count / maxReferrerCount) * 100}%` }} />
                      </div>
                      <span className="pp-mini-bar-value">{r.count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="pp-card">
              <h2 className="pp-section-title" style={{ marginBottom: '0.75rem' }}>Event type mix</h2>
              {eventTypeCounts.length === 0 ? (
                <p className="pp-muted" style={{ margin: 0 }}>No events yet.</p>
              ) : (
                <div className="pp-mini-bars">
                  {eventTypeCounts.slice(0, 8).map((e) => (
                    <div key={e.type} className="pp-mini-bar-row">
                      <span className="pp-mini-bar-label">{e.type}</span>
                      <div className="pp-mini-bar-track">
                        <div className="pp-mini-bar-fill pp-mini-bar-fill--event" style={{ width: `${(e.count / maxEventTypeCount) * 100}%` }} />
                      </div>
                      <span className="pp-mini-bar-value">{e.count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="pp-card">
              <h2 className="pp-section-title" style={{ marginBottom: '0.75rem' }}>Top countries</h2>
              {countryCounts.length === 0 ? (
                <p className="pp-muted" style={{ margin: 0 }}>No location data yet.</p>
              ) : (
                <div className="pp-mini-bars">
                  {countryCounts.map((c) => (
                    <div key={c.country} className="pp-mini-bar-row">
                      <span className="pp-mini-bar-label">{c.country}</span>
                      <div className="pp-mini-bar-track">
                        <div className="pp-mini-bar-fill pp-mini-bar-fill--geo" style={{ width: `${(c.count / maxCountryCount) * 100}%` }} />
                      </div>
                      <span className="pp-mini-bar-value">{c.count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="pp-card" style={{ marginBottom: '1rem' }}>
            <h2 className="pp-section-title" style={{ marginBottom: '0.75rem' }}>Top URLs visited</h2>
            {topUrls.length === 0 ? (
              <p className="pp-muted" style={{ margin: 0 }}>No URL data yet.</p>
            ) : (
              <div className="pp-mini-bars">
                {topUrls.map((u) => {
                  let display = u.url
                  try { const p = new URL(u.url); display = p.pathname + (p.search || '') } catch { /* noop */ }
                  return (
                    <div key={u.url} className="pp-mini-bar-row pp-mini-bar-row--url">
                      <span className="pp-mini-bar-label" title={u.url}>{display || u.url}</span>
                      <div className="pp-mini-bar-track">
                        <div className="pp-mini-bar-fill pp-mini-bar-fill--url" style={{ width: `${(u.count / maxUrlCount) * 100}%` }} />
                      </div>
                      <span className="pp-mini-bar-value">{u.count}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="pp-card pp-table-card" style={{ padding: 0, overflow: 'hidden', marginBottom: '1rem' }}>
            <div style={{ padding: '1rem 1.35rem 0.75rem' }}>
              <h2 className="pp-section-title" style={{ margin: 0 }}>Top interactions</h2>
              <p className="pp-muted" style={{ margin: '0.25rem 0 0', fontSize: '0.8125rem' }}>Clicks and input changes grouped by element and page</p>
            </div>
            {topInteractions.length === 0 ? (
              <p className="pp-muted" style={{ margin: '0 1.35rem 1rem' }}>No click or input events yet.</p>
            ) : (
              <div className="pp-table-wrap" style={{ margin: 0, padding: 0 }}>
                <table>
                  <thead>
                    <tr>
                      <th>Element</th>
                      <th>Page</th>
                      <th>Type</th>
                      <th style={{ textAlign: 'right' }}>Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topInteractions.map((item, i) => {
                      let pageDisplay = item.url
                      try { const p = new URL(item.url); pageDisplay = p.pathname + (p.search || '') } catch { /* noop */ }
                      return (
                        <tr key={i}>
                          <td style={{ maxWidth: 260 }}>
                            <span className="pp-interaction-label" title={item.label}>
                              {item.label.length > 50 ? `${item.label.slice(0, 50)}…` : item.label}
                            </span>
                          </td>
                          <td className="pp-muted" style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.8125rem' }} title={item.url}>
                            {pageDisplay || '—'}
                          </td>
                          <td>
                            <span className={`pp-interaction-type pp-interaction-type--${item.type}`}>{item.type}</span>
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{item.count}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <NamedEventsTaxonomy testId={testId} />
        </>
      )}

      {tab === 'sessions' && (
        <>
          <div className="pp-card" style={{ marginBottom: '1rem' }}>
            <div className="pp-results-filters">
              <label>
                <span>Device</span>
                <select value={sessionDevice} onChange={(e) => setSessionDevice(e.target.value)}>
                  <option value="all">All</option>
                  <option value="desktop">Desktop</option>
                  <option value="mobile">Mobile</option>
                  <option value="tablet">Tablet</option>
                  <option value="unknown">Unknown</option>
                </select>
              </label>
              <label>
                <span>Replay</span>
                <select value={sessionReplay} onChange={(e) => setSessionReplay(e.target.value)}>
                  <option value="all">All</option>
                  <option value="with">With replay</option>
                  <option value="without">Without replay</option>
                </select>
              </label>
              <label>
                <span>Referrer</span>
                <select value={sessionReferrer} onChange={(e) => setSessionReferrer(e.target.value)}>
                  <option value="all">All</option>
                  {sessionReferrerOptions.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          {filteredSessions.length === 0 ? (
            <div className="pp-empty-state"><p>No sessions match these filters.</p></div>
          ) : (
            <div className="pp-card pp-table-card" style={{ padding: 0, overflow: 'hidden' }}>
              <div className="pp-table-wrap" style={{ margin: 0, padding: 0 }}>
                <table>
                  <thead>
                    <tr>
                      <th>Session</th>
                      <th>Started</th>
                      <th>Location</th>
                      <th>Device</th>
                      <th>Browser</th>
                      <th>Referrer</th>
                      <th>Duration</th>
                      <th>Events</th>
                      <th>Replay</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSessions.map((s) => {
                      let ref = 'Direct'
                      if (s.referrer) {
                        try { ref = new URL(s.referrer).hostname } catch { ref = s.referrer }
                      }
                      const location = [s.region, s.country].filter(Boolean).join(', ') || '—'
                      return (
                        <tr key={s.tid}>
                          <td style={{ fontWeight: 600 }}><code style={{ fontSize: '0.7rem', letterSpacing: '-0.01em' }}>{String(s.tid || '')}</code></td>
                          <td className="pp-muted">{new Date(s.created_at).toLocaleString()}</td>
                          <td title={location !== '—' ? `${s.region || ''}${s.region && s.country ? ', ' : ''}${s.country || ''}` : ''}>
                            {location}
                          </td>
                          <td>{s.device_type || '—'}</td>
                          <td>{s.browser || '—'}</td>
                          <td title={s.referrer || ''}>{ref}</td>
                          <td style={{ fontVariantNumeric: 'tabular-nums' }}>{formatMs(s.duration_ms)}</td>
                          <td>{s.event_count}</td>
                          <td>
                            {s.has_replay ? (
                              <button type="button" className="pp-btn-sm primary" onClick={() => navigate(`/tests/${testId}/replay/${s.tid}`)}>
                                ▶ Watch replay
                              </button>
                            ) : (
                              <span className="pp-muted" style={{ fontSize: '0.75rem' }}>No replay</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {tab === 'events' && (
        <>
          <div className="pp-card" style={{ marginBottom: '1rem' }}>
            <div className="pp-results-filters">
              <label>
                <span>Type</span>
                <select value={eventType} onChange={(e) => setEventType(e.target.value)}>
                  <option value="all">All</option>
                  {eventTypeCounts.map((e) => <option key={e.type} value={e.type}>{e.type}</option>)}
                </select>
              </label>
              <label>
                <span>Session ID</span>
                <input value={eventTid} onChange={(e) => setEventTid(e.target.value)} placeholder="tid…" />
              </label>
              <label>
                <span>URL contains</span>
                <input value={eventUrl} onChange={(e) => setEventUrl(e.target.value)} placeholder="/pricing" />
              </label>
              <label>
                <span>Text / selector contains</span>
                <input value={eventText} onChange={(e) => setEventText(e.target.value)} placeholder="signup" />
              </label>
            </div>
          </div>

          {filteredEvents.length === 0 ? (
            <div className="pp-empty-state"><p>No events match these filters.</p></div>
          ) : (
            <div className="pp-card pp-table-card" style={{ padding: 0, overflow: 'hidden' }}>
              <div className="pp-table-wrap" style={{ margin: 0, padding: 0 }}>
                <table>
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Session</th>
                      <th>Type</th>
                      <th>Text / selector</th>
                      <th>URL</th>
                      <th style={{ width: 48 }}>View</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEvents.map((e) => {
                      const hasScreenshot = !!e.screenshot_object_path
                      const screenshotUrl = hasScreenshot ? `${API_BASE}/api/tests/${testId}/events/${e.id}/screenshot` : null
                      return (
                        <tr key={e.id}>
                          <td className="pp-muted" style={{ whiteSpace: 'nowrap' }}>
                            {new Date(e.timestamp).toLocaleString()}
                          </td>
                          <td><code>{String(e.tid || '').slice(0, 8)}</code></td>
                          <td><code>{e.type}</code></td>
                          <td style={{ maxWidth: 180 }}>
                            {e.metadata?.text ? (
                              <span title={e.metadata.text}>
                                {e.metadata.text.length > 40 ? `${e.metadata.text.slice(0, 40)}…` : e.metadata.text}
                              </span>
                            ) : (
                              <code style={{ fontSize: '0.75rem' }}>{e.selector || '—'}</code>
                            )}
                          </td>
                          <td className="pp-muted" style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.75rem' }}>
                            {e.url || '—'}
                          </td>
                          <td>
                            {hasScreenshot ? (
                              <button
                                type="button"
                                className="pp-btn-icon"
                                title="View screenshot"
                                onClick={() => setLightbox(screenshotUrl)}
                              >
                                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                  <rect x="2" y="3" width="12" height="10" rx="1.5" />
                                  <circle cx="5.5" cy="6.5" r="1" />
                                  <path d="M14 10l-3-3-5 5" />
                                  <path d="M14 13H2l4-4" />
                                </svg>
                              </button>
                            ) : (
                              <span className="pp-muted" style={{ fontSize: '0.75rem' }}>—</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── Single-goal results view ──────────────────────────────────────────────

function SingleResults({ results: initialResults, testId, navigate }) {
  const [expanded, setExpanded] = useState(null)
  const [results, setResults] = useState(initialResults)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const id = testId

  const completed = results.filter((r) => r.completed).length
  const rate = results.length > 0 ? Math.round((completed / results.length) * 100) : 0

  const handleDeleted = useCallback((tid) => {
    setResults(prev => prev.filter(r => r.tid !== tid))
    setConfirmDelete(null)
    if (expanded === tid) setExpanded(null)
  }, [expanded])

  return (
    <>
      {confirmDelete && (
        <DeleteParticipantModal
          participant={confirmDelete}
          testId={id}
          onConfirm={handleDeleted}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
      <div className="pp-stat-grid">
        <StatCard label="Participants" value={results.length} />
        <StatCard label="Completed goal" value={`${completed} / ${results.length}`} />
        <StatCard
          label="Completion rate"
          value={`${rate}%`}
          highlight={rate >= 70 ? 'green' : rate >= 40 ? 'yellow' : 'red'}
        />
      </div>

      {results.length === 0 ? (
        <div className="pp-empty-state">
          <p>No participants yet. Add participants from the test setup page.</p>
        </div>
      ) : (
        <div className="pp-card pp-table-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="pp-table-wrap" style={{ margin: 0, padding: 0 }}>
            <table>
              <thead>
                <tr>
                  <th>Participant</th>
                  <th>Completed</th>
                  <th>Time to goal</th>
                  <th>Events</th>
                  <th>Replay</th>
                  <th style={{ width: 48 }} aria-hidden />
                  <th style={{ width: 40 }} aria-hidden />
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <Fragment key={r.tid}>
                    <tr
                      className={`pp-row-expandable ${expanded === r.tid ? 'is-open' : ''}`}
                      onClick={() => setExpanded(expanded === r.tid ? null : r.tid)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          setExpanded(expanded === r.tid ? null : r.tid)
                        }
                      }}
                      tabIndex={0}
                      role="button"
                      aria-expanded={expanded === r.tid}
                    >
                      <td style={{ fontWeight: 600 }}>{r.name}</td>
                      <td>
                        <span className={`badge ${r.completed ? 'green' : 'red'}`}>
                          {r.completed ? 'Yes' : 'No'}
                        </span>
                      </td>
                      <td style={{ fontVariantNumeric: 'tabular-nums' }}>{formatMs(r.total_time_ms)}</td>
                      <td>{r.event_count}</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        {r.has_replay ? (
                          <button
                            type="button"
                            className="pp-btn-sm primary"
                            onClick={() => navigate(`/tests/${id}/replay/${r.tid}`)}
                            style={{ whiteSpace: 'nowrap' }}
                          >
                            ▶ Watch replay
                          </button>
                        ) : (
                          <span className="pp-muted" style={{ fontSize: '0.75rem' }}>No replay</span>
                        )}
                      </td>
                      <td className="pp-chevron">{expanded === r.tid ? '▲' : '▼'}</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          className="pp-btn-delete-participant"
                          title="Remove participant"
                          onClick={() => setConfirmDelete(r)}
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                    {expanded === r.tid && (
                      <tr className="pp-row-detail">
                        <td colSpan={7}>
                          <EventTimeline events={r.events} testId={id} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  )
}

// ─── Scenario results view ────────────────────────────────────────────────

// ─── Insight Summary (cross-participant) ─────────────────────────────────────

const INSIGHT_META = [
  { type: 'confusion',   emoji: '🟡', label: 'Confused'    },
  { type: 'frustration', emoji: '🔴', label: 'Frustrated'  },
  { type: 'delight',     emoji: '🟢', label: 'Delighted'   },
  { type: 'hesitation',  emoji: '🔵', label: 'Hesitant'    },
  { type: 'discovery',   emoji: '✨', label: 'Discovery'   },
  { type: 'comparison',  emoji: '⚪', label: 'Comparison'  },
]

function InsightsSummary({ testId }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [openSections, setOpenSections] = useState({})

  useEffect(() => {
    apiFetch(`/api/tests/${testId}/insights`)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [testId])

  if (loading) return <p className="pp-loading" style={{ padding: '1.5rem 0' }}>Loading insights…</p>
  if (error) return <p className="error">Could not load insights: {error}</p>

  if (!data || data.total_participants_with_insights === 0) {
    return (
      <div className="pp-insights-empty">
        <p>No insights yet. Open a participant transcript and click <strong>✦ Analyze insights</strong> to start.</p>
      </div>
    )
  }

  // Sort types by count descending
  const sortedTypes = INSIGHT_META
    .map((m) => ({ ...m, count: data.type_counts?.[m.type] || 0 }))
    .filter((m) => m.count > 0)
    .sort((a, b) => b.count - a.count)

  function toggleSection(type) {
    setOpenSections((prev) => ({ ...prev, [type]: !prev[type] }))
  }

  return (
    <div>
      <p className="pp-muted" style={{ fontSize: '0.85rem', marginBottom: '1rem' }}>
        {data.total_participants_with_insights} participant{data.total_participants_with_insights !== 1 ? 's' : ''} analyzed
      </p>

      {/* Stat grid */}
      <div className="pp-insights-stat-grid">
        {sortedTypes.map(({ type, emoji, label, count }) => (
          <div key={type} className={`pp-insights-stat-card pp-insights-stat-card--${type}`}>
            <span className="pp-insights-stat-count">{count}</span>
            <span className="pp-insights-stat-label">{emoji} {label}</span>
          </div>
        ))}
      </div>

      {/* Collapsible quote sections per type */}
      {sortedTypes.map(({ type, emoji, label, count }) => {
        const items = data.by_type?.[type] || []
        const isOpen = openSections[type] ?? false
        return (
          <div key={type} className="pp-insights-section">
            <div
              className="pp-insights-section-header"
              onClick={() => toggleSection(type)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && toggleSection(type)}
            >
              <span>{emoji} {count} {label} moment{count !== 1 ? 's' : ''}</span>
              <span style={{ fontSize: '0.8rem', color: 'var(--color-muted)' }}>{isOpen ? '▲' : '▼'}</span>
            </div>
            {isOpen && (
              <div className="pp-insights-section-body">
                {items.map((item, idx) => (
                  <Link
                    key={idx}
                    to={`/tests/${testId}/participants/${item.participant_id}/transcript?recordingId=${item.recording_id}`}
                    className="pp-insights-quote-card"
                  >
                    <div className="pp-insights-quote-meta">
                      <span>{item.participant_name}</span>
                      {item.start != null && <span>· {Math.floor(item.start / 60)}:{String(Math.floor(item.start % 60)).padStart(2, '0')}</span>}
                    </div>
                    <div className="pp-insights-quote-label">{item.label}</div>
                    <div className="pp-insights-quote-text">"{item.quote}"</div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function ScenarioResults({ funnel, results: initialResults, testId, navigate }) {
  const [expanded, setExpanded] = useState(null)
  const [results, setResults] = useState(initialResults)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const id = testId

  const totalParticipants = results.length
  const allDone = results.filter((r) => r.completed).length
  const allDoneRate = totalParticipants > 0 ? Math.round((allDone / totalParticipants) * 100) : 0

  const handleDeleted = useCallback((tid) => {
    setResults(prev => prev.filter(r => r.tid !== tid))
    setConfirmDelete(null)
    if (expanded === tid) setExpanded(null)
  }, [expanded])

  return (
    <>
      {confirmDelete && (
        <DeleteParticipantModal
          participant={confirmDelete}
          testId={id}
          onConfirm={handleDeleted}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
      <div className="pp-stat-grid">
        <StatCard label="Participants" value={totalParticipants} />
        <StatCard label="Completed all steps" value={`${allDone} / ${totalParticipants}`} />
        <StatCard
          label="Full completion rate"
          value={`${allDoneRate}%`}
          highlight={allDoneRate >= 70 ? 'green' : allDoneRate >= 40 ? 'yellow' : 'red'}
        />
      </div>

      {/* Funnel */}
      {funnel.length > 0 && (
        <div className="pp-card">
          <h2 className="pp-section-title" style={{ marginBottom: '1rem' }}>Step funnel</h2>
          <div className="pp-funnel">
            {funnel.map((step) => {
              const pct = Math.round(step.completion_rate * 100)
              const barColor =
                pct >= 70 ? 'var(--color-success)' : pct >= 40 ? 'var(--color-warn)' : 'var(--color-danger)'
              return (
                <div key={step.step_id} className="pp-funnel-row">
                  <div className="pp-funnel-label">
                    <span className="pp-funnel-step-num">Step {step.order_index}</span>
                    <span className="pp-funnel-step-title">{step.title || <em className="pp-muted">Untitled</em>}</span>
                  </div>
                  <div className="pp-funnel-bar-wrap">
                    <div
                      className="pp-funnel-bar"
                      style={{ width: `${pct}%`, background: barColor }}
                    />
                  </div>
                  <div className="pp-funnel-stats">
                    <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                      {step.completion_count}/{totalParticipants}
                    </span>
                    <span className="pp-muted" style={{ fontSize: '0.8125rem' }}>{pct}%</span>
                    {step.median_time_ms != null && (
                      <span className="pp-muted" style={{ fontSize: '0.8125rem' }}>
                        ~{formatMs(step.median_time_ms)} median
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Per-participant table */}
      {results.length === 0 ? (
        <div className="pp-empty-state">
          <p>No participants yet. Add participants from the test setup page.</p>
        </div>
      ) : (
        <div className="pp-card pp-table-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="pp-table-wrap" style={{ margin: 0, padding: 0 }}>
            <table>
              <thead>
                <tr>
                  <th>Participant</th>
                  <th>Steps</th>
                  <th>Status</th>
                  <th>Events</th>
                  <th>Replay</th>
                  <th style={{ width: 48 }} aria-hidden />
                  <th style={{ width: 40 }} aria-hidden />
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <Fragment key={r.tid}>
                    <tr
                      className={`pp-row-expandable ${expanded === r.tid ? 'is-open' : ''}`}
                      onClick={() => setExpanded(expanded === r.tid ? null : r.tid)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          setExpanded(expanded === r.tid ? null : r.tid)
                        }
                      }}
                      tabIndex={0}
                      role="button"
                      aria-expanded={expanded === r.tid}
                    >
                      <td style={{ fontWeight: 600 }}>{r.name}</td>
                      <td style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {r.steps_completed} / {r.total_steps}
                      </td>
                      <td>
                        <span className={`badge ${r.completed ? 'green' : r.steps_completed > 0 ? 'amber' : 'red'}`}>
                          {r.completed ? 'All done' : r.steps_completed > 0 ? 'Partial' : 'Not started'}
                        </span>
                      </td>
                      <td>{r.event_count}</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        {r.has_replay ? (
                          <button
                            type="button"
                            className="pp-btn-sm primary"
                            onClick={() => navigate(`/tests/${id}/replay/${r.tid}`)}
                            style={{ whiteSpace: 'nowrap' }}
                          >
                            ▶ Watch replay
                          </button>
                        ) : (
                          <span className="pp-muted" style={{ fontSize: '0.75rem' }}>No replay</span>
                        )}
                      </td>
                      <td className="pp-chevron">{expanded === r.tid ? '▲' : '▼'}</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          className="pp-btn-delete-participant"
                          title="Remove participant"
                          onClick={() => setConfirmDelete(r)}
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                    {expanded === r.tid && (
                      <tr className="pp-row-detail">
                        <td colSpan={7}>
                          <div className="pp-step-result-grid">
                            {r.steps.map((s) => (
                              <div
                                key={s.step_id}
                                className={`pp-step-result-cell ${s.completed ? 'is-done' : 'is-pending'}`}
                              >
                                <span className="pp-step-result-icon">{s.completed ? '✅' : '❌'}</span>
                                <span className="pp-step-result-label">
                                  Step {s.order_index}{s.title ? `: ${s.title}` : ''}
                                </span>
                                <span className="pp-step-result-time">
                                  {s.completed ? formatMs(s.time_to_complete_ms) : '—'}
                                </span>
                              </div>
                            ))}
                          </div>
                          <EventTimeline events={r.events} testId={id} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  )
}

// ─── Page root ───────────────────────────────────────────────────────────────

export default function TestResults() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    apiFetch(`/api/tests/${id}/results`)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return <p className="pp-loading">Loading results…</p>
  if (error) return <p className="error">Error: {error}</p>
  if (!data) return null

  const isScenario = data.test_type === 'scenario'
  const isObservational = data.test_type === 'observational'
  const researchIntent = data.research_intent?.trim()
  const testContext = data.context?.trim()

  return (
    <div className="pp-page">
      <div className="pp-page-head pp-page-head--single">
        <div>
          <Link to={`/tests/${id}`} className="pp-back-link">← Test setup</Link>
          <h1 className="pp-page-title">Results</h1>
          <p className="pp-muted" style={{ marginTop: '0.35rem' }}>
            {isScenario
              ? 'Step funnel, completion rates, and per-participant timelines.'
              : isObservational
                ? 'Behavioral patterns, sessions, and event-level discovery.'
                : 'Completion, time-to-goal, and full event timelines per participant.'}
          </p>
        </div>
        <Link to={`/tests/${id}/heatmap`}>
          <button type="button" className="pp-btn-sm">🔥 Heatmap</button>
        </Link>
      </div>

      {researchIntent && (
        <section className="pp-card" style={{ marginBottom: '1.25rem' }}>
          <p className="pp-kicker" style={{ marginBottom: '0.5rem' }}>What you&apos;re testing</p>
          <p style={{ margin: 0, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{researchIntent}</p>
        </section>
      )}

      {testContext && (
        <section className="pp-card" style={{ marginBottom: '1.25rem' }}>
          <p className="pp-kicker" style={{ marginBottom: '0.5rem' }}>Test context</p>
          <div className="pp-results-context-markdown">
            <ContextMarkdownPreview markdown={data.context} />
          </div>
        </section>
      )}

      {isObservational ? (
        <ObservationalResults
          data={data}
          testId={id}
          navigate={navigate}
        />
      ) : isScenario ? (
        <ScenarioResults
          funnel={data.funnel}
          results={data.results}
          testId={id}
          navigate={navigate}
        />
      ) : (
        <SingleResults
          results={data.results}
          testId={id}
          navigate={navigate}
        />
      )}

      {/* ── Insights (all test types) ── */}
      <section className="pp-card" style={{ marginTop: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <p className="pp-section-title" style={{ margin: 0 }}>✦ Insights</p>
        </div>
        <InsightsSummary testId={id} />
      </section>
    </div>
  )
}
