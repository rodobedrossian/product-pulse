import { z } from 'zod'
import { log } from '../utils/log.js'

export function registerGetTeamInfo(server, db) {
  server.tool(
    'get_team_info',
    'Get information about the authenticated team: team name, member list with roles, and total number of tests.',
    {},
    async () => {
      const t0 = Date.now()

      // Team details
      const { data: team, error: teamError } = await db.raw.teams()
        .select('id, name, created_at')
        .eq('id', db.teamId)
        .single()
      if (teamError) throw new Error(`Database error: ${teamError.message}`)

      // Team members
      const { data: members } = await db.raw.profiles()
        .select('id, full_name, role')
        .eq('team_id', db.teamId)

      // Total test count
      const { count: totalTests } = await db.tests('id', { count: 'exact', head: true })

      const result = {
        team: {
          id: team.id,
          name: team.name,
          created_at: team.created_at,
        },
        members: (members || []).map(m => ({
          id: m.id,
          full_name: m.full_name,
          role: m.role,
        })),
        member_count: (members || []).length,
        total_tests: totalTests ?? 0,
      }

      log('get_team_info', db.teamId, Date.now() - t0)
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
      }
    }
  )
}
