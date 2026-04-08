import { Fragment, useEffect, useMemo, useState } from 'react'
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
          </div>
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
                      return (
                        <tr key={s.tid}>
                          <td style={{ fontWeight: 600 }}><code>{String(s.tid || '').slice(0, 8)}</code></td>
                          <td className="pp-muted">{new Date(s.created_at).toLocaleString()}</td>
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

function SingleResults({ results, testId, navigate }) {
  const [expanded, setExpanded] = useState(null)
  const id = testId

  const completed = results.filter((r) => r.completed).length
  const rate = results.length > 0 ? Math.round((completed / results.length) * 100) : 0

  return (
    <>
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
                    </tr>
                    {expanded === r.tid && (
                      <tr className="pp-row-detail">
                        <td colSpan={6}>
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

function ScenarioResults({ funnel, results, testId, navigate }) {
  const [expanded, setExpanded] = useState(null)
  const id = testId

  const totalParticipants = results.length
  const allDone = results.filter((r) => r.completed).length
  const allDoneRate = totalParticipants > 0 ? Math.round((allDone / totalParticipants) * 100) : 0

  return (
    <>
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
                    </tr>
                    {expanded === r.tid && (
                      <tr className="pp-row-detail">
                        <td colSpan={6}>
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
    </div>
  )
}
