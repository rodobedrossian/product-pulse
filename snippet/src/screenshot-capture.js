import html2canvas from 'html2canvas'

/**
 * Captures the current viewport as a JPEG data URL.
 * Returns null if capture fails. Ignores Product Pulse UI overlays.
 */
window.__ppCaptureScreenshot = function () {
  return html2canvas(document.body, {
    scale: 1,
    useCORS: true,
    allowTaint: true,
    logging: false,
    width: window.innerWidth,
    height: window.innerHeight,
    x: window.scrollX,
    y: window.scrollY,
    ignoreElements: function (el) {
      if (!el || !el.id) return false
      return el.id === '__pp-ov' || el.id === '__pp-ov-css'
    }
  }).then(function (canvas) {
    return canvas.toDataURL('image/jpeg', 0.75)
  }).catch(function () {
    return null
  })
}
