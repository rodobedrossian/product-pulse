import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { apiFetch } from '../api.js'
import { getApiBase } from '../lib/publicEnv.js'

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

export default function ParticipantAudioRecorder({ testId, participant, recordings }) {
  const [error, setError] = useState(null)
  const [desktopBusy, setDesktopBusy] = useState(false)
  const [desktopErr, setDesktopErr] = useState(null)
  const [playUrl, setPlayUrl] = useState(null)
  const [playingId, setPlayingId] = useState(null)

  useEffect(() => {
    return () => {
      if (playUrl) URL.revokeObjectURL(playUrl)
    }
  }, [playUrl])

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

  return (
    <div className="pp-participant-recorder">
      <div className="pp-participant-recorder-actions">
        <button
          type="button"
          className="pp-btn-sm"
          disabled={desktopBusy}
          onClick={() => openDesktopRecorder()}
        >
          {desktopBusy ? 'Opening…' : 'Open desktop app'}
        </button>
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
