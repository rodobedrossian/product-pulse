/**
 * Normalized API origin for fetch() and absolute URLs in the UI.
 * @returns {string} Full URL with scheme (e.g. https://api.example.com) or '' for same-origin /api (Vite dev proxy).
 */
export function getApiBase() {
  const raw = (import.meta.env.VITE_API_URL || '').trim().replace(/\/$/, '')
  if (!raw) return ''
  if (/^https?:\/\//i.test(raw)) return raw
  return `https://${raw}`
}

/**
 * Public dashboard origin (invite links, /join/…).
 */
export function getAppOrigin() {
  const raw = (import.meta.env.VITE_APP_URL || '').trim().replace(/\/$/, '')
  if (!raw) {
    if (typeof window !== 'undefined') return window.location.origin
    return ''
  }
  if (/^https?:\/\//i.test(raw)) return raw
  return `https://${raw}`
}
