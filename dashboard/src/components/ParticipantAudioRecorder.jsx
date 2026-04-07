import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { apiFormPost, apiFetch } from '../api.js'
import { getApiBase } from '../lib/publicEnv.js'

/**
 * Moderated session audio: start recording only after verbal consent on the call (no in-app consent UI).
 */
function formatDuration(ms) {
  if (ms == null) return '—'
  const s = Math.round(ms / 1000)
  const m = Math.floor(s / 60)
  const r = s % 60
  return m > 0 ? `${m}m ${r}s` : `${r}s`
}

function formatTime(iso) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  } catch {
    return iso
  }
}

function withApiBaseOnDeepLink(deepLink) {
  const base = (getApiBase() || '').trim().replace(/\/$/, '')
  if (!base || !deepLink || deepLink.includes('api_base=')) return deepLink
  const sep = deepLink.includes('?') ? '&' : '?'
  return `${deepLink}${sep}api_base=${encodeURIComponent(base)}`
}

export default function ParticipantAudioRecorder({ testId, participant, recordings, onUploaded }) {
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState(null)
  const [desktopBusy, setDesktopBusy] = useState(false)
  const [desktopErr, setDesktopErr] = useState(null)
  const [linkCopied, setLinkCopied] = useState(false)
  const [elapsedSec, setElapsedSec] = useState(0)
  const [playUrl, setPlayUrl] = useState(null)
  const [playingId, setPlayingId] = useState(null)

  const mediaRecorderRef = useRef(null)
  const streamRef = useRef(null)
  const chunksRef = useRef([])
  const startedAtRef = useRef(null)
  const tickRef = useRef(null)

  useEffect(() => {
    return () => {
      if (tickRef.current) clearInterval(tickRef.current)
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  useEffect(() => {
    return () => {
      if (playUrl) URL.revokeObjectURL(playUrl)
    }
  }, [playUrl])

  const pickMimeType = () => {
    if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return ''
    if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) return 'audio/webm;codecs=opus'
    if (MediaRecorder.isTypeSupported('audio/webm')) return 'audio/webm'
    return ''
  }

  const startRecording = async () => {
    setError(null)
    const mimeType = pickMimeType()
    if (!mimeType) {
      setStatus('unsupported')
      return
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('unsupported')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      chunksRef.current = []
      const mr = new MediaRecorder(stream, { mimeType })
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      mr.start(1000)
      mediaRecorderRef.current = mr
      startedAtRef.current = Date.now()
      setElapsedSec(0)
      tickRef.current = setInterval(() => setElapsedSec((n) => n + 1), 1000)
      setStatus('recording')
    } catch (e) {
      setError(e.message || 'Microphone access denied')
      setStatus('idle')
    }
  }

  const stopAndUpload = useCallback(async () => {
    if (tickRef.current) {
      clearInterval(tickRef.current)
      tickRef.current = null
    }
    const mr = mediaRecorderRef.current
    const started = startedAtRef.current
    if (!mr || mr.state === 'inactive') {
      setStatus('idle')
      return
    }

    setStatus('uploading')

    const blob = await new Promise((resolve) => {
      mr.onstop = () => {
        streamRef.current?.getTracks().forEach((t) => t.stop())
        streamRef.current = null
        const type = mr.mimeType || 'audio/webm'
        resolve(new Blob(chunksRef.current, { type }))
      }
      mr.stop()
    })

    mediaRecorderRef.current = null
    chunksRef.current = []

    const durationMs = started ? Date.now() - started : null
    if (!blob.size) {
      setError('No audio captured')
      setStatus('idle')
      return
    }

    const ext = blob.type.includes('webm') ? 'webm' : 'audio'
    const fd = new FormData()
    fd.append('audio', blob, `recording.${ext}`)
    if (durationMs != null) fd.append('duration_ms', String(durationMs))

    try {
      const row = await apiFormPost(
        `/api/tests/${testId}/participants/${participant.id}/recordings`,
        fd
      )
      onUploaded?.(row)
      setStatus('idle')
      setElapsedSec(0)
    } catch (e) {
      setError(e.message || 'Upload failed')
      setStatus('idle')
    }
  }, [testId, participant.id, onUploaded])

  const openDesktopRecorder = useCallback(async () => {
    setDesktopErr(null)
    setDesktopBusy(true)
    try {
      const data = await apiFetch(
        `/api/tests/${testId}/participants/${participant.id}/recording-token`,
        { method: 'POST' }
      )
      const url = withApiBaseOnDeepLink(data.deep_link)
      if (url) window.location.href = url
      else throw new Error('No deep link returned')
    } catch (e) {
      setDesktopErr(e.message || 'Could not start desktop recorder')
    } finally {
      setDesktopBusy(false)
    }
  }, [testId, participant.id])

  const copyDesktopDeepLink = useCallback(async () => {
    setDesktopErr(null)
    setDesktopBusy(true)
    try {
      const data = await apiFetch(
        `/api/tests/${testId}/participants/${participant.id}/recording-token`,
        { method: 'POST' }
      )
      const url = withApiBaseOnDeepLink(data.deep_link)
      if (!url) throw new Error('No deep link returned')
      await navigator.clipboard.writeText(url)
      setLinkCopied(true)
      window.setTimeout(() => setLinkCopied(false), 2000)
    } catch (e) {
      setDesktopErr(e.message || 'Copy failed')
    } finally {
      setDesktopBusy(false)
    }
  }, [testId, participant.id])

  const stopPlayback = useCallback(() => {
    setPlayUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
    setPlayingId(null)
  }, [])

  const playRecording = useCallback(
    async (recordingId) => {
      stopPlayback()
      const base = getApiBase()
      const sessionResult = await supabase.auth.getSession()
      const token = sessionResult?.data?.session?.access_token
      const url = base
        ? `${base}/api/tests/${testId}/recordings/${recordingId}/audio`
        : `/api/tests/${testId}/recordings/${recordingId}/audio`
      const res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || res.statusText)
      }
      const blob = await res.blob()
      const objectUrl = URL.createObjectURL(blob)
      setPlayUrl(objectUrl)
      setPlayingId(recordingId)
    },
    [testId, stopPlayback]
  )

  if (status === 'unsupported') {
    return (
      <div className="pp-participant-recorder">
        <p className="pp-muted" style={{ fontSize: '0.75rem', margin: 0 }}>
          Recording not supported in this browser. Use Chrome or Edge, or HTTPS.
        </p>
      </div>
    )
  }

  return (
    <div className="pp-participant-recorder">
      <div className="pp-participant-recorder-actions">
        {status === 'recording' ? (
          <>
            <span className="pp-recording-dot" aria-hidden />
            <span className="pp-recording-timer" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {Math.floor(elapsedSec / 60)}:{String(elapsedSec % 60).padStart(2, '0')}
            </span>
            <button type="button" className="pp-btn-sm primary" onClick={() => stopAndUpload()}>
              Stop & save
            </button>
          </>
        ) : status === 'uploading' ? (
          <span className="pp-muted" style={{ fontSize: '0.8125rem' }}>Uploading…</span>
        ) : (
          <button type="button" className="pp-btn-sm" onClick={startRecording}>
            Record session audio
          </button>
        )}
        {status !== 'recording' && status !== 'uploading' && (
          <span className="pp-inline" style={{ marginLeft: '0.35rem', flexWrap: 'wrap', gap: '0.35rem' }}>
            <button
              type="button"
              className="pp-btn-sm"
              disabled={desktopBusy}
              onClick={() => openDesktopRecorder()}
            >
              {desktopBusy ? 'Opening…' : 'Open desktop app'}
            </button>
            <button
              type="button"
              className="pp-btn-sm"
              disabled={desktopBusy}
              onClick={() => copyDesktopDeepLink()}
              title="If the app does not open, paste this link after installing the recorder"
            >
              {linkCopied ? 'Copied' : 'Copy app link'}
            </button>
          </span>
        )}
      </div>
      {desktopErr && (
        <p className="error" style={{ fontSize: '0.75rem', margin: '0.35rem 0 0' }}>
          {desktopErr}
        </p>
      )}
      {error && (
        <p className="error" style={{ fontSize: '0.75rem', margin: '0.35rem 0 0' }}>
          {error}
        </p>
      )}
      <p className="pp-muted" style={{ fontSize: '0.7rem', margin: '0.5rem 0 0', maxWidth: '28rem' }}>
        Desktop: install the recorder from the test page, then use Open desktop app. If the browser does nothing,
        use Copy app link and run{' '}
        <code style={{ fontSize: '0.68rem' }}>open &apos;productpulse://…&apos;</code> in Terminal.
      </p>
      {recordings?.length > 0 && (
        <ul className="pp-recording-list">
          {recordings.map((r) => (
            <li key={r.id}>
              <span className="pp-muted" style={{ fontSize: '0.75rem' }}>
                {formatTime(r.created_at)}
                {r.duration_ms != null && ` · ${formatDuration(r.duration_ms)}`}
              </span>
              <button
                type="button"
                className="pp-btn-sm"
                disabled={status === 'uploading' || status === 'recording'}
                onClick={() =>
                  playRecording(r.id).catch((e) => setError(e.message))
                }
              >
                {playingId === r.id ? 'Loaded' : 'Play'}
              </button>
            </li>
          ))}
        </ul>
      )}
      {playUrl && (
        <div className="pp-recording-player">
          <audio controls src={playUrl} className="pp-recording-audio" />
          <button type="button" className="pp-btn-sm" onClick={stopPlayback}>
            Close player
          </button>
        </div>
      )}
    </div>
  )
}
