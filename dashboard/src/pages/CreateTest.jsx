import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { apiFetch } from '../api.js'

export default function CreateTest() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [prototypeUrl, setPrototypeUrl] = useState('')
  const [testType, setTestType] = useState('single')
  const [researchIntent, setResearchIntent] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const isObservational = testType === 'observational'

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const body = { name, test_type: testType }
      if (!isObservational) {
        body.prototype_url = prototypeUrl
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
      <div className="pp-page-head pp-page-head--single">
        <div>
          <Link to="/" className="pp-back-link">
            ← All tests
          </Link>
          <h1 className="pp-page-title">New test</h1>
          <p className="pp-muted" style={{ marginTop: '0.35rem', maxWidth: '32rem' }}>
            Point at your hosted prototype. You will define goals and grab the embed snippet on the next screen.
          </p>
        </div>
      </div>

      {error && (
        <p className="error" style={{ marginBottom: '1rem' }}>
          Error: {error}
        </p>
      )}

      <form className="pp-card" onSubmit={handleSubmit} style={{ maxWidth: 520 }}>
        <p className="pp-kicker" style={{ marginBottom: '1rem' }}>
          Test details
        </p>

        <div className="pp-type-grid" style={{ marginBottom: '1.25rem' }}>
          {[
            {
              value: 'single',
              label: 'Single goal',
              desc: 'One task, one success state. Best for focused A/B-style tests.'
            },
            {
              value: 'scenario',
              label: 'Scenario / Script',
              desc: 'Multiple ordered tasks with follow-up questions. Best for moderated sessions.'
            },
            {
              value: 'observational',
              label: 'Observe & discover',
              desc: 'Add a snippet and watch how real visitors interact — no tasks, no invite links.'
            }
          ].map((opt) => (
            <label
              key={opt.value}
              className={`pp-type-card${testType === opt.value ? ' is-active' : ''}`}
              onClick={() => setTestType(opt.value)}
            >
              <input
                type="radio"
                name="test_type"
                value={opt.value}
                checked={testType === opt.value}
                onChange={() => setTestType(opt.value)}
                style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }}
              />
              <strong>{opt.label}</strong>
              <span className="pp-muted" style={{ fontSize: '0.8125rem', marginTop: '0.2rem' }}>
                {opt.desc}
              </span>
            </label>
          ))}
        </div>

        <label>
          <span>Test name</span>
          <input
            required
            value={name}
            placeholder="e.g. Checkout flow v2"
            onChange={(e) => setName(e.target.value)}
            autoComplete="off"
          />
        </label>

        {!isObservational && (
          <label>
            <span>Prototype URL</span>
            <input
              required={!isObservational}
              type="url"
              value={prototypeUrl}
              placeholder="https://your-prototype.com"
              onChange={(e) => setPrototypeUrl(e.target.value)}
            />
          </label>
        )}

        {isObservational && (
          <p className="pp-muted" style={{ margin: '0 0 0.75rem', fontSize: '0.8125rem', lineHeight: 1.5 }}>
            No prototype URL needed — the snippet auto-detects sessions. You&apos;ll get the embed code on the next screen.
          </p>
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
                ? 'Hypothesis or question — e.g. "Where do visitors drop off before converting?"'
                : 'Research question or hypothesis — e.g. "Do users notice the new pricing tier?"'
            }
            rows={3}
            maxLength={2000}
            style={{ marginTop: '0.35rem' }}
            className="pp-step-textarea"
          />
          <span className="pp-muted" style={{ fontSize: '0.75rem', display: 'block', marginTop: '0.35rem' }}>
            You can add or edit this on the test page. {researchIntent.length}/2000
          </span>
        </label>

        <div className="pp-inline" style={{ marginTop: '1.25rem' }}>
          <button type="submit" className="primary" disabled={submitting}>
            {submitting ? 'Creating…' : 'Create test'}
          </button>
          <Link to="/">
            <button type="button">Cancel</button>
          </Link>
        </div>
      </form>
    </div>
  )
}
