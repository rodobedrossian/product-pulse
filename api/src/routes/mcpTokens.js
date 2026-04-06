import { Router } from 'express'
import { createHash, randomBytes } from 'crypto'
import adminDb from '../db-admin.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()

// ── POST /mcp/tokens ─────────────────────────────────────────────────────────
// Generate a new MCP access token for the authenticated team.
// The raw token is returned ONCE — it is never stored or returned again.
router.post('/tokens', requireAuth, async (req, res) => {
  try {
    const { name } = req.body || {}

    // Generate a high-entropy token: "pp_mcp_" + 32 random bytes (64 hex chars = 256-bit entropy)
    const rawToken = 'pp_mcp_' + randomBytes(32).toString('hex')
    const tokenHash = createHash('sha256').update(rawToken).digest('hex')

    const { data, error } = await adminDb
      .from('mcp_tokens')
      .insert({
        team_id: req.teamId,
        name: name?.trim() || null,
        token_hash: tokenHash,
      })
      .select('id, name, created_at')
      .single()

    if (error) {
      console.error('[mcpTokens] insert error:', error.message)
      return res.status(500).json({ error: 'Failed to create token' })
    }

    // Return the raw token only this one time
    return res.status(201).json({
      id: data.id,
      name: data.name,
      token: rawToken,
      created_at: data.created_at,
    })
  } catch (err) {
    console.error('[mcpTokens] POST error:', err.message)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

// ── GET /mcp/tokens ───────────────────────────────────────────────────────────
// List active (non-revoked) tokens for the authenticated team.
// Never returns token hashes or raw tokens.
router.get('/tokens', requireAuth, async (req, res) => {
  try {
    const { data, error } = await adminDb
      .from('mcp_tokens')
      .select('id, name, created_at, last_used_at')
      .eq('team_id', req.teamId)
      .eq('revoked', false)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[mcpTokens] list error:', error.message)
      return res.status(500).json({ error: 'Failed to list tokens' })
    }

    return res.json({ tokens: data || [] })
  } catch (err) {
    console.error('[mcpTokens] GET error:', err.message)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

// ── DELETE /mcp/tokens/:id ────────────────────────────────────────────────────
// Revoke a token. The row is soft-deleted (revoked = true).
// team_id filter ensures a team can only revoke its own tokens.
router.delete('/tokens/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params

    const { data, error } = await adminDb
      .from('mcp_tokens')
      .update({ revoked: true })
      .eq('id', id)
      .eq('team_id', req.teamId)
      .select('id')
      .single()

    if (error || !data) {
      return res.status(404).json({ error: 'Token not found' })
    }

    return res.json({ success: true })
  } catch (err) {
    console.error('[mcpTokens] DELETE error:', err.message)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
