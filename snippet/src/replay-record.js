import { record } from 'rrweb'

/**
 * Called by protopulse.js after the participant gives consent.
 * Starts rrweb recording, batches events, and flushes to /api/replay/chunk.
 *
 * @param {{ apiUrl: string, tid: string, testId: string }} config
 */
window.__ppStartReplay = function (config) {
  var apiUrl = config.apiUrl
  var tid = config.tid
  var testId = config.testId

  var buffer = []
  var partIndex = 0
  var stopped = false
  var FLUSH_INTERVAL_MS = 3000
  var FLUSH_SIZE_BYTES = 300 * 1024 // ~300 KB

  function estimatedSize() {
    var s = 0
    for (var i = 0; i < buffer.length; i++) {
      s += JSON.stringify(buffer[i]).length
    }
    return s
  }

  // Regular flush (called on interval or size threshold) — no keepalive needed
  function flush(force) {
    if (buffer.length === 0) return
    if (!force && estimatedSize() < FLUSH_SIZE_BYTES) return

    var chunk = buffer.splice(0, buffer.length)
    var index = partIndex++

    fetch(apiUrl + '/api/replay/chunk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tid: tid, test_id: testId, part_index: index, events: chunk })
    }).catch(function () {})
  }

  // Final flush on page unload — must survive the page being killed.
  // sendBeacon is ideal (designed for this), keepalive fetch as fallback.
  function flushFinal() {
    if (buffer.length === 0) return
    var chunk = buffer.splice(0, buffer.length)
    var index = partIndex++
    var payload = JSON.stringify({ tid: tid, test_id: testId, part_index: index, events: chunk })

    var sent = false
    if (navigator.sendBeacon) {
      sent = navigator.sendBeacon(
        apiUrl + '/api/replay/chunk',
        new Blob([payload], { type: 'application/json' })
      )
    }
    if (!sent) {
      fetch(apiUrl + '/api/replay/chunk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true
      }).catch(function () {})
    }
  }

  var flushInterval = setInterval(function () {
    if (!stopped) flush(true)
  }, FLUSH_INTERVAL_MS)

  function stop() {
    if (stopped) return
    stopped = true
    clearInterval(flushInterval)
    flushFinal()
    fetch(apiUrl + '/api/replay/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tid: tid, test_id: testId }),
      keepalive: true
    }).catch(function () {})
  }

  // Expose stop so the task overlay can call it when all goals are met
  window.__ppStopReplay = stop

  record({
    emit: function (event) {
      buffer.push(event)
      if (estimatedSize() >= FLUSH_SIZE_BYTES) flush(false)
    },
    maskAllInputs: true,
    // Full re-snapshot every 10 s — keeps SPA replays correct across route changes
    checkoutEveryNms: 10000,
    slimDOMOptions: {
      script: true,
      comment: true,
      headWhitespace: true,
      headMetaDescKeywords: false,
      headMetaSocial: false,
      headMetaRobots: false,
      headMetaHttpEquiv: false,
      headMetaAuthorship: false,
      headMetaVerification: false
    }
  })

  // Flush on tab hide (user may return — don't stop, just save)
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') flush(true)
  })

  // Stop (flush + complete) on actual page unload
  window.addEventListener('pagehide', stop)
  window.addEventListener('beforeunload', stop)
}
