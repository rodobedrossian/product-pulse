import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

export default function Auth() {
  const { signIn, signUp } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = location.state?.from || '/tests'
  const [tab, setTab] = useState(location.state?.tab === 'signup' ? 'signup' : 'signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      if (tab === 'signup') {
        await signUp(email, password)
        navigate('/onboarding', { state: { from } })
      } else {
        const { user } = await signIn(email, password)
        // Profile is loaded by AuthContext after sign in — navigate and let ProtectedRoute handle redirect
        navigate(from, { replace: true })
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="pp-auth-page">
      <div className="pp-auth-card">
        <div className="pp-auth-brand">
          <span className="pp-brand-name">Product Pulse</span>
          <p className="pp-auth-tagline">Prototype usability, measured</p>
        </div>

        <div className="pp-auth-tabs">
          <button
            type="button"
            className={`pp-auth-tab${tab === 'signin' ? ' is-active' : ''}`}
            onClick={() => { setTab('signin'); setError(null) }}
          >
            Sign in
          </button>
          <button
            type="button"
            className={`pp-auth-tab${tab === 'signup' ? ' is-active' : ''}`}
            onClick={() => { setTab('signup'); setError(null) }}
          >
            Create account
          </button>
        </div>

        <form className="pp-auth-form" onSubmit={handleSubmit}>
          {error && <p className="pp-auth-error">{error}</p>}

          <div className="pp-field">
            <label className="pp-label" htmlFor="auth-email">Email</label>
            <input
              id="auth-email"
              type="email"
              className="pp-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              required
              autoComplete="email"
            />
          </div>

          <div className="pp-field">
            <label className="pp-label" htmlFor="auth-password">Password</label>
            <input
              id="auth-password"
              type="password"
              className="pp-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={tab === 'signup' ? 'Min. 6 characters' : ''}
              required
              autoComplete={tab === 'signup' ? 'new-password' : 'current-password'}
              minLength={tab === 'signup' ? 6 : undefined}
            />
          </div>

          <button type="submit" className="primary pp-auth-submit" disabled={loading}>
            {loading ? 'Please wait…' : tab === 'signup' ? 'Create account' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
