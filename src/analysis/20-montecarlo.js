/* ============================================================================
   UNCERTAINTY LAYER — seeded Monte Carlo on top of the deterministic engine.

   The base run is never random. This layer runs the same engine many times,
   each time with:
     - every uncertain input drawn from the distribution its registry entry
       declares (only for the categories you leave switched on), and
     - a simulated market and life: rent shocks, a rate walk, recessions at
       random, deal arrivals, turnover, evictions, job loss, component timing.

   Common random numbers: path i always gets the same seed, and every draw is
   keyed by what it is for (this field, this unit, this month), so two plans
   face the same luck and their difference is the plan, not the dice.
   ========================================================================== */
(function (FPE) {
  'use strict';
  var U = FPE.util;

  /* ------------------------------------------------ one sampled input set */
  function drawField(e, v, seed) {
    var d = e.dist, r = new U.Rng(U.hash32(seed, 'cfg', e.p));
    r.next();
    switch (d.k) {
      case 'tri': return r.tri(d.lo, U.clamp(v, d.lo, d.hi), d.hi);
      case 'triRel': return v * (1 + r.tri(d.lo, 0, d.hi));
      case 'triAdd': return v + r.tri(d.lo, 0, d.hi);
      case 'normal': return v + r.normal(0, d.sd);
      case 'uniform': return r.uniform(d.lo, d.hi);
      default: return v;
    }
  }
  function bounded(e, x) {
    if (e.min != null) x = Math.max(e.min, x);
    if (e.max != null) x = Math.min(e.max, x);
    if (e.t === 'pct' || e.t === 'num' || e.t === 'money') return x;
    if (e.t === 'int') return Math.round(x);
    return x;
  }
  function sampleConfig(cfg, seed) {
    var c = U.clone(cfg);
    FPE.registry.ENTRIES.forEach(function (e) {
      if (!e.dist) return;
      if (e.cat && cfg.mc.sample[e.cat] === false) return;
      if (!FPE.registry.isRelevant(cfg, e.p)) return;
      var v = U.getPath(c, e.p);
      if (typeof v !== 'number') return;
      U.setPath(c, e.p, bounded(e, drawField(e, v, seed)));
    });
    return c;
  }

  /* The pth quantile of a distribution — used to show an input's plausible
     low and high in the sensitivity view. */
  function fieldQuantile(e, v, q) {
    var d = e.dist, lo, mode, hi;
    switch (d.k) {
      case 'tri': lo = d.lo; mode = U.clamp(v, d.lo, d.hi); hi = d.hi; break;
      case 'triRel': lo = v * (1 + d.lo); mode = v; hi = v * (1 + d.hi); break;
      case 'triAdd': lo = v + d.lo; mode = v; hi = v + d.hi; break;
      case 'uniform': return d.lo + (d.hi - d.lo) * q;
      case 'normal': return v + d.sd * (q < 0.5 ? -1.2816 : 1.2816) * (Math.abs(q - 0.5) > 0.3 ? 1 : 0.5);
      default: return v;
    }
    if (hi <= lo) return mode;
    var c = (mode - lo) / (hi - lo);
    var x = q < c ? lo + Math.sqrt(q * (hi - lo) * (mode - lo)) : hi - Math.sqrt((1 - q) * (hi - lo) * (hi - mode));
    return bounded(e, x);
  }

  /* ---------------------------------------------------------------- run
     opts: { paths, seed, confidence, onProgress(done, total), series } */
  function run(cfg, opts) {
    opts = opts || {};
    var n = opts.paths || cfg.mc.paths, base = opts.seed != null ? opts.seed : cfg.mc.seed;
    var months = Math.round(cfg.plan.horizonYears * 12);
    var out = {
      paths: n, seed: base, months: months, start: U.parseMonth(cfg.plan.startMonth),
      incomeAtTarget: new Float64Array(n), finalIncome: new Float64Array(n),
      heldNW: new Float64Array(n), soldNW: new Float64Array(n), units: new Float64Array(n),
      ruined: new Uint8Array(n), quit: [], partTime: [], freedom: [], forcedSales: new Float64Array(n),
      recessions: new Float64Array(n), jobLosses: new Float64Array(n),
      series: opts.series === false ? null : { income: [], nw: [], cash: [] }
    };
    for (var i = 0; i < n; i++) {
      var s = U.hash32(base, i);
      var c = sampleConfig(cfg, s);
      var r = FPE.runSimulation(c, { rng: new U.Rng(U.hash32(s, 'market')), seed: s, lean: true, series: !!out.series });
      var sm = r.summary;
      out.ruined[i] = sm.ruined ? 1 : 0;
      out.incomeAtTarget[i] = sm.ruined ? 0 : sm.incomeAtTargetReal;         // a path that runs out of cash scores zero
      out.finalIncome[i] = sm.ruined ? 0 : sm.finalIncomeReal;
      out.heldNW[i] = sm.heldNWReal; out.soldNW[i] = sm.soldNWReal; out.units[i] = sm.units;
      out.quit.push(sm.quit); out.partTime.push(sm.partTime); out.freedom.push(sm.freedom);
      out.forcedSales[i] = sm.forcedSales; out.jobLosses[i] = sm.jobLosses;
      if (out.series) { out.series.income.push(r.series.income); out.series.nw.push(r.series.nw); out.series.cash.push(r.series.cash); }
      if (opts.onProgress && (i % 10 === 9 || i === n - 1)) opts.onProgress(i + 1, n);
    }
    return out;
  }

  /* ------------------------------------------------------------ summaries */
  function sorted(arr) { return Array.prototype.slice.call(arr).sort(function (a, b) { return a - b; }); }
  function q(arr, p) { return U.quantile(sorted(arr), p); }
  /* The "c% case": the value that c% of futures meet or beat. */
  function atConfidence(arr, conf) { return q(arr, 1 - conf); }

  function band(arr) {
    var s = sorted(arr);
    return { p10: U.quantile(s, 0.10), p20: U.quantile(s, 0.20), p50: U.quantile(s, 0.50), p80: U.quantile(s, 0.80), p90: U.quantile(s, 0.90),
             mean: U.sum(s) / Math.max(1, s.length) };
  }
  /* Per-month quantiles of a series, for the fan chart. */
  function fan(list, probs, step) {
    if (!list || !list.length) return null;
    step = step || 1;
    var m = list[0].length, out = { t: [] };
    probs.forEach(function (p) { out['p' + Math.round(p * 100)] = []; });
    var col = new Float64Array(list.length);
    for (var k = 0; k < m; k += step) {
      for (var i = 0; i < list.length; i++) col[i] = list[i][k];
      var s = Array.prototype.slice.call(col).sort(function (a, b) { return a - b; });
      out.t.push(k);
      probs.forEach(function (p) { out['p' + Math.round(p * 100)].push(U.quantile(s, p)); });
    }
    return out;
  }
  /* Share of futures in which an event (quit, part-time…) has happened by month t. */
  function shareBy(list, t) {
    var n = 0; list.forEach(function (x) { if (x != null && x <= t) n++; });
    return list.length ? n / list.length : 0;
  }
  /* The month by which a share `conf` of futures have seen the event (or null). */
  function dateAtConfidence(list, conf) {
    var xs = list.map(function (x) { return x == null ? Infinity : x; }).sort(function (a, b) { return a - b; });
    var v = xs[Math.min(xs.length - 1, Math.ceil(conf * xs.length) - 1)];
    return isFinite(v) ? v : null;
  }

  FPE.mc = { sampleConfig: sampleConfig, fieldQuantile: fieldQuantile, run: run, band: band, fan: fan,
             quantile: q, atConfidence: atConfidence, shareBy: shareBy, dateAtConfidence: dateAtConfidence };
})(FPE);
