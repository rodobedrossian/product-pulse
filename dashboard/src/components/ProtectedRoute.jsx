import { useContext } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { AuthContext } from '../context/AuthContext.jsx'

export default function ProtectedRoute({ children }) {
  const { session, profile, loading } = useContext(AuthContext)
  const location = useLocation()

  if (loading) {
    return (
      <div className="pp-auth-page">
        <p className="pp-loading">Loading…</p>
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/auth" state={{ from: location }} replace />
  }

  if (!profile || !profile.onboarding_complete) {
    return <Navigate to="/onboarding" replace />
  }

  return children
}
