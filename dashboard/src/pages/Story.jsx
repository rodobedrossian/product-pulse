import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { apiFetch } from '../api.js'

// ─── Constants ───────────────────────────────────────────────────────────────

const INSIGHT_META = {
  confusion:   { emoji: '🟡', label: 'Confusion',   bg: 'var(--color-warn-bg)',        border: 'var(--color-warn-border)',    text: 'var(--color-warn)' },
  frustration: { emoji: '🔴', label: 'Frustration', bg: 'var(--color-danger-bg)',      border: 'var(--color-danger-border)',  text: 'var(--color-danger)' },
  delight:     { emoji: '🟢', label: 'Delight',     bg: 'var(--color-success-bg)',     border: 'var(--color-success-border)', text: 'var(--color-success)' },
  hesitation:  { emoji: '🟠', label: 'Hesitation',  bg: 'var(--color-info-bg)',        border: 'var(--color-info-border)',    text: '#3b82f6' },
  discovery:   { emoji: '🔵', label: 'Discovery',   bg: '#f0fdfa',                     border: '#99f6e4',                     text: '#0f766e' },
  comparison:  { emoji: '⚪', label: 'Comparison',  bg: 'var(--color-surface-raised)', border: 'var(--color-border-strong)',  text: 'var(--color-text-secondary)' },
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtSec(seconds) {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function fmtDuration(ms) {
  if (ms == null) return null
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m ${s % 60}s`
}

function fmtPageDuration(sec) {
  if (sec == null || sec < 0) return null
  if (sec < 60) return `${sec}s`
  return `${Math.floor(sec / 60)}m ${sec % 60}s`
}

// Strip scheme + host from URL, collapse long paths
function urlLabel(url) {
  if (!url) return '/'
  const path = url.replace(/^https?:\/\/[^/]+/, '') || '/'
  return path.length > 60 ? path.slice(0, 57) + '…' : path
}

// ─── Insight card (shown once per unique insight) ─────────────────────────────

function InsightCard({ insight, recordingId, testId, participantId }) {
  const meta = INSIGHT_META[insight.type]
  if (!meta) return null
  const transcriptLink =
    recordingId && insight.start != null
      ? `/tests/${testId}/participants/${participantId}/transcript?recordingId=${recordingId}&t=${Math.floor(insight.start)}`
      : null

  return (
    <div
      className="pp-story-insight-card"
      style={{
        background: meta.bg,
        borderLeftColor: meta.border,
      }}
    >
      <div className="pp-story-insight-card-header">
        <span className="pp-story-insight-type-label" style={{ color: meta.text }}>
          {meta.emoji} {meta.label.toUpperCase()}
        </span>
        {insight.start != null && (
          <span className="pp-story-insight-timestamp">
            at {fmtSec(insight.start)} into recording
          </span>
        )}
      </div>
      {insight.label && (
        <p className="pp-story-insight-summary">{insight.label}</p>
      )}
      {insight.quote && (
        <blockquote className="pp-story-insight-quote">"{insight.quote}"</blockquote>
      )}
      {transcriptLink && (
        <Link to={transcriptLink} className="pp-story-insight-link">
          Listen in transcript ↗
        </Link>
      )}
    </div>
  )
}

// ─── Page section (one URL visit) ────────────────────────────────────────────

function PageSection({ section, index }) {
  const [expanded, setExpanded] = useState(index === 0 || section.actions.length <= 4)
  const MAX_COLLAPSED = 4
  const visibleActions = expanded ? section.actions : section.actions.slice(0, MAX_COLLAPSED)
  const hiddenCount = section.actions.length - MAX_COLLAPSED

  return (
    <div className="pp-story-page-section">
      {/* Section header */}
      <div className="pp-story-page-header">
        <div className="pp-story-page-url-row">
          <span className="pp-story-page-icon">🌐</span>
          <code className="pp-story-page-url">{urlLabel(section.url)}</code>
          {section.duration_seconds != null && section.duration_seconds > 0 && (
            <span className="pp-story-page-duration">
              {fmtPageDuration(section.duration_seconds)} on page
            </span>
          )}
        </div>
        <span className="pp-story-page-entered">
          entered at {fmtSec(section.entered_at_seconds)}
        </span>
      </div>

      {/* Actions list */}
      {section.actions.length === 0 ? (
        <p className="pp-story-page-empty">Visited page — no interactions recorded</p>
      ) : (
        <div className="pp-story-page-actions">
          {visibleActions.map((action, i) => (
            <div key={i} className="pp-story-action-row">
              <span className="pp-story-action-time">{fmtSec(action.relative_seconds)}</span>
              <span className="pp-story-action-verb">{action.action}</span>
              <span className="pp-story-action-target">{action.target}</span>
            </div>
          ))}
          {!expanded && hiddenCount > 0 && (
            <button
              type="button"
              className="pp-story-show-more"
              onClick={() => setExpanded(true)}
            >
              + {hiddenCount} more interaction{hiddenCount !== 1 ? 's' : ''}
            </button>
          )}
        </div>
      )}

      {/* Screenshot */}
      {section.screenshot_url && (
        <a
          href={section.screenshot_url}
          target="_blank"
          rel="noopener noreferrer"
          className="pp-story-screenshot-wrap"
          title="View screenshot at this moment"
        >
          <img
            src={section.screenshot_url}
            alt={`Screenshot on ${urlLabel(section.url)}`}
            className="pp-story-screenshot"
            loading="lazy"
          />
          <span className="pp-story-screenshot-label">View full screenshot ↗</span>
        </a>
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
      .then((data) => { if (!cancelled) { setStory(data); setLoading(false) } })
      .catch((err) => { if (!cancelled) { setError(err.message || 'Failed to load story'); setLoading(false) } })
    return () => { cancelled = true }
  }, [testId, participantId])

  if (loading) {
    return (
      <div className="pp-story-page">
        <div className="pp-story-loading">
          <div className="pp-spinner" aria-label="Generating session story…" />
          <p className="pp-story-loading-label">Generating session story…</p>
          <p className="pp-muted pp-story-loading-sub">
            Filtering events · reading transcript · synthesizing with AI
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

  const {
    test, participant, transcript, recordings, insights,
    session_duration_ms, total_events, meaningful_events,
    ai_summary, key_findings, page_sections,
  } = story

  const firstRecording = recordings?.[0]
  const hasInsights = insights?.length > 0
  const hasSections = page_sections?.length > 0

  // Count insight types for the header pills
  const insightTypeCounts = {}
  for (const ins of (insights || [])) {
    insightTypeCounts[ins.type] = (insightTypeCounts[ins.type] || 0) + 1
  }

  return (
    <div className="pp-story-page">

      {/* ── Back nav ── */}
      <nav className="pp-story-nav">
        <Link to={`/tests/${testId}`} className="pp-story-back">← {test.name}</Link>
        {firstRecording && (
          <Link
            to={`/tests/${testId}/participants/${participantId}/transcript?recordingId=${firstRecording.id}`}
            className="pp-story-back"
          >
            View transcript
          </Link>
        )}
      </nav>

      {/* ── Header ── */}
      <header className="pp-story-header">
        {test.research_intent && (
          <p className="pp-story-intent">{test.research_intent}</p>
        )}
        <h1 className="pp-story-title">
          <span className="pp-story-participant-name">{participant.name}</span>
          <span className="pp-story-title-sub">'s Session</span>
        </h1>
        <div className="pp-story-meta-row">
          {fmtDuration(session_duration_ms) && (
            <span className="pp-story-meta-chip">{fmtDuration(session_duration_ms)} session</span>
          )}
          <span className="pp-story-meta-chip">{meaningful_events ?? total_events} interactions</span>
          {page_sections?.length > 0 && (
            <span className="pp-story-meta-chip">{page_sections.length} page{page_sections.length !== 1 ? 's' : ''} visited</span>
          )}
          {Object.entries(insightTypeCounts).map(([type, count]) => {
            const meta = INSIGHT_META[type]
            return meta ? (
              <span
                key={type}
                className="pp-story-meta-insight"
                style={{ background: meta.bg, borderColor: meta.border, color: meta.text }}
              >
                {meta.emoji} {count} {meta.label.toLowerCase()}
              </span>
            ) : null
          })}
        </div>
      </header>

      {/* ── AI Summary ── */}
      {ai_summary && (
        <section className="pp-story-summary-section">
          <div className="pp-story-summary-card">
            <div className="pp-story-summary-eyebrow">✦ AI Session Summary</div>
            <p className="pp-story-summary-text">{ai_summary}</p>
          </div>

          {key_findings?.length > 0 && (
            <div className="pp-story-findings-card">
              <div className="pp-story-findings-eyebrow">Key Findings</div>
              <ol className="pp-story-findings-list">
                {key_findings.map((f, i) => (
                  <li key={i} className="pp-story-finding">{f}</li>
                ))}
              </ol>
            </div>
          )}
        </section>
      )}

      {/* ── What they said ── */}
      {hasInsights && (
        <section className="pp-story-section">
          <div className="pp-story-section-header">
            <h2 className="pp-story-section-title">What they said</h2>
            <p className="pp-story-section-sub">
              Emotional signals detected in the recording transcript ·{' '}
              <span className="pp-muted">timestamps are relative to recording start</span>
            </p>
          </div>
          <div className="pp-story-insights-grid">
            {insights.map((ins, i) => (
              <InsightCard
                key={i}
                insight={ins}
                recordingId={firstRecording?.id}
                testId={testId}
                participantId={participantId}
              />
            ))}
          </div>
        </section>
      )}

      {!hasInsights && transcript && (
        <section className="pp-story-section">
          <div className="pp-story-section-header">
            <h2 className="pp-story-section-title">What they said</h2>
          </div>
          <div className="pp-story-no-insights">
            <p className="pp-muted">
              No emotional signals were detected in the transcript for this session.{' '}
              {firstRecording && (
                <Link to={`/tests/${testId}/participants/${participantId}/transcript?recordingId=${firstRecording.id}`}>
                  View full transcript →
                </Link>
              )}
            </p>
          </div>
        </section>
      )}

      {/* ── What they did ── */}
      {hasSections && (
        <section className="pp-story-section">
          <div className="pp-story-section-header">
            <h2 className="pp-story-section-title">What they did</h2>
            <p className="pp-story-section-sub">
              Meaningful interactions only — mouse moves, scrolls, and focus events filtered out
            </p>
          </div>
          <div className="pp-story-sections-list">
            {page_sections.map((section, i) => (
              <PageSection key={i} section={section} index={i} />
            ))}
          </div>
        </section>
      )}

      {/* ── Empty state ── */}
      {!hasSections && !hasInsights && !ai_summary && (
        <div className="pp-story-empty">
          <p className="pp-muted">No session data recorded for this participant yet.</p>
          <Link to={`/tests/${testId}`} className="pp-btn-sm" style={{ marginTop: '1rem' }}>
            ← Back to test
          </Link>
        </div>
      )}

    </div>
  )
}
