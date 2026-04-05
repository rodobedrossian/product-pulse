import { Fragment, useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { apiFetch } from '../api.js'

function formatMs(ms) {
  if (ms == null) return '—'
  if (ms < 1000) return ms + 'ms'
  if (ms < 60000) return (ms / 1000).toFixed(1) + 's'
  const m = Math.floor(ms / 60000)
  const s = ((ms % 60000) / 1000).toFixed(0)
  return `${m}m ${s}s`
}

const API_BASE = import.meta.env.VITE_API_URL || ''

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

  return (
    <div className="pp-page">
      <div className="pp-page-head pp-page-head--single">
        <div>
          <Link to={`/tests/${id}`} className="pp-back-link">← Test setup</Link>
          <h1 className="pp-page-title">Results</h1>
          <p className="pp-muted" style={{ marginTop: '0.35rem' }}>
            {isScenario
              ? 'Step funnel, completion rates, and per-participant timelines.'
              : 'Completion, time-to-goal, and full event timelines per participant.'}
          </p>
        </div>
      </div>

      {isScenario ? (
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
