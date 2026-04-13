(function () {
  // --- Configuration ---
  var cfg = window.ProtoPulse || {}
  var API_URL = (cfg.apiUrl || '__PRODUCT_PULSE_API_URL__').replace(/\/$/, '')
  // After this many ms with no tracked interaction, stop replay + event capture.
  // New observational sessions get a fresh tid when the user returns; directed (URL tid) resumes the same tid.
  // Override: window.ProtoPulse = { ..., sessionIdleMs: 5 * 60 * 1000 }
  var SESSION_IDLE_MS =
    typeof cfg.sessionIdleMs === 'number' && cfg.sessionIdleMs > 0 ? cfg.sessionIdleMs : 3 * 60 * 1000

  // --- Read tracking params ---
  var params = new URLSearchParams(location.search)
  var scriptTag = document.currentScript
  var stepId = params.get('__step_id') || null

  var BAKED_TEST_ID = '__PRODUCT_PULSE_TEST_ID__'
  var testId =
    (BAKED_TEST_ID.indexOf('__') === -1 ? BAKED_TEST_ID : null) ||
    params.get('__test_id') ||
    sessionStorage.getItem('__pp_test_id') ||
    (scriptTag && scriptTag.dataset.testId) ||
    null

  // --- Shared helpers (hoisted — used by both picker and tracker) ---

  // Strip tracking params from a URL before storing it
  function cleanUrl(href) {
    try {
      var u = new URL(href || location.href)
      u.searchParams.delete('__tid')
      u.searchParams.delete('__test_id')
      u.searchParams.delete('__pp_mode')
      return u.toString()
    } catch (e) { return href }
  }

  // Build a stable CSS selector for a DOM element
  function buildSelector(el) {
    if (!el || el === document.body) return ''
    if (el.id) return '#' + el.id
    var parts = []
    var node = el
    var depth = 0
    while (node && node !== document.body && depth < 3) {
      var tag = node.tagName.toLowerCase()
      var cls = node.classList.length
        ? '.' + Array.prototype.slice.call(node.classList, 0, 2).join('.')
        : ''
      var part = tag + cls
      var siblings = node.parentElement
        ? Array.prototype.filter.call(node.parentElement.children, function (c) {
            return c.tagName === node.tagName
          })
        : []
      if (siblings.length > 1) {
        part += ':nth-of-type(' + (siblings.indexOf(node) + 1) + ')'
      }
      parts.unshift(part)
      node = node.parentElement
      depth++
    }
    return parts.join(' > ')
  }

  // ─── PICKER MODE ────────────────────────────────────────────────────────────
  // Activated when ?__pp_mode=pick is present. Used by the PM to select the
  // goal element visually. Skips all participant tracking.

  function initPicker() {
    // Toolbar
    var bar = document.createElement('div')
    bar.style.cssText = [
      'position:fixed', 'bottom:0', 'left:0', 'right:0', 'z-index:2147483647',
      'background:#1e1e1e', 'color:#fff', 'font-family:sans-serif', 'font-size:14px',
      'display:flex', 'align-items:center', 'justify-content:space-between',
      'padding:10px 16px', 'box-shadow:0 -2px 8px rgba(0,0,0,.4)', 'user-select:none'
    ].join(';')

    var label = document.createElement('span')
    label.textContent = '🎯 Goal Picker'
    label.style.fontWeight = '600'

    var controls = document.createElement('span')
    controls.style.cssText = 'display:flex;gap:8px'

    var btnNav = document.createElement('button')
    btnNav.textContent = 'Navigate'
    var btnUrlGoal = document.createElement('button')
    btnUrlGoal.textContent = 'Use page URL'
    var btnPick = document.createElement('button')
    btnPick.textContent = 'Pick Element'

    var btnBase = 'padding:5px 12px;border-radius:5px;border:none;cursor:pointer;font-size:13px;font-weight:600'
    var btnActiveStyle = btnBase + ';background:#2563eb;color:#fff'
    var btnIdleStyle = btnBase + ';background:#3f3f3f;color:#ccc'

    btnNav.style.cssText = btnActiveStyle
    btnUrlGoal.style.cssText = btnIdleStyle
    btnPick.style.cssText = btnIdleStyle

    controls.appendChild(btnNav)
    controls.appendChild(btnUrlGoal)
    controls.appendChild(btnPick)
    bar.appendChild(label)
    bar.appendChild(controls)

    // Wait for body to be available
    function mountBar() {
      document.body.appendChild(bar)
    }
    if (document.body) mountBar()
    else document.addEventListener('DOMContentLoaded', mountBar)

    // Pick mode state
    var picking = false
    var highlighted = null

    function onMouseOver(e) {
      // Don't highlight the toolbar itself
      if (bar.contains(e.target)) return
      if (highlighted && highlighted !== e.target) {
        highlighted.style.outline = highlighted.__ppOutline || ''
        highlighted.style.outlineOffset = highlighted.__ppOutlineOffset || ''
      }
      highlighted = e.target
      highlighted.__ppOutline = highlighted.style.outline
      highlighted.__ppOutlineOffset = highlighted.style.outlineOffset
      highlighted.style.outline = '2px solid #2563eb'
      highlighted.style.outlineOffset = '2px'
    }

    function onMouseOut(e) {
      if (e.target && e.target.__ppOutline !== undefined) {
        e.target.style.outline = e.target.__ppOutline
        e.target.style.outlineOffset = e.target.__ppOutlineOffset
      }
    }

    function onPickClick(e) {
      if (bar.contains(e.target)) return
      e.preventDefault()
      e.stopPropagation()
      e.stopImmediatePropagation()

      var selector = buildSelector(e.target)
      var url = cleanUrl(location.href)

      // Send selection back to dashboard (opened this tab via window.open)
      if (window.opener) {
        window.opener.postMessage(
          { type: 'pp_goal_selected', goalKind: 'click', selector: selector, url: url, stepId: stepId },
          '*'
        )
      }

      // Clean up highlights
      if (highlighted) {
        highlighted.style.outline = highlighted.__ppOutline || ''
        highlighted.style.outlineOffset = highlighted.__ppOutlineOffset || ''
        highlighted = null
      }
      disablePicking()

      showPickerSuccess()
    }

    function enablePicking() {
      picking = true
      document.body.style.cursor = 'crosshair'
      btnPick.style.cssText = btnActiveStyle
      btnNav.style.cssText = btnIdleStyle
      document.addEventListener('mouseover', onMouseOver, true)
      document.addEventListener('mouseout', onMouseOut, true)
      document.addEventListener('click', onPickClick, true)
    }

    function disablePicking() {
      picking = false
      document.body.style.cursor = ''
      btnPick.style.cssText = btnIdleStyle
      btnNav.style.cssText = btnActiveStyle
      document.removeEventListener('mouseover', onMouseOver, true)
      document.removeEventListener('mouseout', onMouseOut, true)
      document.removeEventListener('click', onPickClick, true)
    }

    function showPickerSuccess() {
      controls.innerHTML = ''
      var successMsg = document.createElement('span')
      successMsg.style.cssText = 'color:#4ade80;font-weight:600'
      successMsg.textContent = '✓ Goal captured — you can close this tab'
      controls.appendChild(successMsg)
    }

    btnNav.addEventListener('click', function (e) {
      e.stopPropagation()
      if (picking) disablePicking()
    })
    btnUrlGoal.addEventListener('click', function (e) {
      e.stopPropagation()
      if (picking) disablePicking()
      var url = cleanUrl(location.href)
      if (window.opener) {
        window.opener.postMessage({ type: 'pp_goal_selected', goalKind: 'url', url: url, stepId: stepId }, '*')
      }
      showPickerSuccess()
    })
    btnPick.addEventListener('click', function (e) {
      e.stopPropagation()
      if (!picking) enablePicking()
    })
  }

  if (params.get('__pp_mode') === 'pick') {
    initPicker()
    return  // skip all participant tracking
  }

  // ─── TRACKER / OBSERVATIONAL MODE ───────────────────────────────────────────

  // No test ID at all → bail immediately
  if (!testId) return

  // Try to read an existing tracked session from URL or sessionStorage
  var tid = params.get('__tid') || sessionStorage.getItem('__pp_tid')

  if (tid) {
    // Normal directed mode (single / scenario) — start tracking immediately
    beginTracking(testId, tid, true)
  } else {
    // No tid in URL — check if this test is observational (auto-session)
    fetch(API_URL + '/api/tests/' + testId + '/tasks')
      .then(function (r) { return r.ok ? r.json() : null })
      .then(function (data) {
        if (data && data.test_type === 'observational') {
          initObservational(testId)
        }
      })
      .catch(function () {})
  }

  // ─── OBSERVATIONAL INIT ──────────────────────────────────────────────────────

  var OBS_LS_PREFIX  = '__pp_tk_'    // localStorage: persistent tester key
  var OBS_TID_PREFIX = '__pp_otid_'  // sessionStorage: session tid
  var OBS_TS_PREFIX  = '__pp_ots_'   // sessionStorage: last-activity timestamp

  function detectBrowser(ua) {
    if (/Edg\//i.test(ua))                                    return 'Edge '    + ((ua.match(/Edg\/(\d+)/)      || [])[1] || '')
    if (/Chrome\/(\d+)/i.test(ua) && !/OPR|Opera/i.test(ua)) return 'Chrome '  + ((ua.match(/Chrome\/(\d+)/i)  || [])[1] || '')
    if (/Firefox\/(\d+)/i.test(ua))                           return 'Firefox ' + ((ua.match(/Firefox\/(\d+)/i) || [])[1] || '')
    if (/Safari\//i.test(ua) && !/Chrome/i.test(ua))          return 'Safari '  + ((ua.match(/Version\/(\d+)/i) || [])[1] || '')
    if (/OPR\/(\d+)/i.test(ua))                               return 'Opera '   + ((ua.match(/OPR\/(\d+)/i)     || [])[1] || '')
    return 'Unknown'
  }

  function initObservational(resolvedTestId) {
    // 1. Persistent tester key in localStorage (survives tab/session close)
    var lsKey = OBS_LS_PREFIX + resolvedTestId
    var testerKey = null
    try { testerKey = localStorage.getItem(lsKey) } catch (e) {}
    if (!testerKey) {
      testerKey = 'pp_' + Math.random().toString(36).slice(2, 14)
      try { localStorage.setItem(lsKey, testerKey) } catch (e) {}
    }

    // 2. Session boundary: reuse session if last interaction within SESSION_IDLE_MS (default 3 min)
    var ssKey = OBS_TID_PREFIX + resolvedTestId
    var tsKey = OBS_TS_PREFIX  + resolvedTestId
    var existingTid = null
    var lastTs = 0
    try {
      existingTid = sessionStorage.getItem(ssKey)
      lastTs = parseInt(sessionStorage.getItem(tsKey) || '0', 10)
    } catch (e) {}

    if (existingTid && (Date.now() - lastTs <= SESSION_IDLE_MS)) {
      // Resume existing session — start tracking immediately, no API call needed
      try { sessionStorage.setItem(tsKey, String(Date.now())) } catch (e) {}
      beginTracking(resolvedTestId, existingTid, false)
      return
    }

    // 3. Generate a session tid locally — tracking starts without waiting for the server.
    //    A locally-generated id is enough to associate events in this session.
    var newTid = 'obs_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10)
    try {
      sessionStorage.setItem(ssKey, newTid)
      sessionStorage.setItem(tsKey, String(Date.now()))
    } catch (e) {}

    // 4. Start tracking IMMEDIATELY — events flow even if the session registration below fails
    beginTracking(resolvedTestId, newTid, false)

    // 5. Refresh the inactivity timer on any user interaction
    document.addEventListener('click', function () {
      try { sessionStorage.setItem(tsKey, String(Date.now())) } catch (e) {}
    }, { passive: true })

    // 6. Register session with the API async (fire-and-forget).
    //    This creates the participant record that shows up in the dashboard sessions table.
    //    If it fails, events are still tracked — the session just won't have metadata.
    var ua = navigator.userAgent
    fetch(API_URL + '/api/tests/' + resolvedTestId + '/auto-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tid: newTid,
        tester_key: testerKey,
        referrer: document.referrer || '',
        browser: detectBrowser(ua),
        device_type: /Mobi|Android/i.test(ua) ? 'mobile' : /Tablet|iPad/i.test(ua) ? 'tablet' : 'desktop'
      })
    }).catch(function () {})
  }

  // ─── CORE TRACKING ───────────────────────────────────────────────────────────
  // beginTracking is a function declaration so it is hoisted above the async
  // calls above — this is intentional.

  function beginTracking(resolvedTestId, resolvedTid, propagateParams) {
    // ── Stop sentinel (MPA support) ─────────────────────────────────────────────
    // If the moderator stopped tracking and the participant navigates to a new page
    // (e.g. in a multi-page Figma/Framer prototype), sessionStorage persists the
    // stopped state so the tracker never restarts on the new page load.
    var _stoppedKey = '__pp_stopped_' + resolvedTestId + '_' + resolvedTid
    try { if (sessionStorage.getItem(_stoppedKey)) return } catch (e) {}

    var _trackingStopped = false
    var liveTid = resolvedTid
    var lastActivityAt = Date.now()
    var idlePaused = false
    var idleCheckIntervalId = null

    function noteActivity() {
      lastActivityAt = Date.now()
    }

    function resumeAfterIdle() {
      if (!idlePaused) return
      idlePaused = false
      noteActivity()
      if (!propagateParams) {
        var newTid = 'obs_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10)
        liveTid = newTid
        try {
          sessionStorage.setItem('__pp_otid_' + resolvedTestId, newTid)
          sessionStorage.setItem('__pp_ots_' + resolvedTestId, String(Date.now()))
          sessionStorage.setItem('__pp_tid', newTid)
        } catch (e) {}
        var lsKey = OBS_LS_PREFIX + resolvedTestId
        var testerKey = null
        try {
          testerKey = localStorage.getItem(lsKey)
        } catch (e) {}
        var ua = navigator.userAgent
        fetch(API_URL + '/api/tests/' + resolvedTestId + '/auto-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tid: newTid,
            tester_key: testerKey || '',
            referrer: document.referrer || '',
            browser: detectBrowser(ua),
            device_type: /Mobi|Android/i.test(ua) ? 'mobile' : /Tablet|iPad/i.test(ua) ? 'tablet' : 'desktop'
          })
        }).catch(function () {})
      }
      if (typeof window.__ppStartReplay === 'function') {
        window.__ppStartReplay({ apiUrl: API_URL, tid: liveTid, testId: resolvedTestId })
      } else {
        var sResume = document.createElement('script')
        sResume.src = API_URL + '/snippet/replay-bundle.js'
        sResume.onload = function () {
          if (typeof window.__ppStartReplay === 'function') {
            window.__ppStartReplay({ apiUrl: API_URL, tid: liveTid, testId: resolvedTestId })
          }
        }
        document.head.appendChild(sResume)
      }
    }

    function pauseForIdle() {
      if (idlePaused || _trackingStopped) return
      idlePaused = true
      if (typeof window.__ppStopReplay === 'function') window.__ppStopReplay()
      if (!propagateParams) {
        try {
          sessionStorage.removeItem('__pp_otid_' + resolvedTestId)
          sessionStorage.removeItem('__pp_ots_' + resolvedTestId)
        } catch (e) {}
      }
    }

    idleCheckIntervalId = setInterval(function () {
      if (_trackingStopped || idlePaused) return
      if (Date.now() - lastActivityAt < SESSION_IDLE_MS) return
      pauseForIdle()
    }, 10000)

    document.addEventListener(
      'keydown',
      function () {
        if (!idlePaused || _trackingStopped) return
        resumeAfterIdle()
      },
      true
    )

    function stopTracking() {
      if (_trackingStopped) return
      _trackingStopped = true
      if (idleCheckIntervalId) {
        clearInterval(idleCheckIntervalId)
        idleCheckIntervalId = null
      }
      try { sessionStorage.setItem(_stoppedKey, '1') } catch (e) {}
      if (typeof window.__ppStopReplay === 'function') window.__ppStopReplay()
    }

    try {
      sessionStorage.setItem('__pp_tid', liveTid)
      sessionStorage.setItem('__pp_test_id', resolvedTestId)
    } catch (e) {}

    // Hook called after every tracked event — assigned by the task overlay once ready
    var _ppOnEvent = null

    // ─── Screenshot capture helper ──────────────────────────────────────────────
    var _screenshotReady = false
    var _screenshotLoading = false

    function ensureScreenshotLib(cb) {
      if (_screenshotReady) { cb(); return }
      if (_screenshotLoading) {
        var iv = setInterval(function () {
          if (_screenshotReady) { clearInterval(iv); cb() }
        }, 100)
        return
      }
      _screenshotLoading = true
      var sc = document.createElement('script')
      sc.src = API_URL + '/snippet/screenshot-bundle.js'
      sc.onload = function () { _screenshotReady = true; cb() }
      sc.onerror = function () { _screenshotReady = false; _screenshotLoading = false }
      document.head.appendChild(sc)
    }

    // --- Core send function ---
    // Sends the event immediately (without screenshot), then fires a follow-up
    // request with the screenshot attached once html2canvas finishes.
    // coords (optional): { x, y, vw, vh } — normalised pointer position
    function send(type, selector, url, metadata, coords) {
      if (idlePaused && type !== 'mousemove_batch') resumeAfterIdle()
      if (_trackingStopped) return
      if (idlePaused) return
      noteActivity()
      var cleanedUrl = cleanUrl(url || location.href)
      var ts = new Date().toISOString()
      var payload = {
        tid: liveTid,
        test_id: resolvedTestId,
        type: type,
        selector: selector || null,
        url: cleanedUrl,
        metadata: metadata || null,
        timestamp: ts
      }
      if (coords) {
        payload.x  = coords.x
        payload.y  = coords.y
        payload.vw = coords.vw
        payload.vh = coords.vh
        if (coords.doc_x != null) payload.doc_x = coords.doc_x
        if (coords.doc_y != null) payload.doc_y = coords.doc_y
        if (coords.doc_w_px != null) payload.doc_w_px = coords.doc_w_px
        if (coords.doc_h_px != null) payload.doc_h_px = coords.doc_h_px
      }

      // Capture screenshot in parallel; send event data with it in a single request.
      // If the lib isn't loaded yet, send without screenshot so events aren't delayed.
      function handleEventsResponse(r) {
        if (r && r.ok) r.json().then(function (d) { if (d && d.stop) stopTracking() }).catch(function () {})
      }

      if (_screenshotReady && typeof window.__ppCaptureScreenshot === 'function') {
        window.__ppCaptureScreenshot().then(function (dataUrl) {
          if (dataUrl) payload.screenshot = dataUrl
          fetch(API_URL + '/api/events', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          }).then(handleEventsResponse).catch(function () {})
        }).catch(function () {
          fetch(API_URL + '/api/events', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          }).then(handleEventsResponse).catch(function () {})
        })
      } else {
        fetch(API_URL + '/api/events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          keepalive: true
        }).then(handleEventsResponse).catch(function () {})
      }

      // Notify overlay (non-blocking)
      if (_ppOnEvent) _ppOnEvent(type, selector || null, cleanedUrl)
    }

    // Document-space coords for heatmaps (scroll-aware). Sampled at event time.
    function docCoords(clientX, clientY) {
      var dh = Math.max(document.documentElement.scrollHeight, window.innerHeight)
      var dw = Math.max(document.documentElement.scrollWidth, window.innerWidth)
      if (!dh || !dw) return null
      return {
        doc_x:    Math.min(1, Math.max(0, (window.scrollX + clientX) / dw)),
        doc_y:    Math.min(1, Math.max(0, (window.scrollY + clientY) / dh)),
        doc_w_px: dw,
        doc_h_px: dh
      }
    }

    // --- Extract visible text from a clicked element ---
    function getClickText(el) {
      var node = el
      for (var i = 0; i < 3; i++) {
        if (!node) break
        var text = (node.innerText || node.textContent || '').replace(/\s+/g, ' ').trim()
        if (text) return text.slice(0, 80)
        node = node.parentElement
      }
      return null
    }

    // --- Click tracking (capture phase, with normalised coordinates) ---
    document.addEventListener(
      'click',
      function (e) {
        var text = getClickText(e.target)
        var vp = {
          x: e.clientX / window.innerWidth, y: e.clientY / window.innerHeight,
          vw: window.innerWidth, vh: window.innerHeight
        }
        var dc = docCoords(e.clientX, e.clientY)
        if (dc) {
          vp.doc_x = dc.doc_x
          vp.doc_y = dc.doc_y
          vp.doc_w_px = dc.doc_w_px
          vp.doc_h_px = dc.doc_h_px
        }
        send(
          'click',
          buildSelector(e.target),
          location.href,
          text ? { text: text } : null,
          vp
        )
      },
      true
    )

    // --- Mouse-movement heatmap (batched to keep event volume low) ---
    ;(function () {
      var _moveBuf = []
      var _lastMove = 0
      document.addEventListener('mousemove', function (e) {
        var now = Date.now()
        if (now - _lastMove < 500) return   // sample at most 2 pts/s
        _lastMove = now
        var dc = docCoords(e.clientX, e.clientY)
        var pt = {
          x: +(e.clientX / window.innerWidth).toFixed(4),
          y: +(e.clientY / window.innerHeight).toFixed(4)
        }
        if (dc) {
          pt.dx = +dc.doc_x.toFixed(4)
          pt.dy = +dc.doc_y.toFixed(4)
          pt.dh = dc.doc_h_px
          pt.dw = dc.doc_w_px
        }
        _moveBuf.push(pt)
      })
      function flushMoves() {
        if (!_moveBuf.length || !liveTid) return
        if (idlePaused) {
          _moveBuf.length = 0
          return
        }
        var pts = _moveBuf.splice(0)
        send('mousemove_batch', null, location.href, { points: pts },
             { vw: window.innerWidth, vh: window.innerHeight })
      }
      setInterval(flushMoves, 10000)
      window.addEventListener('pagehide', flushMoves)
    })()

    // --- Input change tracking (selector only, never the value) ---
    document.addEventListener(
      'change',
      function (e) {
        send('input_change', buildSelector(e.target), location.href, { tagName: e.target.tagName })
      },
      true
    )

    // --- URL / navigation tracking ---
    // Delay slightly so the new page content paints before the screenshot fires.
    function trackUrl() {
      setTimeout(function () {
        send('url_change', null, location.href, null)
      }, 150)
    }

    if (propagateParams) {
      // Re-inject __tid/__test_id into SPA navigation URLs so they survive React Router
      function injectParamsIntoUrl(url) {
        if (!url) return url
        try {
          var u = new URL(url, location.href)
          u.searchParams.set('__tid', resolvedTid)
          u.searchParams.set('__test_id', resolvedTestId)
          return u.toString()
        } catch (e) { return url }
      }

      var origPush = history.pushState
      history.pushState = function (state, title, url) {
        origPush.call(history, state, title, injectParamsIntoUrl(url))
        trackUrl()
      }
      var origReplace = history.replaceState
      history.replaceState = function (state, title, url) {
        origReplace.call(history, state, title, injectParamsIntoUrl(url))
        trackUrl()
      }

      // --- Link propagation ---
      function propagateLinks() {
        var links = document.querySelectorAll('a[href]')
        for (var i = 0; i < links.length; i++) {
          try {
            var href = new URL(links[i].href)
            if (href.origin === location.origin) {
              href.searchParams.set('__tid', resolvedTid)
              href.searchParams.set('__test_id', resolvedTestId)
              links[i].href = href.toString()
            }
          } catch (e) {}
        }
      }

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', propagateLinks)
      } else {
        propagateLinks()
      }

      var observer = new MutationObserver(function (mutations) {
        for (var i = 0; i < mutations.length; i++) {
          if (mutations[i].addedNodes.length) { propagateLinks(); break }
        }
      })
      observer.observe(document.documentElement, { childList: true, subtree: true })
    } else {
      // Observational mode: track URL changes without injecting params
      var origPushObs = history.pushState
      history.pushState = function (state, title, url) {
        origPushObs.call(history, state, title, url)
        trackUrl()
      }
      var origReplaceObs = history.replaceState
      history.replaceState = function (state, title, url) {
        origReplaceObs.call(history, state, title, url)
        trackUrl()
      }
    }

    window.addEventListener('popstate', trackUrl)
    window.addEventListener('hashchange', trackUrl)

    // --- Public API ---
    window.ProtoPulse = {
      apiUrl: API_URL,
      track: function (eventName, metadata) {
        send(eventName, null, location.href, metadata || null)
      }
    }

    // Track initial pageview
    send('url_change', null, location.href, null)

    // ─── SESSION REPLAY ────────────────────────────────────────────────────────
    // Starts automatically — no consent banner needed for recruited usability tests.
    // All inputs are masked (maskAllInputs: true). No audio/video is captured.

    var s = document.createElement('script')
    s.src = API_URL + '/snippet/replay-bundle.js'
    s.onload = function () {
      if (_trackingStopped) return // stopped before bundle finished loading
      if (typeof window.__ppStartReplay === 'function') {
        window.__ppStartReplay({ apiUrl: API_URL, tid: liveTid, testId: resolvedTestId })
      }
    }
    document.head.appendChild(s)

    // ─── SCREENSHOT CAPTURE ──────────────────────────────────────────────────
    // Pre-load html2canvas so it's ready before the first click event fires.
    ensureScreenshotLib(function () {})

    // ─── PARTICIPANT TASK OVERLAY ──────────────────────────────────────────────
    // For scenario tests only. Shows the current task in a floating card and plays
    // a success animation when the participant completes each step goal.
    // Observational tests skip this entirely (handled by the test_type check below).

    ;(function () {
      var steps = []
      var currentIdx = 0
      var completing = false // guard double-fire
      var overlayEl = null

      // Mirror of server matchesGoal — kept in sync manually.
      // AND logic: when both selector and url_pattern are set, both must match.
      function clientMatchesGoal(type, sel, url, def) {
        if (!def || !def.type) return false
        if (type !== def.type) return false
        var hasSel = def.selector && def.selector !== ''
        var hasUrl = def.url_pattern && def.url_pattern !== ''
        if (!hasSel && !hasUrl) return true
        if (hasSel && hasUrl) {
          return sel === def.selector && !!url && url.indexOf(def.url_pattern) !== -1
        }
        if (hasSel) return sel === def.selector
        return !!url && url.indexOf(def.url_pattern) !== -1
      }

      // Inject CSS once
      function injectStyles() {
        if (document.getElementById('__pp-ov-css')) return
        var st = document.createElement('style')
        st.id = '__pp-ov-css'
        st.textContent = [
          '#__pp-ov{',
            'position:fixed;bottom:16px;right:16px;width:272px;z-index:2147483640;',
            'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;',
            'border-radius:14px;overflow:hidden;',
            'box-shadow:0 12px 40px rgba(0,0,0,.35),0 2px 8px rgba(0,0,0,.2);',
            'transition:opacity .35s,transform .35s cubic-bezier(.22,1,.36,1);',
          '}',
          '#__pp-ov.__pp-hidden{opacity:0;transform:translateY(12px);pointer-events:none}',
          '.__pp-task{padding:14px 16px 16px;background:#18181b;color:#fff;animation:__ppSlideIn .4s cubic-bezier(.22,1,.36,1)}',
          '.__pp-step-lbl{font-size:10px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:#52525b;margin-bottom:5px}',
          '.__pp-task-title{font-size:13px;font-weight:700;color:#fff;margin-bottom:7px;line-height:1.35}',
          '.__pp-divider{height:1px;background:rgba(255,255,255,.08);margin-bottom:9px}',
          '.__pp-task-body{font-size:12.5px;line-height:1.55;color:#a1a1aa}',
          '.__pp-no-task{padding:12px 16px;background:#18181b;color:#52525b;font-size:12px;text-align:center}',
          /* success panel */
          '.__pp-success{padding:22px 16px 20px;background:#15803d;color:#fff;',
            'display:flex;flex-direction:column;align-items:center;text-align:center;',
            'position:relative;overflow:hidden;animation:__ppSlideIn .3s cubic-bezier(.22,1,.36,1)',
          '}',
          '.__pp-check-wrap{width:52px;height:52px;margin-bottom:11px;',
            'animation:__ppCheckPop .45s cubic-bezier(.34,1.56,.64,1) .05s both',
          '}',
          '.__pp-check-svg path{stroke-dasharray:29;stroke-dashoffset:29;animation:__ppDrawCheck .4s cubic-bezier(.22,1,.36,1) .2s forwards}',
          '.__pp-ok-title{font-size:15px;font-weight:700;margin-bottom:3px}',
          '.__pp-ok-sub{font-size:11.5px;color:rgba(255,255,255,.7)}',
          /* particles */
          '.__pp-pt{position:absolute;width:7px;height:7px;border-radius:50%;',
            'top:50%;left:50%;',
            'animation:__ppFly .65s ease-out both',
          '}',
          /* all-done panel */
          '.__pp-done{padding:18px 16px;background:#18181b;color:#fff;',
            'display:flex;flex-direction:column;align-items:center;text-align:center;',
            'animation:__ppSlideIn .4s cubic-bezier(.22,1,.36,1)',
          '}',
          '.__pp-done-emoji{font-size:28px;margin-bottom:8px}',
          '.__pp-done-title{font-size:14px;font-weight:700;margin-bottom:4px}',
          '.__pp-done-sub{font-size:12px;color:#71717a}',
          /* keyframes */
          '@keyframes __ppSlideIn{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}',
          '@keyframes __ppCheckPop{from{transform:scale(0) rotate(-20deg)}to{transform:scale(1) rotate(0)}}',
          '@keyframes __ppDrawCheck{to{stroke-dashoffset:0}}',
          '@keyframes __ppFly{0%{transform:translate(-50%,-50%) scale(1);opacity:1}100%{transform:translate(calc(-50% + var(--dx)),calc(-50% + var(--dy))) scale(0);opacity:0}}',
          '@keyframes __ppFadeOut{to{opacity:0;transform:translateY(-8px)}}'
        ].join('')
        document.head.appendChild(st)
      }

      // Build a success panel with checkmark + particles
      function buildSuccessPanel(isLast) {
        var div = document.createElement('div')
        div.className = '__pp-success'

        // Particles — 8 dots fanned around the center
        var ptColors = ['#4ade80','#86efac','#fde68a','#fbbf24','#a5f3fc','#67e8f9','#c4b5fd','#f9a8d4']
        var angles = [0,45,90,135,180,225,270,315]
        for (var i = 0; i < 8; i++) {
          var pt = document.createElement('div')
          pt.className = '__pp-pt'
          var rad = angles[i] * Math.PI / 180
          pt.style.cssText = [
            '--dx:' + Math.round(Math.cos(rad) * 44) + 'px',
            '--dy:' + Math.round(Math.sin(rad) * 44) + 'px',
            'background:' + ptColors[i],
            'animation-delay:' + (i * 0.03) + 's'
          ].join(';')
          div.appendChild(pt)
        }

        // Checkmark SVG
        var wrap = document.createElement('div')
        wrap.className = '__pp-check-wrap'
        wrap.innerHTML = '<svg viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg" class="__pp-check-svg">' +
          '<circle cx="14" cy="14" r="13" fill="rgba(255,255,255,.15)"/>' +
          '<path d="M8 14.5 L12.5 19 L20.5 10" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>' +
          '</svg>'
        div.appendChild(wrap)

        var title = document.createElement('div')
        title.className = '__pp-ok-title'
        title.textContent = isLast ? 'All done!' : 'Nice work!'
        div.appendChild(title)

        var sub = document.createElement('div')
        sub.className = '__pp-ok-sub'
        sub.textContent = isLast ? 'You\'ve completed all tasks.' : 'Moving to the next task\u2026'
        div.appendChild(sub)

        return div
      }

      // Build a task panel for the given step
      function buildTaskPanel(step, total) {
        var div = document.createElement('div')
        div.className = '__pp-task'

        if (!step.task && !step.title) {
          var empty = document.createElement('div')
          empty.className = '__pp-no-task'
          empty.textContent = 'Complete the task to continue.'
          div.appendChild(empty)
          return div
        }

        var lbl = document.createElement('div')
        lbl.className = '__pp-step-lbl'
        lbl.textContent = 'Task ' + step.order_index + ' of ' + total
        div.appendChild(lbl)

        if (step.title) {
          var ttl = document.createElement('div')
          ttl.className = '__pp-task-title'
          ttl.textContent = step.title
          div.appendChild(ttl)
        }

        if (step.task) {
          if (step.title) {
            var hr = document.createElement('div')
            hr.className = '__pp-divider'
            div.appendChild(hr)
          }
          var body = document.createElement('div')
          body.className = '__pp-task-body'
          body.textContent = step.task
          div.appendChild(body)
        }

        return div
      }

      // Build the "all tasks complete" panel
      function buildDonePanel() {
        var div = document.createElement('div')
        div.className = '__pp-done'
        var emoji = document.createElement('div')
        emoji.className = '__pp-done-emoji'
        emoji.textContent = '\uD83C\uDF89'
        div.appendChild(emoji)
        var ttl = document.createElement('div')
        ttl.className = '__pp-done-title'
        ttl.textContent = 'All tasks complete'
        div.appendChild(ttl)
        var sub = document.createElement('div')
        sub.className = '__pp-done-sub'
        sub.textContent = 'Thanks for participating!'
        div.appendChild(sub)
        return div
      }

      function showStep(idx) {
        if (!overlayEl) return
        overlayEl.innerHTML = ''
        overlayEl.classList.remove('__pp-hidden')
        overlayEl.appendChild(buildTaskPanel(steps[idx], steps.length))
      }

      function triggerSuccess(idx) {
        if (!overlayEl) return
        var isLast = idx >= steps.length - 1
        overlayEl.innerHTML = ''
        overlayEl.appendChild(buildSuccessPanel(isLast))

        setTimeout(function () {
          if (!overlayEl) return
          if (isLast) {
            // Stop replay recording — all tasks complete
            if (typeof window.__ppStopReplay === 'function') window.__ppStopReplay()
            // Show done panel, then fade out
            overlayEl.innerHTML = ''
            overlayEl.appendChild(buildDonePanel())
            setTimeout(function () {
              if (overlayEl) {
                overlayEl.style.animation = '__ppFadeOut .5s ease forwards'
                setTimeout(function () {
                  if (overlayEl && overlayEl.parentNode) overlayEl.parentNode.removeChild(overlayEl)
                }, 500)
              }
            }, 3500)
          } else {
            // Advance to next task
            currentIdx = idx + 1
            completing = false
            showStep(currentIdx)
          }
        }, 2000)
      }

      // Fetch scenario tasks and boot the overlay.
      // Pass ?tid= so the server can signal stop: true if the moderator
      // has already halted tracking for this participant.
      fetch(API_URL + '/api/tests/' + resolvedTestId + '/tasks?tid=' + encodeURIComponent(liveTid))
        .then(function (r) { return r.json() })
        .then(function (data) {
          // Moderator stopped tracking before participant opened the URL
          if (data && data.stop) { stopTracking(); return }

          // ── Single-goal: stop replay the moment the goal fires ────────────────
          if (data.test_type === 'single' && data.goal_event && data.goal_event.type) {
            _ppOnEvent = function (type, sel, url) {
              if (clientMatchesGoal(type, sel, url, data.goal_event)) {
                _ppOnEvent = null // unhook so it only fires once
                if (typeof window.__ppStopReplay === 'function') window.__ppStopReplay()
              }
            }
            return
          }

          // Observational and unrecognised types: no overlay needed
          if (data.test_type !== 'scenario') return

          steps = (data.steps || []).filter(function (s) { return s.task || s.title })
          if (!steps.length) return

          injectStyles()
          overlayEl = document.createElement('div')
          overlayEl.id = '__pp-ov'
          overlayEl.className = '__pp-hidden'

          function mount() { document.body.appendChild(overlayEl); showStep(0) }
          if (document.body) mount()
          else document.addEventListener('DOMContentLoaded', mount)

          // Wire up the event hook so every tracked event is checked against the current step
          _ppOnEvent = function (type, sel, url) {
            if (completing || currentIdx >= steps.length) return
            var step = steps[currentIdx]
            if (clientMatchesGoal(type, sel, url, step.goal_event)) {
              completing = true
              triggerSuccess(currentIdx)
            }
          }
        })
        .catch(function () {})
    })()
  }

})()
