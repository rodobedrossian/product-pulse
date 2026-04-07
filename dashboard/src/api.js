import { supabase } from './lib/supabase.js'
import { getApiBase } from './lib/publicEnv.js'

export async function apiFetch(path, options = {}) {
  const { timeoutMs = 25000, signal: outerSignal, accessToken: accessTokenOpt, ...fetchRest } =
    options

  let token = accessTokenOpt
  if (token === undefined) {
    const sessionResult = await supabase.auth.getSession()
    token = sessionResult?.data?.session?.access_token
  }

  const timeoutCtrl = new AbortController()
  const tid = setTimeout(() => timeoutCtrl.abort(), timeoutMs)
  const signal =
    typeof AbortSignal !== 'undefined' && typeof AbortSignal.any === 'function' && outerSignal
      ? AbortSignal.any([outerSignal, timeoutCtrl.signal])
      : outerSignal || timeoutCtrl.signal

  const base = getApiBase()
  const url = base ? `${base}${path}` : path

  try {
    const res = await fetch(url, {
      ...fetchRest,
      signal,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...fetchRest.headers
      }
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }))
      throw new Error(err.error || res.statusText)
    }
    if (res.status === 204) return null
    return res.json()
  } finally {
    clearTimeout(tid)
  }
}

/** Multipart POST (e.g. file upload). Do not set Content-Type — browser sets boundary. */
export async function apiFormPost(path, formData, options = {}) {
  const { timeoutMs = 120000, signal: outerSignal, accessToken: accessTokenOpt } = options

  let token = accessTokenOpt
  if (token === undefined) {
    const sessionResult = await supabase.auth.getSession()
    token = sessionResult?.data?.session?.access_token
  }

  const timeoutCtrl = new AbortController()
  const tid = setTimeout(() => timeoutCtrl.abort(), timeoutMs)
  const signal =
    typeof AbortSignal !== 'undefined' && typeof AbortSignal.any === 'function' && outerSignal
      ? AbortSignal.any([outerSignal, timeoutCtrl.signal])
      : outerSignal || timeoutCtrl.signal

  const base = getApiBase()
  const url = base ? `${base}${path}` : path

  try {
    const res = await fetch(url, {
      method: 'POST',
      signal,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: formData
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }))
      throw new Error(err.error || res.statusText)
    }
    return res.json()
  } finally {
    clearTimeout(tid)
  }
}
