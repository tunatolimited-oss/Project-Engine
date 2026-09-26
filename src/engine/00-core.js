/* ============================================================================
   FARGO PORTFOLIO ENGINE — core utilities
   Everything lives on one namespace, FPE, so the same files run unchanged in
   the browser bundle and in the node test loader. No DOM anywhere in engine/.
   ========================================================================== */
var FPE = (typeof FPE !== 'undefined' && FPE) ? FPE : {};

(function (FPE) {
  'use strict';

  /* ------------------------------------------------------------------ months
     A month is a plain integer: year * 12 + (0-11). Arithmetic is addition.   */
  var MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function mk(y, m) { return y * 12 + m; }
  function parseMonth(s) {
    if (typeof s === 'number') return s;
    var p = String(s).split('-');
    return mk(parseInt(p[0], 10), (parseInt(p[1] || '1', 10) - 1));
  }
  function yearOf(t) { return Math.floor(t / 12); }
  function monthOf(t) { return ((t % 12) + 12) % 12; }
  function iso(t) { return yearOf(t) + '-' + String(monthOf(t) + 1).padStart(2, '0'); }
  function label(t) { return MONTH_ABBR[monthOf(t)] + ' ' + yearOf(t); }
  function shortLabel(t) { return (monthOf(t) + 1) + '/' + yearOf(t); }

  /* ------------------------------------------------------------------ money */
  function pmt(principal, annualRate, termYears) {
    var r = annualRate / 12, n = Math.round(termYears * 12);
    if (principal <= 0) return 0;
    if (n <= 0) return principal;
    if (Math.abs(r) < 1e-12) return principal / n;
    return principal * r / (1 - Math.pow(1 + r, -n));
  }
  /* balance after k payments of a fully amortizing loan */
  function balanceAfter(principal, annualRate, termYears, k) {
    var r = annualRate / 12, pay = pmt(principal, annualRate, termYears);
    if (Math.abs(r) < 1e-12) return Math.max(0, principal - pay * k);
    return Math.max(0, principal * Math.pow(1 + r, k) - pay * (Math.pow(1 + r, k) - 1) / r);
  }
  /* largest loan a payment supports */
  function loanForPayment(payment, annualRate, termYears) {
    var r = annualRate / 12, n = Math.round(termYears * 12);
    if (payment <= 0 || n <= 0) return 0;
    if (Math.abs(r) < 1e-12) return payment * n;
    return payment * (1 - Math.pow(1 + r, -n)) / r;
  }
  function clamp(x, lo, hi) { return x < lo ? lo : (x > hi ? hi : x); }
  function round2(x) { return Math.round(x * 100) / 100; }
  function sum(a, f) {
    var s = 0;
    for (var i = 0; i < a.length; i++) s += f ? f(a[i], i) : a[i];
    return s;
  }
  /* annual rate -> equivalent monthly compounding factor */
  function monthlyFactor(annual) { return Math.pow(1 + annual, 1 / 12); }

  /* ---------------------------------------------------------- object paths */
  function splitPath(path) { return String(path).replace(/\[(\d+)\]/g, '.$1').split('.'); }
  function getPath(obj, path) {
    var parts = splitPath(path), cur = obj;
    for (var i = 0; i < parts.length; i++) { if (cur == null) return undefined; cur = cur[parts[i]]; }
    return cur;
  }
  function setPath(obj, path, value) {
    var parts = splitPath(path), cur = obj;
    for (var i = 0; i < parts.length - 1; i++) {
      if (cur[parts[i]] == null || typeof cur[parts[i]] !== 'object') {
        cur[parts[i]] = /^\d+$/.test(parts[i + 1]) ? [] : {};
      }
      cur = cur[parts[i]];
    }
    cur[parts[parts.length - 1]] = value;
  }
  function clone(x) { return x == null ? x : JSON.parse(JSON.stringify(x)); }

  /* --------------------------------------------------------------- hashing
     FNV-1a with a final avalanche. Used to derive independent, reproducible
     random streams from keys — never to decide anything in the base run.   */
  function hash32() {
    var h = 2166136261;
    for (var a = 0; a < arguments.length; a++) {
      var s = String(arguments[a]);
      for (var i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619) >>> 0;
      }
      h ^= 0x9e; h = Math.imul(h, 16777619) >>> 0;      // separator between keys
    }
    h ^= h >>> 16; h = Math.imul(h, 2246822507) >>> 0;
    h ^= h >>> 13; h = Math.imul(h, 3266489909) >>> 0;
    h ^= h >>> 16;
    return h >>> 0;
  }

  /* -------------------------------------------------------- seeded random
     mulberry32 — small, fast, good enough for Monte Carlo. The base run never
     calls it; only the uncertainty layer does, always from an explicit seed. */
  function Rng(seed) {
    var a = (seed >>> 0) || 1;
    this.next = function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  Rng.prototype.uniform = function (lo, hi) { return lo + (hi - lo) * this.next(); };
  Rng.prototype.normal = function (mean, sd) {
    var u = 0, v = 0;
    while (u === 0) u = this.next();
    while (v === 0) v = this.next();
    return (mean || 0) + (sd == null ? 1 : sd) * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  Rng.prototype.tri = function (lo, mode, hi) {
    if (hi <= lo) return mode;
    var u = this.next(), c = (mode - lo) / (hi - lo);
    return u < c ? lo + Math.sqrt(u * (hi - lo) * (mode - lo))
                 : hi - Math.sqrt((1 - u) * (hi - lo) * (hi - mode));
  };
  Rng.prototype.chance = function (p) { return this.next() < p; };
  Rng.prototype.poisson = function (lambda) {
    if (lambda <= 0) return 0;
    var L = Math.exp(-lambda), k = 0, p = 1;
    do { k++; p *= this.next(); } while (p > L && k < 50);
    return k - 1;
  };
  /* A uniform draw that depends only on the keys — the same keys give the same
     number in every plan. That is what makes two plans face the same luck
     (common random numbers), so their difference is the plan, not the dice. */
  function keyed() {
    var h = hash32.apply(null, arguments);
    var r = new Rng(h);
    r.next();                                   // discard the first, weakest draw
    return r.next();
  }

  /* ----------------------------------------------------------- statistics */
  function quantile(sorted, q) {
    if (!sorted.length) return NaN;
    var pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
  }
  function summarize(values) {
    var s = values.slice().filter(function (v) { return isFinite(v); }).sort(function (a, b) { return a - b; });
    return {
      n: s.length, mean: s.length ? sum(s) / s.length : NaN,
      p05: quantile(s, 0.05), p10: quantile(s, 0.10), p20: quantile(s, 0.20),
      p50: quantile(s, 0.50), p80: quantile(s, 0.80), p90: quantile(s, 0.90),
      min: s[0], max: s[s.length - 1], sorted: s
    };
  }

  /* ------------------------------------------------------------ formatting */
  function fmtMoney(n) {
    if (n == null || isNaN(n)) return '—';
    var neg = n < 0, a = Math.abs(n), s;
    if (a >= 1e6) s = '$' + (a / 1e6).toFixed(a >= 1e7 ? 1 : 2) + 'M';
    else if (a >= 1e4) s = '$' + Math.round(a / 1e3) + 'K';
    else s = '$' + Math.round(a).toLocaleString('en-US');
    return (neg ? '−' : '') + s;
  }
  function fmtDollars(n) {
    if (n == null || isNaN(n)) return '—';
    return (n < 0 ? '−' : '') + '$' + Math.round(Math.abs(n)).toLocaleString('en-US');
  }
  function fmtPct(n, d) {
    if (n == null || isNaN(n)) return '—';
    return (n * 100).toFixed(d == null ? 1 : d) + '%';
  }

  FPE.util = {
    MONTH_ABBR: MONTH_ABBR, mk: mk, parseMonth: parseMonth, yearOf: yearOf, monthOf: monthOf,
    iso: iso, label: label, shortLabel: shortLabel,
    pmt: pmt, balanceAfter: balanceAfter, loanForPayment: loanForPayment,
    clamp: clamp, round2: round2, sum: sum, monthlyFactor: monthlyFactor,
    getPath: getPath, setPath: setPath, clone: clone, splitPath: splitPath,
    hash32: hash32, Rng: Rng, keyed: keyed, quantile: quantile, summarize: summarize,
    fmtMoney: fmtMoney, fmtDollars: fmtDollars, fmtPct: fmtPct
  };
})(FPE);
