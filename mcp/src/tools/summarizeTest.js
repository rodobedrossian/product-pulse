import { z } from 'zod'
import { validateTestOwnership } from '../utils/validate.js'
import { log } from '../utils/log.js'
import { computeMedian, computeAverage, formatDuration, completionRate, pct, sortedTimes } from '../utils/stats.js'

export function registerSummarizeTest(server, db) {
  server.tool(
    'summarize_test',
    'Generate a plain-English markdown summary of a usability test\'s findings. Includes completion rate, timing, drop-off analysis (for scenario tests), and key observations. Ideal for quickly understanding test results.',
    {
      test_id: z.string().uuid().describe('The test ID to summarize'),
    },
    async ({ test_id }) => {
      const t0 = Date.now()
      await validateTestOwnership(db, test_id)

      const { data: test } = await db.tests('id, name, test_type, prototype_url')
        .eq('id', test_id)
        .single()

      // Load participants
      const { data: participants } = await db.raw.participants()
        .select('id, name, tid')
        .eq('test_id', test_id)
        .order('created_at', { ascending: true })
        .limit(200)

      const totalParticipants = participants?.length ?? 0
      let summary = ''

      if (test.test_type === 'scenario') {
        summary = await buildScenarioSummary(db, test, participants || [])
      } else {
        summary = await buildSingleSummary(db, test, participants || [])
      }

      log('summarize_test', db.teamId, Date.now() - t0)
      return {
        content: [{ type: 'text', text: JSON.stringify({ test_id, test_name: test.name, summary }, null, 2) }]
      }
    }
  )
}

async function buildSingleSummary(db, test, participants) {
  const { data: sessionResultsRows } = await db.raw.session_results()
    .select('tid, completed, time_to_complete_ms, event_count')
    .eq('test_id', test.id)

  const persistedByTid = {}
  for (const r of sessionResultsRows || []) persistedByTid[r.tid] = r

  const results = participants.map(p => ({
    name: p.name,
    tid: p.tid,
    completed: persistedByTid[p.tid]?.completed ?? false,
    time_to_complete_ms: persistedByTid[p.tid]?.time_to_complete_ms ?? null,
  }))

  const completed = results.filter(r => r.completed)
  const rate = completionRate(completed.length, participants.length)
  const times = sortedTimes(completed)
  const avgMs = computeAverage(times)
  const medMs = computeMedian(times)

  // Check replay availability
  const { count: replayCount } = await db.raw.session_replays()
    .select('tid', { count: 'exact', head: true })
    .eq('test_id', test.id)
    .eq('status', 'complete')

  const fastest = times.length ? results.find(r => r.time_to_complete_ms === times[0]) : null
  const slowest = times.length ? results.find(r => r.time_to_complete_ms === times[times.length - 1]) : null

  let md = `## ${test.name}\n\n`
  md += `**Type:** Single-goal test | **Participants:** ${participants.length}\n\n`

  if (participants.length === 0) {
    md += `_No participants have run this test yet._\n`
    return md
  }

  md += `### Completion\n`
  md += `- **Rate:** ${completed.length}/${participants.length} (${pct(rate)})\n`
  if (participants.length - completed.length > 0) {
    md += `- **Did not complete:** ${participants.length - completed.length} participant${participants.length - completed.length > 1 ? 's' : ''}\n`
  }
  md += `\n`

  if (times.length) {
    md += `### Timing\n`
    md += `- **Average time to goal:** ${formatDuration(avgMs)}\n`
    md += `- **Median time to goal:** ${formatDuration(medMs)}\n`
    if (fastest) md += `- **Fastest:** ${fastest.name} (${formatDuration(fastest.time_to_complete_ms)})\n`
    if (slowest && slowest.tid !== fastest?.tid) md += `- **Slowest:** ${slowest.name} (${formatDuration(slowest.time_to_complete_ms)})\n`
    md += `\n`
  }

  if (replayCount > 0) {
    md += `### Session Replays\n`
    md += `${replayCount} session replay${replayCount > 1 ? 's' : ''} available for this test.\n\n`
  }

  if (participants.length - completed.length > 0) {
    const notCompleted = results.filter(r => !r.completed).map(r => r.name).join(', ')
    md += `### Did Not Complete\n`
    md += `${notCompleted}\n`
  }

  return md
}

async function buildScenarioSummary(db, test, participants) {
  const { data: steps } = await db.raw.steps()
    .select('id, order_index, title, task')
    .eq('test_id', test.id)
    .order('order_index', { ascending: true })

  const { data: allStepResults } = await db.raw.step_results()
    .select('step_id, tid, completed, time_to_complete_ms')
    .eq('test_id', test.id)

  const totalParticipants = participants.length

  let md = `## ${test.name}\n\n`
  md += `**Type:** Scenario test (${steps?.length ?? 0} steps) | **Participants:** ${totalParticipants}\n\n`

  if (totalParticipants === 0) {
    md += `_No participants have run this test yet._\n`
    return md
  }

  md += `### Step-by-Step Funnel\n\n`
  md += `| Step | Title | Completed | Rate | Median Time |\n`
  md += `|------|-------|-----------|------|-------------|\n`

  let maxDropOff = { count: 0, step: null }

  for (const step of steps || []) {
    const completions = (allStepResults || []).filter(sr => sr.step_id === step.id && sr.completed)
    const times = sortedTimes(completions)
    const rate = completionRate(completions.length, totalParticipants)
    const dropOff = totalParticipants - completions.length

    if (dropOff > maxDropOff.count) {
      maxDropOff = { count: dropOff, step }
    }

    md += `| ${step.order_index} | ${step.title || '(untitled)'} | ${completions.length}/${totalParticipants} | ${pct(rate)} | ${formatDuration(computeMedian(times))} |\n`
  }

  md += `\n`

  // Overall completion (all steps done)
  const fullyCompleted = participants.filter(p =>
    (steps || []).every(s =>
      (allStepResults || []).some(sr => sr.step_id === s.id && sr.tid === p.tid && sr.completed)
    )
  )
  const overallRate = completionRate(fullyCompleted.length, totalParticipants)
  md += `### Overall Completion\n`
  md += `${fullyCompleted.length}/${totalParticipants} participants completed all steps (${pct(overallRate)}).\n\n`

  if (maxDropOff.step) {
    md += `### Biggest Drop-off\n`
    md += `Step ${maxDropOff.step.order_index} — **"${maxDropOff.step.title || maxDropOff.step.task}"** had the most drop-off (${maxDropOff.count} participant${maxDropOff.count > 1 ? 's' : ''} did not complete it).\n`
  }

  return md
}
