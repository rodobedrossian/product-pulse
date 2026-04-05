import adminDb from '../db-admin.js'

export async function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'Unauthorized' })

  const { data: { user }, error } = await adminDb.auth.getUser(token)
  if (error || !user) return res.status(401).json({ error: 'Unauthorized' })

  const { data: profile } = await adminDb
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  req.user = user
  req.profile = profile
  req.teamId = profile?.team_id || null
  next()
}
