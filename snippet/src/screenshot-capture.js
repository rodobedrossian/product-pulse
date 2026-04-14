import html2canvas from 'html2canvas'

function ignoreOverlay(el) {
  if (!el || !el.id) return false
  return el.id === '__pp-ov' || el.id === '__pp-ov-css'
}

function isWindowScrollRoot(el) {
  return !el || el === document.documentElement || el === document.body
}

var HEATMAP_FP_MAX_W = 1440
var HEATMAP_FP_MAX_H = 6000

/**
 * Capped full-document JPEG for heatmap dashboard (optional).
 * Uses the same scroll root as viewport capture (`window.__ppCaptureScrollRoot`).
 */
window.__ppCaptureHeatmapFullPage = function () {
  var root = window.__ppCaptureScrollRoot
  if (isWindowScrollRoot(root)) {
    var docEl = document.documentElement
    var capW = Math.min(HEATMAP_FP_MAX_W, Math.max(docEl.scrollWidth, window.innerWidth))
    var capH = Math.min(HEATMAP_FP_MAX_H, Math.max(docEl.scrollHeight, window.innerHeight))
    var scale = capW > 1200 ? 0.45 : 0.55
    return html2canvas(docEl, {
      scale: scale,
      useCORS: true,
      allowTaint: true,
      logging: false,
      width: capW,
      height: capH,
      x: 0,
      y: 0,
      ignoreElements: ignoreOverlay
    })
      .then(function (canvas) {
        return canvas.toDataURL('image/jpeg', 0.42)
      })
      .catch(function () {
        return null
      })
  }
  var rw = Math.min(HEATMAP_FP_MAX_W, Math.max(root.scrollWidth, root.clientWidth))
  var rh = Math.min(HEATMAP_FP_MAX_H, Math.max(root.scrollHeight, root.clientHeight))
  var scaleInner = rw > 1200 ? 0.45 : 0.55
  return html2canvas(root, {
    scale: scaleInner,
    useCORS: true,
    allowTaint: true,
    logging: false,
    width: rw,
    height: rh,
    x: 0,
    y: 0,
    ignoreElements: ignoreOverlay
  })
    .then(function (canvas) {
      return canvas.toDataURL('image/jpeg', 0.42)
    })
    .catch(function () {
      return null
    })
}

/**
 * Captures the visible viewport as a JPEG data URL.
 * `window.__ppCaptureScrollRoot` (set by the tracker) selects window vs inner scroll container.
 */
window.__ppCaptureScreenshot = function () {
  var root = window.__ppCaptureScrollRoot
  if (isWindowScrollRoot(root)) {
    return html2canvas(document.body, {
      scale: 1,
      useCORS: true,
      allowTaint: true,
      logging: false,
      width: window.innerWidth,
      height: window.innerHeight,
      x: window.scrollX,
      y: window.scrollY,
      ignoreElements: ignoreOverlay
    }).then(function (canvas) {
      return canvas.toDataURL('image/jpeg', 0.75)
    }).catch(function () {
      return null
    })
  }
  return html2canvas(root, {
    scale: 1,
    useCORS: true,
    allowTaint: true,
    logging: false,
    width: root.clientWidth,
    height: root.clientHeight,
    x: root.scrollLeft,
    y: root.scrollTop,
    ignoreElements: ignoreOverlay
  }).then(function (canvas) {
    return canvas.toDataURL('image/jpeg', 0.75)
  }).catch(function () {
    return null
  })
}
