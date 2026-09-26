/* ============================================================================
   RECOMMENDER — proposes plans; you choose.

   1  Screen: every variant of every strategy in your would-do set, applied
      alone to your plan, run deterministically.
   2  Climb: starting from your plan, add the best remaining variant while it
      still improves the score (one variant per strategy), a few steps deep.
   3  Re-rank the shortlist — your plan, the best climb, the best single
      change, and the climb's runners-up — on the uncertainty layer, all on
      the same simulated futures, by the headline (the c% case).
   4  Explain: for the winner, what each change is worth (remove it, re-run).

   Nothing is switched on without you: the output is a list of plans, each
   with its changes spelled out.
   ========================================================================== */
(function (FPE) {
  'use strict';
  var U = FPE.util, CAT = function () { return FPE.catalogue; };

  function detScore(cfg) {
    var r = FPE.runSimulation(cfg, { lean: true, series: cfg.plan.objective.kind === 'replaceSalary' });
    return { score: FPE.objective.scoreRun(cfg, r).score, sum: r.summary };
  }
  function patchOf(cfg, x) { return typeof x.patch === 'function' ? x.patch(cfg) : x.patch; }
  function changes(cfg, patch) {
    return Object.keys(patch).filter(function (k) { return JSON.stringify(U.getPath(cfg, k)) !== JSON.stringify(patch[k]); });
  }
  function withPatch(cfg, patch) { var c = U.clone(cfg); Object.keys(patch).forEach(function (k) { U.setPath(c, k, patch[k]); }); return c; }

  /* The moves worth trying from a plan, given the would-do set. */
  function moves(cfg, wouldDo) {
    var out = [];
    CAT().ENTRIES.forEach(function (e) {
      if (e.lifestyle || e.info) return;
      var want = wouldDo && wouldDo[e.id] != null ? wouldDo[e.id] : e.wouldDo;
      if (!want) return;
      if (e.requires && e.requires(cfg)) return;
      (e.explore || []).forEach(function (x, i) {
        var p = patchOf(cfg, x);
        if (!changes(cfg, p).length) return;              // already the plan
        out.push({ key: e.id + ':' + i, entry: e.id, family: e.family, label: x.label, patch: p });
      });
    });
    return out;
  }

  /* opts: { wouldDo, paths, shortlist, maxSteps, minGain, seed, onProgress(stage, done, total) } */
  function recommend(cfg, opts) {
    opts = opts || {};
    var prog = opts.onProgress || function () {};
    var kind = cfg.plan.objective.kind;
    var minGain = opts.minGain != null ? opts.minGain : (kind === 'replaceSalary' ? 1 : 25);
    var maxSteps = opts.maxSteps || 6;
    var evaluated = 0;

    /* 1. screen single changes */
    var base = detScore(cfg); evaluated++;
    var all = moves(cfg, opts.wouldDo);
    prog('screen', 0, all.length);
    all.forEach(function (m, i) {
      var r = detScore(withPatch(cfg, m.patch)); evaluated++;
      m.score = r.score; m.gain = r.score - base.score; m.sum = r.sum;
      prog('screen', i + 1, all.length);
    });
    var singles = all.slice().sort(function (a, b) { return b.gain - a.gain; });

    /* 2. greedy climb, one variant per strategy */
    function climb(startMoves, exclude) {
      var cur = U.clone(cfg), curScore = base.score, taken = [], used = {};
      (startMoves || []).forEach(function (m) { cur = withPatch(cur, m.patch); used[m.entry] = true; taken.push(m); });
      if (startMoves && startMoves.length) { curScore = detScore(cur).score; evaluated++; }
      var runners = [];
      for (var step = 0; step < maxSteps; step++) {
        var best = null, bestScore = curScore + minGain, tried = [];
        moves(cur, opts.wouldDo).forEach(function (m) {
          if (used[m.entry] || (exclude && exclude[m.key])) return;
          var s = detScore(withPatch(cur, m.patch)).score; evaluated++;
          tried.push({ m: m, s: s });
          if (s > bestScore) { best = m; bestScore = s; }
        });
        prog('climb', step + 1, maxSteps);
        if (!best) break;
        tried.sort(function (a, b) { return b.s - a.s; });
        if (tried[1] && tried[1].s > curScore + minGain) runners.push(tried[1].m);
        cur = withPatch(cur, best.patch); used[best.entry] = true; taken.push(best); curScore = bestScore;
      }
      return { cfg: cur, score: curScore, taken: taken, runners: runners };
    }
    var top = climb();

    /* strategies whose value only exists in some futures (a seller who
       carries, a recession, falling rates) are invisible to the calm run:
       judge them on a small set of simulated futures instead, against the
       climbed plan, on the same seeds */
    var miniPaths = opts.miniPaths || 60, seed0 = opts.seed != null ? opts.seed : cfg.mc.seed;
    function miniRun(c) { return Array.prototype.slice.call(FPE.mc.run(c, { paths: miniPaths, seed: seed0, series: false }).incomeAtTarget); }
    function miniMean(c) { return U.sum(miniRun(c)) / miniPaths; }
    /* paired difference on the same futures: the mean, and whether it clears
       twice its standard error (so noise is not mistaken for value) */
    function pairedGain(a, b) {
      var d = b.map(function (x, i) { return x - a[i]; }), n = d.length, m = U.sum(d) / n;
      var sd = Math.sqrt(U.sum(d, function (x) { return (x - m) * (x - m); }) / Math.max(1, n - 1));
      return { mean: m, clear: m > 2 * sd / Math.sqrt(n) };
    }
    var stoch = moves(top.cfg, opts.wouldDo).filter(function (m) { return CAT().byId(m.entry).stochastic; });
    if (stoch.length && kind === 'incomeByDate') {
      var used = {}; top.taken.forEach(function (m) { used[m.entry] = true; });
      var baseRun = miniRun(top.cfg);
      prog('futures', 0, stoch.length);
      stoch.forEach(function (m, i) {
        if (used[m.entry]) return;
        var g = pairedGain(baseRun, miniRun(withPatch(top.cfg, m.patch)));
        m.miniGain = g.mean; m.miniClear = g.clear;
        var single = all.filter(function (x) { return x.key === m.key; })[0];
        if (single) { single.miniGain = g.mean; single.miniClear = g.clear; }
        prog('futures', i + 1, stoch.length);
      });
      stoch.filter(function (m) { return m.miniClear && m.miniGain > minGain; })
        .sort(function (a, b) { return b.miniGain - a.miniGain; })
        .forEach(function (m) {
          if (used[m.entry]) return;
          var c2 = withPatch(top.cfg, m.patch), r2 = miniRun(c2), g2 = pairedGain(baseRun, r2);
          if (g2.clear && g2.mean > minGain) { top.cfg = c2; top.taken.push(m); used[m.entry] = true; baseRun = r2; m.viaFutures = true; }
        });
      top.score = detScore(top.cfg).score; evaluated++;
    }
    /* a second route: forbid the climb's first move, to see the best plan without it */
    var alt = top.taken.length ? climb(null, (function () { var x = {}; x[top.taken[0].key] = true; return x; })()) : null;

    /* 3. shortlist, re-ranked on simulated futures (same seeds for every plan) */
    var plans = [{ id: 'yours', name: 'Your plan as it stands', cfg: cfg, taken: [] }];
    if (top.taken.length) plans.push({ id: 'best', name: 'Best combination found', cfg: top.cfg, taken: top.taken });
    if (singles[0] && singles[0].gain > minGain && !(top.taken.length === 1 && top.taken[0].key === singles[0].key)) {
      plans.push({ id: 'single', name: 'The one change worth most on its own', cfg: withPatch(cfg, singles[0].patch), taken: [singles[0]] });
    }
    if (alt && alt.taken.length && alt.score > base.score + minGain) plans.push({ id: 'alt', name: 'Best plan without "' + top.taken[0].label + '"', cfg: alt.cfg, taken: alt.taken });
    var paths = opts.paths || Math.min(cfg.mc.paths, 200);
    var seed = opts.seed != null ? opts.seed : cfg.mc.seed;
    plans.forEach(function (p, i) {
      prog('simulate', i, plans.length);
      var mc = FPE.mc.run(p.cfg, { paths: paths, seed: seed, series: kind === 'replaceSalary' });
      p.headline = FPE.objective.headline(p.cfg, mc);
      p.det = detScore(p.cfg); evaluated++;
      p.forcedShare = Array.prototype.filter.call(mc.forcedSales, function (x) { return x > 0; }).length / mc.paths;
      p.hours = hoursPerWeek(p.cfg);
    });
    prog('simulate', plans.length, plans.length);
    plans.sort(function (a, b) { return b.headline.score - a.headline.score; });

    /* 4. explain the winner (and the climb) change by change */
    plans.forEach(function (p) {
      p.why = p.taken.map(function (m) {
        var without = U.clone(p.cfg);
        Object.keys(m.patch).forEach(function (k) { U.setPath(without, k, U.getPath(cfg, k)); });
        if (m.viaFutures) {
          return { key: m.key, entry: m.entry, label: m.label, worth: miniMean(p.cfg) - miniMean(without), viaFutures: true };
        }
        var s = detScore(without).score; evaluated++;
        return { key: m.key, entry: m.entry, label: m.label, worth: p.det.score - s };
      }).sort(function (a, b) { return b.worth - a.worth; });
      p.changes = p.taken.map(function (m) {
        return { entry: m.entry, label: m.label, paths: changes(cfg, m.patch).map(function (k) { return { path: k, from: U.getPath(cfg, k), to: m.patch[k] }; }) };
      });
    });

    return { kind: kind, base: base.score, plans: plans, singles: singles, evaluated: evaluated, paths: paths };
  }

  /* Average weekly real-estate hours over the plan, from the base run. */
  function hoursPerWeek(cfg) {
    var r = FPE.runSimulation(cfg);
    var hrs = U.sum(r.years, function (y) { return y.reHours; }), yrs = r.years.length || 1;
    return hrs / yrs / 52;
  }

  FPE.recommender = { recommend: recommend, moves: moves, hoursPerWeek: hoursPerWeek };
})(FPE);
