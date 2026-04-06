import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

export default function LandingNav() {
  const { session, loading } = useAuth()
  const isLoggedIn = !loading && !!session

  return (
    <nav className="pp-landing-nav" aria-label="Main">
      <div className="pp-landing-nav-inner">
        <Link to="/" className="pp-landing-nav-brand">Product Pulse</Link>

        <div className="pp-landing-nav-links">
          <Link to="/features/session-replay">Session Replay</Link>
          <Link to="/features/goal-tracking">Goal Tracking</Link>
          <Link to="/features/ai-insights">AI Insights</Link>
          <Link to="/docs">Docs</Link>
        </div>

        <div className="pp-landing-nav-actions">
          {isLoggedIn ? (
            <Link to="/tests" className="pp-btn-primary">Go to dashboard →</Link>
          ) : (
            <>
              <Link to="/auth" className="pp-btn-ghost">Sign in</Link>
              <Link to="/auth" state={{ tab: 'signup' }} className="pp-btn-primary">Get started free</Link>
            </>
          )}
        </div>
      </div>
    </nav>
  )
}
