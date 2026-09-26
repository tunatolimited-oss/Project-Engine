/* ============================================================================
   WHAT THIS RESTS ON — every uncertain input moved to its plausible low and
   high (the 10th and 90th percentile of the distribution its registry entry
   declares), one at a time, with the plan re-run deterministically. Ranked
   by how far the headline moves, and coloured by how much the input can be
   trusted. The inputs at the top that are also guesses are the ones to
   verify before acting.

   A few structural questions ride along: what if the sold comps flatter the
   prices or the in-place rents, what if rates sit higher or lower.
   ========================================================================== */
(function (FPE) {
  'use strict';
  var U = FPE.util;

  function scoreOf(cfg) {
    var r = FPE.runSimulation(cfg, { lean: true, series: cfg.plan.objective.kind === 'replaceSalary' });
    return FPE.objective.scoreRun(cfg, r).score;
  }

  function scaleArchetypes(c, field, f) {
    Object.keys(c.archetypes || {}).forEach(function (k) {
      ['lo', 'mid', 'hi'].forEach(function (a) { var A = c.archetypes[k].anchors[a]; if (A) A[field] *= f; });
    });
    (c.properties || []).forEach(function (p) {
      if (field === 'pricePerUnit') p.price *= f;
      if (field === 'rentRatio') p.unitRents = p.unitRents.map(function (r) { return r * f; });
    });
  }
  var STRUCTURAL = [
    { id: 'prices', label: 'Purchase prices vs the sold comps', prov: 'estimate', lo: '−10%', hi: '+10%',
      apply: function (c, s) { scaleArchetypes(c, 'pricePerUnit', 1 + s * 0.10); },
      note: 'Seven sales in three months set every archetype price.' },
    { id: 'inplace', label: 'In-place rents vs the sold comps', prov: 'estimate', lo: '−10%', hi: '+10%',
      apply: function (c, s) { scaleArchetypes(c, 'rentRatio', 1 + s * 0.10); },
      note: 'How far below market the tenants you inherit are paying.' },
    { id: 'rates', label: 'Interest rates on every product', prov: 'vendor', lo: '−0.75 pt', hi: '+0.75 pt',
      apply: function (c, s) { ['fha', 'convOO', 'convInv', 'dscr', 'commercial', 'heloc'].forEach(function (k) { c.rates[k] += s * 0.0075; }); },
      note: 'Held flat by default; no forecast is built in.' }
  ];

  /* opts: { onProgress(done, total) } */
  function restsOn(cfg, opts) {
    opts = opts || {};
    var baseScore = scoreOf(cfg);
    var fields = FPE.registry.ENTRIES.filter(function (e) {
      return e.dist && FPE.registry.isRelevant(cfg, e.p) && typeof U.getPath(cfg, e.p) === 'number';
    });
    var total = fields.length + STRUCTURAL.length, done = 0, items = [];
    fields.forEach(function (e) {
      var v = U.getPath(cfg, e.p);
      var lo = FPE.mc.fieldQuantile(e, v, 0.10), hi = FPE.mc.fieldQuantile(e, v, 0.90);
      var cl = U.clone(cfg), ch = U.clone(cfg);
      U.setPath(cl, e.p, lo); U.setPath(ch, e.p, hi);
      var sl = scoreOf(cl), sh = scoreOf(ch);
      items.push({ id: e.p, path: e.p, label: e.l, group: e.g, prov: e.c, note: e.n || null, unit: e.u || null, type: e.t,
                   value: v, lo: lo, hi: hi, scoreLo: sl, scoreHi: sh,
                   down: Math.min(sl, sh) - baseScore, up: Math.max(sl, sh) - baseScore, swing: Math.abs(sh - sl) });
      done++; if (opts.onProgress) opts.onProgress(done, total);
    });
    STRUCTURAL.forEach(function (x) {
      var cl = U.clone(cfg), ch = U.clone(cfg);
      x.apply(cl, -1); x.apply(ch, 1);
      var sl = scoreOf(cl), sh = scoreOf(ch);
      items.push({ id: x.id, path: null, label: x.label, prov: x.prov, noteText: x.note, structural: true,
                   lo: x.lo, hi: x.hi, scoreLo: sl, scoreHi: sh,
                   down: Math.min(sl, sh) - baseScore, up: Math.max(sl, sh) - baseScore, swing: Math.abs(sh - sl) });
      done++; if (opts.onProgress) opts.onProgress(done, total);
    });
    items.sort(function (a, b) { return b.swing - a.swing; });
    /* The ones to check first: large swing and weak evidence. */
    var weak = { guess: 2, estimate: 1 };
    var verifyFirst = items.filter(function (x) { return weak[x.prov]; })
      .map(function (x) { return { item: x, priority: x.swing * weak[x.prov] }; })
      .sort(function (a, b) { return b.priority - a.priority; }).slice(0, 5).map(function (x) { return x.item.id; });
    return { base: baseScore, kind: cfg.plan.objective.kind, items: items, verifyFirst: verifyFirst };
  }

  FPE.sensitivity = { restsOn: restsOn, STRUCTURAL: STRUCTURAL };
})(FPE);
