import { Router } from 'express'
import adminDb from '../db-admin.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()

function isOnboardingComplete(profile) {
  return !!(profile?.full_name && profile?.role && profile?.team_id)
}

// PATCH /api/profile — update name and/or role
router.patch('/profile', requireAuth, async (req, res) => {
  const { full_name, role } = req.body
  const updates = {}
  if (full_name !== undefined) updates.full_name = full_name
  if (role !== undefined) updates.role = role

  if (Object.keys(updates).length === 0)
    return res.status(400).json({ error: 'No fields to update' })

  // Merge with existing profile to check completion
  const merged = { ...req.profile, ...updates }
  updates.onboarding_complete = isOnboardingComplete(merged)

  const { data, error } = await adminDb
    .from('profiles')
    .update(updates)
    .eq('id', req.user.id)
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// POST /api/teams — create a team and link the current user
router.post('/teams', requireAuth, async (req, res) => {
  const { name } = req.body
  if (!name) return res.status(400).json({ error: 'Team name is required' })

  // Create the team
  const { data: team, error: teamError } = await adminDb
    .from('teams')
    .insert({ name, created_by: req.user.id })
    .select()
    .single()

  if (teamError) return res.status(500).json({ error: teamError.message })

  // Link profile to team, mark complete if name+role already set
  const merged = { ...req.profile, team_id: team.id }
  const onboarding_complete = isOnboardingComplete(merged)

  await adminDb
    .from('profiles')
    .update({ team_id: team.id, onboarding_complete })
    .eq('id', req.user.id)

  // Create the first invite token
  const { data: invite } = await adminDb
    .from('team_invites')
    .insert({ team_id: team.id, created_by: req.user.id })
    .select('token')
    .single()

  res.status(201).json({ team, invite_token: invite?.token ?? null })
})

// GET /api/teams/me — return team + profile + invite token + members
router.get('/teams/me', requireAuth, async (req, res) => {
  if (!req.teamId) {
    return res.json({
      team: null,
      profile: req.profile,
      invite_token: null,
      members: []
    })
  }

  const { data: team } = await adminDb
    .from('teams')
    .select('*')
    .eq('id', req.teamId)
    .single()

  const { data: membersRows } = await adminDb
    .from('profiles')
    .select('id, full_name, role')
    .eq('team_id', req.teamId)
    .order('full_name', { ascending: true, nullsFirst: false })

  // Get the most recent invite token, or create one
  let { data: invite } = await adminDb
    .from('team_invites')
    .select('token')
    .eq('team_id', req.teamId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!invite) {
    const { data: newInvite } = await adminDb
      .from('team_invites')
      .insert({ team_id: req.teamId, created_by: req.user.id })
      .select('token')
      .single()
    invite = newInvite
  }

  res.json({
    team,
    profile: req.profile,
    invite_token: invite?.token ?? null,
    members: membersRows ?? []
  })
})

// PATCH /api/teams/me — rename current user's team
router.patch('/teams/me', requireAuth, async (req, res) => {
  const { name } = req.body
  if (!req.teamId) return res.status(400).json({ error: 'You are not on a team' })
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Team name is required' })
  }

  const { data, error } = await adminDb
    .from('teams')
    .update({ name: name.trim() })
    .eq('id', req.teamId)
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// POST /api/teams/invite — create a new invite token for the team
router.post('/teams/invite', requireAuth, async (req, res) => {
  if (!req.teamId) return res.status(400).json({ error: 'You are not on a team' })

  const { data, error } = await adminDb
    .from('team_invites')
    .insert({ team_id: req.teamId, created_by: req.user.id })
    .select('token')
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json({ invite_token: data.token })
})

// GET /api/teams/invite/:token — public: return team name + validity for landing page
router.get('/teams/invite/:token', async (req, res) => {
  const { token } = req.params

  const { data: invite } = await adminDb
    .from('team_invites')
    .select('expires_at, teams(name)')
    .eq('token', token)
    .single()

  if (!invite) return res.status(404).json({ valid: false, expired: false, team_name: null })

  const expired = invite.expires_at && new Date(invite.expires_at) < new Date()
  return res.json({
    valid: !expired,
    expired: !!expired,
    team_name: invite.teams?.name ?? 'a team'
  })
})

// POST /api/teams/join/:token — join a team via invite link
router.post('/teams/join/:token', requireAuth, async (req, res) => {
  const { token } = req.params

  const { data: invite } = await adminDb
    .from('team_invites')
    .select('*')
    .eq('token', token)
    .single()

  if (!invite) return res.status(404).json({ error: 'Invalid invite link' })
  if (new Date(invite.expires_at) < new Date()) {
    return res.status(410).json({ error: 'This invite link has expired' })
  }

  const merged = { ...req.profile, team_id: invite.team_id }
  const onboarding_complete = isOnboardingComplete(merged)

  const { data: updatedProfile, error } = await adminDb
    .from('profiles')
    .update({ team_id: invite.team_id, onboarding_complete })
    .eq('id', req.user.id)
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })

  const { data: team } = await adminDb
    .from('teams')
    .select('*')
    .eq('id', invite.team_id)
    .single()

  res.json({ profile: updatedProfile, team })
})

export default router
