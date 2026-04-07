import { useEffect, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { apiFetch } from '../api.js'
import { getApiBase } from '../lib/publicEnv.js'
import ParticipantAudioRecorder from '../components/ParticipantAudioRecorder.jsx'

const API_URL = getApiBase() || 'http://localhost:3001'
const RESEARCH_INTENT_MAX = 2000

function pathnameFromUrl(url) {
  try {
    return new URL(url).pathname
  } catch {
    return url
  }
}

function buildParticipantLink(prototypeUrl, participantTid, testId) {
  if (!prototypeUrl || !participantTid || !testId) return ''
  try {
    const url = new URL(prototypeUrl)
    url.searchParams.set('__tid', participantTid)
    url.searchParams.set('__test_id', testId)
    return url.toString()
  } catch {
    return ''
  }
}

function buildAiPrompt(snippetTag, testName, prototypeUrl) {
  return `I'm running a usability test called "${testName}" on ${prototypeUrl} using Product Pulse.

Please add the following script tag to the <head> of every HTML page (or the root layout file if this is a React/Vue/Next.js/etc. app):

${snippetTag}

Important requirements:
- Add it WITHOUT the async or defer attribute — it must load synchronously so document.currentScript is available.
- Place it as early in <head> as possible, before any other scripts.
- If this is a single-page app (React, Next.js, Vue, Svelte, etc.), add it to the root HTML template (e.g. index.html, _document.jsx, app.html) so it loads once on every page.
- Do not modify or wrap the tag in any way — paste it exactly as shown above.

That's all — no other code changes are needed. The snippet automatically tracks clicks, navigation, and page views.`
}

function CopyButton({ text, label = 'Copy', className = 'pp-btn-sm' }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }
  return (
    <button type="button" className={className} onClick={copy}>
      {copied ? '✓ Copied!' : label}
    </button>
  )
}

function TrashIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  )
}

function HeartbeatDot({ active, secondsAgo }) {
  return (
    <span className="pp-inline" style={{ gap: '0.4rem' }}>
      <span className="pp-dot-wrap">
        {active && <span className="pp-dot-pulse" aria-hidden />}
        <span
          className={`pp-dot-core ${active ? 'pp-dot-core--on' : 'pp-dot-core--idle'}`}
          aria-hidden
        />
      </span>
      <span
        className="pp-muted"
        style={{ fontSize: '0.8125rem', color: active ? 'var(--color-success)' : 'var(--color-warn)' }}
      >
        {active
          ? secondsAgo != null
            ? `Active — last event ${secondsAgo}s ago`
            : 'Active'
          : 'Awaiting events…'}
      </span>
    </span>
  )
}

function GoalBadge({ goal_event, compact = false }) {
  if (!goal_event?.type) {
    return (
      <span className="pp-muted" style={{ fontSize: '0.8125rem', fontStyle: 'italic' }}>
        No goal defined
      </span>
    )
  }
  return (
    <span style={{ fontSize: compact ? '0.8125rem' : '0.875rem', lineHeight: 1.4 }}>
      <span style={{ fontWeight: 700, color: 'var(--color-success)', marginRight: '0.35rem' }}>✓</span>
      {goal_event.type === 'url_change' ? (
        <>Reach <code>{goal_event.url_pattern}</code></>
      ) : (
        <>
          Click <code>{goal_event.selector || '(any)'}</code>
          {goal_event.url_pattern && (
            <span className="pp-muted"> on <code>{goal_event.url_pattern}</code></span>
          )}
        </>
      )}
    </span>
  )
}

// ─── Step card (scenario tests only) ────────────────────────────────────────

function stepHasDefinedGoal(step) {
  const ge = step.goal_event
  if (!ge?.type) return false
  const hasSel = ge.selector != null && ge.selector !== ''
  const hasUrl = ge.url_pattern != null && String(ge.url_pattern).length > 0
  if (ge.type === 'url_change') return hasUrl
  return hasSel || hasUrl
}

function StepCard({ step, prototypeUrl, testId, onUpdate, onDelete, onPickGoal }) {
  const [localTitle, setLocalTitle] = useState(step.title)
  const [localTask, setLocalTask] = useState(step.task)
  const [localFollowUp, setLocalFollowUp] = useState(step.follow_up)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [expanded, setExpanded] = useState(() => !stepHasDefinedGoal(step))

  useEffect(() => {
    setLocalTitle(step.title)
    setLocalTask(step.task)
    setLocalFollowUp(step.follow_up)
  }, [step.id, step.title, step.task, step.follow_up])

  const goalSig =
    step.goal_event == null
      ? ''
      : `${step.goal_event.type}\0${step.goal_event.selector ?? ''}\0${step.goal_event.url_pattern ?? ''}`

  const hadDefinedGoalRef = useRef(stepHasDefinedGoal(step))
  useEffect(() => {
    const now = stepHasDefinedGoal(step)
    if (now && !hadDefinedGoalRef.current) setExpanded(false)
    hadDefinedGoalRef.current = now
  }, [step.id, goalSig, step])

  async function saveField(field, value) {
    setSaving(true)
    try {
      const updated = await apiFetch(`/api/tests/${testId}/steps/${step.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ [field]: value })
      })
      onUpdate(updated)
    } catch (err) {
      alert('Failed to save: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete step ${step.order_index}? This cannot be undone.`)) return
    setDeleting(true)
    try {
      await apiFetch(`/api/tests/${testId}/steps/${step.id}`, { method: 'DELETE' })
      onDelete(step.id)
    } catch (err) {
      alert('Failed to delete: ' + err.message)
      setDeleting(false)
    }
  }

  const goalDone = stepHasDefinedGoal(step)
  const collapsed = goalDone && !expanded

  const taskPreview = (() => {
    if (!localTask || !localTask.trim()) return ''
    const t = localTask.replace(/\s+/g, ' ').trim()
    return t.length > 140 ? t.slice(0, 140) + '…' : t
  })()

  if (collapsed) {
    return (
      <div className="pp-step-card pp-step-card--collapsed">
        <div className="pp-step-collapsed-row">
          <div className="pp-step-collapsed-main">
            <div className="pp-step-collapsed-head">
              <span className="pp-step-number">Step {step.order_index}</span>
              <span className="pp-step-title-readonly" title={localTitle || ''}>
                {localTitle?.trim() || 'Untitled step'}
              </span>
            </div>
            <div className="pp-step-collapsed-goal">
              <GoalBadge goal_event={step.goal_event} compact />
            </div>
            {taskPreview && (
              <p className="pp-step-collapsed-preview pp-muted" title={localTask}>
                {taskPreview}
              </p>
            )}
          </div>
          <div className="pp-step-collapsed-actions">
            <button
              type="button"
              className="pp-btn-sm primary"
              onClick={() => setExpanded(true)}
            >
              Edit
            </button>
            <button
              type="button"
              className="pp-btn-sm"
              title="Pick goal in prototype"
              onClick={() => onPickGoal(step)}
            >
              🎯 Redefine goal
            </button>
            <button
              type="button"
              className="pp-btn-sm pp-btn-danger pp-btn-delete-icon"
              title="Delete step"
              aria-label="Delete step"
              disabled={deleting}
              onClick={handleDelete}
            >
              <TrashIcon />
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="pp-step-card">
      <div className="pp-step-card-header">
        <span className="pp-step-number">Step {step.order_index}</span>
        <input
          className="pp-step-title-input"
          placeholder="Step title (e.g. Understanding Automated vs Manual)"
          value={localTitle}
          onChange={(e) => setLocalTitle(e.target.value)}
          onBlur={() => localTitle !== step.title && saveField('title', localTitle)}
        />
        <div className="pp-inline" style={{ gap: '0.35rem', flexShrink: 0 }}>
          {goalDone && (
            <button type="button" className="pp-btn-sm" onClick={() => setExpanded(false)}>
              Done editing
            </button>
          )}
          <button
            type="button"
            className="pp-btn-sm"
            title="Pick goal in prototype"
            onClick={() => onPickGoal(step)}
          >
            🎯 {step.goal_event?.type ? 'Redefine goal' : 'Pick goal'}
          </button>
          <button
            type="button"
            className="pp-btn-sm pp-btn-danger pp-btn-delete-icon"
            title="Delete step"
            aria-label="Delete step"
            disabled={deleting}
            onClick={handleDelete}
          >
            <TrashIcon />
          </button>
        </div>
      </div>

      <div className="pp-step-fields">
        <label className="pp-step-field-label">
          <span>Task</span>
          <textarea
            className="pp-step-textarea"
            placeholder="The instruction you'll give the participant — e.g. Can you tell me what the difference is between Automated and Manual?"
            rows={2}
            value={localTask}
            onChange={(e) => setLocalTask(e.target.value)}
            onBlur={() => localTask !== step.task && saveField('task', localTask)}
          />
        </label>
        <label className="pp-step-field-label">
          <span>Follow-up</span>
          <textarea
            className="pp-step-textarea"
            placeholder="Question to ask after task completion — e.g. If you wanted to change a seller, how would you do that?"
            rows={2}
            value={localFollowUp}
            onChange={(e) => setLocalFollowUp(e.target.value)}
            onBlur={() => localFollowUp !== step.follow_up && saveField('follow_up', localFollowUp)}
          />
        </label>
      </div>

      <div className="pp-step-goal">
        <GoalBadge goal_event={step.goal_event} compact />
      </div>

      {saving && <span className="pp-muted" style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>Saving…</span>}
    </div>
  )
}

// ─── Script modal (read-only moderator view) ─────────────────────────────────

function ScriptModal({ steps, testName, onClose }) {
  const ref = useRef(null)

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="pp-modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="pp-modal" ref={ref}>
        <div className="pp-modal-head">
          <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Moderator script — {testName}</h2>
          <button type="button" className="pp-btn-sm" onClick={onClose}>✕ Close</button>
        </div>
        <div className="pp-modal-body">
          {steps.length === 0 && (
            <p className="pp-muted">No steps defined yet.</p>
          )}
          {steps.map((s) => (
            <div key={s.id} className="pp-script-step">
              <div className="pp-script-step-num">Step {s.order_index}{s.title ? ` — ${s.title}` : ''}</div>
              {s.task && (
                <div className="pp-script-block">
                  <span className="pp-script-label">Task</span>
                  <p className="pp-script-text">"{s.task}"</p>
                </div>
              )}
              {s.follow_up && (
                <div className="pp-script-block">
                  <span className="pp-script-label">Follow-up</span>
                  <p className="pp-script-text">"{s.follow_up}"</p>
                </div>
              )}
              {!s.task && !s.follow_up && (
                <p className="pp-muted" style={{ fontSize: '0.8125rem' }}>No task or follow-up defined.</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function TestDetail() {
  const { id } = useParams()
  const [test, setTest] = useState(null)
  const [steps, setSteps] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [newName, setNewName] = useState('')
  const [adding, setAdding] = useState(false)
  const [addingStep, setAddingStep] = useState(false)
  const [heartbeat, setHeartbeat] = useState(null)
  const [pendingGoal, setPendingGoal] = useState(null) // { goalKind, selector, url, stepId? }
  const [savingGoal, setSavingGoal] = useState(false)
  const [showScript, setShowScript] = useState(false)
  const [intentDraft, setIntentDraft] = useState('')
  const [savingIntent, setSavingIntent] = useState(false)
  const [recordingsByParticipant, setRecordingsByParticipant] = useState({})
  const [desktopMac, setDesktopMac] = useState(null)
  const [desktopWin, setDesktopWin] = useState(null)

  function loadTest() {
    return apiFetch(`/api/tests/${id}`)
      .then((data) => {
        const { steps: s = [], ...rest } = data
        setTest(rest)
        setSteps(s)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }

  function pollHeartbeat() {
    apiFetch(`/api/tests/${id}/heartbeat`).then(setHeartbeat).catch(() => {})
  }

  useEffect(() => {
    loadTest()
    pollHeartbeat()
    const hbInterval = setInterval(pollHeartbeat, 5000)

    function onMessage(e) {
      if (e.data?.type === 'pp_goal_selected' && e.data.url) {
        const goalKind = e.data.goalKind === 'url' ? 'url' : 'click'
        setPendingGoal({
          goalKind,
          selector: e.data.selector,
          url: e.data.url,
          stepId: e.data.stepId || null
        })
      }
    }
    window.addEventListener('message', onMessage)

    return () => {
      clearInterval(hbInterval)
      window.removeEventListener('message', onMessage)
    }
  }, [id])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [mac, win] = await Promise.all([
          apiFetch('/api/desktop/releases/latest?platform=darwin'),
          apiFetch('/api/desktop/releases/latest?platform=win32')
        ])
        if (!cancelled) {
          setDesktopMac(mac)
          setDesktopWin(win)
        }
      } catch {
        if (!cancelled) {
          setDesktopMac(null)
          setDesktopWin(null)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!test) return
    setIntentDraft(test.research_intent ?? '')
  }, [test?.id, test?.research_intent])

  useEffect(() => {
    if (!test?.participants?.length) {
      setRecordingsByParticipant({})
      return
    }
    let cancelled = false
    ;(async () => {
      const next = {}
      await Promise.all(
        test.participants.map(async (p) => {
          try {
            const r = await apiFetch(`/api/tests/${id}/participants/${p.id}/recordings`)
            next[p.id] = r.recordings || []
          } catch {
            next[p.id] = []
          }
        })
      )
      if (!cancelled) setRecordingsByParticipant(next)
    })()
    return () => {
      cancelled = true
    }
  }, [id, test?.participants])

  async function saveResearchIntent() {
    const next = intentDraft.slice(0, RESEARCH_INTENT_MAX)
    const prev = (test.research_intent ?? '').trim()
    if (next.trim() === prev) return
    setSavingIntent(true)
    try {
      const updated = await apiFetch(`/api/tests/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ research_intent: next })
      })
      setTest((t) => ({ ...t, research_intent: updated.research_intent }))
    } catch (err) {
      alert('Failed to save: ' + err.message)
    } finally {
      setSavingIntent(false)
    }
  }

  function openGoalPicker(step = null) {
    try {
      const pickerUrl = new URL(test.prototype_url)
      pickerUrl.searchParams.set('__pp_mode', 'pick')
      pickerUrl.searchParams.set('__test_id', id)
      if (step) pickerUrl.searchParams.set('__step_id', step.id)
      window.open(pickerUrl.toString(), '_blank')
    } catch {
      alert('Invalid prototype URL')
    }
  }

  async function saveGoal() {
    setSavingGoal(true)
    try {
      let urlPattern = pendingGoal.url
      try { urlPattern = new URL(pendingGoal.url).pathname } catch { /* keep */ }

      // url_pattern='/' matches every URL — don't store it for click goals as it
      // provides zero page filtering and caused false-positive completions.
      const clickUrlPattern = urlPattern === '/' ? '' : urlPattern

      const goal_event =
        pendingGoal.goalKind === 'url'
          ? { type: 'url_change', url_pattern: urlPattern }
          : { type: 'click', selector: pendingGoal.selector, url_pattern: clickUrlPattern }

      if (pendingGoal.stepId) {
        // Scenario: save to specific step
        const updated = await apiFetch(`/api/tests/${id}/steps/${pendingGoal.stepId}`, {
          method: 'PATCH',
          body: JSON.stringify({ goal_event })
        })
        setSteps((prev) => prev.map((s) => s.id === pendingGoal.stepId ? { ...s, goal_event: updated.goal_event } : s))
      } else {
        // Single-goal test
        await apiFetch(`/api/tests/${id}`, {
          method: 'PATCH',
          body: JSON.stringify({ goal_event })
        })
        setTest((prev) => ({ ...prev, goal_event }))
      }
      setPendingGoal(null)
    } catch (err) {
      alert('Failed to save goal: ' + err.message)
    } finally {
      setSavingGoal(false)
    }
  }

  async function handleAddParticipant(e) {
    e.preventDefault()
    if (!newName.trim()) return
    setAdding(true)
    try {
      await apiFetch(`/api/tests/${id}/participants`, {
        method: 'POST',
        body: JSON.stringify({ name: newName.trim() })
      })
      setNewName('')
      await loadTest()
    } catch (err) {
      alert('Failed to add participant: ' + err.message)
    } finally {
      setAdding(false)
    }
  }

  async function handleAddStep() {
    setAddingStep(true)
    try {
      const step = await apiFetch(`/api/tests/${id}/steps`, { method: 'POST', body: JSON.stringify({}) })
      setSteps((prev) => [...prev, step])
    } catch (err) {
      alert('Failed to add step: ' + err.message)
    } finally {
      setAddingStep(false)
    }
  }

  function handleStepUpdate(updated) {
    setSteps((prev) => prev.map((s) => s.id === updated.id ? updated : s))
  }

  function handleStepDelete(deletedId) {
    setSteps((prev) => {
      const filtered = prev.filter((s) => s.id !== deletedId)
      // Re-number order_index locally
      return filtered.map((s, i) => ({ ...s, order_index: i + 1 }))
    })
  }

  if (loading) return <p className="pp-loading">Loading test…</p>
  if (error) return <p className="error">Error: {error}</p>
  if (!test) return null

  const isScenario = test.test_type === 'scenario'
  const snippetSrc = `${API_URL}/api/tests/${id}/snippet.js`
  const singleTag = `<script src="${snippetSrc}"></script>`
  const twoTagVersion =
    `<script>window.ProtoPulse = { apiUrl: '${API_URL}' }</script>\n` +
    `<script src="${API_URL}/snippet/protopulse.js" data-test-id="${id}"></script>`

  const ge = test.goal_event
  const hasGoal =
    !!ge?.type &&
    (!!ge.selector || (!!ge.url_pattern && String(ge.url_pattern).length > 0))

  const hbClass =
    heartbeat?.active
      ? 'pp-heartbeat-card pp-heartbeat-card--active'
      : heartbeat && !heartbeat.active
        ? 'pp-heartbeat-card pp-heartbeat-card--warn'
        : 'pp-heartbeat-card'

  return (
    <div className="pp-page pp-stack">
      <div>
        <Link to="/" className="pp-back-link">← All tests</Link>
        <div className="pp-page-head" style={{ marginBottom: '1.25rem' }}>
          <div style={{ minWidth: 0 }}>
            <div className="pp-inline" style={{ gap: '0.5rem', marginBottom: '0.2rem' }}>
              <h1 className="pp-page-title" style={{ margin: 0 }}>{test.name}</h1>
              <span className={`badge ${isScenario ? 'amber' : 'blue'}`} style={{ alignSelf: 'center' }}>
                {isScenario ? 'Scenario' : 'Single goal'}
              </span>
            </div>
            <a href={test.prototype_url} target="_blank" rel="noreferrer" className="pp-proto-link">
              {test.prototype_url}
            </a>
          </div>
          <div className="pp-inline">
            {isScenario ? (
              <button type="button" className="pp-btn-sm" onClick={() => setShowScript(true)}>
                📋 Script
              </button>
            ) : (
              <button type="button" className="pp-btn-sm" onClick={() => openGoalPicker()}>
                {hasGoal ? 'Redefine goal' : 'Define goal'}
              </button>
            )}
            <Link to={`/tests/${id}/results`}>
              <button type="button" className="primary pp-btn-sm">View results</button>
            </Link>
          </div>
        </div>
      </div>

      {!isScenario && (
        <>
          {!String(test.research_intent || '').trim() && (
            <section className="pp-banner pp-banner--info" style={{ marginBottom: '1rem' }}>
              <p className="pp-banner-title" style={{ marginBottom: '0.35rem' }}>What are you trying to learn?</p>
              <p className="pp-muted" style={{ margin: 0, fontSize: '0.875rem', lineHeight: 1.5 }}>
                Add a research question or hypothesis so results stay interpretable when you compare runs.
              </p>
            </section>
          )}
          <section className="pp-card" style={{ marginBottom: '1.25rem' }}>
            <label className="pp-step-field-label" style={{ display: 'block', marginBottom: 0 }}>
              <span>What you&apos;re testing</span>
              <span className="pp-muted" style={{ fontWeight: 400, fontSize: '0.8125rem', display: 'block', marginTop: '0.2rem' }}>
                Research question or hypothesis — what this test should answer (separate from the technical goal).
              </span>
              <textarea
                className="pp-step-textarea"
                placeholder='e.g. "Can users find checkout without scanning the whole page?" or "We believe the new CTA increases completions."'
                rows={3}
                maxLength={RESEARCH_INTENT_MAX}
                value={intentDraft}
                onChange={(e) => setIntentDraft(e.target.value.slice(0, RESEARCH_INTENT_MAX))}
                onBlur={saveResearchIntent}
                disabled={savingIntent}
                style={{ marginTop: '0.5rem' }}
              />
              <span className="pp-muted" style={{ fontSize: '0.75rem', display: 'block', marginTop: '0.35rem' }}>
                {intentDraft.length}/{RESEARCH_INTENT_MAX}{savingIntent ? ' · Saving…' : ''}
              </span>
            </label>
          </section>
        </>
      )}

      {/* Pending goal banner */}
      {pendingGoal && (
        <section className="pp-banner pp-banner--info">
          <p className="pp-banner-title">
            Goal captured{pendingGoal.stepId ? ` for Step ${steps.find(s => s.id === pendingGoal.stepId)?.order_index ?? ''}` : ''}
          </p>
          <div className="pp-muted" style={{ marginBottom: '0.35rem', fontSize: '0.8125rem' }}>
            <span>Type: </span>
            <strong style={{ color: 'var(--color-text)' }}>
              {pendingGoal.goalKind === 'url' ? 'URL / page reached' : 'Click element'}
            </strong>
          </div>
          {pendingGoal.goalKind === 'click' && (
            <div className="pp-muted" style={{ marginBottom: '0.25rem', fontSize: '0.8125rem' }}>
              <span>Element: </span>
              <code>{pendingGoal.selector || '(no selector)'}</code>
            </div>
          )}
          <div className="pp-muted" style={{ marginBottom: '0.85rem', fontSize: '0.8125rem' }}>
            <span>{pendingGoal.goalKind === 'url' ? 'URL match (path): ' : 'Page: '}</span>
            <code>
              {pendingGoal.goalKind === 'url' ? pathnameFromUrl(pendingGoal.url) : pendingGoal.url}
            </code>
          </div>
          <div className="pp-inline">
            <button type="button" className="primary pp-btn-sm" disabled={savingGoal} onClick={saveGoal}>
              {savingGoal ? 'Saving…' : 'Save as goal'}
            </button>
            <button type="button" className="pp-btn-sm" onClick={() => setPendingGoal(null)}>
              Discard
            </button>
          </div>
        </section>
      )}

      {/* Single-goal display */}
      {!isScenario && hasGoal && !pendingGoal && (
        <section className="pp-banner pp-banner--success">
          <div className="pp-inline" style={{ justifyContent: 'space-between', width: '100%' }}>
            <div style={{ fontSize: '0.875rem', lineHeight: 1.5 }}>
              <span style={{ fontWeight: 700, color: 'var(--color-success)', marginRight: '0.5rem' }}>
                Goal
              </span>
              {test.goal_event.type === 'url_change' ? (
                <>
                  Reach URL containing <code>{test.goal_event.url_pattern}</code>
                  <span className="pp-muted"> (navigation / SPA route)</span>
                </>
              ) : (
                <>
                  Click <code>{test.goal_event.selector}</code>
                  {test.goal_event.url_pattern && (
                    <span className="pp-muted"> on page <code>{test.goal_event.url_pattern}</code></span>
                  )}
                </>
              )}
            </div>
            <button type="button" className="pp-btn-sm" onClick={() => openGoalPicker()}>
              Redefine
            </button>
          </div>
        </section>
      )}

      {/* Heartbeat */}
      <section className={hbClass}>
        <div className="pp-heartbeat">
          <div className="pp-inline">
            <span className="pp-heartbeat-label">Snippet status</span>
            {heartbeat ? (
              <HeartbeatDot active={heartbeat.active} secondsAgo={heartbeat.seconds_ago} />
            ) : (
              <span className="pp-muted" style={{ fontSize: '0.8125rem' }}>Checking…</span>
            )}
          </div>
          <span className="pp-muted" style={{ fontSize: '0.75rem' }}>Polls every 5s</span>
        </div>
      </section>

      {/* Scenario: Steps section */}
      {isScenario && (
        <section className="pp-card">
          <div className="pp-inline" style={{ justifyContent: 'space-between', marginBottom: '1rem' }}>
            <h2 className="pp-section-title" style={{ margin: 0 }}>
              Steps ({steps.length})
            </h2>
          </div>
          {steps.length === 0 && (
            <p className="pp-muted" style={{ margin: '0 0 1rem' }}>
              No steps yet. Add your first task below.
            </p>
          )}
          <div className="pp-steps-list">
            {steps.map((step) => (
              <StepCard
                key={step.id}
                step={step}
                prototypeUrl={test.prototype_url}
                testId={id}
                onUpdate={handleStepUpdate}
                onDelete={handleStepDelete}
                onPickGoal={openGoalPicker}
              />
            ))}
          </div>
          <button
            type="button"
            className="pp-btn-sm"
            style={{ marginTop: steps.length > 0 ? '0.75rem' : 0 }}
            disabled={addingStep}
            onClick={handleAddStep}
          >
            {addingStep ? 'Adding…' : '+ Add step'}
          </button>
        </section>
      )}

      {/* Embed snippet */}
      <section className="pp-card">
        <h2 className="pp-section-title">Embed snippet</h2>
        <p className="pp-muted" style={{ margin: '0 0 1rem' }}>
          Paste into the <code>&lt;head&gt;</code> of your prototype. API URL and test ID are already baked in.
        </p>
        <div style={{ marginBottom: '1rem' }}>
          <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--color-text-secondary)', marginBottom: '0.4rem' }}>
            Single tag — recommended
          </div>
          <pre>{singleTag}</pre>
          <div className="pp-inline" style={{ marginTop: '0.5rem' }}>
            <CopyButton text={singleTag} label="Copy tag" />
            <CopyButton
              text={buildAiPrompt(singleTag, test.name, test.prototype_url)}
              label="✦ Copy AI prompt"
              className="pp-btn-sm pp-btn-ai"
            />
            <a href={snippetSrc} target="_blank" rel="noreferrer" style={{ fontSize: '0.8125rem', fontWeight: 600 }}>
              Preview JS file ↗
            </a>
          </div>
          <p className="pp-muted" style={{ margin: '0.5rem 0 0', fontSize: '0.75rem' }}>
            The AI prompt includes the tag and step-by-step instructions — paste it straight into Cursor, Claude, or ChatGPT.
          </p>
        </div>
        <details className="pp-details pp-muted">
          <summary>Generic snippet (two tags, works with any test)</summary>
          <pre style={{ marginTop: '0.75rem' }}>{twoTagVersion}</pre>
          <div style={{ marginTop: '0.5rem' }}>
            <CopyButton text={twoTagVersion} label="Copy" />
          </div>
        </details>
      </section>

      {/* Participants */}
      <section className="pp-card">
        <h2 className="pp-section-title">Participants ({test.participants.length})</h2>
        <p className="pp-muted" style={{ fontSize: '0.8125rem', margin: '0 0 0.85rem', lineHeight: 1.45 }}>
          {desktopMac?.download_url || desktopWin?.download_url ? (
            <>
              <span style={{ fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                Desktop meeting recorder — install once:{' '}
              </span>
              {desktopMac?.download_url && (
                <a href={desktopMac.download_url} rel="noreferrer">
                  macOS ({desktopMac.version || 'latest'})
                </a>
              )}
              {desktopMac?.download_url && desktopWin?.download_url && ' · '}
              {desktopWin?.download_url && (
                <a href={desktopWin.download_url} rel="noreferrer">
                  Windows ({desktopWin.version || 'latest'})
                </a>
              )}
            </>
          ) : (
            <>
              Record from the browser per participant, or use <strong>Open desktop app</strong> after installing
              the native recorder. Download links appear here when your API sets{' '}
              <code style={{ fontSize: '0.75rem' }}>DESKTOP_MAC_DOWNLOAD_URL</code> /{' '}
              <code style={{ fontSize: '0.75rem' }}>DESKTOP_WIN_DOWNLOAD_URL</code>.
            </>
          )}
        </p>
        <form className="pp-form-inline" onSubmit={handleAddParticipant}>
          <input
            placeholder="Participant name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <button type="submit" className="primary pp-btn-sm" disabled={adding}>
            {adding ? 'Adding…' : 'Add participant'}
          </button>
        </form>
        {test.participants.length === 0 ? (
          <p className="pp-muted" style={{ margin: 0 }}>No participants yet.</p>
        ) : (
          <div>
            {test.participants.map((p) => (
              <div key={p.id} className="pp-participant-row">
                <div className="pp-participant-row-main">
                  <span style={{ fontWeight: 600 }}>{p.name}</span>
                  {buildParticipantLink(test.prototype_url, p.tid, id) ? (
                    <div className="pp-link-row">
                      <code>{buildParticipantLink(test.prototype_url, p.tid, id)}</code>
                      <CopyButton text={buildParticipantLink(test.prototype_url, p.tid, id)} label="Copy link" />
                    </div>
                  ) : (
                    <span className="pp-muted" style={{ fontSize: '0.75rem' }}>
                      Invalid prototype URL — update test prototype URL to generate participant links
                    </span>
                  )}
                </div>
                <ParticipantAudioRecorder
                  testId={id}
                  participant={p}
                  recordings={recordingsByParticipant[p.id] || []}
                />
              </div>
            ))}
          </div>
        )}
      </section>

      {showScript && (
        <ScriptModal
          steps={steps}
          testName={test.name}
          onClose={() => setShowScript(false)}
        />
      )}
    </div>
  )
}
