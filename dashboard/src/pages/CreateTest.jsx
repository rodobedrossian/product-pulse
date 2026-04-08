import { useMemo, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { apiFetch } from '../api.js'

function isPrototypeUrlValid(raw) {
  const s = raw.trim()
  if (!s) return false
  try {
    const u = new URL(s)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

function TypeIconSingle() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
    </svg>
  )
}

function TypeIconScenario() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" strokeLinecap="round" />
    </svg>
  )
}

function TypeIconObservational() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

const TYPE_OPTIONS = [
  {
    value: 'single',
    label: 'Single goal',
    setup: 'Next: one success goal + embed snippet',
    desc: 'One task, one success state. Strong for focused usability checks and comparisons.',
    Icon: TypeIconSingle
  },
  {
    value: 'scenario',
    label: 'Scenario / script',
    setup: 'Next: ordered tasks, follow-ups + snippet',
    desc: 'Multiple steps with questions between. Fits moderated or scripted sessions.',
    Icon: TypeIconScenario
  },
  {
    value: 'observational',
    label: 'Observe & discover',
    setup: 'Next: embed snippet only — no tasks or invites',
    desc: 'Passive recording on your site. See how visitors behave without assigning tasks.',
    Icon: TypeIconObservational
  }
]

export default function CreateTest() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [prototypeUrl, setPrototypeUrl] = useState('')
  const [testType, setTestType] = useState('single')
  const [researchIntent, setResearchIntent] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [urlBlurred, setUrlBlurred] = useState(false)

  const isObservational = testType === 'observational'

  const urlOk = isObservational || isPrototypeUrlValid(prototypeUrl)
  const showUrlError =
    !isObservational && urlBlurred && prototypeUrl.trim() !== '' && !isPrototypeUrlValid(prototypeUrl)

  const canSubmit = useMemo(() => {
    if (!name.trim()) return false
    if (isObservational) return true
    return isPrototypeUrlValid(prototypeUrl)
  }, [name, prototypeUrl, isObservational])

  const submitBlockReason = useMemo(() => {
    if (!name.trim()) return 'Add a test name to continue.'
    if (!isObservational && !prototypeUrl.trim()) return 'Add a prototype URL (https://…) for task-based tests.'
    if (!isObservational && !isPrototypeUrlValid(prototypeUrl)) return 'Use a full http or https URL for your prototype.'
    return null
  }, [name, prototypeUrl, isObservational])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      const body = { name, test_type: testType }
      if (!isObservational) {
        body.prototype_url = prototypeUrl.trim()
      }
      if (researchIntent.trim()) {
        body.research_intent = researchIntent.trim()
      }
      const test = await apiFetch('/api/tests', {
        method: 'POST',
        body: JSON.stringify(body)
      })
      navigate(`/tests/${test.id}`)
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="pp-page">
      <div className="pp-create-shell">
        <div className="pp-page-head pp-page-head--single">
          <div>
            <Link to="/" className="pp-back-link">
              ← All tests
            </Link>
            <h1 className="pp-page-title">New test</h1>
            <p className="pp-muted" style={{ marginTop: '0.35rem', maxWidth: '36rem' }}>
              Choose how you want to learn from participants. You will add goals (if needed) and copy the embed snippet
              after this step.
            </p>
            <div className="pp-create-steps" aria-hidden>
              <span className="pp-create-step-pill is-current">1 · Basics</span>
              <span className="pp-create-step-pill is-next">2 · Goals & snippet</span>
            </div>
          </div>
        </div>

        {error && (
          <p className="error" style={{ marginBottom: '1rem' }}>
            Error: {error}
          </p>
        )}

        <form className="pp-card pp-create-card" onSubmit={handleSubmit}>
          <div className="pp-create-grid">
            <div className="pp-create-col-type">
              <p className="pp-kicker">Test type</p>
              <div className="pp-type-stack" role="radiogroup" aria-label="Test type">
                {TYPE_OPTIONS.map((opt) => {
                  const active = testType === opt.value
                  const Icon = opt.Icon
                  return (
                    <label
                      key={opt.value}
                      className={`pp-type-card${active ? ' is-active' : ''}`}
                      onClick={() => setTestType(opt.value)}
                    >
                      <input
                        type="radio"
                        name="test_type"
                        value={opt.value}
                        checked={active}
                        onChange={() => setTestType(opt.value)}
                        style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }}
                      />
                      <span className="pp-type-card-icon">
                        <Icon />
                      </span>
                      <span className="pp-type-card-body">
                        <span className="pp-type-card-title-row">
                          <strong>{opt.label}</strong>
                          {active ? <span className="pp-type-card-badge">Selected</span> : null}
                        </span>
                        <span className="pp-type-card-setup">{opt.setup}</span>
                        <span className="pp-type-card-desc">{opt.desc}</span>
                      </span>
                    </label>
                  )
                })}
              </div>

              <div className="pp-create-next-panel">
                <strong>After you create</strong>
                <ul>
                  <li>Copy the lightweight snippet into your prototype or site.</li>
                  <li>Share participant links or watch observational sessions roll in.</li>
                </ul>
                <Link to="/docs#test-types">Compare test types in the docs →</Link>
              </div>
            </div>

            <div className="pp-create-col-form">
              <p className="pp-kicker" style={{ marginBottom: '1rem' }}>
                Details
              </p>

              <label>
                <span>Test name</span>
                <input
                  required
                  value={name}
                  placeholder="e.g. Checkout flow — March study"
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="off"
                />
                <span className="pp-field-hint">Shown to you and in exports; use something your team will recognize.</span>
              </label>

              {!isObservational && (
                <label style={{ marginTop: '1rem' }}>
                  <span>Prototype URL</span>
                  <input
                    required={false}
                    type="url"
                    inputMode="url"
                    value={prototypeUrl}
                    placeholder="https://…"
                    onChange={(e) => setPrototypeUrl(e.target.value)}
                    onBlur={() => setUrlBlurred(true)}
                    aria-invalid={showUrlError}
                  />
                  {showUrlError ? (
                    <span className="pp-field-error" role="alert">
                      Enter a full URL starting with https:// or http://
                    </span>
                  ) : (
                    <span className="pp-field-hint">
                      Must be reachable by participants (Figma, Webflow, staging, or production).
                    </span>
                  )}
                </label>
              )}

              {isObservational && (
                <div className="pp-obs-callout" role="note">
                  <strong>Observational tests skip the prototype URL</strong>
                  You will paste the snippet on the pages you want to record. Sessions are detected automatically — no
                  task list or invite links required.
                </div>
              )}

              <label style={{ marginTop: isObservational ? 0 : '1rem' }}>
                <span>
                  What are you trying to learn?{' '}
                  <span className="pp-muted" style={{ fontWeight: 400 }}>(optional)</span>
                </span>
                <textarea
                  value={researchIntent}
                  onChange={(e) => setResearchIntent(e.target.value.slice(0, 2000))}
                  placeholder={
                    isObservational
                      ? 'e.g. “Where do visitors hesitate before signing up?”'
                      : 'e.g. “Do people notice the new pricing tier?”'
                  }
                  rows={3}
                  maxLength={2000}
                  style={{ marginTop: '0.35rem' }}
                  className="pp-step-textarea"
                />
                <span className="pp-field-hint">
                  Optional context for your team. You can edit this on the test page. {researchIntent.length}/2000
                </span>
              </label>
            </div>
          </div>

          <div className="pp-form-footer">
            <p className="pp-form-footer-hint">
              {canSubmit
                ? 'You can change type and details later from the test page.'
                : submitBlockReason}
            </p>
            <div className="pp-form-footer-actions">
              <Link to="/">
                <button type="button">Cancel</button>
              </Link>
              <button
                type="submit"
                className="primary"
                disabled={submitting || !canSubmit}
                title={!canSubmit && submitBlockReason ? submitBlockReason : undefined}
              >
                {submitting ? 'Creating…' : 'Create test'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
