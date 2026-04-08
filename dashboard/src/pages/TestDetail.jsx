import { useEffect, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { apiFetch } from '../api.js'
import { getApiBase } from '../lib/publicEnv.js'
import ParticipantAudioRecorder from '../components/ParticipantAudioRecorder.jsx'
import ContextMarkdownPreview from '../components/ContextMarkdownPreview.jsx'

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
  const [contextDraft, setContextDraft]   = useState('')
  const [savingContext, setSavingContext] = useState(false)
  const [savedContext, setSavedContext]   = useState(false)
  const [importedFile, setImportedFile]   = useState(null)
  const [contextDropZoneActive, setContextDropZoneActive] = useState(false)
  const [contextEditing, setContextEditing] = useState(false)
  const contextDragDepth                  = useRef(0)
  const fileInputRef                      = useRef(null)
  const [activeSection, setActiveSection] = useState('define')
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
    if (!test) return
    setContextDraft(test.context ?? '')
  }, [test?.id, test?.context])

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

  // IntersectionObserver for active section tracking
  useEffect(() => {
    const sectionIds = ['define', 'setup', 'run']
    const observers = sectionIds.map((sec) => {
      const el = document.getElementById(sec)
      if (!el) return null
      const o = new IntersectionObserver(
        ([entry]) => { if (entry.isIntersecting) setActiveSection(sec) },
        { rootMargin: '-40% 0px -55% 0px' }
      )
      o.observe(el)
      return o
    })
    return () => observers.forEach((o) => o?.disconnect())
  }, [test?.id])

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

  async function saveTestContext(overrideText) {
    if (!test) return
    const raw = overrideText !== undefined ? String(overrideText) : contextDraft
    const next = raw.trim()
    if (next === (test.context ?? '').trim()) return
    setSavingContext(true)
    try {
      const updated = await apiFetch(`/api/tests/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ context: raw })
      })
      setTest((t) => ({ ...t, context: updated.context }))
      setSavedContext(true)
      setTimeout(() => setSavedContext(false), 2000)
    } catch (err) {
      alert('Failed to save context: ' + err.message)
    } finally {
      setSavingContext(false)
    }
  }

  async function handleContextFile(file) {
    if (!file) return
    const ext = file.name.split('.').pop().toLowerCase()
    if (!['md', 'txt', 'docx'].includes(ext)) {
      alert('Only .md, .txt, and .docx files are supported.')
      return
    }
    setImportedFile({ name: file.name })
    try {
      let text
      if (ext === 'docx') {
        const mammoth = await import('mammoth')
        const result = await mammoth.convertToMarkdown({ arrayBuffer: await file.arrayBuffer() })
        text = result.value
      } else {
        text = await file.text()
      }
      setContextDraft(text)
      setContextEditing(false)
      await saveTestContext(text)
    } catch (err) {
      alert('Could not read file: ' + (err.message || String(err)))
      setImportedFile(null)
    }
  }

  function handleContextDragEnter(e) {
    e.preventDefault()
    e.stopPropagation()
    contextDragDepth.current += 1
    setContextDropZoneActive(true)
  }

  function handleContextDragLeave(e) {
    e.preventDefault()
    e.stopPropagation()
    contextDragDepth.current -= 1
    if (contextDragDepth.current <= 0) {
      contextDragDepth.current = 0
      setContextDropZoneActive(false)
    }
  }

  function handleContextDragOver(e) {
    e.preventDefault()
    e.stopPropagation()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
  }

  function handleContextDrop(e) {
    e.preventDefault()
    e.stopPropagation()
    contextDragDepth.current = 0
    setContextDropZoneActive(false)
    const f = e.dataTransfer.files?.[0]
    if (f) handleContextFile(f)
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

      const clickUrlPattern = urlPattern === '/' ? '' : urlPattern

      const goal_event =
        pendingGoal.goalKind === 'url'
          ? { type: 'url_change', url_pattern: urlPattern }
          : { type: 'click', selector: pendingGoal.selector, url_pattern: clickUrlPattern }

      if (pendingGoal.stepId) {
        const updated = await apiFetch(`/api/tests/${id}/steps/${pendingGoal.stepId}`, {
          method: 'PATCH',
          body: JSON.stringify({ goal_event })
        })
        setSteps((prev) => prev.map((s) => s.id === pendingGoal.stepId ? { ...s, goal_event: updated.goal_event } : s))
      } else {
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
      return filtered.map((s, i) => ({ ...s, order_index: i + 1 }))
    })
  }

  if (loading) return <p className="pp-loading">Loading test…</p>
  if (error) return <p className="error">Error: {error}</p>
  if (!test) return null

  const isScenario = test.test_type === 'scenario'
  const isObservational = test.test_type === 'observational'
  const snippetSrc = `${API_URL}/api/tests/${id}/snippet.js`
  const singleTag = `<script src="${snippetSrc}"></script>`
  const twoTagVersion =
    `<script>window.ProtoPulse = { apiUrl: '${API_URL}' }</script>\n` +
    `<script src="${API_URL}/snippet/protopulse.js" data-test-id="${id}"></script>`

  const ge = test.goal_event
  const hasGoal =
    !!ge?.type &&
    (!!ge.selector || (!!ge.url_pattern && String(ge.url_pattern).length > 0))

  const hasIntent = String(test.research_intent || '').trim().length > 0
  const hasContext = String(test.context || '').trim().length > 0
  const hasSnippetLive = !!heartbeat?.active
  const hasParticipants = (test.participants?.length || 0) > 0
  const hasScenarioSteps = !isScenario || steps.length > 0
  const hasScenarioGoals = !isScenario || steps.every(stepHasDefinedGoal)
  const hasSingleGoalReady = isScenario || isObservational || hasGoal

  const nextAction = (() => {
    if (!hasIntent) return 'Add your research question'
    if (!hasContext) return 'Add test context for AI reports'
    if (isScenario && !hasScenarioSteps) return 'Add your first scenario step'
    if (isScenario && !hasScenarioGoals) return 'Define goals for each step'
    if (!isScenario && !isObservational && !hasSingleGoalReady) return 'Define a success goal'
    if (!hasSnippetLive) return 'Install and validate snippet'
    if (!hasParticipants) return isObservational ? 'Wait for first session' : 'Add participants'
    return 'View incoming results'
  })()

  return (
    <div className="pp-page">

      {/* ─── Page header ───────────────────────────────────────────────── */}
      <div className="pp-notion-page-header">
        <Link to="/" className="pp-back-link">← All tests</Link>
        <div className="pp-page-head" style={{ marginBottom: 0, marginTop: '0.5rem' }}>
          <div style={{ minWidth: 0 }}>
            <div className="pp-inline" style={{ gap: '0.5rem', marginBottom: '0.2rem' }}>
              <h1 className="pp-page-title" style={{ margin: 0 }}>{test.name}</h1>
              <span
                className={`badge ${isScenario ? 'amber' : isObservational ? 'green' : 'blue'}`}
                style={{ alignSelf: 'center' }}
              >
                {isScenario ? 'Scenario' : isObservational ? 'Observe & discover' : 'Single goal'}
              </span>
            </div>
            {test.prototype_url && (
              <a href={test.prototype_url} target="_blank" rel="noreferrer" className="pp-proto-link">
                {test.prototype_url}
              </a>
            )}
          </div>
          <div className="pp-inline">
            {isScenario ? (
              <button type="button" className="pp-btn-sm" onClick={() => setShowScript(true)}>
                📋 Script
              </button>
            ) : !isObservational ? (
              <button type="button" className="pp-btn-sm" onClick={() => openGoalPicker()}>
                {hasGoal ? 'Redefine goal' : 'Define goal'}
              </button>
            ) : null}
            <Link to={`/tests/${id}/results`}>
              <button type="button" className="primary pp-btn-sm">View results</button>
            </Link>
          </div>
        </div>
      </div>

      {/* ─── Two-column Notion layout ───────────────────────────────────── */}
      <div className="pp-notion-layout">

        {/* Sidebar */}
        <aside className="pp-notion-sidebar">
          <nav className="pp-notion-nav" aria-label="Test sections">
            {[
              {
                sid: 'define',
                label: 'Define',
                done: hasIntent && hasContext,
                partial: hasIntent || hasContext,
              },
              {
                sid: 'setup',
                label: 'Setup',
                done: hasSnippetLive && hasScenarioSteps && hasScenarioGoals && hasSingleGoalReady,
                partial: hasSnippetLive || hasScenarioSteps,
              },
              {
                sid: 'run',
                label: 'Run',
                done: hasParticipants,
                partial: false,
              },
            ].map(({ sid, label, done, partial }) => (
              <a
                key={sid}
                href={`#${sid}`}
                className={`pp-notion-nav-item${activeSection === sid ? ' is-active' : ''}`}
              >
                <span className={`pp-nav-dot${done ? ' is-done' : partial ? ' is-partial' : ''}`} />
                {label}
              </a>
            ))}
            <a href={`/tests/${id}/results`} className="pp-notion-nav-item">
              <span className="pp-nav-dot pp-nav-dot--review" />
              Review
            </a>
          </nav>

          <div className="pp-notion-next-action">
            <span className="pp-kicker" style={{ fontSize: '0.6875rem', marginBottom: '0.3rem', display: 'block' }}>
              Next
            </span>
            <span style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--color-text)', lineHeight: 1.4 }}>
              {nextAction}
            </span>
          </div>
        </aside>

        {/* Main content */}
        <main className="pp-notion-main">

          {/* ── DEFINE ─────────────────────────────────────────────────── */}
          <section id="define" className="pp-notion-section">
            <div className="pp-notion-section-label">Define</div>

            {/* Research question */}
            <div className="pp-notion-field">
              <div className="pp-notion-field-label">Research question</div>
              <div className="pp-notion-field-hint">
                {isObservational
                  ? 'Hypothesis or question — what you want this observation to answer.'
                  : 'What you\'re testing — the question or hypothesis this test should answer.'}
              </div>
              <textarea
                className="pp-notion-textarea"
                placeholder={
                  isObservational
                    ? 'e.g. "Where do visitors drop off before converting?"'
                    : 'e.g. "Can users find checkout without scanning the whole page?"'
                }
                rows={3}
                maxLength={RESEARCH_INTENT_MAX}
                value={intentDraft}
                onChange={(e) => setIntentDraft(e.target.value.slice(0, RESEARCH_INTENT_MAX))}
                onBlur={saveResearchIntent}
                disabled={savingIntent}
              />
              <div className="pp-notion-saving">
                {intentDraft.length}/{RESEARCH_INTENT_MAX}
                {savingIntent && ' · Saving…'}
              </div>
            </div>

            {/* Test context */}
            <div className="pp-notion-field">
              <div className="pp-notion-field-label">
                Test context{' '}
                <span style={{ fontWeight: 400, color: 'var(--color-text-secondary)', fontSize: '0.75rem' }}>
                  · AI report context
                </span>
              </div>
              <div className="pp-notion-field-hint">
                Background the AI uses when generating reports. Context is shown formatted below; use Edit to change the markdown source.
                Drag .md / .txt / .docx anywhere on this block or use Import.
              </div>

              <div
                className={`pp-context-dropzone${contextDropZoneActive ? ' is-drag-over' : ''}`}
                onDragEnter={handleContextDragEnter}
                onDragLeave={handleContextDragLeave}
                onDragOver={handleContextDragOver}
                onDrop={handleContextDrop}
              >
                {importedFile && (
                  <div className="pp-inline" style={{ gap: '0.4rem', marginBottom: '0.4rem' }}>
                    <span className="pp-muted" style={{ fontSize: '0.8125rem' }}>📄 {importedFile.name}</span>
                    <button
                      type="button"
                      className="pp-btn-sm"
                      onClick={() => {
                        setImportedFile(null)
                        setContextDraft('')
                        saveTestContext('')
                      }}
                    >
                      Clear
                    </button>
                  </div>
                )}

                <div className="pp-inline pp-context-edit-row" style={{ gap: '0.35rem', marginBottom: '0.45rem' }}>
                  {contextEditing ? (
                    <button
                      type="button"
                      className="pp-btn-sm primary"
                      disabled={savingContext}
                      onClick={() => {
                        saveTestContext()
                        setContextEditing(false)
                      }}
                    >
                      Done
                    </button>
                  ) : (
                    <button type="button" className="pp-btn-sm" onClick={() => setContextEditing(true)}>
                      Edit
                    </button>
                  )}
                </div>

                {contextEditing ? (
                  <textarea
                    className="pp-notion-textarea pp-context-textarea"
                    placeholder={"# Test context\n\nDescribe the product, who the participants are, what you're validating, and any relevant background.\n\nMarkdown is supported."}
                    rows={8}
                    value={contextDraft}
                    onChange={(e) => setContextDraft(e.target.value)}
                    onBlur={() => saveTestContext()}
                    onDragOver={handleContextDragOver}
                    disabled={savingContext}
                  />
                ) : (
                  <div className="pp-context-preview-pane">
                    <ContextMarkdownPreview markdown={contextDraft} />
                  </div>
                )}

                <div className="pp-inline" style={{ justifyContent: 'space-between', marginTop: '0.4rem' }}>
                  <div className="pp-notion-saving">
                    {contextDraft.length.toLocaleString()} chars
                    {contextDraft.length >= 5000 && (
                      <span style={{ color: 'var(--color-warn)', marginLeft: '0.35rem' }}>· Getting long</span>
                    )}
                    {savingContext && <span style={{ marginLeft: '0.35rem' }}>· Saving…</span>}
                    {savedContext && !savingContext && (
                      <span style={{ color: 'var(--color-success)', marginLeft: '0.35rem' }}>· Saved</span>
                    )}
                  </div>
                  <div
                    className="pp-notion-file-import"
                    onClick={() => fileInputRef.current?.click()}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        fileInputRef.current?.click()
                      }
                    }}
                  >
                    ↑ Import .md / .txt / .docx
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".md,.txt,.docx,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        if (f) handleContextFile(f)
                        e.target.value = ''
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* ── SETUP ──────────────────────────────────────────────────── */}
          <section id="setup" className="pp-notion-section">
            <div className="pp-notion-section-label">Setup</div>

            {/* Pending goal capture banner */}
            {pendingGoal && (
              <div className="pp-banner pp-banner--info" style={{ marginBottom: '1.25rem' }}>
                <p className="pp-banner-title">
                  Goal captured{pendingGoal.stepId ? ` for Step ${steps.find((s) => s.id === pendingGoal.stepId)?.order_index ?? ''}` : ''}
                </p>
                <div className="pp-muted" style={{ marginBottom: '0.35rem', fontSize: '0.8125rem' }}>
                  <span>Type: </span>
                  <strong style={{ color: 'var(--color-text)' }}>
                    {pendingGoal.goalKind === 'url' ? 'URL / page reached' : 'Click element'}
                  </strong>
                </div>
                {pendingGoal.goalKind === 'click' && (
                  <div className="pp-muted" style={{ marginBottom: '0.25rem', fontSize: '0.8125rem' }}>
                    <span>Element: </span><code>{pendingGoal.selector || '(no selector)'}</code>
                  </div>
                )}
                <div className="pp-muted" style={{ marginBottom: '0.85rem', fontSize: '0.8125rem' }}>
                  <span>{pendingGoal.goalKind === 'url' ? 'URL match (path): ' : 'Page: '}</span>
                  <code>{pendingGoal.goalKind === 'url' ? pathnameFromUrl(pendingGoal.url) : pendingGoal.url}</code>
                </div>
                <div className="pp-inline">
                  <button type="button" className="primary pp-btn-sm" disabled={savingGoal} onClick={saveGoal}>
                    {savingGoal ? 'Saving…' : 'Save as goal'}
                  </button>
                  <button type="button" className="pp-btn-sm" onClick={() => setPendingGoal(null)}>Discard</button>
                </div>
              </div>
            )}

            {/* Single-goal display */}
            {!isScenario && !isObservational && hasGoal && !pendingGoal && (
              <div className="pp-notion-field" style={{ marginBottom: '1.25rem' }}>
                <div className="pp-notion-field-label">Success goal</div>
                <div className="pp-banner pp-banner--success" style={{ margin: 0 }}>
                  <div className="pp-inline" style={{ justifyContent: 'space-between', width: '100%' }}>
                    <div style={{ fontSize: '0.875rem', lineHeight: 1.5 }}>
                      <span style={{ fontWeight: 700, color: 'var(--color-success)', marginRight: '0.5rem' }}>✓</span>
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
                    <button type="button" className="pp-btn-sm" onClick={() => openGoalPicker()}>Redefine</button>
                  </div>
                </div>
              </div>
            )}

            {/* Scenario: script steps */}
            {isScenario && (
              <div className="pp-notion-field">
                <div className="pp-notion-field-label">
                  Script steps{' '}
                  <span className="pp-muted" style={{ fontWeight: 400, fontSize: '0.8125rem' }}>({steps.length})</span>
                </div>
                {steps.length === 0 && (
                  <p className="pp-muted" style={{ margin: '0 0 0.75rem', fontSize: '0.875rem' }}>
                    No steps yet. Add your first task below.
                  </p>
                )}
                <div className="pp-steps-list" style={{ marginBottom: '0.5rem' }}>
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
                <button type="button" className="pp-btn-sm" disabled={addingStep} onClick={handleAddStep}>
                  {addingStep ? 'Adding…' : '+ Add step'}
                </button>
              </div>
            )}

            {/* Snippet embed + heartbeat */}
            <div className="pp-notion-field">
              <div className="pp-notion-field-label">
                Snippet
                <span style={{ marginLeft: '0.75rem', verticalAlign: 'middle' }}>
                  {heartbeat ? (
                    <HeartbeatDot active={heartbeat.active} secondsAgo={heartbeat.seconds_ago} />
                  ) : (
                    <span className="pp-muted" style={{ fontSize: '0.8125rem' }}>Checking…</span>
                  )}
                </span>
              </div>
              <div className="pp-notion-field-hint">
                Paste into the <code>&lt;head&gt;</code> of your prototype. API URL and test ID are already baked in.
              </div>

              <div style={{ marginBottom: '0.75rem' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Single tag — recommended
                </div>
                <pre style={{ margin: 0 }}>{singleTag}</pre>
                <div className="pp-inline" style={{ marginTop: '0.5rem', gap: '0.5rem' }}>
                  <CopyButton text={singleTag} label="Copy tag" />
                  {test.prototype_url && (
                    <CopyButton
                      text={buildAiPrompt(singleTag, test.name, test.prototype_url)}
                      label="✦ Copy AI prompt"
                      className="pp-btn-sm pp-btn-ai"
                    />
                  )}
                  <a href={snippetSrc} target="_blank" rel="noreferrer" style={{ fontSize: '0.8125rem', fontWeight: 600 }}>
                    Preview JS ↗
                  </a>
                </div>
                <p className="pp-muted" style={{ margin: '0.5rem 0 0', fontSize: '0.75rem' }}>
                  The AI prompt includes the tag and step-by-step instructions — paste straight into Cursor, Claude, or ChatGPT.
                </p>
              </div>

              <details className="pp-details pp-muted">
                <summary>Generic snippet (two tags, works with any test)</summary>
                <pre style={{ marginTop: '0.75rem' }}>{twoTagVersion}</pre>
                <div style={{ marginTop: '0.5rem' }}>
                  <CopyButton text={twoTagVersion} label="Copy" />
                </div>
              </details>
            </div>
          </section>

          {/* ── RUN ────────────────────────────────────────────────────── */}
          <section id="run" className="pp-notion-section">
            <div className="pp-notion-section-label">Run</div>

            {/* Observational: sessions table */}
            {isObservational && (
              <div className="pp-notion-field">
                <div className="pp-notion-field-label">
                  Sessions{' '}
                  <span className="pp-muted" style={{ fontWeight: 400, fontSize: '0.8125rem' }}>
                    ({test.participants.length})
                    {test.tester_count != null && (
                      <> · {test.tester_count} unique visitor{test.tester_count !== 1 ? 's' : ''}</>
                    )}
                  </span>
                </div>
                {test.participants.length === 0 ? (
                  <p className="pp-muted" style={{ margin: 0, fontSize: '0.875rem' }}>
                    No sessions yet. Add the snippet to your prototype — sessions appear here automatically as visitors arrive.
                  </p>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                          <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>Date</th>
                          <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>Device</th>
                          <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>Browser</th>
                          <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>Referrer</th>
                          <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {test.participants.map((p) => {
                          const date = new Date(p.created_at)
                          const dateStr = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
                          const timeStr = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
                          const deviceIcon = p.device_type === 'mobile' ? '📱' : p.device_type === 'tablet' ? '📟' : '🖥'
                          let referrerDisplay = '—'
                          if (p.referrer) {
                            try { referrerDisplay = new URL(p.referrer).hostname } catch { referrerDisplay = p.referrer }
                          }
                          return (
                            <tr key={p.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                              <td style={{ padding: '0.6rem 0.75rem', whiteSpace: 'nowrap' }}>
                                <span style={{ fontWeight: 500 }}>{dateStr}</span>
                                <span className="pp-muted" style={{ marginLeft: '0.35rem' }}>{timeStr}</span>
                              </td>
                              <td style={{ padding: '0.6rem 0.75rem' }}>
                                <span title={p.device_type || 'unknown'}>{deviceIcon}</span>
                              </td>
                              <td style={{ padding: '0.6rem 0.75rem', whiteSpace: 'nowrap' }}>
                                {p.browser || <span className="pp-muted">—</span>}
                              </td>
                              <td style={{ padding: '0.6rem 0.75rem' }}>
                                {p.referrer ? (
                                  <a href={p.referrer} target="_blank" rel="noreferrer" style={{ fontSize: '0.8125rem' }} title={p.referrer}>
                                    {referrerDisplay}
                                  </a>
                                ) : (
                                  <span className="pp-muted">Direct</span>
                                )}
                              </td>
                              <td style={{ padding: '0.6rem 0.75rem', whiteSpace: 'nowrap' }}>
                                <Link to={`/tests/${id}/replay/${p.tid}`} style={{ fontSize: '0.8125rem', fontWeight: 600 }}>
                                  View replay ↗
                                </Link>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Directed: participants */}
            {!isObservational && (
              <div className="pp-notion-field">
                <div className="pp-notion-field-label">
                  Participants{' '}
                  <span className="pp-muted" style={{ fontWeight: 400, fontSize: '0.8125rem' }}>
                    ({test.participants.length})
                  </span>
                </div>
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

                <form className="pp-form-inline" onSubmit={handleAddParticipant} style={{ marginBottom: '0.85rem' }}>
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
                          {(() => {
                            const participantLink = buildParticipantLink(test.prototype_url, p.tid, id)
                            if (!participantLink) {
                              return (
                                <span className="pp-muted" style={{ fontSize: '0.75rem' }}>
                                  Invalid prototype URL — update test prototype URL to generate participant links
                                </span>
                              )
                            }
                            return (
                              <div className="pp-link-row pp-link-row--participant">
                                <a
                                  href={participantLink}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="pp-testing-link"
                                  title={participantLink}
                                >
                                  Testing link
                                </a>
                                <CopyButton text={participantLink} label="Copy link" />
                                <ParticipantAudioRecorder
                                  testId={id}
                                  participant={p}
                                  recordings={recordingsByParticipant[p.id] || []}
                                  inline
                                />
                              </div>
                            )
                          })()}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>

        </main>
      </div>

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
