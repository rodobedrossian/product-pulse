import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import testsRouter from './routes/tests.js'
import participantsRouter from './routes/participants.js'
import eventsRouter from './routes/events.js'
import replayRouter from './routes/replay.js'
import screenshotRouter from './routes/event-screenshots.js'
import teamsRouter from './routes/teams.js'

const app = express()
const PORT = process.env.PORT || 3001

const __dirname = dirname(fileURLToPath(import.meta.url))

// CORS open on all origins — snippet can run on any prototype domain
app.use(cors())

// Serve the snippet as a static file
app.use('/snippet', express.static(join(__dirname, '../../snippet')))

// Higher body limits: replay chunks ~8 MB, events with screenshots ~5 MB
app.use('/api/replay', express.json({ limit: '8mb' }))
app.use('/api/events', express.json({ limit: '8mb' }))
app.use(express.json())

app.use('/api/tests', testsRouter)
app.use('/api/tests', participantsRouter)
app.use('/api/events', eventsRouter)
app.use('/api', replayRouter)
app.use('/api', screenshotRouter)
app.use('/api', teamsRouter)

app.listen(PORT, () => {
  console.log(`Product Pulse API running on http://localhost:${PORT}`)
})
