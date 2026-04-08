import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../api.js'

export default function TestList() {
  const [tests, setTests] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    apiFetch('/api/tests')
      .then(setTests)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <p className="pp-loading">Loading tests…</p>
  if (error) return <p className="error">Error: {error}</p>

  return (
    <div className="pp-page">
      <div className="pp-page-head">
        <div>
          <p className="pp-kicker">Your workspace</p>
          <h1 className="pp-page-title">Tests</h1>
          <p className="pp-muted" style={{ marginTop: '0.35rem', maxWidth: '36rem' }}>
            Instrument prototypes, set goals, and read how people really move through your flows.
          </p>
        </div>
        <Link to="/tests/new">
          <button type="button" className="primary">+ New test</button>
        </Link>
      </div>

      {tests.length === 0 ? (
        <div className="pp-empty-state">
          <p style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.1rem', color: 'var(--color-text)', marginBottom: '0.5rem' }}>
            No tests yet
          </p>
          <p>
            Create a test, drop one script tag on your prototype, and share participant links — you will see clicks,
            routes, and time-to-goal in one place.
          </p>
          <p style={{ marginTop: '1.25rem' }}>
            <Link to="/tests/new">
              <button type="button" className="primary">Create your first test</button>
            </Link>
          </p>
        </div>
      ) : (
        <div className="pp-card" style={{ padding: 0, overflow: 'hidden' }}>
          {tests.map((test, i) => (
            <div
              key={test.id}
              className="pp-test-row"
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '1rem',
                flexWrap: 'wrap',
                padding: '1rem 1.35rem',
                borderBottom: i < tests.length - 1 ? '1px solid var(--color-border)' : 'none'
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div className="pp-inline" style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
                  <Link to={`/tests/${test.id}`} className="pp-test-name-link">
                    {test.name}
                  </Link>
                  <span
                    className={`badge ${
                      test.test_type === 'scenario'
                        ? 'amber'
                        : test.test_type === 'observational'
                          ? 'green'
                          : 'blue'
                    }`}
                  >
                    {test.test_type === 'scenario'
                      ? 'Scenario'
                      : test.test_type === 'observational'
                        ? 'Observe & discover'
                        : 'Single goal'}
                  </span>
                </div>
                <div className="pp-muted" style={{ marginTop: '0.2rem', fontSize: '0.8125rem' }}>
                  {new Date(test.created_at).toLocaleDateString(undefined, {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric'
                  })}
                </div>
              </div>
              <div className="pp-inline">
                <Link to={`/tests/${test.id}`}>
                  <button type="button" className="pp-btn-sm">Setup</button>
                </Link>
                <Link to={`/tests/${test.id}/results`}>
                  <button type="button" className="primary pp-btn-sm">Results</button>
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
