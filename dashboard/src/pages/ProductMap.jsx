import { useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { apiFetch } from '../api.js'

const METHOD_COLORS = {
  GET: '#22c55e', POST: '#3b82f6', PUT: '#f59e0b',
  PATCH: '#8b5cf6', DELETE: '#ef4444', ALL: '#6b7280', HEAD: '#6b7280', OPTIONS: '#6b7280'
}

function MethodBadge({ method }) {
  return (
    <span style={{
      display: 'inline-block', padding: '1px 7px', borderRadius: 4, fontSize: '0.7rem',
      fontWeight: 700, fontFamily: 'monospace', letterSpacing: '0.04em',
      background: `${METHOD_COLORS[method] || '#6b7280'}22`,
      color: METHOD_COLORS[method] || '#6b7280',
      border: `1px solid ${METHOD_COLORS[method] || '#6b7280'}44`
    }}>
      {method}
    </span>
  )
}

function StackBadge({ children }) {
  return (
    <span style={{
      display: 'inline-block', padding: '3px 10px', borderRadius: 999, fontSize: '0.8125rem',
      fontWeight: 600, background: 'var(--color-surface)', border: '1px solid var(--color-border)',
      color: 'var(--color-text)'
    }}>
      {children}
    </span>
  )
}

function timeAgo(iso) {
  if (!iso) return '—'
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

// ── State A: not connected ────────────────────────────────────────────────────

function ConnectPrompt({ onConnect, connecting }) {
  return (
    <div className="pp-empty-state" style={{ maxWidth: 480, margin: '4rem auto', padding: '3rem 2rem' }}>
      <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>🗺️</div>
      <p style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.2rem', color: 'var(--color-text)', marginBottom: '0.5rem' }}>
        Connect your GitHub repo
      </p>
      <p className="pp-muted" style={{ marginBottom: '1.5rem', fontSize: '0.9375rem', lineHeight: 1.55 }}>
        Auto-extract your product's API routes, database schema, UI components, and tech stack.
        Stays fresh automatically via push webhook.
      </p>
      <ul className="pp-muted" style={{ listStyle: 'none', padding: 0, margin: '0 0 1.75rem', fontSize: '0.875rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        <li>✓ API endpoints &amp; routes</li>
        <li>✓ Database tables (SQL migrations + Prisma)</li>
        <li>✓ UI pages &amp; components</li>
        <li>✓ Tech stack &amp; key dependencies</li>
      </ul>
      <button type="button" className="primary" onClick={onConnect} disabled={connecting}>
        {connecting ? 'Redirecting…' : 'Connect GitHub →'}
      </button>
      <p className="pp-muted" style={{ marginTop: '1rem', fontSize: '0.8125rem' }}>
        Read-only access · Uses GitHub App
      </p>
    </div>
  )
}

// ── State B: connected, select repo ──────────────────────────────────────────

function RepoSelector({ githubLogin, onConnect, onDisconnect }) {
  const [repos, setRepos] = useState(null)
  const [selected, setSelected] = useState('')
  const [loading, setLoading] = useState(true)
  const [indexing, setIndexing] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    apiFetch('/api/github/repos')
      .then((data) => { setRepos(data); setLoading(false) })
      .catch((e) => { setError(e.message); setLoading(false) })
  }, [])

  async function handleSelect() {
    if (!selected) return
    setIndexing(true)
    setError(null)
    try {
      const result = await apiFetch('/api/github/connect-repo', {
        method: 'POST',
        body: JSON.stringify({ repo_full_name: selected }),
        signal: AbortSignal.timeout(120000)
      })
      onConnect(result.map)
    } catch (e) {
      setError(e.message)
      setIndexing(false)
    }
  }

  return (
    <div style={{ maxWidth: 520, margin: '3rem auto' }}>
      <div className="pp-card" style={{ padding: '1.5rem' }}>
        <p className="pp-kicker" style={{ marginBottom: '0.25rem' }}>GitHub connected</p>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', margin: '0 0 0.35rem' }}>
          @{githubLogin}
        </h2>
        <p className="pp-muted" style={{ marginBottom: '1.25rem', fontSize: '0.9rem' }}>
          Select which repository to index.
        </p>
        {error && <p style={{ color: 'var(--color-danger)', fontSize: '0.875rem', marginBottom: '1rem' }}>{error}</p>}
        {loading ? (
          <p className="pp-muted">Loading repositories…</p>
        ) : (
          <>
            <div className="pp-field" style={{ marginBottom: '1rem' }}>
              <label className="pp-label" htmlFor="repo-select">Repository</label>
              <select id="repo-select" className="pp-input" value={selected} onChange={(e) => setSelected(e.target.value)}>
                <option value="">Select a repository…</option>
                {(repos || []).map((r) => (
                  <option key={r.full_name} value={r.full_name}>
                    {r.full_name}{r.private ? ' 🔒' : ''}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button type="button" className="primary" onClick={handleSelect} disabled={!selected || indexing}>
                {indexing ? 'Indexing… (may take up to 60s)' : 'Select & index'}
              </button>
              <button type="button" className="secondary" onClick={onDisconnect}>
                Disconnect
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── State C: map available ────────────────────────────────────────────────────

function MapView({ map, githubLogin, onReindex, onDisconnect }) {
  const [tab, setTab] = useState('overview')
  const [reindexing, setReindexing] = useState(false)

  async function handleReindex() {
    setReindexing(true)
    try {
      await onReindex()
    } finally {
      setReindexing(false)
    }
  }

  const tabs = ['overview', 'endpoints', 'db', 'components', 'stack']
  const tabLabels = { overview: 'Overview', endpoints: `Endpoints (${map.endpoints?.length || 0})`, db: `DB Tables (${map.db_tables?.length || 0})`, components: `Components (${map.tech_stack ? '' : ''})`, stack: 'Tech Stack' }

  // Count components from features
  const componentCount = (map.features || []).reduce((acc, f) => acc + (f.pages?.length || 0), 0)
  tabLabels.components = `Components`

  return (
    <div className="pp-page">
      <div className="pp-page-head pp-page-head--single" style={{ marginBottom: '1.25rem' }}>
        <div>
          <p className="pp-kicker">GitHub · @{githubLogin}</p>
          <h1 className="pp-page-title" style={{ marginBottom: '0.25rem' }}>{map.repo_full_name}</h1>
          <p className="pp-muted" style={{ fontSize: '0.875rem' }}>
            Last indexed {timeAgo(map.last_indexed_at)} · {map.raw_file_count} files scanned
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <button type="button" className="secondary" onClick={handleReindex} disabled={reindexing}>
            {reindexing ? 'Indexing…' : '↺ Re-index'}
          </button>
          <button type="button" className="secondary" onClick={onDisconnect}>
            Disconnect
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="pp-tab-bar" style={{ marginBottom: '1.25rem' }}>
        {tabs.map((t) => (
          <button
            key={t}
            type="button"
            className={`pp-tab${tab === t ? ' pp-tab--active' : ''}`}
            onClick={() => setTab(t)}
          >
            {tabLabels[t]}
          </button>
        ))}
      </div>

      {/* Overview */}
      {tab === 'overview' && (
        <>
          {map.ai_summary && (
            <div className="pp-card" style={{ padding: '1rem 1.35rem', marginBottom: '1.25rem', borderLeft: '3px solid var(--color-accent, #c0543c)', display: 'flex', alignItems: 'flex-start', gap: '0.65rem' }}>
              <span style={{ fontSize: '1rem', flexShrink: 0, marginTop: '0.05rem' }}>✦</span>
              <p style={{ margin: 0, fontSize: '0.9375rem', lineHeight: 1.55 }}>{map.ai_summary}</p>
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
            {[
              { label: 'Endpoints', value: map.endpoints?.length || 0, icon: '⚡' },
              { label: 'DB Tables', value: map.db_tables?.length || 0, icon: '🗄️' },
              { label: 'Features', value: map.features?.length || 0, icon: '📦' },
            ].map((s) => (
              <div key={s.label} className="pp-card" style={{ padding: '1rem 1.25rem', textAlign: 'center' }}>
                <div style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>{s.icon}</div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.75rem', fontWeight: 800, lineHeight: 1 }}>{s.value}</div>
                <div className="pp-muted" style={{ fontSize: '0.8125rem', marginTop: '0.2rem' }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Features */}
          {(map.features || []).length > 0 && (
            <div className="pp-card" style={{ padding: '1.25rem 1.35rem', marginBottom: '1rem' }}>
              <h2 className="pp-section-title" style={{ marginBottom: '0.75rem' }}>Detected features</h2>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {map.features.map((f) => (
                  <div key={f.name} style={{
                    padding: '0.4rem 0.85rem', borderRadius: 8, fontSize: '0.875rem',
                    background: 'var(--color-surface)', border: '1px solid var(--color-border)',
                    fontWeight: 600, maxWidth: f.description ? '22rem' : undefined
                  }}>
                    <span>{f.name}</span>
                    {f.endpoint_count > 0 && (
                      <span className="pp-muted" style={{ fontWeight: 400, marginLeft: '0.4rem' }}>
                        {f.endpoint_count} endpoints
                      </span>
                    )}
                    {f.description && (
                      <p className="pp-muted" style={{ margin: '0.2rem 0 0', fontWeight: 400, fontSize: '0.775rem', lineHeight: 1.4 }}>{f.description}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tech stack pills */}
          {map.tech_stack && Object.keys(map.tech_stack).length > 0 && (
            <div className="pp-card" style={{ padding: '1.25rem 1.35rem' }}>
              <h2 className="pp-section-title" style={{ marginBottom: '0.75rem' }}>Tech stack</h2>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {[map.tech_stack.framework, map.tech_stack.ui_library, map.tech_stack.database_orm,
                  map.tech_stack.runtime, map.tech_stack.styling, map.tech_stack.testing,
                  ...(map.tech_stack.languages || [])
                ].filter(Boolean).map((v) => <StackBadge key={v}>{v}</StackBadge>)}
              </div>
            </div>
          )}
        </>
      )}

      {/* Endpoints */}
      {tab === 'endpoints' && (
        <div className="pp-card pp-table-card" style={{ padding: 0, overflow: 'hidden' }}>
          {(map.endpoints || []).length === 0 ? (
            <p className="pp-muted" style={{ padding: '1.5rem' }}>No endpoints detected.</p>
          ) : (
            <div className="pp-table-wrap" style={{ margin: 0, padding: 0 }}>
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 80 }}>Method</th>
                    <th>Path</th>
                    <th>File</th>
                    <th style={{ width: 100 }}>Framework</th>
                  </tr>
                </thead>
                <tbody>
                  {map.endpoints.map((e, i) => (
                    <tr key={i}>
                      <td><MethodBadge method={e.method} /></td>
                      <td>
                        <code style={{ fontSize: '0.8125rem' }}>{e.path}</code>
                        {e.description && (
                          <p className="pp-muted" style={{ margin: '0.15rem 0 0', fontSize: '0.775rem', lineHeight: 1.4 }}>{e.description}</p>
                        )}
                      </td>
                      <td className="pp-muted" style={{ fontSize: '0.8125rem' }}>{e.file}</td>
                      <td className="pp-muted" style={{ fontSize: '0.8125rem' }}>{e.framework}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* DB Tables */}
      {tab === 'db' && (
        <div className="pp-card pp-table-card" style={{ padding: 0, overflow: 'hidden' }}>
          {(map.db_tables || []).length === 0 ? (
            <p className="pp-muted" style={{ padding: '1.5rem' }}>No database tables detected. Looking for SQL migration files or a Prisma schema.</p>
          ) : (
            <div className="pp-table-wrap" style={{ margin: 0, padding: 0 }}>
              <table>
                <thead>
                  <tr>
                    <th>Table</th>
                    <th>Source</th>
                    <th>File</th>
                  </tr>
                </thead>
                <tbody>
                  {map.db_tables.map((t, i) => (
                    <tr key={i}>
                      <td><code style={{ fontWeight: 700 }}>{t.name}</code></td>
                      <td>
                        <span style={{
                          fontSize: '0.75rem', padding: '1px 7px', borderRadius: 4,
                          background: t.source === 'prisma' ? '#8b5cf622' : '#3b82f622',
                          color: t.source === 'prisma' ? '#8b5cf6' : '#3b82f6',
                          border: `1px solid ${t.source === 'prisma' ? '#8b5cf644' : '#3b82f644'}`,
                          fontWeight: 600
                        }}>
                          {t.source}
                        </span>
                      </td>
                      <td className="pp-muted" style={{ fontSize: '0.8125rem' }}>{t.source_file}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Components */}
      {tab === 'components' && (
        <div className="pp-card pp-table-card" style={{ padding: 0, overflow: 'hidden' }}>
          {(map.features || []).length === 0 ? (
            <p className="pp-muted" style={{ padding: '1.5rem' }}>No UI components detected.</p>
          ) : (
            <div className="pp-table-wrap" style={{ margin: 0, padding: 0 }}>
              <table>
                <thead>
                  <tr>
                    <th>Feature / Group</th>
                    <th>Pages / Components</th>
                    <th style={{ textAlign: 'right' }}>Endpoints</th>
                  </tr>
                </thead>
                <tbody>
                  {map.features.map((f, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 600 }}>{f.name}</td>
                      <td className="pp-muted" style={{ fontSize: '0.8125rem' }}>
                        {(f.pages || []).join(', ') || '—'}
                      </td>
                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{f.endpoint_count || 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tech Stack */}
      {tab === 'stack' && (
        <div className="pp-card" style={{ padding: '1.35rem 1.5rem' }}>
          {!map.tech_stack || Object.keys(map.tech_stack).length === 0 ? (
            <p className="pp-muted">No tech stack info detected. Looking for package.json.</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.25rem' }}>
              {[
                { label: 'Runtime', value: map.tech_stack.runtime },
                { label: 'Framework', value: map.tech_stack.framework },
                { label: 'UI Library', value: map.tech_stack.ui_library },
                { label: 'Database ORM', value: map.tech_stack.database_orm },
                { label: 'Styling', value: map.tech_stack.styling },
                { label: 'Testing', value: map.tech_stack.testing },
              ].filter((s) => s.value).map((s) => (
                <div key={s.label}>
                  <p className="pp-muted" style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.3rem' }}>{s.label}</p>
                  <p style={{ fontWeight: 700, fontSize: '0.9375rem', margin: 0 }}>{s.value}</p>
                </div>
              ))}
              {(map.tech_stack.languages || []).length > 0 && (
                <div>
                  <p className="pp-muted" style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.4rem' }}>Languages</p>
                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                    {map.tech_stack.languages.map((l) => <StackBadge key={l}>{l}</StackBadge>)}
                  </div>
                </div>
              )}
              {(map.tech_stack.key_dependencies || []).length > 0 && (
                <div style={{ gridColumn: '1 / -1' }}>
                  <p className="pp-muted" style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.5rem' }}>Key dependencies</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                    {map.tech_stack.key_dependencies.map((d) => (
                      <code key={d} style={{ fontSize: '0.8125rem', padding: '2px 8px', borderRadius: 4, background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>{d}</code>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ProductMap() {
  const [searchParams] = useSearchParams()
  const [status, setStatus] = useState(null) // null = loading
  const [error, setError] = useState(null)
  const [connecting, setConnecting] = useState(false)

  const fetchStatus = useCallback(() => {
    return apiFetch('/api/github/status')
      .then(setStatus)
      .catch((e) => setError(e.message))
  }, [])

  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  async function handleConnect() {
    setConnecting(true)
    setError(null)
    try {
      const { url } = await apiFetch('/api/github/auth-url')
      const popup = window.open(url, 'github-oauth', 'width=620,height=720,left=200,top=100')

      // Listen for postMessage from the callback HTML page
      function onMessage(event) {
        if (event.data?.type !== 'github_connected') return
        window.removeEventListener('message', onMessage)
        clearInterval(pollTimer)
        setConnecting(false)
        const { error: ghErr } = event.data.payload || {}
        if (ghErr && ghErr !== 'cancelled') setError(`GitHub: ${ghErr}`)
        else fetchStatus()
      }
      window.addEventListener('message', onMessage)

      // Fallback: if popup closes without postMessage (e.g. user closes manually)
      const pollTimer = setInterval(() => {
        if (!popup || popup.closed) {
          clearInterval(pollTimer)
          window.removeEventListener('message', onMessage)
          setConnecting(false)
          fetchStatus()
        }
      }, 800)
    } catch (e) {
      setError(e.message)
      setConnecting(false)
    }
  }

  async function handleDisconnect() {
    await apiFetch('/api/github/disconnect', { method: 'DELETE' })
    setStatus({ connected: false })
  }

  async function handleReindex() {
    const result = await apiFetch('/api/github/index', { method: 'POST', signal: AbortSignal.timeout(120000) })
    setStatus((prev) => ({ ...prev, map: result.map }))
  }

  if (status === null) {
    return (
      <div className="pp-page">
        <p className="pp-loading">Loading…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="pp-page">
        <div className="pp-page-head pp-page-head--single">
          <h1 className="pp-page-title">Product Map</h1>
        </div>
        <p style={{ color: 'var(--color-danger)' }}>{error}</p>
      </div>
    )
  }

  // Not connected
  if (!status.connected) {
    return (
      <div className="pp-page">
        <div className="pp-page-head pp-page-head--single">
          <div>
            <p className="pp-kicker">Integrations</p>
            <h1 className="pp-page-title">Product Map</h1>
          </div>
        </div>
        <ConnectPrompt onConnect={handleConnect} connecting={connecting} />
      </div>
    )
  }

  // Connected but no repo selected
  if (!status.map) {
    return (
      <div className="pp-page">
        <div className="pp-page-head pp-page-head--single">
          <div>
            <p className="pp-kicker">Integrations</p>
            <h1 className="pp-page-title">Product Map</h1>
          </div>
        </div>
        <RepoSelector
          githubLogin={status.github_login}
          onConnect={(map) => setStatus((prev) => ({ ...prev, map, repo_full_name: map.repo_full_name }))}
          onDisconnect={handleDisconnect}
        />
      </div>
    )
  }

  // Map available
  return (
    <MapView
      map={status.map}
      githubLogin={status.github_login}
      onReindex={handleReindex}
      onDisconnect={handleDisconnect}
    />
  )
}
