import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, Link, useSearchParams } from 'react-router-dom'
import { apiFetch } from '../api.js'
import { getApiBase } from '../lib/publicEnv.js'
import { supabase } from '../lib/supabase.js'

const API_BASE = getApiBase()

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTime(seconds) {
  if (seconds == null || isNaN(seconds)) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function formatDuration(ms) {
  if (ms == null) return null
  const s = Math.round(ms / 1000)
  const m = Math.floor(s / 60)
  const r = s % 60
  return m > 0 ? `${m}m ${r}s` : `${r}s`
}

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'long', day: 'numeric', year: 'numeric'
    })
  } catch { return iso }
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const map = {
    pending:    { label: 'Queued',        cls: 'pp-transcript-badge--pending' },
    processing: { label: 'Transcribing…', cls: 'pp-transcript-badge--processing' },
    done:       { label: 'Transcript ready', cls: 'pp-transcript-badge--done' },
    error:      { label: 'Transcription failed', cls: 'pp-transcript-badge--error' },
  }
  const { label, cls } = map[status] ?? { label: status, cls: '' }
  return <span className={`pp-transcript-badge ${cls}`}>{label}</span>
}

// ─── Skeleton loader ──────────────────────────────────────────────────────────

function TranscriptSkeleton() {
  return (
    <div className="pp-transcript-skeleton" aria-busy="true" aria-label="Loading transcript">
      {[120, 90, 140, 80, 110, 95].map((w, i) => (
        <div key={i} className="pp-transcript-skeleton-row">
          <div className="pp-transcript-skeleton-time" />
          <div className="pp-transcript-skeleton-text" style={{ width: `${w}px` }} />
        </div>
      ))}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Transcript() {
  const { id: testId, participantId } = useParams()
  const [searchParams] = useSearchParams()
  const recordingIdParam = searchParams.get('recordingId')

  const [participant, setParticipant] = useState(null)
  const [recordings, setRecordings] = useState([])
  const [activeRecordingId, setActiveRecordingId] = useState(recordingIdParam || null)
  const [audioUrl, setAudioUrl] = useState(null)
  const [transcript, setTranscript] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [retrying, setRetrying] = useState(false)

  const pollRef = useRef(null)
  const audioRef = useRef(null)
  const [currentTime, setCurrentTime] = useState(0)

  // ── Load participant info ────────────────────────────────────────────────
  useEffect(() => {
    apiFetch(`/api/tests/${testId}/participants/${participantId}/recordings`)
      .then((data) => {
        setRecordings(data.recordings || [])
        if (!activeRecordingId && data.recordings?.length > 0) {
          setActiveRecordingId(data.recordings[0].id)
        }
      })
      .catch((e) => setError(e.message))
  }, [testId, participantId, activeRecordingId])

  // Load participant name from test participants list
  useEffect(() => {
    apiFetch(`/api/tests/${testId}`)
      .then((data) => {
        const p = data.participants?.find((x) => x.id === participantId)
        setParticipant(p || null)
      })
      .catch(() => {})
  }, [testId, participantId])

  // ── Load audio blob ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!activeRecordingId) return
    setAudioUrl(null)
    const base = API_BASE || ''
    const url = `${base}/api/tests/${testId}/recordings/${activeRecordingId}/audio`

    supabase.auth.getSession().then(({ data: { session } }) => {
      const token = session?.access_token
      fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
        .then((res) => {
          if (!res.ok) throw new Error('Audio not available')
          return res.blob()
        })
        .then((blob) => setAudioUrl(URL.createObjectURL(blob)))
        .catch((e) => console.warn('[transcript] audio load:', e.message))
    })

    return () => {
      setAudioUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return null
      })
    }
  }, [testId, activeRecordingId])

  // ── Load transcript (with polling while pending/processing) ─────────────
  const fetchTranscript = useCallback(async () => {
    if (!activeRecordingId) return

    try {
      const data = await apiFetch(
        `/api/tests/${testId}/recordings/${activeRecordingId}/transcript`
      )
      setTranscript(data)
      setLoading(false)

      // Stop polling once terminal state reached
      if (data.status === 'done' || data.status === 'error') {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    } catch (e) {
      if (e.message?.includes('No transcript')) {
        // Recording uploaded before the feature — show prompt to retry
        setTranscript({ status: 'not_started' })
      } else {
        setError(e.message)
      }
      setLoading(false)
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [testId, activeRecordingId])

  useEffect(() => {
    if (!activeRecordingId) return
    setLoading(true)
    setTranscript(null)
    setError(null)

    fetchTranscript()

    // Poll every 3 seconds while transcribing
    pollRef.current = setInterval(fetchTranscript, 3000)
    return () => {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [fetchTranscript, activeRecordingId])

  // ── Retry transcription ──────────────────────────────────────────────────
  async function retryTranscription() {
    setRetrying(true)
    try {
      await apiFetch(
        `/api/tests/${testId}/recordings/${activeRecordingId}/transcript/retry`,
        { method: 'POST' }
      )
      setTranscript({ status: 'processing' })
      setLoading(true)
      // Restart polling
      clearInterval(pollRef.current)
      pollRef.current = setInterval(fetchTranscript, 3000)
    } catch (e) {
      setError(e.message)
    } finally {
      setRetrying(false)
    }
  }

  // ── Sync audio playhead with transcript highlight ────────────────────────
  function handleTimeUpdate() {
    if (audioRef.current) setCurrentTime(audioRef.current.currentTime)
  }

  function seekTo(seconds) {
    if (audioRef.current) {
      audioRef.current.currentTime = seconds
      audioRef.current.play().catch(() => {})
    }
  }

  // ── Derive active recording metadata ────────────────────────────────────
  const activeRecording = recordings.find((r) => r.id === activeRecordingId)

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="pp-transcript-page">
      {/* ── Back nav ── */}
      <div className="pp-transcript-nav">
        <Link to={`/tests/${testId}`} className="pp-back-link">
          ← Results
        </Link>
      </div>

      <div className="pp-transcript-body">
        {/* ── Participant header ── */}
        <div className="pp-transcript-header">
          <h1 className="pp-transcript-name">
            {participant?.name || 'Participant'}
          </h1>
          <div className="pp-transcript-meta pp-muted">
            {activeRecording && (
              <>
                {formatDuration(activeRecording.duration_ms) && (
                  <span>{formatDuration(activeRecording.duration_ms)}</span>
                )}
                {activeRecording.created_at && (
                  <span>· {formatDate(activeRecording.created_at)}</span>
                )}
              </>
            )}
            {transcript?.status && <StatusBadge status={transcript.status} />}
          </div>

          {/* Multiple recordings selector */}
          {recordings.length > 1 && (
            <div className="pp-transcript-recording-tabs">
              {recordings.map((r, i) => (
                <button
                  key={r.id}
                  type="button"
                  className={`pp-btn-sm${activeRecordingId === r.id ? ' pp-btn-active' : ''}`}
                  onClick={() => setActiveRecordingId(r.id)}
                >
                  Recording {i + 1}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Audio player ── */}
        {audioUrl ? (
          <div className="pp-transcript-player">
            <audio
              ref={audioRef}
              controls
              src={audioUrl}
              className="pp-transcript-audio"
              onTimeUpdate={handleTimeUpdate}
            />
          </div>
        ) : (
          <div className="pp-transcript-player pp-transcript-player--loading">
            <div className="pp-transcript-audio-skeleton" />
          </div>
        )}

        {/* ── Transcript body ── */}
        <div className="pp-transcript-content">
          <p className="pp-section-label" style={{ marginBottom: '0.75rem' }}>
            TRANSCRIPT
          </p>

          {loading && <TranscriptSkeleton />}

          {!loading && transcript?.status === 'done' && (
            <div className="pp-transcript-segments">
              {(transcript.segments || []).length > 0 ? (
                transcript.segments.map((seg, i) => {
                  const isActive =
                    audioRef.current &&
                    currentTime >= seg.start &&
                    currentTime < (transcript.segments[i + 1]?.start ?? Infinity)
                  return (
                    <div
                      key={i}
                      className={`pp-transcript-segment${isActive ? ' pp-transcript-segment--active' : ''}`}
                      onClick={() => seekTo(seg.start)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => e.key === 'Enter' && seekTo(seg.start)}
                      title="Click to jump to this moment"
                    >
                      <span className="pp-transcript-time">[{formatTime(seg.start)}]</span>
                      <span className="pp-transcript-text">{seg.text}</span>
                    </div>
                  )
                })
              ) : (
                // No segments but has text (e.g. short audio with no pauses)
                <p className="pp-transcript-full-text">{transcript.transcript_text}</p>
              )}
            </div>
          )}

          {!loading && transcript?.status === 'processing' && (
            <div className="pp-transcript-pending">
              <div className="pp-transcript-spinner" aria-hidden />
              <p>Transcribing audio… this usually takes 10–30 seconds.</p>
            </div>
          )}

          {!loading && transcript?.status === 'pending' && (
            <div className="pp-transcript-pending">
              <div className="pp-transcript-spinner" aria-hidden />
              <p>Queued for transcription…</p>
            </div>
          )}

          {!loading && (transcript?.status === 'error' || transcript?.status === 'not_started') && (
            <div className="pp-transcript-error-state">
              {transcript.status === 'error' && (
                <p className="pp-muted" style={{ fontSize: '0.85rem', marginBottom: '0.75rem' }}>
                  {transcript.error_message || 'Transcription failed.'}
                </p>
              )}
              {transcript.status === 'not_started' && (
                <p className="pp-muted" style={{ fontSize: '0.85rem', marginBottom: '0.75rem' }}>
                  This recording was uploaded before transcription was available.
                </p>
              )}
              <button
                type="button"
                className="pp-btn-sm"
                onClick={retryTranscription}
                disabled={retrying}
              >
                {retrying ? 'Starting…' : 'Transcribe now'}
              </button>
            </div>
          )}

          {error && (
            <p className="error" style={{ fontSize: '0.85rem' }}>{error}</p>
          )}
        </div>
      </div>
    </div>
  )
}
