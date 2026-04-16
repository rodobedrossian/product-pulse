import './env-bootstrap.js'
import express from 'express'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import testsRouter from './routes/tests.js'
import participantsRouter from './routes/participants.js'
import eventsRouter from './routes/events.js'
import replayRouter from './routes/replay.js'
import screenshotRouter from './routes/event-screenshots.js'
import teamsRouter from './routes/teams.js'
import mcpTokensRouter from './routes/mcpTokens.js'
import participantRecordingsRouter from './routes/participant-recordings.js'
import transcriptsRouter from './routes/transcripts.js'
import testInsightsRouter from './routes/test-insights.js'
import eventDefinitionsRouter from './routes/eventDefinitions.js'
import desktopRouter from './routes/desktop.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

const app = express()
const PORT = process.env.PORT || 3001

if (!process.env.RECORDING_JWT_SECRET?.trim()) {
  console.warn(
    '[api] RECORDING_JWT_SECRET is missing — POST …/recording-token will return 500. Set it in api/.env and restart.'
  )
}

// CORS: explicit headers + OPTIONS preflight. Browsers send OPTIONS before PATCH with Authorization;
// some proxies/edges are picky — this must run before any body parsers or routers.
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.setHeader('Access-Control-Max-Age', '86400')
  if (req.method === 'OPTIONS') {
    return res.status(204).end()
  }
  next()
})

// Serve the snippet as a static file
app.use('/snippet', express.static(join(__dirname, '../snippet')))

// Higher body limits: replay chunks ~8 MB; events are JSON-only by default (no screenshots)
app.use('/api/replay', express.json({ limit: '8mb' }))
const eventsJsonLimit =
  process.env.ACCEPT_EVENT_SCREENSHOTS === 'true' ? '14mb' : '2mb'
app.use('/api/events', express.json({ limit: eventsJsonLimit }))
app.use(express.json())

// Health check for Railway deployment
app.get('/health', (req, res) => res.json({ status: 'ok' }))

app.use('/api/tests', testsRouter)
app.use('/api/tests', participantsRouter)
app.use('/api/tests', participantRecordingsRouter)
app.use('/api/tests', transcriptsRouter)
app.use('/api/tests', testInsightsRouter)
app.use('/api/tests', eventDefinitionsRouter)
app.use('/api/events', eventsRouter)
app.use('/api', replayRouter)
app.use('/api', screenshotRouter)
app.use('/api', teamsRouter)
app.use('/api/mcp', mcpTokensRouter)
app.use('/api/desktop', desktopRouter)

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Product Pulse API listening on 0.0.0.0:${PORT}`)
})
