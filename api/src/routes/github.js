import { Router } from 'express'
import { createHmac, randomBytes } from 'crypto'
import jwt from 'jsonwebtoken'
import adminDb from '../db-admin.js'
import { requireAuth } from '../middleware/auth.js'
import { scanRepo } from '../services/repoScanner.js'

const router = Router()

const CLIENT_ID = process.env.GITHUB_CLIENT_ID
const CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET
const STATE_SECRET = process.env.GITHUB_STATE_SECRET
const DASHBOARD_URL = process.env.DASHBOARD_URL || 'http://localhost:5173'
const API_URL = process.env.PUBLIC_API_URL || 'http://localhost:3001'

// ── Helper: GitHub API call with stored token ─────────────────────────────────

async function ghApi(token, path, opts = {}) {
  const res = await fetch(`https://api.github.com${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'ProductPulse/1.0',
      'Content-Type': 'application/json',
      ...(opts.headers || {})
    }
  })
  if (!res.ok && res.status !== 404) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.message || `GitHub API ${res.status}`)
  }
  if (res.status === 204 || res.status === 404) return null
  return res.json()
}

// ── Helper: upsert product map ────────────────────────────────────────────────

async function upsertProductMap(teamId, repoFullName, scanResult) {
  const { data, error } = await adminDb
    .from('product_maps')
    .upsert(
      {
        team_id: teamId,
        repo_full_name: repoFullName,
        features: scanResult.features,
        endpoints: scanResult.endpoints,
        db_tables: scanResult.db_tables,
        tech_stack: scanResult.tech_stack,
        raw_file_count: scanResult.raw_file_count,
        last_indexed_at: new Date().toISOString()
      },
      { onConflict: 'team_id' }
    )
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data
}

// ── GET /api/github/auth-url ──────────────────────────────────────────────────

router.get('/auth-url', requireAuth, (req, res) => {
  if (!CLIENT_ID || !STATE_SECRET) {
    return res.status(500).json({ error: 'GitHub OAuth not configured. Set GITHUB_CLIENT_ID and GITHUB_STATE_SECRET.' })
  }
  const state = jwt.sign({ teamId: req.teamId }, STATE_SECRET, { expiresIn: '10m' })
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    scope: 'repo read:user',
    state
  })
  res.json({ url: `https://github.com/login/oauth/authorize?${params}` })
})

// ── GET /api/github/callback ──────────────────────────────────────────────────

router.get('/callback', async (req, res) => {
  const { code, state, error: ghError } = req.query

  if (ghError) {
    return res.redirect(`${DASHBOARD_URL}/product-map?error=${encodeURIComponent(ghError)}`)
  }

  if (!state || !code) {
    return res.redirect(`${DASHBOARD_URL}/product-map?error=missing_state`)
  }

  let teamId
  try {
    const decoded = jwt.verify(state, STATE_SECRET)
    teamId = decoded.teamId
  } catch {
    return res.redirect(`${DASHBOARD_URL}/product-map?error=invalid_state`)
  }

  if (!teamId) {
    return res.redirect(`${DASHBOARD_URL}/product-map?error=no_team`)
  }

  // Exchange code for access token
  let accessToken
  try {
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, code })
    })
    const tokenData = await tokenRes.json()
    if (tokenData.error) throw new Error(tokenData.error_description || tokenData.error)
    accessToken = tokenData.access_token
  } catch (e) {
    return res.redirect(`${DASHBOARD_URL}/product-map?error=${encodeURIComponent(e.message)}`)
  }

  // Fetch GitHub user
  let ghUser
  try {
    ghUser = await ghApi(accessToken, '/user')
  } catch (e) {
    return res.redirect(`${DASHBOARD_URL}/product-map?error=${encodeURIComponent(e.message)}`)
  }

  // Upsert connection
  const { error: dbErr } = await adminDb
    .from('github_connections')
    .upsert(
      {
        team_id: teamId,
        github_user_id: ghUser.id,
        github_login: ghUser.login,
        github_token: accessToken,
        updated_at: new Date().toISOString()
      },
      { onConflict: 'team_id' }
    )

  if (dbErr) {
    return res.redirect(`${DASHBOARD_URL}/product-map?error=${encodeURIComponent(dbErr.message)}`)
  }

  // Redirect popup to success page — the page will call window.close()
  res.redirect(`${DASHBOARD_URL}/product-map?connected=1`)
})

// ── GET /api/github/status ────────────────────────────────────────────────────

router.get('/status', requireAuth, async (req, res) => {
  if (!req.teamId) return res.json({ connected: false })

  const { data: conn } = await adminDb
    .from('github_connections')
    .select('github_login, repo_full_name, created_at, updated_at')
    .eq('team_id', req.teamId)
    .single()

  if (!conn) return res.json({ connected: false })

  const { data: map } = await adminDb
    .from('product_maps')
    .select('*')
    .eq('team_id', req.teamId)
    .single()

  res.json({
    connected: true,
    github_login: conn.github_login,
    repo_full_name: conn.repo_full_name || null,
    connected_at: conn.created_at,
    map: map || null
  })
})

// ── GET /api/github/repos ─────────────────────────────────────────────────────

router.get('/repos', requireAuth, async (req, res) => {
  if (!req.teamId) return res.status(400).json({ error: 'No team' })

  const { data: conn } = await adminDb
    .from('github_connections')
    .select('github_token')
    .eq('team_id', req.teamId)
    .single()

  if (!conn) return res.status(404).json({ error: 'Not connected to GitHub' })

  try {
    // Fetch user repos + org repos (paginated, first 100)
    const repos = await ghApi(conn.github_token, '/user/repos?per_page=100&sort=updated&type=all')
    res.json(repos.map((r) => ({
      full_name: r.full_name,
      name: r.name,
      private: r.private,
      description: r.description,
      language: r.language,
      updated_at: r.updated_at,
      default_branch: r.default_branch
    })))
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── POST /api/github/connect-repo ─────────────────────────────────────────────

router.post('/connect-repo', requireAuth, async (req, res) => {
  if (!req.teamId) return res.status(400).json({ error: 'No team' })
  const { repo_full_name } = req.body
  if (!repo_full_name) return res.status(400).json({ error: 'repo_full_name required' })

  const { data: conn } = await adminDb
    .from('github_connections')
    .select('*')
    .eq('team_id', req.teamId)
    .single()

  if (!conn) return res.status(404).json({ error: 'Not connected to GitHub' })

  const [owner, repo] = repo_full_name.split('/')

  // Verify access
  try {
    await ghApi(conn.github_token, `/repos/${owner}/${repo}`)
  } catch {
    return res.status(403).json({ error: `Cannot access repo ${repo_full_name}` })
  }

  // Remove old webhook if switching repos
  if (conn.webhook_id && conn.repo_full_name && conn.repo_full_name !== repo_full_name) {
    const [oldOwner, oldRepo] = conn.repo_full_name.split('/')
    await ghApi(conn.github_token, `/repos/${oldOwner}/${oldRepo}/hooks/${conn.webhook_id}`, { method: 'DELETE' }).catch(() => {})
  }

  // Register webhook
  const webhookSecret = randomBytes(32).toString('hex')
  let webhookId = null
  try {
    const hook = await ghApi(conn.github_token, `/repos/${owner}/${repo}/hooks`, {
      method: 'POST',
      body: JSON.stringify({
        name: 'web',
        active: true,
        events: ['push'],
        config: {
          url: `${API_URL}/api/github/webhook`,
          content_type: 'json',
          secret: webhookSecret
        }
      })
    })
    webhookId = hook?.id || null
  } catch (e) {
    console.warn('[github] Webhook registration failed (continuing):', e.message)
  }

  // Update connection
  await adminDb
    .from('github_connections')
    .update({ repo_full_name, webhook_id: webhookId, webhook_secret: webhookSecret, updated_at: new Date().toISOString() })
    .eq('team_id', req.teamId)

  // Scan repo
  try {
    const scanResult = await scanRepo({ token: conn.github_token, repoFullName: repo_full_name })
    const map = await upsertProductMap(req.teamId, repo_full_name, scanResult)
    res.json({ map, repo_full_name, webhook_registered: !!webhookId })
  } catch (e) {
    res.status(500).json({ error: `Scan failed: ${e.message}` })
  }
})

// ── POST /api/github/index ────────────────────────────────────────────────────

router.post('/index', requireAuth, async (req, res) => {
  if (!req.teamId) return res.status(400).json({ error: 'No team' })

  const { data: conn } = await adminDb
    .from('github_connections')
    .select('github_token, repo_full_name')
    .eq('team_id', req.teamId)
    .single()

  if (!conn?.repo_full_name) return res.status(400).json({ error: 'No repo connected' })

  try {
    const scanResult = await scanRepo({ token: conn.github_token, repoFullName: conn.repo_full_name })
    const map = await upsertProductMap(req.teamId, conn.repo_full_name, scanResult)
    res.json({ map })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── DELETE /api/github/disconnect ─────────────────────────────────────────────

router.delete('/disconnect', requireAuth, async (req, res) => {
  if (!req.teamId) return res.status(400).json({ error: 'No team' })

  const { data: conn } = await adminDb
    .from('github_connections')
    .select('*')
    .eq('team_id', req.teamId)
    .single()

  if (!conn) return res.json({ disconnected: true })

  // Delete webhook from GitHub
  if (conn.webhook_id && conn.repo_full_name) {
    const [owner, repo] = conn.repo_full_name.split('/')
    await ghApi(conn.github_token, `/repos/${owner}/${repo}/hooks/${conn.webhook_id}`, { method: 'DELETE' }).catch(() => {})
  }

  // Delete from DB (cascade deletes product_maps too via FK)
  await adminDb.from('product_maps').delete().eq('team_id', req.teamId)
  await adminDb.from('github_connections').delete().eq('team_id', req.teamId)

  res.json({ disconnected: true })
})

// ── POST /api/github/webhook ──────────────────────────────────────────────────
// Raw body required for HMAC verification — handled in index.js before express.json()

router.post('/webhook', async (req, res) => {
  const sig = req.headers['x-hub-signature-256']
  const event = req.headers['x-github-event']

  if (!sig || event !== 'push') return res.status(200).end() // ignore non-push events

  // Parse payload (raw body was set by express.raw middleware)
  const rawBody = req.body instanceof Buffer ? req.body : Buffer.from(JSON.stringify(req.body))
  let payload
  try {
    payload = JSON.parse(rawBody.toString('utf8'))
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' })
  }

  const repoFullName = payload?.repository?.full_name
  const ref = payload?.ref || ''

  // Only process pushes to main or master
  if (!ref.endsWith('/main') && !ref.endsWith('/master')) {
    return res.status(200).end()
  }

  if (!repoFullName) return res.status(400).json({ error: 'No repo in payload' })

  // Look up connection by repo
  const { data: conn } = await adminDb
    .from('github_connections')
    .select('team_id, github_token, webhook_secret')
    .eq('repo_full_name', repoFullName)
    .single()

  if (!conn?.webhook_secret) return res.status(200).end() // unknown repo — ignore silently

  // Verify HMAC
  const expectedSig = 'sha256=' + createHmac('sha256', conn.webhook_secret).update(rawBody).digest('hex')
  if (sig !== expectedSig) {
    return res.status(401).json({ error: 'Invalid signature' })
  }

  // Re-index in background
  res.status(200).end()

  setImmediate(async () => {
    try {
      const scanResult = await scanRepo({ token: conn.github_token, repoFullName })
      await upsertProductMap(conn.team_id, repoFullName, scanResult)
      console.log(`[github] Re-indexed ${repoFullName} after push`)
    } catch (e) {
      console.error(`[github] Re-index failed for ${repoFullName}:`, e.message)
    }
  })
})

export default router
