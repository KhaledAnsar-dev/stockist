/* Stockist offline cache. The app files are cached on install; fonts are cached when first loaded. */
var VER = 'stk-feae8750d244';
var FILES = ["./", "app.css", "apple-touch-icon.png", "catalog.js", "icon-192.png", "icon-512.png", "index.html", "logo.png", "manifest.webmanifest", "react-dom.production.min.js", "react.production.min.js", "stk-ean.js", "stk-pwa.js", "support.js"];
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VER).then(function (c) { return c.addAll(FILES); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k.indexOf('stk-') === 0 && k !== VER; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var req = e.request; if (req.method !== 'GET') return;
  var url = new URL(req.url);
  var font = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (url.origin !== location.origin && !font) return;
  e.respondWith(caches.match(req, { ignoreSearch: !font }).then(function (hit) {
    if (hit) return hit;
    return fetch(req).then(function (res) {
      if (res && (res.ok || res.type === 'opaque')) { var cp = res.clone(); caches.open(VER).then(function (c) { c.put(req, cp); }); }
      return res;
    }).catch(function () { return req.mode === 'navigate' ? caches.match('./') : undefined; });
  }));
});
