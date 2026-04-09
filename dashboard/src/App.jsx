import { Routes, Route, Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import TestList from './pages/TestList.jsx'
import CreateTest from './pages/CreateTest.jsx'
import TestDetail from './pages/TestDetail.jsx'
import TestResults from './pages/TestResults.jsx'
import Heatmap from './pages/Heatmap.jsx'
import Transcript from './pages/Transcript.jsx'
import SessionReplay from './pages/SessionReplay.jsx'
import Auth from './pages/Auth.jsx'
import Onboarding from './pages/Onboarding.jsx'
import JoinTeam from './pages/JoinTeam.jsx'
import Settings from './pages/Settings.jsx'
import Docs from './pages/Docs.jsx'
import Landing from './pages/Landing.jsx'
import FeatureSessionReplay from './pages/FeatureSessionReplay.jsx'
import FeatureGoalTracking from './pages/FeatureGoalTracking.jsx'
import FeatureAI from './pages/FeatureAI.jsx'
import DesktopAppDownloadButton from './components/DesktopAppDownloadButton.jsx'

function Shell() {
  const { pathname } = useLocation()
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const segment = pathname.split('/')[2]
  const isNew = pathname === '/tests/new'
  const docsActive = pathname === '/docs'
  const settingsActive = pathname === '/settings'
  const testsActive =
    !settingsActive &&
    (pathname === '/tests' || (pathname.startsWith('/tests/') && segment && segment !== 'new'))

  async function handleSignOut() {
    await signOut()
    navigate('/auth')
  }

  return (
    <div className="pp-shell">
      <header className="pp-header">
        <div className="pp-header-inner">
          <Link to="/tests" className="pp-brand">
            <span className="pp-brand-name">Product Pulse</span>
            <span className="pp-brand-tagline">Prototype usability, measured</span>
          </Link>
          <nav className="pp-nav" aria-label="Main">
            <Link to="/tests" className={testsActive && !isNew ? 'pp-nav-active' : undefined}>
              Tests
            </Link>
            <Link to="/tests/new" className={isNew ? 'pp-nav-active' : undefined}>
              New test
            </Link>
            <Link to="/docs" className={docsActive ? 'pp-nav-active' : undefined}>
              Docs
            </Link>
            <Link to="/settings" className={settingsActive ? 'pp-nav-active' : undefined}>
              Settings
            </Link>
          </nav>
          <div className="pp-user-menu">
            <DesktopAppDownloadButton />
            {profile?.full_name && (
              <span className="pp-user-name">{profile.full_name}</span>
            )}
            <button type="button" className="pp-btn-signout" onClick={handleSignOut}>
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="pp-main">
        <Routes>
          <Route index element={<Navigate to="/tests" replace />} />
          <Route path="/tests" element={<TestList />} />
          <Route path="/tests/new" element={<CreateTest />} />
          <Route path="/tests/:id" element={<TestDetail />} />
          <Route path="/tests/:id/results" element={<TestResults />} />
          <Route path="/tests/:id/heatmap" element={<Heatmap />} />
          <Route path="/tests/:id/participants/:participantId/transcript" element={<Transcript />} />
          <Route path="/tests/:id/replay/:tid" element={<SessionReplay />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/docs" element={<Docs />} />
        </Routes>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/features/session-replay" element={<FeatureSessionReplay />} />
        <Route path="/features/goal-tracking" element={<FeatureGoalTracking />} />
        <Route path="/features/ai-insights" element={<FeatureAI />} />
        <Route path="/auth" element={<Auth />} />
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="/join/:token" element={<JoinTeam />} />
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <Shell />
            </ProtectedRoute>
          }
        />
      </Routes>
    </AuthProvider>
  )
}
