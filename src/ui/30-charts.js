/* ============================================================================
   CHARTS — drawn as SVG at the container's real width (text stays 11px on a
   phone or a wide screen), coloured from the theme tokens, redrawn on resize.
   ========================================================================== */
(function (UI) {
  'use strict';
  var h = UI.h, s = UI.s, U = FPE.util;

  function niceStep(span, ticks) {
    var raw = span / Math.max(1, ticks), mag = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1e-9)))), n = raw / mag;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
  }
  function yScale(lo, hi, ticks) {
    if (hi <= lo) { hi = lo + 1; }
    var step = niceStep(hi - lo, ticks || 5);
    var a = Math.floor(lo / step) * step, b = Math.ceil(hi / step) * step;
    var list = []; for (var v = a; v <= b + step / 2; v += step) list.push(Math.round(v / step) * step);
    return { lo: a, hi: b, ticks: list };
  }
  function moneyTick(v) {
    var a = Math.abs(v), sign = v < 0 ? '−' : '';
    if (a >= 1e6) return sign + '$' + (a / 1e6).toFixed(a % 1e6 ? 1 : 0) + 'M';
    if (a >= 1000) return sign + '$' + (a / 1000).toFixed(a % 1000 ? 1 : 0).replace(/\.0$/, '') + 'K';
    return sign + '$' + Math.round(a);
  }
  function path(xs, ys) {
    var d = '';
    for (var i = 0; i < xs.length; i++) { if (ys[i] == null || !isFinite(ys[i])) continue; d += (d ? 'L' : 'M') + xs[i].toFixed(1) + ',' + ys[i].toFixed(1); }
    return d;
  }
  function band(xs, lo, hi) {
    var d = '';
    for (var i = 0; i < xs.length; i++) d += (i ? 'L' : 'M') + xs[i].toFixed(1) + ',' + hi[i].toFixed(1);
    for (var j = xs.length - 1; j >= 0; j--) d += 'L' + xs[j].toFixed(1) + ',' + lo[j].toFixed(1);
    return d + 'Z';
  }

  /* Frame shared by the time charts: axes, grid, year ticks, target marker.
     opts: { start, months, lo, hi, height, target, yFormat } */
  function frame(width, opts) {
    var H = opts.height || 300, ml = 58, mr = 18, mt = 22, mb = 28;
    var W = Math.max(280, width);
    var ys = yScale(opts.lo, opts.hi, H < 220 ? 4 : 5);
    var X = function (k) { return ml + (W - ml - mr) * (k / Math.max(1, opts.months - 1)); };
    var Y = function (v) { return mt + (H - mt - mb) * (1 - (v - ys.lo) / (ys.hi - ys.lo)); };
    var svg = s('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, role: 'img' });
    ys.ticks.forEach(function (v) {
      svg.appendChild(s('line', { x1: ml, x2: W - mr, y1: Y(v), y2: Y(v), style: 'stroke:' + (v === 0 ? 'var(--chart-axis)' : 'var(--chart-grid)') + ';stroke-width:1' }));
      svg.appendChild(s('text', { x: ml - 8, y: Y(v) + 4, 'text-anchor': 'end' }, (opts.yFormat || moneyTick)(v)));
    });
    var years = Math.ceil(opts.months / 12), every = W < 520 ? (years > 10 ? 4 : 2) : (years > 16 ? 2 : 1);
    for (var k = 0; k < opts.months; k++) {
      var t = opts.start + k;
      if (U.monthOf(t) !== 0) continue;
      var yr = U.yearOf(t);
      svg.appendChild(s('line', { x1: X(k), x2: X(k), y1: H - mb, y2: H - mb + 4, style: 'stroke:var(--chart-axis)' }));
      if ((yr % every) === 0) svg.appendChild(s('text', { x: X(k), y: H - mb + 17, 'text-anchor': 'middle' }, String(yr)));
    }
    svg.appendChild(s('line', { x1: ml, x2: W - mr, y1: H - mb, y2: H - mb, style: 'stroke:var(--chart-axis)' }));
    if (opts.target != null && opts.target >= opts.start && opts.target < opts.start + opts.months) {
      var tx = X(opts.target - opts.start);
      svg.appendChild(s('line', { x1: tx, x2: tx, y1: mt - 8, y2: H - mb, style: 'stroke:var(--ink-2);stroke-width:1;stroke-dasharray:2 3' }));
      svg.appendChild(s('text', { x: tx + (tx > W - 120 ? -6 : 6), y: mt - 8, 'text-anchor': tx > W - 120 ? 'end' : 'start', style: 'fill:var(--ink-2);font-weight:600' },
        'Target · ' + U.label(opts.target)));
    }
    return { svg: svg, X: X, Y: Y, W: W, H: H, ml: ml, mr: mr, mt: mt, mb: mb, ys: ys };
  }

  /* The income fan: the spread of simulated futures, the chosen-confidence
     case as a bold line, the calm base run dashed, and what you need. */
  function fan(container, o) {
    var width = container.clientWidth || 760;
    var f = o.fan, n = f.t.length, conv = o.convert || function (v) { return v; };
    var q = 'p' + Math.round(o.hq * 100);
    var all = [0];
    ['p10', 'p90', q].forEach(function (k) { f[k].forEach(function (v, i) { all.push(conv(v, i)); }); });
    if (o.base) o.base.forEach(function (v, i) { all.push(conv(v, i)); });
    if (o.need) o.need.forEach(function (v, i) { all.push(conv(v, i)); });
    var lo = Math.min.apply(null, all), hi = Math.max.apply(null, all) * 1.04;
    var fr = frame(width, { start: o.start, months: n, lo: lo, hi: hi, height: o.height || 300, target: o.target });
    var xs = f.t.map(function (k) { return fr.X(k); });
    function ys(key) { return f[key].map(function (v, i) { return fr.Y(conv(v, i)); }); }
    fr.svg.insertBefore(s('path', { d: band(xs, ys('p10'), ys('p90')), style: 'fill:var(--band-outer);stroke:none' }), fr.svg.firstChild);
    fr.svg.insertBefore(s('path', { d: band(xs, ys('p20'), ys('p80')), style: 'fill:var(--band-inner);stroke:none' }), fr.svg.childNodes[1]);
    if (o.need) fr.svg.appendChild(s('path', { d: path(xs, o.need.map(function (v, i) { return fr.Y(conv(v, i)); })), style: 'fill:none;stroke:var(--chart-need);stroke-width:1.5;stroke-dasharray:1 3;stroke-linecap:round' }));
    if (o.base) fr.svg.appendChild(s('path', { d: path(xs, o.base.map(function (v, i) { return fr.Y(conv(v, i)); })), style: 'fill:none;stroke:var(--chart-base);stroke-width:1.5;stroke-dasharray:5 4' }));
    fr.svg.appendChild(s('path', { d: path(xs, ys('p50')), style: 'fill:none;stroke:var(--accent);stroke-width:1.3;opacity:0.55' }));
    fr.svg.appendChild(s('path', { d: path(xs, ys(q)), style: 'fill:none;stroke:var(--accent);stroke-width:2.6;stroke-linejoin:round' }));
    if (o.target != null) {
      var k = o.target - o.start;
      if (k >= 0 && k < n) {
        var yv = conv(f[q][k], k), cx = fr.X(k), cy = fr.Y(yv);
        fr.svg.appendChild(s('circle', { cx: cx, cy: cy, r: 4.5, style: 'fill:var(--surface);stroke:var(--accent);stroke-width:2.5' }));
        var right = cx < fr.W - 150;
        fr.svg.appendChild(s('text', { x: cx + (right ? 9 : -9), y: cy + 16, 'text-anchor': right ? 'start' : 'end', style: 'fill:var(--accent);font-weight:700;font-size:12px' }, UI.money(yv) + '/mo'));
      }
    }
    UI.clear(container).appendChild(fr.svg);
  }

  /* Several lines (and optional bands) over months.
     o: { start, months, series: [{values, color, width, dash, label}], bands: [{lo, hi, color}], height, target, floor } */
  function lines(container, o) {
    var width = container.clientWidth || 760, all = [0];
    o.series.forEach(function (sr) { sr.values.forEach(function (v) { if (v != null && isFinite(v)) all.push(v); }); });
    (o.bands || []).forEach(function (b) { b.lo.forEach(function (v) { all.push(v); }); b.hi.forEach(function (v) { all.push(v); }); });
    var lo = Math.min.apply(null, all), hi = Math.max.apply(null, all) * 1.05;
    var fr = frame(width, { start: o.start, months: o.months, lo: lo, hi: hi, height: o.height || 240, target: o.target });
    (o.bands || []).forEach(function (b) {
      var xs = b.lo.map(function (v, i) { return fr.X(b.t ? b.t[i] : i); });
      fr.svg.insertBefore(s('path', { d: band(xs, b.lo.map(fr.Y), b.hi.map(fr.Y)), style: 'fill:' + b.color + ';stroke:none' }), fr.svg.firstChild);
    });
    o.series.forEach(function (sr) {
      var xs = sr.values.map(function (v, i) { return fr.X(sr.t ? sr.t[i] : i); });
      fr.svg.appendChild(s('path', { d: path(xs, sr.values.map(function (v) { return v == null ? null : fr.Y(v); })),
        style: 'fill:none;stroke:' + sr.color + ';stroke-width:' + (sr.width || 2) + (sr.dash ? ';stroke-dasharray:' + sr.dash : '') + ';stroke-linejoin:round' }));
    });
    UI.clear(container).appendChild(fr.svg);
  }

  /* "What this rests on": one row per input, a bar from its low case to its
     high case around your plan's result. Built in HTML so labels wrap. */
  function tornado(container, items, base, fmt, onPick) {
    var max = 1e-9;
    items.forEach(function (x) { max = Math.max(max, Math.abs(x.down), Math.abs(x.up)); });
    var rows = items.map(function (x) {
      var lo = Math.min(x.down, x.up, 0), hi = Math.max(x.down, x.up, 0);
      var left = 50 + 34 * lo / max, right = 50 + 34 * hi / max;          // bars use the middle 68%; labels sit outside them
      var track = h('div', { style: { position: 'relative', height: '20px', overflow: 'hidden' } },
        h('div', { style: { position: 'absolute', left: '50%', top: '0', bottom: '0', width: '1px', background: 'var(--ink-2)' } }),
        lo < 0 ? h('div', { style: { position: 'absolute', left: left + '%', width: (50 - left) + '%', top: '4px', height: '12px', background: 'var(--crit)', opacity: '0.75', borderRadius: '2px 0 0 2px' } }) : null,
        hi > 0 ? h('div', { style: { position: 'absolute', left: '50%', width: (right - 50) + '%', top: '4px', height: '12px', background: 'var(--good)', opacity: '0.75', borderRadius: '0 2px 2px 0' } }) : null,
        lo < 0 ? h('span', { style: { position: 'absolute', right: (100 - left + 1) + '%', top: '1px', fontSize: '11px', color: 'var(--muted)', whiteSpace: 'nowrap' } }, fmt(lo)) : null,
        hi > 0 ? h('span', { style: { position: 'absolute', left: (right + 1) + '%', top: '1px', fontSize: '11px', color: 'var(--muted)', whiteSpace: 'nowrap' } }, fmt(hi, true)) : null);
      var provLabel = (FPE.data.PROVENANCE[x.prov] || {}).label || x.prov;
      var loTxt = typeof x.lo === 'number' ? fieldValueText(x.path, x.lo) : x.lo, hiTxt = typeof x.hi === 'number' ? fieldValueText(x.path, x.hi) : x.hi;
      return h('div', { class: 'torow', title: x.label + ' — at ' + loTxt + ': ' + fmt(x.scoreLo - base, true) + '; at ' + hiTxt + ': ' + fmt(x.scoreHi - base, true) },
        h('div', { class: 'torow-label' },
          h('span', { class: 'prov', dataset: { c: x.prov }, title: (FPE.data.PROVENANCE[x.prov] || {}).text || '' }, provLabel),
          onPick && x.path ? h('button', { type: 'button', class: 'chip', style: { background: 'transparent', padding: '0', fontSize: '12.5px', fontWeight: '500' }, onclick: function () { onPick(x); } }, h('span', { class: 't' }, x.label))
                           : h('span', { class: 't' }, x.label),
          h('span', { style: { color: 'var(--faint)', fontSize: '11px', whiteSpace: 'nowrap' } }, loTxt + ' – ' + hiTxt)),
        track);
    });
    UI.clear(container).appendChild(h('div', { class: 'tornado' }, rows));
  }

  /* A registry value as a person reads it. */
  function fieldValueText(pathKey, v) {
    var e = pathKey ? FPE.registry.BY_PATH[pathKey] : null;
    if (!e) return UI.num(v, 2);
    if (e.t === 'pct') return (v * 100).toFixed(Math.abs(v) < 0.1 ? 1 : 0) + '%';
    if (e.t === 'money') return UI.money(v);
    if (e.t === 'int') return UI.num(v, 0);
    return UI.num(v, 2);
  }

  /* Redraw charts when their container changes width. */
  var watched = [];
  var ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(function (entries) {
    entries.forEach(function (en) {
      var w = watched.filter(function (x) { return x.el === en.target; })[0];
      if (w && Math.abs(en.contentRect.width - w.width) > 4) { w.width = en.contentRect.width; w.draw(); }
    });
  }) : null;
  function watch(el, draw) {
    watched = watched.filter(function (x) { return document.body.contains(x.el); });
    var w = { el: el, draw: draw, width: el.clientWidth };
    watched.push(w);
    if (ro) ro.observe(el);
    draw();
  }

  UI.charts = { fan: fan, lines: lines, tornado: tornado, watch: watch, moneyTick: moneyTick, fieldValueText: fieldValueText };
})(UI);
