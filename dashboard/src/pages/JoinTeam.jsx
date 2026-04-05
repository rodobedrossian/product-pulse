import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { apiFetch } from '../api.js'

export default function JoinTeam() {
  const { token } = useParams()
  const { session, loading: authLoading, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const [status, setStatus] = useState('idle') // idle | joining | success | error
  const [error, setError] = useState(null)
  const [teamName, setTeamName] = useState(null)

  useEffect(() => {
    if (authLoading) return

    // Not logged in — redirect to auth with return path
    if (!session) {
      navigate(`/auth`, { state: { from: { pathname: `/join/${token}` } }, replace: true })
      return
    }

    // Logged in — attempt to join
    setStatus('joining')
    apiFetch(`/api/teams/join/${token}`, { method: 'POST' })
      .then(async (data) => {
        setTeamName(data.team?.name ?? null)
        await refreshProfile()
        setStatus('success')
        setTimeout(() => navigate('/'), 2000)
      })
      .catch((err) => {
        setError(err.message)
        setStatus('error')
      })
  }, [authLoading, session, token])

  if (authLoading || status === 'idle') return null

  return (
    <div className="pp-auth-page">
      <div className="pp-auth-card" style={{ textAlign: 'center' }}>
        {status === 'joining' && (
          <>
            <p className="pp-loading" style={{ marginBottom: '0.5rem' }}>Joining team…</p>
            <p className="pp-muted">Just a moment</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>🎉</div>
            <h2 className="pp-page-title">You're in!</h2>
            {teamName && (
              <p className="pp-muted">You've joined <strong>{teamName}</strong>. Heading to the dashboard…</p>
            )}
          </>
        )}

        {status === 'error' && (
          <>
            <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>⚠️</div>
            <h2 className="pp-page-title">Invite issue</h2>
            <p className="pp-muted" style={{ marginBottom: '1.5rem' }}>{error}</p>
            <button type="button" className="primary" onClick={() => navigate('/')}>
              Go to dashboard
            </button>
          </>
        )}
      </div>
    </div>
  )
}
