/**
 * Whisper transcription service.
 * Called fire-and-forget after a recording is uploaded.
 * Stores result in the `transcripts` table with status tracking.
 */
import OpenAI, { toFile } from 'openai'
import adminDb from '../db-admin.js'

const BUCKET = 'participant-recordings'
const MAX_WHISPER_BYTES = 24 * 1024 * 1024  // Whisper API limit is 25 MB

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

/**
 * Transcribe a participant recording with Whisper.
 * @param {{ id: string, test_id: string, tid: string, audio_object_path: string, mime_type: string, byte_size: number }} recording
 */
export async function transcribeRecording(recording) {
  const { id: recordingId, test_id, tid, audio_object_path, mime_type, byte_size } = recording

  // 1. Insert / update transcript row to 'processing' so the UI can show status immediately
  const { error: upsertErr } = await adminDb.from('transcripts').upsert({
    recording_id:  recordingId,
    test_id,
    tid,
    status:        'processing',
    updated_at:    new Date().toISOString(),
  }, { onConflict: 'recording_id' })

  if (upsertErr) {
    console.error('[transcription] could not upsert pending row:', upsertErr.message)
    return  // Don't crash — just skip
  }

  try {
    // 2. Guard against files too large for Whisper
    if (byte_size != null && byte_size > MAX_WHISPER_BYTES) {
      throw new Error(
        `Recording is ${Math.round(byte_size / 1024 / 1024)} MB — exceeds Whisper's 25 MB limit`
      )
    }

    // 3. Download audio from Supabase Storage
    const { data: blob, error: dlErr } = await adminDb.storage
      .from(BUCKET)
      .download(audio_object_path)
    if (dlErr || !blob) {
      throw new Error(`Storage download failed: ${dlErr?.message ?? 'empty blob'}`)
    }
    const buffer = Buffer.from(await blob.arrayBuffer())

    // 4. Call Whisper (verbose_json → includes timestamp segments)
    // Use openai's toFile() helper — avoids relying on Web API `File` which
    // is not available as a global in all Node.js versions on Railway.
    const ext = audio_object_path.split('.').pop() || 'm4a'
    const filename = `audio.${ext}`
    const file = await toFile(buffer, filename, { type: mime_type || 'audio/m4a' })
    const result = await getOpenAI().audio.transcriptions.create({
      file,
      model:           'whisper-1',
      response_format: 'verbose_json',
    })

    // 5. Store completed transcript
    await adminDb.from('transcripts').upsert({
      recording_id:    recordingId,
      test_id,
      tid,
      status:          'done',
      transcript_text: result.text ?? '',
      segments:        result.segments ?? [],
      model_used:      'whisper-1',
      updated_at:      new Date().toISOString(),
    }, { onConflict: 'recording_id' })

    console.log(`[transcription] done for recording ${recordingId} (${result.text?.length ?? 0} chars)`)

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
