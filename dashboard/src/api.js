import { supabase } from './lib/supabase.js'

const BASE = import.meta.env.VITE_API_URL || ''

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

  try {
    const res = await fetch(BASE + path, {
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
