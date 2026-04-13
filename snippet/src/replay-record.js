import { record } from 'rrweb'

/**
 * Called by protopulse.js after the participant gives consent.
 * Starts rrweb recording, batches events, and flushes to /api/replay/chunk.
 *
 * @param {{ apiUrl: string, tid: string, testId: string }} config
 */
window.__ppStartReplay = function (config) {
  if (typeof window.__ppReplayTeardown === 'function') {
    window.__ppReplayTeardown()
    window.__ppReplayTeardown = null
  }

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
    if (typeof window.__ppReplayTeardown === 'function') {
      window.__ppReplayTeardown()
      window.__ppReplayTeardown = null
    }
    if (typeof stopRecording === 'function') stopRecording()
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

  var stopRecording = record({
    emit: function (event) {
      if (stopped) return
      buffer.push(event)
      if (estimatedSize() >= FLUSH_SIZE_BYTES) flush(false)
    },
    maskAllInputs: true,
    // Full re-snapshot every 10s for SPA correctness; protopulse idle timeout stops rrweb so idle tabs do not record hours of silence.
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

  function onVisibilityChange() {
    if (document.visibilityState === 'hidden') flush(true)
  }

  function onUnload() {
    stop()
  }

  document.addEventListener('visibilitychange', onVisibilityChange)
  window.addEventListener('pagehide', onUnload)
  window.addEventListener('beforeunload', onUnload)

  window.__ppReplayTeardown = function () {
    document.removeEventListener('visibilitychange', onVisibilityChange)
    window.removeEventListener('pagehide', onUnload)
    window.removeEventListener('beforeunload', onUnload)
  }
}
