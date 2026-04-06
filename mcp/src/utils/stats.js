/**
 * Pure statistical helpers used by results and summary tools.
 * All functions are side-effect-free and testable in isolation.
 */

/**
 * Compute the median of an array of numbers.
 * @param {number[]} sorted - pre-sorted ascending array
 * @returns {number | null}
 */
export function computeMedian(sorted) {
  if (!sorted.length) return null
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid]
}

/**
 * Compute the mean of an array of numbers.
 * @param {number[]} values
 * @returns {number | null}
 */
export function computeAverage(values) {
  if (!values.length) return null
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length)
}

/**
 * Format milliseconds into a human-readable duration string.
 * @param {number | null} ms
 * @returns {string} e.g. "2m 14s", "45s", "—"
 */
export function formatDuration(ms) {
  if (ms == null || ms < 0) return '—'
  const totalSeconds = Math.round(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes === 0) return `${seconds}s`
  return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`
}

/**
 * Compute completion rate as 0.0–1.0.
 * @param {number} count
 * @param {number} total
 * @returns {number}
 */
export function completionRate(count, total) {
  return total > 0 ? count / total : 0
}

/**
 * Format a completion rate as a percentage string.
 * @param {number} rate - 0.0 to 1.0
 * @returns {string} e.g. "68%"
 */
export function pct(rate) {
  return `${Math.round(rate * 100)}%`
}

/**
 * Extract sorted (ascending) completion times from results array.
 * @param {Array<{time_to_complete_ms?: number|null}>} results
 * @returns {number[]}
 */
export function sortedTimes(results) {
  return results
    .map(r => r.time_to_complete_ms)
    .filter(t => t != null && t > 0)
    .sort((a, b) => a - b)
}
