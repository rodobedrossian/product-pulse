import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { apiFetch } from '../api.js'
import { getAppOrigin } from '../lib/publicEnv.js'

const BASE_URL = getAppOrigin()

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

  useEffect(() => {
    refreshTeam()
  }, [refreshTeam])

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || '')
      setRole(profile.role || '')
    }
  }, [profile])

  useEffect(() => {
    if (team?.name) setTeamName(team.name)
  }, [team])

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
    </div>
  )
}
