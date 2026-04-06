import 'dotenv/config'
import { createScopedDb } from './db.js'
import { resolveToken } from './auth.js'
import { createServer } from './server.js'
import { logInfo, logError } from './utils/log.js'

const MCP_TRANSPORT = process.env.MCP_TRANSPORT || 'stdio'

if (MCP_TRANSPORT === 'http') {
  await startHttpServer()
} else {
  await startStdioServer()
}

// ─── stdio transport ─────────────────────────────────────────────────────────
// For local use: Claude Desktop, Cursor, Windsurf, etc.
// JWT is read from SUPABASE_TOKEN env var at startup and validated once.
// NOTE: The JWT expires (~1h). This transport is intended for local dev only.
async function startStdioServer() {
  const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js')

  const token = process.env.SUPABASE_TOKEN
  if (!token) {
    logError('stdio', 'SUPABASE_TOKEN env var is required for stdio mode')
    process.exit(1)
  }

  let teamId
  try {
    const auth = await resolveToken(token)
    teamId = auth.teamId
    logInfo(`stdio server started — teamId=${teamId}`)
  } catch (err) {
    logError('stdio', `Auth failed: ${err.message}`)
    process.exit(1)
  }

  const db = createScopedDb(teamId)
  const server = createServer(db)
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

// ─── HTTP transport (Streamable HTTP) ────────────────────────────────────────
// For Railway deployment. Each request carries Authorization: Bearer <jwt>.
// Stateless: fresh McpServer + transport per POST request (no session state).
async function startHttpServer() {
  const { default: express } = await import('express')
  const { StreamableHTTPServerTransport } = await import('@modelcontextprotocol/sdk/server/streamableHttp.js')

  const app = express()
  app.use(express.json())

  const PORT = process.env.PORT || 3002

  // Health check (no auth required)
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', version: '1.0.0', transport: 'http' })
  })

  // MCP POST handler — one request per tool call
  app.post('/mcp', async (req, res) => {
    const authHeader = req.headers.authorization || ''
    const token = authHeader.replace(/^Bearer\s+/i, '').trim()

    if (!token) {
      return res.status(401).json({ error: 'Missing Authorization header' })
    }

    let teamId
    try {
      const auth = await resolveToken(token)
      teamId = auth.teamId
    } catch (err) {
      logError('http-auth', err.message)
      return res.status(401).json({ error: err.message })
    }

    try {
      const db = createScopedDb(teamId)
      const server = createServer(db)
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined, // stateless — no session management
      })
      await server.connect(transport)
      await transport.handleRequest(req, res, req.body)
    } catch (err) {
      logError('http-request', err.message)
      if (!res.headersSent) {
        res.status(500).json({ error: 'Internal server error' })
      }
    }
  })

  // MCP GET handler — for server-sent event notifications (required by spec)
  app.get('/mcp', (req, res) => {
    res.status(405).json({ error: 'Method not allowed. Use POST for MCP requests.' })
  })

  app.listen(PORT, '0.0.0.0', () => {
    logInfo(`HTTP server listening on 0.0.0.0:${PORT}`)
  })
}
