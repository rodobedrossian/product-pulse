import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { apiFetch } from '../api.js'

// ─── Insight metadata ────────────────────────────────────────────────────────
const INSIGHT_META = {
  confusion:   { emoji: '🟡', label: 'Confusion',   colorClass: 'warn' },
  frustration: { emoji: '🔴', label: 'Frustration', colorClass: 'danger' },
  delight:     { emoji: '🟢', label: 'Delight',     colorClass: 'success' },
  hesitation:  { emoji: '🟠', label: 'Hesitation',  colorClass: 'info' },
  discovery:   { emoji: '🔵', label: 'Discovery',   colorClass: 'discovery' },
  comparison:  { emoji: '⚪', label: 'Comparison',  colorClass: 'comparison' },
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmtTime(seconds) {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function fmtDuration(ms) {
  if (ms == null) return null
  const s = Math.round(ms / 1000)
  const m = Math.floor(s / 60)
  const r = s % 60
  return m > 0 ? `${m}m ${r}s` : `${r}s`
}

function humanEventType(type) {
  const map = {
    click: 'Clicked',
    input: 'Typed',
    scroll: 'Scrolled',
    pageview: 'Viewed page',
    keypress: 'Key press',
    focus: 'Focused',
    blur: 'Left field',
    mousemove: 'Mouse moved',
    change: 'Changed',
    submit: 'Submitted',
  }
  return map[type] || type
}

function stripScheme(url) {
  if (!url) return null
  return url.replace(/^https?:\/\/[^/]+/, '') || url
}

function condensedSelector(selector) {
  if (!selector) return null
  // Show last meaningful segment (e.g. #submit-btn or .button)
  const parts = selector.split(/[\s>]+/)
  return parts[parts.length - 1] || selector
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function InsightChip({ type }) {
  const meta = INSIGHT_META[type]
  if (!meta) return null
  return (
    <span className={`pp-story-insight-chip pp-story-insight-chip--${type}`}>
      {meta.emoji} {meta.label}
    </span>
  )
}

function TimelineWindow({ win, participantId, testId, firstRecordingId }) {
  const [expanded, setExpanded] = useState(false)
  const hasInsights = win.insights?.length > 0
  const hasScreenshot = !!win.screenshot_url
  const hasSegment = !!win.segment
  const hasMultipleEvents = win.events.length > 1

  // Primary event (first click or first event overall)
  const primaryEvent =
    win.events.find((e) => e.type === 'click') || win.events[0]

  return (
    <div className={`pp-story-window${hasInsights ? ' pp-story-window--insight' : ''}`}>
      {/* Time marker */}
      <div className="pp-story-window-time">
        <span className="pp-story-time-pill">{fmtTime(win.start_seconds)}</span>
        {hasInsights && (
          <div className="pp-story-window-chips">
            {win.insights.map((ins, i) => (
              <InsightChip key={i} type={ins.type} />
            ))}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="pp-story-window-content">
        {/* Primary event */}
        <div className="pp-story-event-primary">
          <span className="pp-story-event-type">{humanEventType(primaryEvent.type)}</span>
          {primaryEvent.selector && (
            <code className="pp-story-selector">{condensedSelector(primaryEvent.selector)}</code>
          )}
          {primaryEvent.url && !primaryEvent.selector && (
            <span className="pp-story-url">{stripScheme(primaryEvent.url)}</span>
          )}
        </div>

        {/* Additional events (collapsed by default) */}
        {hasMultipleEvents && (
          <div className="pp-story-more-events">
            {!expanded && win.events.length > 1 && (
              <button
                type="button"
                className="pp-story-expand-btn"
                onClick={() => setExpanded(true)}
              >
                +{win.events.length - 1} more interaction{win.events.length > 2 ? 's' : ''}
              </button>
            )}
            {expanded && (
              <ul className="pp-story-event-list">
                {win.events.slice(1).map((ev, i) => (
                  <li key={ev.id || i} className="pp-story-event-item">
                    <span className="pp-story-event-type">{humanEventType(ev.type)}</span>
                    {ev.selector && (
                      <code className="pp-story-selector">{condensedSelector(ev.selector)}</code>
                    )}
                    {ev.url && !ev.selector && (
                      <span className="pp-story-url">{stripScheme(ev.url)}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Transcript segment */}
        {hasSegment && (
          <blockquote className="pp-story-quote">
            <span className="pp-story-quote-icon">💬</span>
            {'"'}{win.segment.text}{'"'}
            {firstRecordingId && win.segment.start != null && (
              <Link
                to={`/tests/${testId}/participants/${participantId}/transcript?recordingId=${firstRecordingId}&t=${Math.floor(win.segment.start)}`}
                className="pp-story-quote-link"
                title="View in transcript"
              >
                ↗
              </Link>
            )}
          </blockquote>
        )}

        {/* Insight details */}
        {hasInsights && win.insights.map((ins, i) => {
          const meta = INSIGHT_META[ins.type]
          return (
            <div key={i} className={`pp-story-insight-card pp-story-insight-card--${ins.type}`}>
              <span className="pp-story-insight-label">
                {meta?.emoji} {meta?.label || ins.type}
              </span>
              {ins.label && <span className="pp-story-insight-summary">{ins.label}</span>}
              {ins.quote && <em className="pp-story-insight-quote">"{ins.quote}"</em>}
            </div>
          )
        })}
      </div>

      {/* Screenshot thumbnail */}
      {hasScreenshot && (
        <div className="pp-story-screenshot-col">
          <a
            href={win.screenshot_url}
            target="_blank"
            rel="noopener noreferrer"
            className="pp-story-screenshot-link"
            title="View screenshot"
          >
            <img
              src={win.screenshot_url}
              alt={`Screenshot at ${fmtTime(win.start_seconds)}`}
              className="pp-story-screenshot"
              loading="lazy"
            />
          </a>
        </div>
      )}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Story() {
  const { id: testId, participantId } = useParams()
  const [story, setStory] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    apiFetch(`/api/tests/${testId}/participants/${participantId}/story`)
      .then((data) => {
        if (!cancelled) {
          setStory(data)
          setLoading(false)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message || 'Failed to load session story')
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [testId, participantId])

  if (loading) {
    return (
      <div className="pp-story-page">
        <div className="pp-story-loading">
          <div className="pp-spinner" aria-label="Generating session story…" />
          <p className="pp-story-loading-text">
            Synthesizing session story<span className="pp-ellipsis" />
          </p>
          <p className="pp-muted" style={{ fontSize: '0.8rem' }}>
            Correlating events, transcript, and insights with AI analysis
          </p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="pp-story-page">
        <div className="pp-story-error">
          <p className="error">{error}</p>
          <Link to={`/tests/${testId}`} className="pp-btn-sm">← Back to test</Link>
        </div>
      </div>
    )
  }

  if (!story) return null

  const { test, participant, transcript, recordings, session_duration_ms, total_events, ai_summary, key_findings, timeline } = story
  const firstRecording = recordings?.[0]
  const hasInsights = transcript?.has_insights

  // Count insight types in timeline
  const insightCounts = {}
  for (const win of (timeline || [])) {
    for (const ins of (win.insights || [])) {
      insightCounts[ins.type] = (insightCounts[ins.type] || 0) + 1
    }
  }

  return (
    <div className="pp-story-page">
      {/* Back nav */}
      <nav className="pp-story-nav">
        <Link to={`/tests/${testId}`} className="pp-story-back">
          ← {test.name}
        </Link>
        {firstRecording && (
          <Link
            to={`/tests/${testId}/participants/${participantId}/transcript?recordingId=${firstRecording.id}`}
            className="pp-story-back"
          >
            View transcript
          </Link>
        )}
      </nav>

      {/* Header */}
      <header className="pp-story-header">
        <div className="pp-story-header-meta">
          {test.research_intent && (
            <span className="pp-story-intent-badge">{test.research_intent}</span>
          )}
        </div>
        <h1 className="pp-story-title">
          {participant.name}
          <span className="pp-story-title-sub">'s Session</span>
        </h1>
        <div className="pp-story-stats">
          {fmtDuration(session_duration_ms) && (
            <span className="pp-story-stat">
              <strong>{fmtDuration(session_duration_ms)}</strong> session
            </span>
          )}
          <span className="pp-story-stat">
            <strong>{total_events}</strong> interactions
          </span>
          {transcript?.insight_count > 0 && (
            <span className="pp-story-stat">
              <strong>{transcript.insight_count}</strong> emotional signals
            </span>
          )}
          {Object.keys(insightCounts).length > 0 && (
            <span className="pp-story-insight-pills">
              {Object.entries(insightCounts).map(([type, count]) => {
                const meta = INSIGHT_META[type]
                return meta ? (
                  <span key={type} className={`pp-story-insight-chip pp-story-insight-chip--${type}`}>
                    {meta.emoji} {count}
                  </span>
                ) : null
              })}
            </span>
          )}
        </div>
      </header>

      {/* AI Summary */}
      {ai_summary && (
        <section className="pp-story-summary-section">
          <div className="pp-story-summary-card">
            <div className="pp-story-summary-label">✦ AI Session Summary</div>
            <p className="pp-story-summary-text">{ai_summary}</p>
          </div>

          {key_findings?.length > 0 && (
            <div className="pp-story-findings">
              <h3 className="pp-story-findings-title">Key Findings</h3>
              <ol className="pp-story-findings-list">
                {key_findings.map((finding, i) => (
                  <li key={i} className="pp-story-finding-item">
                    {finding}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </section>
      )}

      {/* No AI summary fallback */}
      {!ai_summary && total_events === 0 && (
        <div className="pp-story-empty">
          <p className="pp-muted">No session events recorded for this participant yet.</p>
        </div>
      )}

      {/* Timeline */}
      {timeline?.length > 0 && (
        <section className="pp-story-timeline-section">
          <h2 className="pp-story-timeline-title">Session Timeline</h2>
          <p className="pp-story-timeline-sub pp-muted">
            {timeline.length} moment{timeline.length !== 1 ? 's' : ''} · events, quotes, and emotional signals correlated by time
          </p>
          <div className="pp-story-timeline">
            {timeline.map((win) => (
              <TimelineWindow
                key={win.windowKey}
                win={win}
                participantId={participantId}
                testId={testId}
                firstRecordingId={firstRecording?.id}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
