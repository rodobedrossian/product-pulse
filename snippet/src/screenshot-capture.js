import html2canvas from 'html2canvas'

function ignoreOverlay(el) {
  if (!el || !el.id) return false
  return el.id === '__pp-ov' || el.id === '__pp-ov-css'
}

function isWindowScrollRoot(el) {
  return !el || el === document.documentElement || el === document.body
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
