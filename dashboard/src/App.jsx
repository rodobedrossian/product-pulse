import { Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import TestList from './pages/TestList.jsx'
import CreateTest from './pages/CreateTest.jsx'
import TestDetail from './pages/TestDetail.jsx'
import TestResults from './pages/TestResults.jsx'
import SessionReplay from './pages/SessionReplay.jsx'
import Auth from './pages/Auth.jsx'
import Onboarding from './pages/Onboarding.jsx'
import JoinTeam from './pages/JoinTeam.jsx'
import Settings from './pages/Settings.jsx'
import Docs from './pages/Docs.jsx'

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
    (pathname === '/' || (pathname.startsWith('/tests/') && segment && segment !== 'new'))

  async function handleSignOut() {
    await signOut()
    navigate('/auth')
  }

  return (
    <div className="pp-shell">
      <header className="pp-header">
        <div className="pp-header-inner">
          <Link to="/" className="pp-brand">
            <span className="pp-brand-name">Product Pulse</span>
            <span className="pp-brand-tagline">Prototype usability, measured</span>
          </Link>
          <nav className="pp-nav" aria-label="Main">
            <Link to="/" className={testsActive && !isNew ? 'pp-nav-active' : undefined}>
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
          <Route path="/" element={<TestList />} />
          <Route path="/tests/new" element={<CreateTest />} />
          <Route path="/tests/:id" element={<TestDetail />} />
          <Route path="/tests/:id/results" element={<TestResults />} />
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
