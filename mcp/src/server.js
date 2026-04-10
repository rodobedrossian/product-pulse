import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerListTests } from './tools/listTests.js'
import { registerGetTest } from './tools/getTest.js'
import { registerGetTestResults } from './tools/getTestResults.js'
import { registerGetScenarioResults } from './tools/getScenarioResults.js'
import { registerGetParticipantEvents } from './tools/getParticipantEvents.js'
import { registerGetTeamInfo } from './tools/getTeamInfo.js'
import { registerSummarizeTest } from './tools/summarizeTest.js'
import { registerGetTranscripts } from './tools/getTranscripts.js'

/**
 * Creates and configures the MCP server with all tools registered.
 *
 * @param {ReturnType<import('./db.js').createScopedDb>} db - Team-scoped DB helper
 * @returns {McpServer}
 */
export function createServer(db) {
  const server = new McpServer({
    name: 'product-pulse',
    version: '1.0.0',
  })

  // Register all tools — each closes over db (which contains teamId)
  registerListTests(server, db)
  registerGetTest(server, db)
  registerGetTestResults(server, db)
  registerGetScenarioResults(server, db)
  registerGetParticipantEvents(server, db)
  registerGetTeamInfo(server, db)
  registerSummarizeTest(server, db)
  registerGetTranscripts(server, db)

  return server
}
