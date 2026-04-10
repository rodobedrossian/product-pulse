/**
 * Whisper transcription service.
 * Called fire-and-forget after a recording is uploaded.
 *
 * Files > 24 MB are split into time-based chunks via ffmpeg before sending to
 * Whisper.  Each chunk's segment timestamps are offset by the chunk's start
 * time so the merged transcript has correct absolute timestamps.
 */
import { execFile } from 'child_process'
import { promisify } from 'util'
import { writeFile, readFile, readdir, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { randomUUID } from 'crypto'
import OpenAI, { toFile } from 'openai'
import adminDb from '../db-admin.js'

const execFileAsync = promisify(execFile)

const BUCKET           = 'participant-recordings'
const WHISPER_LIMIT    = 24 * 1024 * 1024   // 24 MB — stay under Whisper's 25 MB hard limit
const CHUNK_TARGET_SEC = 20 * 60            // aim for 20-minute chunks when splitting

let _openai = null
function getOpenAI() {
  if (!_openai) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not set — cannot transcribe audio')
    }
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  }
  return _openai
}

// ── ffmpeg helpers ────────────────────────────────────────────────────────────

/** Returns audio duration in seconds using ffprobe.  Throws if ffprobe is missing. */
async function probeDuration(filePath) {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v', 'quiet',
    '-print_format', 'json',
    '-show_format',
    filePath,
  ], { timeout: 30_000 })
  const info = JSON.parse(stdout)
  const secs = parseFloat(info.format?.duration ?? '0')
  if (!secs) throw new Error('ffprobe returned zero duration')
  return secs
}

/**
 * Split an audio file into fixed-duration segments.
 * Returns an array of { path, startSec } for each segment, in order.
 *
 * Uses `-c copy` (stream copy, no re-encode) so this is very fast.
 * `-reset_timestamps 1` makes each segment start at t=0, so Whisper
 * timestamps are relative to the segment — we add `startSec` back when merging.
 */
async function splitAudio(inputPath, workDir, segmentSec) {
  const pattern = join(workDir, 'seg%03d.m4a')
  await execFileAsync('ffmpeg', [
    '-i',                  inputPath,
    '-f',                  'segment',
    '-segment_time',       String(Math.ceil(segmentSec)),
    '-reset_timestamps',   '1',
    '-c',                  'copy',
    pattern,
  ], { timeout: 300_000 })

  const files = (await readdir(workDir))
    .filter(f => /^seg\d+\.m4a$/.test(f))
    .sort()

  return files.map((f, i) => ({
    path:     join(workDir, f),
    startSec: i * segmentSec,
  }))
}

// ── Whisper helpers ───────────────────────────────────────────────────────────

/** Transcribe a single Buffer with Whisper, returning verbose_json. */
async function whisperTranscribe(buffer, filename, mimeType) {
  const file = await toFile(buffer, filename, { type: mimeType || 'audio/m4a' })
  return getOpenAI().audio.transcriptions.create({
    file,
    model:           'whisper-1',
    response_format: 'verbose_json',
  })
}

/**
 * Merge multiple Whisper verbose_json results into one.
 * Each result's segment timestamps are shifted by the chunk's start offset (seconds).
 */
function mergeResults(chunks) {
  // chunks: Array<{ result: WhisperVerboseJson, startSec: number }>
  const text     = chunks.map(c => (c.result.text ?? '').trim()).filter(Boolean).join(' ')
  const segments = []
  let nextId = 0

  for (const { result, startSec } of chunks) {
    for (const seg of result.segments ?? []) {
      segments.push({
        ...seg,
        id:    nextId++,
        start: seg.start + startSec,
        end:   seg.end   + startSec,
        words: (seg.words ?? []).map(w => ({
          ...w,
          start: w.start + startSec,
          end:   w.end   + startSec,
        })),
      })
    }
  }

  return { text, segments }
}

// ── Core transcription logic ──────────────────────────────────────────────────

/**
 * Transcribe an audio buffer that may exceed Whisper's 25 MB limit.
 * If it fits, sends directly.  If not, splits via ffmpeg and merges.
 */
async function transcribeBuffer(buffer, ext, mimeType) {
  // Fast path — fits in one Whisper call
  if (buffer.length <= WHISPER_LIMIT) {
    const result = await whisperTranscribe(buffer, `audio.${ext}`, mimeType)
    return { text: result.text ?? '', segments: result.segments ?? [] }
  }

  // Slow path — need to split
  const workDir = join(tmpdir(), `pp-transcribe-${randomUUID()}`)
  const inputPath = join(workDir, `input.${ext}`)

  try {
    await (await import('fs/promises')).mkdir(workDir, { recursive: true })
    await writeFile(inputPath, buffer)

    // Determine how many chunks we need
    const totalSec    = await probeDuration(inputPath)
    const chunksCount = Math.ceil(buffer.length / WHISPER_LIMIT)
    const segSec      = Math.min(CHUNK_TARGET_SEC, Math.ceil(totalSec / chunksCount))

    console.log(`[transcription] splitting ${Math.round(buffer.length / 1024 / 1024)} MB / ${Math.round(totalSec)}s into ~${segSec}s segments`)

    const segments = await splitAudio(inputPath, workDir, segSec)
    console.log(`[transcription] created ${segments.length} segments`)

    const chunks = await Promise.all(
      segments.map(async ({ path, startSec }) => {
        const buf    = await readFile(path)
        const result = await whisperTranscribe(buf, `seg.m4a`, mimeType)
        return { result, startSec }
      })
    )

    return mergeResults(chunks)

  } finally {
    rm(workDir, { recursive: true, force: true }).catch(() => {})
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Transcribe a participant recording with Whisper.
 * Handles files larger than Whisper's 25 MB limit by splitting via ffmpeg.
 *
 * @param {{ id: string, test_id: string, tid: string, audio_object_path: string, mime_type: string, byte_size: number }} recording
 */
export async function transcribeRecording(recording) {
  const { id: recordingId, test_id, tid, audio_object_path, mime_type, byte_size } = recording

  // Mark as processing immediately so the UI shows status
  const { error: upsertErr } = await adminDb.from('transcripts').upsert({
    recording_id: recordingId,
    test_id,
    tid,
    status:       'processing',
    updated_at:   new Date().toISOString(),
  }, { onConflict: 'recording_id' })

  if (upsertErr) {
    console.error('[transcription] could not upsert pending row:', upsertErr.message)
    return
  }

  try {
    // Download audio from Supabase Storage
    const { data: blob, error: dlErr } = await adminDb.storage
      .from(BUCKET)
      .download(audio_object_path)
    if (dlErr || !blob) {
      throw new Error(`Storage download failed: ${dlErr?.message ?? 'empty blob'}`)
    }
    const buffer = Buffer.from(await blob.arrayBuffer())

    // Use the path extension, but fall back to 'm4a' for generic binary uploads
    // (curl without an explicit Content-Type stores files as .bin)
    const rawExt = audio_object_path.split('.').pop() || 'm4a'
    const ext    = rawExt === 'bin' ? 'm4a' : rawExt
    const effectiveMime = (!mime_type || mime_type === 'application/octet-stream') ? 'audio/mp4' : mime_type

    const { text, segments } = await transcribeBuffer(buffer, ext, effectiveMime)

    // Store completed transcript
    const { data: savedRow } = await adminDb.from('transcripts').upsert({
      recording_id:    recordingId,
      test_id,
      tid,
      status:          'done',
      transcript_text: text,
      segments,
      model_used:      'whisper-1',
      updated_at:      new Date().toISOString(),
    }, { onConflict: 'recording_id' }).select('id').single()

    console.log(`[transcription] done for recording ${recordingId} (${text.length} chars, ${segments.length} segments)`)

    // Fire-and-forget insight analysis
    if (savedRow?.id) {
      const { analyzeTranscript } = await import('./insights.js')
      analyzeTranscript({
        transcriptId:   savedRow.id,
        transcriptText: text,
        segments,
      }).catch((err) => console.error('[insights] auto-trigger error:', err))
    }

  } catch (err) {
    console.error(`[transcription] failed for recording ${recordingId}:`, err.message)

    await adminDb.from('transcripts').upsert({
      recording_id:  recordingId,
      test_id,
      tid,
      status:        'error',
      error_message: err.message,
      updated_at:    new Date().toISOString(),
    }, { onConflict: 'recording_id' })
  }
}
