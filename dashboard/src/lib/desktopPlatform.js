/**
 * Best-effort client OS for showing the right desktop download (not security-critical).
 * @returns {'darwin' | 'win32' | 'other'}
 */
export function detectClientDesktopOS() {
  if (typeof navigator === 'undefined') return 'other'
  const ua = navigator.userAgent || ''
  const p = String(navigator.userAgentData?.platform || navigator.platform || '').toLowerCase()
  if (p.includes('mac') || p === 'darwin' || /macintosh|mac os x/i.test(ua)) return 'darwin'
  if (p.includes('win') || /windows/i.test(ua)) return 'win32'
  return 'other'
}
