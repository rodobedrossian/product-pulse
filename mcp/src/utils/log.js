/**
 * Structured logger for the MCP server.
 * Logs to stdout — visible in Railway logs and local terminal.
 * Only logs metadata (tool name, teamId, duration) — never logs user data or inputs.
 */

function timestamp() {
  return new Date().toISOString()
}

export function log(toolName, teamId, durationMs) {
  console.log(`[pp-mcp] ${timestamp()} tool=${toolName} teamId=${teamId} duration=${durationMs}ms`)
}

export function logError(context, message) {
  console.error(`[pp-mcp] ${timestamp()} error context=${context} message="${message}"`)
}

export function logInfo(message) {
  console.log(`[pp-mcp] ${timestamp()} ${message}`)
}
