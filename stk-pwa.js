/* Stockist web app (PWA) bridge for iPhone and browsers: app mode, screen fit, camera through getUserMedia,
   barcode reading with StkEAN (or the browser BarcodeDetector when present), offline service worker. */
(function () {
  'use strict';
  window.STK_APP = true;
  window.STK_PWA = true;
  document.documentElement.setAttribute('dir', 'rtl');
  document.documentElement.setAttribute('lang', 'ar');

  // ---- fit the 390x844 design inside the safe area ----
  function insets() {
    var el = document.getElementById('stk-insets');
    if (!el) { el = document.createElement('div'); el.id = 'stk-insets'; document.body.appendChild(el); }
    var cs = getComputedStyle(el);
    return { t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0, b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0 };
  }
  function fit() {
    var st = document.getElementById('stk-stage'); if (!st) return;
    var i = insets();
    var w = window.innerWidth - i.l - i.r, h = window.innerHeight - i.t - i.b;
    var k = Math.min(w / 390, h / 844);
    st.style.left = (i.l + w / 2) + 'px'; st.style.top = (i.t + h / 2) + 'px';
    st.style.transform = 'translate(-50%, -50%) scale(' + k + ')';
  }
  window.addEventListener('resize', fit);
  window.addEventListener('orientationchange', function () { setTimeout(fit, 300); });
  document.addEventListener('DOMContentLoaded', function () { fit(); setTimeout(fit, 300); });

  // ---- barcodes known to the catalog (UPC-A is stored with 12 digits) ----
  var known = null;
  function normalize(code) {
    if (!known) { known = {}; try { (window.STK_CATALOG.rows || []).forEach(function (r) { known[r[0]] = 1; }); } catch (e) {} }
    if (code.length === 13 && code[0] === '0' && !known[code] && known[code.slice(1)]) return code.slice(1);
    return code;
  }

  // ---- camera ----
  var video = null, stream = null, running = false, timer = 0, canvas = null, ctx = null, detector = null, last = { c: '', n: 0 };
  function deliver(code) {
    var lg = window.__stkLogic;
    if (lg && running) { try { lg.onCode(normalize(code)); } catch (e) { console.error(e); } }
  }
  function ensureVideo() {
    if (video) return video;
    video = document.createElement('video');
    video.id = 'stk-video';
    video.setAttribute('playsinline', ''); video.setAttribute('muted', ''); video.muted = true; video.autoplay = true;
    document.body.insertBefore(video, document.body.firstChild);
    return video;
  }
  function makeDetector() {
    try {
      if ('BarcodeDetector' in window) return new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'] });
    } catch (e) {}
    return null;
  }
  function tick() {
    if (!running || !video || video.readyState < 2) { timer = setTimeout(tick, 150); return; }
    if (detector) {
      detector.detect(video).then(function (list) {
        if (list && list.length) deliver(String(list[0].rawValue || ''));
      }).catch(function () { detector = null; }).then(function () { if (running) timer = setTimeout(tick, 120); });
      return;
    }
    var vw = video.videoWidth, vh = video.videoHeight;
    if (!vw || !vh) { timer = setTimeout(tick, 150); return; }
    // central region of the frame, at camera resolution (max 1000 px wide)
    var cw = Math.round(vw * 0.8), ch = Math.round(vh * 0.6), sx = Math.round((vw - cw) / 2), sy = Math.round((vh - ch) / 2);
    var k = Math.min(1, 1000 / cw), w = Math.round(cw * k), h = Math.round(ch * k);
    if (!canvas) { canvas = document.createElement('canvas'); ctx = canvas.getContext('2d', { willReadFrequently: true }); }
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    try {
      ctx.drawImage(video, sx, sy, cw, ch, 0, 0, w, h);
      var px = ctx.getImageData(0, 0, w, h).data, g = new Uint8Array(w * h);
      for (var i = 0, j = 0; i < g.length; i++, j += 4) g[i] = (px[j] * 77 + px[j + 1] * 150 + px[j + 2] * 29) >> 8;
      var code = window.StkEAN.scanImage(g, w, h);
      if (code) {
        // a code read on several lines of one frame is delivered; a weak read needs a second frame
        if (code === last.c) { last.n++; } else { last = { c: code, n: 1 }; }
        deliver(code);
      }
    } catch (e) { console.error(e); }
    timer = setTimeout(tick, 110);
  }

  window.stkCam = {
    native: true,
    start: function () {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return Promise.resolve('unsupported');
      var v = ensureVideo();
      return navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } })
        .then(function (s) {
          stream = s; v.srcObject = s;
          return v.play().catch(function () {});
        })
        .then(function () {
          detector = makeDetector(); running = true; last = { c: '', n: 0 };
          document.documentElement.classList.add('stk-cam-on');
          clearTimeout(timer); timer = setTimeout(tick, 200);
          return true;
        })
        .catch(function (e) {
          var n = e && e.name;
          return (n === 'NotAllowedError' || n === 'SecurityError') ? 'denied' : 'error';
        });
    },
    stop: function () {
      running = false; clearTimeout(timer);
      document.documentElement.classList.remove('stk-cam-on');
      if (stream) { try { stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {} stream = null; }
      if (video) { try { video.srcObject = null; } catch (e) {} }
      return Promise.resolve();
    },
    test: function (code) { deliver(code); }
  };

  // stop the camera when the app goes to the background (iOS keeps the light on otherwise)
  document.addEventListener('visibilitychange', function () {
    if (document.hidden && running) { var lg = window.__stkLogic; if (lg && lg.camStop) lg.camStop(); else window.stkCam.stop(); }
  });

  // ---- offline ----
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
  }
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}
})();
