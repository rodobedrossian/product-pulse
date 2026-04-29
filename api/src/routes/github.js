/**
 * GitHub App integration routes
 *
 * Uses a GitHub App (not an OAuth App) so users can grant access to
 * specific repositories only — not their entire account.
 *
 * Required env vars:
 *   GITHUB_APP_ID          — numeric App ID from GitHub App settings
 *   GITHUB_APP_NAME        — App slug (used in install URL)
 *   GITHUB_APP_PRIVATE_KEY — RSA private key, base64-encoded (no newlines in env var)
 *   GITHUB_STATE_SECRET    — random secret for JWT state signing
 *   DASHBOARD_URL          — dashboard origin (fallback for non-popup flow)
 *   PUBLIC_API_URL         — this API's public URL (for webhook registration)
 */

import { Router } from 'express'
import { createHmac, randomBytes } from 'crypto'
import jwt from 'jsonwebtoken'
import adminDb from '../db-admin.js'
import { requireAuth } from '../middleware/auth.js'
import { scanRepo } from '../services/repoScanner.js'

const router = Router()

const APP_ID = process.env.GITHUB_APP_ID
const APP_NAME = process.env.GITHUB_APP_NAME
const STATE_SECRET = process.env.GITHUB_STATE_SECRET
const DASHBOARD_URL = process.env.DASHBOARD_URL || 'http://localhost:5173'
const API_URL = process.env.PUBLIC_API_URL || 'http://localhost:3001'

// Private key is stored base64-encoded in the env var (newlines can't be in Railway env vars).
// Supports both raw PEM and base64-encoded PEM.
function getPrivateKey() {
  const raw = process.env.GITHUB_APP_PRIVATE_KEY || ''
  if (!raw) return null
  if (raw.includes('BEGIN')) return raw                             // raw PEM
  return Buffer.from(raw, 'base64').toString('utf8')               // base64-encoded PEM
}

// ── GitHub App JWT (identifies our App to GitHub) ─────────────────────────────

function createAppJwt() {
  const privateKey = getPrivateKey()
  if (!privateKey || !APP_ID) throw new Error('GitHub App not configured (GITHUB_APP_ID or GITHUB_APP_PRIVATE_KEY missing)')
  const now = Math.floor(Date.now() / 1000)
  return jwt.sign({ iat: now - 60, exp: now + 600, iss: APP_ID }, privateKey, { algorithm: 'RS256' })
}

// ── Installation access token (short-lived, scoped to selected repos) ─────────

async function getInstallationToken(installationId) {
  const appJwt = createAppJwt()
  const res = await fetch(`https://api.github.com/app/installations/${installationId}/access_tokens`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${appJwt}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'ProductPulse/1.0'
    }
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(`Could not get installation token: ${body.message || res.status}`)
  }
  const data = await res.json()
  return data.token
}

// ── GitHub API call ───────────────────────────────────────────────────────────

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
  if (res.status === 204 || res.status === 404) return null
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.message || `GitHub API ${res.status}`)
  }
  return res.json()
}

// ── Popup response: HTML that postMessages to opener then closes ──────────────

function popupResponse(res, payload) {
  const safeJson = JSON.stringify(payload).replace(/</g, '\\u003c')
  const fallbackUrl = payload.error
    ? `${DASHBOARD_URL}/product-map?error=${encodeURIComponent(payload.error)}`
    : `${DASHBOARD_URL}/product-map?connected=1`

  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.send(`<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Connecting…</title></head>
<body style="font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#0d1117;color:#f0f6fc">
<p id="msg">Connecting to GitHub…</p>
<script>
  (function() {
    var data = ${safeJson};
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage({ type: 'github_connected', payload: data }, '*');
      window.close();
    } else {
      document.getElementById('msg').textContent = data.error ? 'Error: ' + data.error : 'Connected! Redirecting…';
      setTimeout(function() { window.location.href = '${fallbackUrl}'; }, 1000);
    }
  })();
</script>
</body>
</html>`)
}

// ── Upsert product map ────────────────────────────────────────────────────────

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
// Returns the GitHub App installation URL with a signed state JWT.
// Users pick which repos to share during the GitHub installation flow.

router.get('/auth-url', requireAuth, (req, res) => {
  if (!APP_NAME || !STATE_SECRET) {
    return res.status(500).json({
      error: 'GitHub App not configured. Set GITHUB_APP_NAME and GITHUB_STATE_SECRET in env vars.'
    })
  }
  const state = jwt.sign({ teamId: req.teamId }, STATE_SECRET, { expiresIn: '15m' })
  res.json({ url: `https://github.com/apps/${APP_NAME}/installations/new?state=${state}` })
})

// ── GET /api/github/callback ──────────────────────────────────────────────────
// GitHub redirects here after the user installs (or cancels) the App.
// Query params: installation_id, setup_action (install|update|cancel), state

router.get('/callback', async (req, res) => {
  const { installation_id, setup_action, state } = req.query

  if (setup_action === 'cancel' || !installation_id) {
    return popupResponse(res, { error: 'cancelled' })
  }

  // Verify state JWT
  let teamId
  try {
    const decoded = jwt.verify(state, STATE_SECRET)
    teamId = decoded.teamId
  } catch {
    return popupResponse(res, { error: 'invalid_or_expired_state' })
  }

  if (!teamId) return popupResponse(res, { error: 'no_team' })

  // Fetch installation info (account login for display)
  let githubLogin = null
  try {
    const appJwt = createAppJwt()
    const info = await fetch(`https://api.github.com/app/installations/${installation_id}`, {
      headers: {
        Authorization: `Bearer ${appJwt}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'ProductPulse/1.0'
      }
    })
    if (info.ok) {
      const data = await info.json()
      githubLogin = data?.account?.login || null
    }
  } catch { /* non-fatal */ }

  // Upsert connection
  const { error: dbErr } = await adminDb
    .from('github_connections')
    .upsert(
      {
        team_id: teamId,
        installation_id: parseInt(installation_id, 10),
        github_login: githubLogin,
        updated_at: new Date().toISOString()
      },
      { onConflict: 'team_id' }
    )

  if (dbErr) return popupResponse(res, { error: dbErr.message })

  return popupResponse(res, { connected: true, github_login: githubLogin })
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
// Lists only repositories the App has been granted access to.

router.get('/repos', requireAuth, async (req, res) => {
  if (!req.teamId) return res.status(400).json({ error: 'No team' })

  const { data: conn } = await adminDb
    .from('github_connections')
    .select('installation_id')
    .eq('team_id', req.teamId)
    .single()

  if (!conn) return res.status(404).json({ error: 'Not connected to GitHub' })

  try {
    const token = await getInstallationToken(conn.installation_id)
    const data = await ghApi(token, '/installation/repositories?per_page=100')
    res.json((data?.repositories || []).map((r) => ({
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

  let token
  try {
    token = await getInstallationToken(conn.installation_id)
  } catch (e) {
    return res.status(400).json({ error: e.message })
  }

  const [owner, repo] = repo_full_name.split('/')

  // Remove old webhook if switching repos
  if (conn.webhook_id && conn.repo_full_name && conn.repo_full_name !== repo_full_name) {
    const [oldOwner, oldRepo] = conn.repo_full_name.split('/')
    await ghApi(token, `/repos/${oldOwner}/${oldRepo}/hooks/${conn.webhook_id}`, { method: 'DELETE' }).catch(() => {})
  }

  // Register webhook
  const webhookSecret = randomBytes(32).toString('hex')
  let webhookId = null
  try {
    const hook = await ghApi(token, `/repos/${owner}/${repo}/hooks`, {
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

  // Update connection record
  await adminDb
    .from('github_connections')
    .update({ repo_full_name, webhook_id: webhookId, webhook_secret: webhookSecret, updated_at: new Date().toISOString() })
    .eq('team_id', req.teamId)

  // First scan
  try {
    const scanResult = await scanRepo({ token, repoFullName: repo_full_name })
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
    .select('installation_id, repo_full_name')
    .eq('team_id', req.teamId)
    .single()

  if (!conn?.repo_full_name) return res.status(400).json({ error: 'No repo connected' })

  try {
    const token = await getInstallationToken(conn.installation_id)
    const scanResult = await scanRepo({ token, repoFullName: conn.repo_full_name })
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
    .select('installation_id, webhook_id, repo_full_name')
    .eq('team_id', req.teamId)
    .single()

  if (!conn) return res.json({ disconnected: true })

  // Delete webhook from GitHub
  if (conn.webhook_id && conn.repo_full_name) {
    try {
      const token = await getInstallationToken(conn.installation_id)
      const [owner, repo] = conn.repo_full_name.split('/')
      await ghApi(token, `/repos/${owner}/${repo}/hooks/${conn.webhook_id}`, { method: 'DELETE' }).catch(() => {})
    } catch { /* non-fatal */ }
  }

  await adminDb.from('product_maps').delete().eq('team_id', req.teamId)
  await adminDb.from('github_connections').delete().eq('team_id', req.teamId)

  res.json({ disconnected: true })
})

// ── POST /api/github/webhook ──────────────────────────────────────────────────
// Raw body required for HMAC — registered in index.js before express.json()

router.post('/webhook', async (req, res) => {
  const sig = req.headers['x-hub-signature-256']
  const event = req.headers['x-github-event']

  if (!sig || event !== 'push') return res.status(200).end()

  const rawBody = req.body instanceof Buffer ? req.body : Buffer.from(JSON.stringify(req.body))
  let payload
  try {
    payload = JSON.parse(rawBody.toString('utf8'))
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' })
  }

  const repoFullName = payload?.repository?.full_name
  const ref = payload?.ref || ''

  if (!ref.endsWith('/main') && !ref.endsWith('/master')) return res.status(200).end()
  if (!repoFullName) return res.status(400).json({ error: 'No repo in payload' })

  const { data: conn } = await adminDb
    .from('github_connections')
    .select('team_id, installation_id, webhook_secret')
    .eq('repo_full_name', repoFullName)
    .single()

  if (!conn?.webhook_secret) return res.status(200).end()

  // Verify HMAC
  const expectedSig = 'sha256=' + createHmac('sha256', conn.webhook_secret).update(rawBody).digest('hex')
  if (sig !== expectedSig) return res.status(401).json({ error: 'Invalid signature' })

  res.status(200).end()

  // Re-index in background
  setImmediate(async () => {
    try {
      const token = await getInstallationToken(conn.installation_id)
      const scanResult = await scanRepo({ token, repoFullName })
      await upsertProductMap(conn.team_id, repoFullName, scanResult)
      console.log(`[github] Re-indexed ${repoFullName} after push`)
    } catch (e) {
      console.error(`[github] Re-index failed for ${repoFullName}:`, e.message)
    }
  })
})

export default router
