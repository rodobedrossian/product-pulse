/**
 * Must be imported before any module that reads process.env (e.g. db.js).
 * ESM evaluates static imports before the rest of index.js runs, so dotenv cannot live below imports there.
 */
import { config as loadEnv } from 'dotenv'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
loadEnv({ path: join(__dirname, '../.env') })
