/* ============================================================================
   INTERFACE HELPERS — a small element builder, formatters, storage that
   never throws, a toast. No framework: every view builds its own DOM.
   ========================================================================== */
var UI = {};
(function (UI) {
  'use strict';
  var U = FPE.util;
  var SVGNS = 'http://www.w3.org/2000/svg';

  /* h('div', {class: 'x', onclick: fn, dataset: {k: v}}, child, [children], 'text') */
  function build(el, attrs, kids) {
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v == null || v === false) return;
        if (k === 'class') el.setAttribute('class', v);
        else if (k === 'text') el.textContent = v;
        else if (k === 'dataset') Object.keys(v).forEach(function (d) { el.dataset[d] = v[d]; });
        else if (k === 'style' && typeof v === 'object') Object.keys(v).forEach(function (s) { el.style[s] = v[s]; });
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else if (k === 'value' && 'value' in el && el.namespaceURI !== SVGNS) el.value = v;
        else if (k === 'checked' || k === 'disabled' || k === 'hidden' || k === 'selected') el[k] = !!v;
        else el.setAttribute(k, v === true ? '' : v);
      });
    }
    (function add(list) {
      list.forEach(function (c) {
        if (c == null || c === false) return;
        if (Array.isArray(c)) add(c);
        else if (typeof c === 'string' || typeof c === 'number') el.appendChild(document.createTextNode(String(c)));
        else el.appendChild(c);
      });
    })(kids);
    return el;
  }
  function h(tag, attrs) { return build(document.createElement(tag), attrs, Array.prototype.slice.call(arguments, 2)); }
  function s(tag, attrs) { return build(document.createElementNS(SVGNS, tag), attrs, Array.prototype.slice.call(arguments, 2)); }
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }
  function $(id) { return document.getElementById(id); }

  /* ------------------------------------------------------------ formatting */
  function money(x, opts) {
    if (x == null || !isFinite(x)) return '—';
    opts = opts || {};
    var a = Math.abs(x), sign = x < 0 ? '−' : (opts.plus && x > 0 ? '+' : '');
    if (opts.compact && a >= 1e6) return sign + '$' + (a / 1e6).toFixed(a >= 1e7 ? 1 : 2) + 'M';
    if (opts.compact && a >= 1e4) return sign + '$' + Math.round(a / 1000) + 'K';
    return sign + '$' + Math.round(a).toLocaleString('en-US');
  }
  function perMonth(x, opts) { return money(x, opts) + '/mo'; }
  function pct(x, d) { return x == null || !isFinite(x) ? '—' : (x * 100).toFixed(d == null ? 0 : d) + '%'; }
  function monthLabel(t) { return t == null ? '—' : U.label(t); }
  function num(x, d) { return x == null || !isFinite(x) ? '—' : (+x).toLocaleString('en-US', { maximumFractionDigits: d == null ? 0 : d }); }
  function monthsFrom(a, b) {
    var m = b - a;
    if (m <= 0) return 'now';
    if (m < 24) return 'in ' + m + ' month' + (m === 1 ? '' : 's');
    return 'in ' + (m / 12).toFixed(1).replace(/\.0$/, '') + ' years';
  }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); }

  /* ---------------------------------------------------------------- timing */
  function debounce(fn, ms) {
    var tm = null;
    function d() { var a = arguments, self = this; clearTimeout(tm); tm = setTimeout(function () { fn.apply(self, a); }, ms); }
    d.cancel = function () { clearTimeout(tm); };
    return d;
  }

  /* ------------------------------------------------ browser storage (convenience only) */
  var PREFIX = 'fpe2:';
  var store = {
    get: function (k, fallback) {
      try { var v = window.localStorage.getItem(PREFIX + k); return v == null ? fallback : JSON.parse(v); }
      catch (e) { return fallback; }
    },
    set: function (k, v) { try { window.localStorage.setItem(PREFIX + k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } }
  };

  /* ----------------------------------------------------------------- toast */
  var toastTimer = null;
  function toast(msg, action) {
    var el = $('toast');
    clear(el);
    el.appendChild(h('span', { text: msg }));
    if (action) el.appendChild(h('button', { type: 'button', text: action.label, onclick: function () { el.hidden = true; action.run(); } }));
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, action ? 8000 : 3200);
  }

  /* A button that needs a second click to act — the page's own confirmation,
     since the viewer blocks confirm() dialogs. */
  function armedButton(label, armedLabel, run, cls) {
    var armed = false, tm = null;
    var b = h('button', { type: 'button', class: 'btn sm danger ' + (cls || ''), text: label });
    b.addEventListener('click', function () {
      if (!armed) {
        armed = true; b.classList.add('armed'); b.textContent = armedLabel;
        tm = setTimeout(function () { armed = false; b.classList.remove('armed'); b.textContent = label; }, 4000);
        return;
      }
      clearTimeout(tm); armed = false; b.classList.remove('armed'); b.textContent = label;
      run();
    });
    return b;
  }

  function uid() { return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  Object.assign(UI, { h: h, s: s, clear: clear, $: $, money: money, perMonth: perMonth, pct: pct, monthLabel: monthLabel,
                      num: num, monthsFrom: monthsFrom, plural: plural, debounce: debounce, store: store, toast: toast,
                      armedButton: armedButton, uid: uid });
})(UI);
