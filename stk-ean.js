/* Stockist barcode reader for the web version: EAN-13 / UPC-A / EAN-8 from grayscale scan lines.
   No external library. Works on horizontal and vertical lines, both directions. */
(function (root) {
  'use strict';
  var L = [[3, 2, 1, 1], [2, 2, 2, 1], [2, 1, 2, 2], [1, 4, 1, 1], [1, 1, 3, 2], [1, 2, 3, 1], [1, 1, 1, 4], [1, 3, 1, 2], [1, 2, 1, 3], [3, 1, 1, 2]];
  var G = L.map(function (p) { return p.slice().reverse(); });
  var PAR = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];
  var RAWW = 0.35;
  var MAXERR = 0.7; // mean squared module error allowed per digit

  function digit(r, i, unit, set) {
    var best = -1, bErr = 1e9, bSet = '';
    for (var s = 0; s < set.length; s++) {
      var tab = set[s] === 'L' ? L : G;
      for (var d = 0; d < 10; d++) {
        var p = tab[d], e = 0;
        var t1 = (r[i] + r[i + 1]) / unit - p[0] - p[1], t2 = (r[i + 1] + r[i + 2]) / unit - p[1] - p[2], raw = 0;
        for (var k = 0; k < 4; k++) { var x = r[i + k] / unit - p[k]; raw += x * x; }
        e = t1 * t1 + t2 * t2 + RAWW * raw;
        if (e < bErr) { bErr = e; best = d; bSet = set[s]; }
      }
    }
    return { d: best, e: bErr, s: bSet };
  }
  function guard(r, i, n, unit) { for (var k = 0; k < n; k++) { var m = r[i + k] / unit; if (m < 0.4 || m > 1.9) return false; } return true; }
  function sum(r, i, n) { var t = 0; for (var k = 0; k < n; k++) t += r[i + k]; return t; }
  function ck13(c) { var t = 0; for (var i = 0; i < 12; i++) t += (+c[i]) * (i % 2 ? 3 : 1); return (10 - t % 10) % 10 === +c[12]; }
  function ck8(c) { var t = 0; for (var i = 0; i < 7; i++) t += (+c[i]) * (i % 2 ? 1 : 3); return (10 - t % 10) % 10 === +c[7]; }

  // r: run widths, starting with a dark run at index i (runs alternate dark/light)
  function try13(r, i) {
    if (i + 59 > r.length) return null;
    var tot = sum(r, i, 59), unit = tot / 95;
    if (i > 0 && r[i - 1] < unit * 3) return null; // quiet zone before
    if (!guard(r, i, 3, unit) || !guard(r, i + 27, 5, unit) || !guard(r, i + 56, 3, unit)) return null;
    var out = '', par = '', j = i + 3;
    for (var a = 0; a < 6; a++, j += 4) {
      var u = sum(r, j, 4) / 7, g = digit(r, j, u, 'LG'); if (g.e > MAXERR) return null; out += g.d; par += g.s;
    }
    j = i + 32;
    for (var b = 0; b < 6; b++, j += 4) {
      var u2 = sum(r, j, 4) / 7, h = digit(r, j, u2, 'L'); if (h.e > MAXERR) return null; out += h.d;
    }
    var f = PAR.indexOf(par); if (f < 0) return null;
    var code = f + out; return ck13(code) ? code : null;
  }
  function try8(r, i) {
    if (i + 43 > r.length) return null;
    var tot = sum(r, i, 43), unit = tot / 67;
    if (i > 0 && r[i - 1] < unit * 3) return null;
    if (!guard(r, i, 3, unit) || !guard(r, i + 19, 5, unit) || !guard(r, i + 40, 3, unit)) return null;
    var out = '', j = i + 3;
    for (var a = 0; a < 4; a++, j += 4) { var u = sum(r, j, 4) / 7, g = digit(r, j, u, 'L'); if (g.e > MAXERR) return null; out += g.d; }
    j = i + 24;
    for (var b = 0; b < 4; b++, j += 4) { var u2 = sum(r, j, 4) / 7, h = digit(r, j, u2, 'L'); if (h.e > MAXERR) return null; out += h.d; }
    return ck8(out) ? out : null;
  }

  // line: Float32Array/Array of gray values. Returns array of codes found.
  function runsOf(line) {
    var n = line.length, sm = new Float32Array(n), i, j;
    for (i = 0; i < n; i++) sm[i] = line[i];
    var W = Math.max(12, Math.round(n / 14)), gmn = 255, gmx = 0;
    for (i = 0; i < n; i++) { if (sm[i] < gmn) gmn = sm[i]; if (sm[i] > gmx) gmx = sm[i]; }
    if (gmx - gmn < 30) return null;
    // local min / max over +-W (block maxima, O(n))
    var B = W, nb = Math.ceil(n / B), bmn = new Float32Array(nb), bmx = new Float32Array(nb);
    for (j = 0; j < nb; j++) { var lo = 255, hi = 0; for (i = j * B; i < Math.min(n, (j + 1) * B); i++) { if (sm[i] < lo) lo = sm[i]; if (sm[i] > hi) hi = sm[i]; } bmn[j] = lo; bmx[j] = hi; }
    var edges = [], state = null, prevD = 0, lastCross = 0;
    for (i = 0; i < n; i++) {
      var bj = Math.floor(i / B), lo2 = 255, hi2 = 0;
      for (j = Math.max(0, bj - 1); j <= Math.min(nb - 1, bj + 1); j++) { if (bmn[j] < lo2) lo2 = bmn[j]; if (bmx[j] > hi2) hi2 = bmx[j]; }
      var amp = hi2 - lo2, mid = (hi2 + lo2) / 2, hy = Math.max(3, amp * 0.04), d = sm[i] - mid;
      if (amp < 24) { d = 1; }
      if (i > 0 && (d < 0) !== (prevD < 0)) lastCross = i - 1 + prevD / (prevD - d || 1);
      prevD = d;
      var dark = state;
      if (sm[i] < mid - hy && amp >= 24) dark = true; else if (sm[i] > mid + hy || amp < 24) dark = false;
      if (state === null) { state = dark; edges.push({ x: 0, dark: dark }); continue; }
      if (dark !== state) { state = dark; edges.push({ x: lastCross, dark: dark }); }
    }
    if (edges.length < 30) return null;
    var runs = [];
    for (i = 0; i < edges.length; i++) runs.push((i + 1 < edges.length ? edges[i + 1].x : n) - edges[i].x);
    return { runs: runs, firstDark: edges[0].dark };
  }
  function scanRuns(ro) {
    var r = ro.runs, start = ro.firstDark ? 0 : 1, found = [];
    for (var i = start; i < r.length; i += 2) {
      var c = try13(r, i) || try8(r, i);
      if (c) { found.push(c); i += 40; }
    }
    return found;
  }
  function scanLine(line) {
    var ro = runsOf(line); if (!ro) return [];
    var f = scanRuns(ro);
    if (!f.length) {
      var rv = { runs: ro.runs.slice().reverse(), firstDark: (ro.runs.length % 2 === 1) ? ro.firstDark : !ro.firstDark };
      f = scanRuns(rv);
    }
    return f;
  }
  // gray: Uint8Array w*h. Scans horizontal and vertical lines; returns the code read on >= 2 lines, or null.
  function scanImage(gray, w, h) {
    var votes = {}, best = null, bestN = 0, line, x, y, k;
    function vote(list) { for (var q = 0; q < list.length; q++) { var c = list[q]; votes[c] = (votes[c] || 0) + 1; if (votes[c] > bestN) { bestN = votes[c]; best = c; } } }
    var NH = 21; line = new Float32Array(w);
    for (k = 0; k < NH; k++) { y = Math.round(h * (0.2 + 0.6 * k / (NH - 1))); for (x = 0; x < w; x++) line[x] = (gray[(y - 1) * w + x] + gray[y * w + x] + gray[(y + 1) * w + x]) / 3; vote(scanLine(line)); if (bestN >= 3) return best; }
    var NV = 15; line = new Float32Array(h);
    for (k = 0; k < NV; k++) { x = Math.round(w * (0.2 + 0.6 * k / (NV - 1))); for (y = 0; y < h; y++) line[y] = (gray[y * w + x - 1] + gray[y * w + x] + gray[y * w + x + 1]) / 3; vote(scanLine(line)); if (bestN >= 3) return best; }
    return bestN >= 2 ? best : null;
  }
  var api = { scanLine: scanLine, scanImage: scanImage };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.StkEAN = api;
})(this);
