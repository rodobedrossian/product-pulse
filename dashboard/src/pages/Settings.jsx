import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { apiFetch } from '../api.js'
import { getAppOrigin } from '../lib/publicEnv.js'
import { useDesktopReleases } from '../hooks/useDesktopReleases.js'
import { detectClientDesktopOS } from '../lib/desktopPlatform.js'

const BASE_URL = getAppOrigin()
const MCP_URL = 'https://product-pulse-mcp.up.railway.app/mcp'

const ROLE_OPTIONS = [
  'Product Designer',
  'UX Researcher',
  'Product Manager',
  'Design Lead',
  'Product Lead',
  'UX Writer',
  'Engineer',
  'Founder',
  'Other'
]

export default function Settings() {
  const location = useLocation()
  const { mac: desktopMac, win: desktopWin, error: desktopErr, loading: desktopLoading } =
    useDesktopReleases()
  const clientOS = detectClientDesktopOS()
  const { user, profile, team, inviteToken, members, refreshTeam } = useAuth()
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState('')
  const [teamName, setTeamName] = useState('')
  const [editingProfile, setEditingProfile] = useState(false)
  const [editingTeam, setEditingTeam] = useState(false)
  const [profileSaving, setProfileSaving] = useState(false)
  const [teamSaving, setTeamSaving] = useState(false)
  const [inviteLoading, setInviteLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [profileError, setProfileError] = useState(null)
  const [teamError, setTeamError] = useState(null)
  const [inviteError, setInviteError] = useState(null)

  // MCP tokens
  const [mcpTokens, setMcpTokens] = useState([])
  const [tokenName, setTokenName] = useState('')
  const [generatingToken, setGeneratingToken] = useState(false)
  const [tokenError, setTokenError] = useState(null)
  const [newToken, setNewToken] = useState(null)   // shown in modal once, then cleared
  const [copiedToken, setCopiedToken] = useState(false)
  const [copiedConfig, setCopiedConfig] = useState(false)

  useEffect(() => {
    refreshTeam()
  }, [refreshTeam])

  useEffect(() => {
    if (location.hash !== '#desktop-app') return
    requestAnimationFrame(() => {
      document.getElementById('desktop-app')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [location.pathname, location.hash])

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || '')
      setRole(profile.role || '')
    }
  }, [profile])

  useEffect(() => {
    if (team?.name) setTeamName(team.name)
  }, [team])

  // Load MCP tokens once on mount
  useEffect(() => {
    async function fetchTokens() {
      try {
        const data = await apiFetch('/api/mcp/tokens')
        setMcpTokens(data.tokens || [])
      } catch {
        // silently ignore — non-critical on load
      }
    }
    fetchTokens()
  }, [])

  const inviteUrl = inviteToken ? `${BASE_URL}/join/${inviteToken}` : ''

  function resetProfileDraft() {
    if (profile) {
      setFullName(profile.full_name || '')
      setRole(profile.role || '')
    }
  }

  function resetTeamDraft() {
    if (team?.name) setTeamName(team.name)
  }

  async function handleProfileSave(e) {
    e.preventDefault()
    setProfileError(null)
    setProfileSaving(true)
    try {
      await apiFetch('/api/profile', {
        method: 'PATCH',
        body: JSON.stringify({ full_name: fullName, role })
      })
      await refreshTeam()
      setEditingProfile(false)
    } catch (err) {
      setProfileError(err.message)
    } finally {
      setProfileSaving(false)
    }
  }

  function handleProfileCancel() {
    resetProfileDraft()
    setProfileError(null)
    setEditingProfile(false)
  }

  async function handleTeamSave(e) {
    e.preventDefault()
    setTeamError(null)
    setTeamSaving(true)
    try {
      await apiFetch('/api/teams/me', {
        method: 'PATCH',
        body: JSON.stringify({ name: teamName })
      })
      await refreshTeam()
      setEditingTeam(false)
    } catch (err) {
      setTeamError(err.message)
    } finally {
      setTeamSaving(false)
    }
  }

  function handleTeamCancel() {
    resetTeamDraft()
    setTeamError(null)
    setEditingTeam(false)
  }

  async function handleNewInvite() {
    setInviteError(null)
    setInviteLoading(true)
    try {
      await apiFetch('/api/teams/invite', { method: 'POST' })
      await refreshTeam()
    } catch (err) {
      setInviteError(err.message)
    } finally {
      setInviteLoading(false)
    }
  }

  async function handleCopyInvite() {
    if (!inviteUrl) return
    await navigator.clipboard.writeText(inviteUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // ── MCP token handlers ─────────────────────────────────────────────────────

  async function handleGenerateToken(e) {
    e.preventDefault()
    setTokenError(null)
    setGeneratingToken(true)
    try {
      const data = await apiFetch('/api/mcp/tokens', {
        method: 'POST',
        body: JSON.stringify({ name: tokenName.trim() || 'Default' })
      })
      setNewToken(data)
      setTokenName('')
      // Refresh list
      const list = await apiFetch('/api/mcp/tokens')
      setMcpTokens(list.tokens || [])
    } catch (err) {
      setTokenError(err.message)
    } finally {
      setGeneratingToken(false)
    }
  }

  async function handleRevokeToken(id) {
    try {
      await apiFetch(`/api/mcp/tokens/${id}`, { method: 'DELETE' })
      setMcpTokens(prev => prev.filter(t => t.id !== id))
    } catch (err) {
      setTokenError(err.message)
    }
  }

  async function handleCopyToken() {
    if (!newToken?.token) return
    await navigator.clipboard.writeText(newToken.token)
    setCopiedToken(true)
    setTimeout(() => setCopiedToken(false), 2000)
  }

  async function handleCopyConfig() {
    if (!newToken?.token) return
    const config = JSON.stringify({
      mcpServers: {
        'product-pulse': {
          type: 'http',
          url: MCP_URL,
          headers: { Authorization: `Bearer ${newToken.token}` }
        }
      }
    }, null, 2)
    await navigator.clipboard.writeText(config)
    setCopiedConfig(true)
    setTimeout(() => setCopiedConfig(false), 2000)
  }

  function formatDate(iso) {
    if (!iso) return 'Never'
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  }

  return (
    <div className="pp-page">
      <div className="pp-page-head pp-page-head--single">
        <div>
          <p className="pp-kicker">Workspace</p>
          <h1 className="pp-page-title">Settings</h1>
          <p className="pp-muted" style={{ marginTop: '0.35rem', maxWidth: '36rem' }}>
            Your profile, team name, invite link, and teammates.
          </p>
        </div>
      </div>

      <div
        id="desktop-app"
        className="pp-card"
        style={{ padding: '1.35rem 1.5rem', marginBottom: '1.25rem' }}
      >
        <h2 className="pp-page-title" style={{ fontSize: '1.15rem', marginBottom: '0.35rem' }}>
          Desktop meeting recorder
        </h2>
        <p className="pp-muted" style={{ margin: '0 0 0.5rem', fontSize: '0.9375rem', maxWidth: '40rem' }}>
          Install the native app once, then use <strong>Open desktop app</strong> on a participant row to capture
          session audio (after verbal consent). Deep links include a short-lived token.
        </p>
        {(clientOS === 'darwin' || clientOS === 'win32') && (
          <p className="pp-muted" style={{ margin: '0 0 1rem', fontSize: '0.8125rem', maxWidth: '44rem' }}>
            This browser looks like{' '}
            <strong>{clientOS === 'darwin' ? 'macOS' : 'Windows'}</strong> — we show that download first when both
            builds are available.
          </p>
        )}
        {desktopLoading && <p className="pp-muted" style={{ margin: 0 }}>Loading download links…</p>}
        {desktopErr && !desktopLoading && (
          <p className="pp-auth-error" style={{ margin: '0 0 0.75rem' }}>
            {desktopErr}
          </p>
        )}
        {!desktopLoading && !desktopErr && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            {(clientOS === 'win32'
              ? ['win', 'mac']
              : ['mac', 'win']
            ).map((which) =>
              which === 'mac' ? (
                <div key="mac">
                  {desktopMac?.download_url ? (
                    <a
                      href={desktopMac.download_url}
                      className={clientOS === 'darwin' ? 'primary pp-btn-sm' : 'pp-btn-sm'}
                      rel="noreferrer"
                      style={{ textDecoration: 'none', display: 'inline-block' }}
                    >
                      Download for macOS ({desktopMac.version || 'latest'})
                    </a>
                  ) : (
                    <div>
                      <p className="pp-muted" style={{ margin: '0 0 0.35rem', fontSize: '0.875rem' }}>
                        <strong>macOS</strong> — no download link yet. Choose one:
                      </p>
                      <ul
                        className="pp-muted"
                        style={{
                          margin: 0,
                          paddingLeft: '1.25rem',
                          fontSize: '0.8125rem',
                          lineHeight: 1.5,
                          maxWidth: '42rem'
                        }}
                      >
                        <li>
                          <strong>Team / production:</strong> upload your signed <code>.dmg</code> (e.g. Supabase
                          Storage or S3), copy a public or signed URL, set{' '}
                          <code style={{ fontSize: '0.75rem' }}>DESKTOP_MAC_DOWNLOAD_URL</code> on the API
                          (Railway / <code>api/.env</code>), redeploy the API, refresh this page.
                        </li>
                        <li>
                          <strong>Just you, from source:</strong> on this Mac, run{' '}
                          <code style={{ fontSize: '0.75rem' }}>brew install xcodegen</code> (once), then{' '}
                          <code style={{ fontSize: '0.75rem' }}>cd desktop/macos && xcodegen generate</code>, open the
                          generated Xcode project, choose <strong>Product → Run</strong>. No dashboard link needed.
                        </li>
                      </ul>
                    </div>
                  )}
                </div>
              ) : (
                <div key="win">
                  {desktopWin?.download_url ? (
                    <a
                      href={desktopWin.download_url}
                      className={clientOS === 'win32' ? 'primary pp-btn-sm' : 'pp-btn-sm'}
                      rel="noreferrer"
                      style={{ textDecoration: 'none', display: 'inline-block' }}
                    >
                      Download for Windows ({desktopWin.version || 'latest'})
                    </a>
                  ) : (
                    <p className="pp-muted" style={{ margin: 0, fontSize: '0.875rem', maxWidth: '42rem' }}>
                      <strong>Windows</strong> — set <code style={{ fontSize: '0.8rem' }}>DESKTOP_WIN_DOWNLOAD_URL</code>{' '}
                      on the API to a public or signed installer URL, then redeploy.
                    </p>
                  )}
                </div>
              )
            )}
          </div>
        )}
      </div>

      <div className="pp-card" style={{ padding: '1.35rem 1.5rem', marginBottom: '1.25rem' }}>
        <div className="pp-settings-card-head">
          <div>
            <h2 className="pp-page-title" style={{ fontSize: '1.15rem', marginBottom: '0.35rem' }}>
              Your profile
            </h2>
            <p className="pp-muted" style={{ margin: 0, fontSize: '0.9375rem' }}>
              Shown to teammates in the workspace.
            </p>
          </div>
          {!editingProfile && (
            <div className="pp-settings-actions">
              <button type="button" className="pp-btn-text" onClick={() => setEditingProfile(true)}>
                Edit
              </button>
            </div>
          )}
        </div>

        {editingProfile ? (
          <form onSubmit={handleProfileSave}>
            {profileError && <p className="pp-auth-error" style={{ marginBottom: '1rem' }}>{profileError}</p>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: '24rem' }}>
              <div className="pp-field">
                <label className="pp-label" htmlFor="set-name">Your name</label>
                <input
                  id="set-name"
                  type="text"
                  className="pp-input"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <div className="pp-field">
                <label className="pp-label" htmlFor="set-role">Your role</label>
                <select
                  id="set-role"
                  className="pp-input"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  required
                >
                  <option value="" disabled>
                    Select your role…
                  </option>
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                  {role && !ROLE_OPTIONS.includes(role) && (
                    <option value={role}>{role}</option>
                  )}
                </select>
              </div>
            </div>
            <div className="pp-inline" style={{ marginTop: '1.25rem' }}>
              <button type="submit" className="primary" disabled={profileSaving}>
                {profileSaving ? 'Saving…' : 'Save profile'}
              </button>
              <button type="button" className="secondary" onClick={handleProfileCancel} disabled={profileSaving}>
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <div className="pp-settings-readonly" aria-live="polite">
            <div className="pp-settings-readonly-row">
              <span className="pp-settings-dt">Name</span>
              <span className="pp-settings-dd">{profile?.full_name || '—'}</span>
            </div>
            <div className="pp-settings-readonly-row">
              <span className="pp-settings-dt">Role</span>
              <span className="pp-settings-dd">{profile?.role || '—'}</span>
            </div>
          </div>
        )}
      </div>

      {!team ? (
        <div className="pp-card" style={{ padding: '1.35rem 1.5rem' }}>
          <p className="pp-muted">You are not on a team yet. Complete onboarding or use an invite link.</p>
        </div>
      ) : (
        <>
          <div className="pp-card" style={{ padding: '1.35rem 1.5rem', marginBottom: '1.25rem' }}>
            <div className="pp-settings-card-head">
              <div>
                <h2 className="pp-page-title" style={{ fontSize: '1.15rem', marginBottom: '0.35rem' }}>
                  Team
                </h2>
                <p className="pp-muted" style={{ margin: 0, fontSize: '0.9375rem' }}>
                  Rename your team anytime.
                </p>
              </div>
              {!editingTeam && (
                <div className="pp-settings-actions">
                  <button type="button" className="pp-btn-text" onClick={() => setEditingTeam(true)}>
                    Edit
                  </button>
                </div>
              )}
            </div>

            {editingTeam ? (
              <form onSubmit={handleTeamSave}>
                {teamError && <p className="pp-auth-error" style={{ marginBottom: '1rem' }}>{teamError}</p>}
                <div className="pp-field" style={{ maxWidth: '24rem' }}>
                  <label className="pp-label" htmlFor="set-team">Team name</label>
                  <input
                    id="set-team"
                    type="text"
                    className="pp-input"
                    value={teamName}
                    onChange={(e) => setTeamName(e.target.value)}
                    required
                    autoFocus
                  />
                </div>
                <div className="pp-inline" style={{ marginTop: '1.25rem' }}>
                  <button type="submit" className="primary" disabled={teamSaving}>
                    {teamSaving ? 'Saving…' : 'Save team name'}
                  </button>
                  <button type="button" className="secondary" onClick={handleTeamCancel} disabled={teamSaving}>
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <div className="pp-settings-readonly" aria-live="polite">
                <div className="pp-settings-readonly-row">
                  <span className="pp-settings-dt">Team name</span>
                  <span className="pp-settings-dd">{team?.name || '—'}</span>
                </div>
              </div>
            )}
          </div>

          <div className="pp-card" style={{ padding: '1.35rem 1.5rem', marginBottom: '1.25rem' }}>
            <h2 className="pp-page-title" style={{ fontSize: '1.15rem', marginBottom: '0.35rem' }}>
              Invite teammates
            </h2>
            <p className="pp-muted" style={{ marginBottom: '1.25rem', fontSize: '0.9375rem' }}>
              Share this link — anyone with it can join your team. Links expire after 30 days; generating a new link
              keeps older links valid until they expire.
            </p>
            {inviteError && <p className="pp-auth-error" style={{ marginBottom: '1rem' }}>{inviteError}</p>}
            {inviteUrl ? (
              <div>
                <p className="pp-label" style={{ marginBottom: '0.5rem' }}>
                  Invite link <span className="pp-muted" style={{ fontWeight: 400 }}>(read-only — copy to share)</span>
                </p>
                <div className="pp-invite-url-row">
                  <pre className="pp-invite-url-code" tabIndex={0}>
                    {inviteUrl}
                  </pre>
                  <button type="button" className="secondary pp-invite-copy" onClick={handleCopyInvite}>
                    {copied ? '✓ Copied' : 'Copy link'}
                  </button>
                </div>
              </div>
            ) : (
              <p className="pp-muted">No invite link yet.</p>
            )}
            <button
              type="button"
              className="secondary"
              style={{ marginTop: '1rem' }}
              onClick={handleNewInvite}
              disabled={inviteLoading}
            >
              {inviteLoading ? 'Generating…' : 'Generate new invite link'}
            </button>
          </div>

          {/* ── AI / MCP Access ──────────────────────────────────────────── */}
          <div className="pp-card" style={{ padding: '1.35rem 1.5rem', marginBottom: '1.25rem' }}>
            <h2 className="pp-page-title" style={{ fontSize: '1.15rem', marginBottom: '0.35rem' }}>
              AI / MCP Access
            </h2>
            <p className="pp-muted" style={{ marginBottom: '1.25rem', fontSize: '0.9375rem' }}>
              Generate long-lived tokens to connect AI tools like Claude Desktop or Cursor to your Product Pulse data.
              Tokens are shown once — save them securely.
            </p>

            {tokenError && <p className="pp-auth-error" style={{ marginBottom: '1rem' }}>{tokenError}</p>}

            <form onSubmit={handleGenerateToken} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
              <div className="pp-field" style={{ flex: '1 1 16rem', marginBottom: 0 }}>
                <label className="pp-label" htmlFor="mcp-token-name">Token name <span className="pp-muted" style={{ fontWeight: 400 }}>(optional)</span></label>
                <input
                  id="mcp-token-name"
                  type="text"
                  className="pp-input"
                  placeholder="e.g. Claude Desktop"
                  value={tokenName}
                  onChange={(e) => setTokenName(e.target.value)}
                  maxLength={80}
                />
              </div>
              <button type="submit" className="primary" disabled={generatingToken} style={{ flexShrink: 0 }}>
                {generatingToken ? 'Generating…' : 'Generate token'}
              </button>
            </form>

            {mcpTokens.length > 0 && (
              <div>
                <p className="pp-label" style={{ marginBottom: '0.5rem' }}>Active tokens</p>
                <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                  {mcpTokens.map((t, i) => (
                    <li
                      key={t.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '1rem',
                        padding: '0.65rem 0',
                        borderBottom: i < mcpTokens.length - 1 ? '1px solid var(--color-border)' : 'none',
                        flexWrap: 'wrap'
                      }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                        <span style={{ fontWeight: 600 }}>{t.name || 'Unnamed token'}</span>
                        <span className="pp-muted" style={{ fontSize: '0.8125rem' }}>
                          Created {formatDate(t.created_at)} · Last used {formatDate(t.last_used_at)}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="secondary"
                        style={{ fontSize: '0.875rem', padding: '0.3rem 0.75rem' }}
                        onClick={() => handleRevokeToken(t.id)}
                      >
                        Revoke
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {mcpTokens.length === 0 && (
              <p className="pp-muted" style={{ fontSize: '0.9rem' }}>No active tokens yet.</p>
            )}
          </div>

          <div className="pp-card" style={{ padding: '1.35rem 1.5rem' }}>
            <h2 className="pp-page-title" style={{ fontSize: '1.15rem', marginBottom: '0.35rem' }}>
              Teammates
            </h2>
            <p className="pp-muted" style={{ marginBottom: '1.25rem', fontSize: '0.9375rem' }}>
              People on this team ({members.length}).
            </p>
            {members.length === 0 ? (
              <p className="pp-muted">No teammates listed yet.</p>
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {members.map((m, i) => (
                  <li
                    key={m.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'baseline',
                      gap: '1rem',
                      padding: '0.65rem 0',
                      borderBottom: i < members.length - 1 ? '1px solid var(--color-border)' : 'none'
                    }}
                  >
                    <span style={{ fontWeight: 600 }}>
                      {m.full_name || 'Unnamed'}
                      {user?.id === m.id && (
                        <span className="pp-muted" style={{ fontWeight: 500, marginLeft: '0.35rem' }}>
                          (you)
                        </span>
                      )}
                    </span>
                    <span className="pp-muted" style={{ fontSize: '0.875rem' }}>
                      {m.role || '—'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      {/* ── New Token Modal ─────────────────────────────────────────────────── */}
      {newToken && (
        <div
          className="pp-modal-backdrop"
          onClick={() => { setNewToken(null); setCopiedToken(false); setCopiedConfig(false) }}
        >
          <div className="pp-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '540px' }}>
            <div className="pp-modal-head">
              <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Your new MCP token</h2>
            </div>
            <div className="pp-modal-body">
              <div
                className="pp-auth-error"
                style={{ background: 'var(--color-warning-bg, #fffbeb)', borderColor: 'var(--color-warning, #f59e0b)', color: 'var(--color-warning-text, #92400e)', marginBottom: '1.25rem', fontSize: '0.9rem' }}
              >
                Save this token now — it won't be shown again.
              </div>

              <p className="pp-label" style={{ marginBottom: '0.4rem' }}>Token</p>
              <div className="pp-invite-url-row" style={{ marginBottom: '1.25rem' }}>
                <pre className="pp-invite-url-code" tabIndex={0} style={{ fontSize: '0.8125rem', wordBreak: 'break-all', whiteSpace: 'pre-wrap' }}>
                  {newToken.token}
                </pre>
                <button type="button" className="secondary pp-invite-copy" onClick={handleCopyToken}>
                  {copiedToken ? '✓ Copied' : 'Copy'}
                </button>
              </div>

              <p className="pp-label" style={{ marginBottom: '0.4rem' }}>
                Claude Desktop config <span className="pp-muted" style={{ fontWeight: 400 }}>(ready to paste)</span>
              </p>
              <div className="pp-invite-url-row" style={{ marginBottom: '1.5rem' }}>
                <pre className="pp-invite-url-code" tabIndex={0} style={{ fontSize: '0.75rem', whiteSpace: 'pre' }}>
{`{
  "mcpServers": {
    "product-pulse": {
      "type": "http",
      "url": "${MCP_URL}",
      "headers": {
        "Authorization": "Bearer ${newToken.token}"
      }
    }
  }
}`}
                </pre>
                <button type="button" className="secondary pp-invite-copy" onClick={handleCopyConfig}>
                  {copiedConfig ? '✓ Copied' : 'Copy'}
                </button>
              </div>

              <button
                type="button"
                className="primary"
                style={{ width: '100%' }}
                onClick={() => { setNewToken(null); setCopiedToken(false); setCopiedConfig(false) }}
              >
                Done — I've saved the token
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
