import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { apiFetch } from '../api.js'

const BASE_URL = import.meta.env.VITE_APP_URL || window.location.origin

export default function Onboarding() {
  const [step, setStep] = useState(1)
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState('')
  const [teamName, setTeamName] = useState('')
  const [inviteToken, setInviteToken] = useState(null)
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const { refreshProfile } = useAuth()
  const navigate = useNavigate()

  async function handleStep1(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await apiFetch('/api/profile', {
        method: 'PATCH',
        body: JSON.stringify({ full_name: fullName, role })
      })
      setStep(2)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleStep2(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const data = await apiFetch('/api/teams', {
        method: 'POST',
        body: JSON.stringify({ name: teamName })
      })
      setInviteToken(data.invite_token)
      await refreshProfile()
      setStep(3)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleCopy() {
    const link = `${BASE_URL}/join/${inviteToken}`
    await navigator.clipboard.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="pp-auth-page">
      <div className="pp-onboarding-card">
        {/* Progress */}
        <div className="pp-onboarding-progress">
          {[1, 2, 3].map((n) => (
            <div key={n} className={`pp-ob-dot${step >= n ? ' is-done' : ''}${step === n ? ' is-active' : ''}`} />
          ))}
        </div>

        {/* Step 1: Name + Role */}
        {step === 1 && (
          <form onSubmit={handleStep1}>
            <p className="pp-kicker">Step 1 of 3</p>
            <h2 className="pp-page-title" style={{ marginBottom: '0.25rem' }}>Tell us about yourself</h2>
            <p className="pp-muted" style={{ marginBottom: '1.75rem' }}>This helps your team know who you are.</p>

            {error && <p className="pp-auth-error">{error}</p>}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1rem' }}>
              <div className="pp-field">
                <label className="pp-label" htmlFor="ob-name">Your name</label>
                <input
                  id="ob-name"
                  type="text"
                  className="pp-input"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Alex Rivera"
                  required
                />
              </div>

              <div className="pp-field">
                <label className="pp-label" htmlFor="ob-role">Your role</label>
                <select
                  id="ob-role"
                  className="pp-input"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  required
                >
                  <option value="" disabled>Select your role…</option>
                  <option value="Product Designer">Product Designer</option>
                  <option value="UX Researcher">UX Researcher</option>
                  <option value="Product Manager">Product Manager</option>
                  <option value="Design Lead">Design Lead</option>
                  <option value="Product Lead">Product Lead</option>
                  <option value="UX Writer">UX Writer</option>
                  <option value="Engineer">Engineer</option>
                  <option value="Founder">Founder</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>

            <button type="submit" className="primary" style={{ width: '100%', marginTop: '0.5rem' }} disabled={loading}>
              {loading ? 'Saving…' : 'Continue →'}
            </button>
          </form>
        )}

        {/* Step 2: Team name */}
        {step === 2 && (
          <form onSubmit={handleStep2}>
            <p className="pp-kicker">Step 2 of 3</p>
            <h2 className="pp-page-title" style={{ marginBottom: '0.25rem' }}>Name your team</h2>
            <p className="pp-muted" style={{ marginBottom: '1.75rem' }}>You can always change this later.</p>

            {error && <p className="pp-auth-error">{error}</p>}

            <div className="pp-field">
              <label className="pp-label" htmlFor="ob-team">Team name</label>
              <input
                id="ob-team"
                type="text"
                className="pp-input"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                placeholder="Acme Design"
                required
              />
            </div>

            <button type="submit" className="primary" style={{ width: '100%', marginTop: '0.5rem' }} disabled={loading}>
              {loading ? 'Creating team…' : 'Create team →'}
            </button>
          </form>
        )}

        {/* Step 3: Invite */}
        {step === 3 && (
          <div>
            <p className="pp-kicker">Step 3 of 3</p>
            <h2 className="pp-page-title" style={{ marginBottom: '0.25rem' }}>Invite teammates</h2>
            <p className="pp-muted" style={{ marginBottom: '1.75rem' }}>Share this link — anyone with it can join your team.</p>

            {inviteToken && (
              <div className="pp-invite-block">
                <input
                  readOnly
                  className="pp-input"
                  value={`${BASE_URL}/join/${inviteToken}`}
                  onFocus={(e) => e.target.select()}
                />
                <button type="button" className="secondary pp-invite-copy" onClick={handleCopy}>
                  {copied ? '✓ Copied' : 'Copy link'}
                </button>
              </div>
            )}

            <p className="pp-muted" style={{ fontSize: '0.82rem', marginTop: '0.75rem' }}>
              Invite links expire after 30 days. You can always generate a new one from settings.
            </p>

            <button
              type="button"
              className="primary"
              style={{ width: '100%', marginTop: '1.5rem' }}
              onClick={() => navigate('/')}
            >
              Go to dashboard →
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
