import { useEffect, useState } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { apiFetch } from '../api.js'

export default function JoinTeam() {
  const { token } = useParams()
  const { session, loading: authLoading, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  // Stage: 'loading' | 'ready' | 'joining' | 'success' | 'invalid' | 'error'
  const [stage, setStage] = useState('loading')
  const [teamName, setTeamName] = useState(null)
  const [error, setError] = useState(null)

  // Step 1: fetch public token info to show team name on the landing page
  useEffect(() => {
    async function fetchInviteInfo() {
      try {
        const data = await apiFetch(`/api/teams/invite/${token}`)
        if (!data.valid) {
          setStage(data.expired ? 'expired' : 'invalid')
          return
        }
        setTeamName(data.team_name)
        setStage('ready')
      } catch {
        setStage('invalid')
      }
    }
    fetchInviteInfo()
  }, [token])

  async function handleJoin() {
    // Not logged in — send to auth then back here
    if (!session) {
      navigate('/auth', { state: { from: location.pathname } })
      return
    }

    setStage('joining')
    try {
      const data = await apiFetch(`/api/teams/join/${token}`, { method: 'POST' })
      setTeamName(data.team?.name ?? teamName)
      await refreshProfile()
      setStage('success')
      setTimeout(() => navigate('/'), 2000)
    } catch (err) {
      setError(err.message)
      setStage('error')
    }
  }

  if (authLoading || stage === 'loading') {
    return (
      <div className="pp-auth-page">
        <div className="pp-auth-card" style={{ textAlign: 'center' }}>
          <p className="pp-loading">Loading invite…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="pp-auth-page">
      <div className="pp-auth-card" style={{ textAlign: 'center' }}>

        {/* ── Invalid / expired ── */}
        {(stage === 'invalid' || stage === 'expired') && (
          <>
            <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>🔗</div>
            <h2 className="pp-page-title" style={{ marginBottom: '0.5rem' }}>
              {stage === 'expired' ? 'Invite link expired' : 'Invalid invite link'}
            </h2>
            <p className="pp-muted" style={{ marginBottom: '1.5rem' }}>
              {stage === 'expired'
                ? 'This link has expired. Ask a teammate to generate a new one from Settings.'
                : 'This invite link is not valid. Make sure you copied the full URL.'}
            </p>
            {session && (
              <button type="button" className="secondary" onClick={() => navigate('/')}>
                Go to dashboard
              </button>
            )}
          </>
        )}

        {/* ── Landing: ready to join ── */}
        {stage === 'ready' && (
          <>
            <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>👋</div>
            <h2 className="pp-page-title" style={{ marginBottom: '0.5rem' }}>You've been invited</h2>
            <p className="pp-muted" style={{ marginBottom: '1.75rem' }}>
              You were invited to join <strong>{teamName}</strong> on Product Pulse.
            </p>
            <button type="button" className="primary" style={{ width: '100%' }} onClick={handleJoin}>
              {session ? `Join ${teamName}` : 'Sign in to join'}
            </button>
            {!session && (
              <p className="pp-muted" style={{ marginTop: '1rem', fontSize: '0.875rem' }}>
                Don't have an account?{' '}
                <button
                  type="button"
                  className="pp-btn-text"
                  style={{ fontSize: '0.875rem' }}
                  onClick={() => navigate('/auth', { state: { from: location.pathname, tab: 'signup' } })}
                >
                  Create one
                </button>
              </p>
            )}
          </>
        )}

        {/* ── Joining in progress ── */}
        {stage === 'joining' && (
          <>
            <p className="pp-loading" style={{ marginBottom: '0.5rem' }}>Joining team…</p>
            <p className="pp-muted">Just a moment</p>
          </>
        )}

        {/* ── Success ── */}
        {stage === 'success' && (
          <>
            <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>🎉</div>
            <h2 className="pp-page-title" style={{ marginBottom: '0.5rem' }}>You're in!</h2>
            <p className="pp-muted">You've joined <strong>{teamName}</strong>. Heading to the dashboard…</p>
          </>
        )}

        {/* ── Error ── */}
        {stage === 'error' && (
          <>
            <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>⚠️</div>
            <h2 className="pp-page-title" style={{ marginBottom: '0.5rem' }}>Something went wrong</h2>
            <p className="pp-muted" style={{ marginBottom: '1.5rem' }}>{error}</p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
              <button type="button" className="secondary" onClick={() => setStage('ready')}>
                Try again
              </button>
              {session && (
                <button type="button" className="secondary" onClick={() => navigate('/')}>
                  Go to dashboard
                </button>
              )}
            </div>
          </>
        )}

      </div>
    </div>
  )
}
