/* ============================================================================
   MARKET — indices over time: market rents, building prices, operating costs,
   insurance, consumer prices, interest rates, and recessions.

   Deterministic unless an Rng is passed (the uncertainty layer does that).
   All indices are 1.0 at the data month (when the listings were collected),
   except the consumer-price index, which is 1.0 at the plan start so that
   "today's dollars" means the dollars of the month the plan starts.
   ========================================================================== */
(function (FPE) {
  'use strict';
  var U = FPE.util;
  var CAP0 = 0.07;              // reference cap rate for converting bps drift into a price factor

  function create(cfg, opts) {
    opts = opts || {};
    var rng = opts.rng || null;
    var M = cfg.market, RT = cfg.rates, ST = cfg.stress, MC = cfg.mc;
    var dataMonth = FPE.data.dataMonth;
    var start = U.parseMonth(cfg.plan.startMonth);
    var end = start + Math.round(cfg.plan.horizonYears * 12) + 12;
    var origin = Math.min(dataMonth, start) - 1;
    var N = end - origin + 1;
    function k(t) { return U.clamp(t - origin, 0, N - 1); }

    /* ------------------------------------------------------------ recession
       Intensity 0..1: ramps in over three months, holds, then fades over a
       year after it ends. Scheduled recessions come from the stress settings;
       random ones only exist on a simulated path.                          */
    var rec = new Array(N);           // {rentDrop, vacancyAdd, capAddBps, credit, active}
    var intensity = new Float64Array(N);
    function addRecession(s, months, eff) {
      for (var m = 0; m < months + 12; m++) {
        var t = s + m, i = t - origin;
        if (i < 0 || i >= N) continue;
        var x = m < months ? Math.min(1, (m + 1) / 3) : Math.max(0, 1 - (m - months + 1) / 12);
        if (x > intensity[i]) { intensity[i] = x; rec[i] = eff; }
        if (m < months) rec[i] = Object.assign({ active: true }, eff);
      }
    }
    if (ST.recession.enabled) {
      addRecession(U.mk(ST.recession.startYear, 0), ST.recession.months,
        { rentDrop: ST.recession.rentDrop, vacancyAdd: ST.recession.vacancyAdd,
          capAddBps: ST.recession.capAddBps, credit: !!ST.recession.creditTightens, scheduled: true });
    }
    if (rng && MC.sample.recessions) {
      var pMonth = 1 - Math.pow(1 - (MC.recessionAnnualProb || 0), 1 / 12);
      var t0 = start;
      while (t0 < end) {
        if (rng.chance(pMonth)) {
          var dur = Math.round(rng.uniform(12, 24));
          addRecession(t0, dur, { rentDrop: rng.tri(0.02, 0.06, 0.12), vacancyAdd: rng.tri(0.01, 0.035, 0.08),
                                  capAddBps: rng.tri(20, 60, 125), credit: true, scheduled: false });
          t0 += dur + 12;
        } else t0++;
      }
    }

    /* --------------------------------------------------------- market rents
       Trend growth, with yearly persistent shocks on a simulated path.       */
    var rentTrend = new Float64Array(N);
    var g = M.rentGrowth, shock = 0, yr = null, gYear = g;
    for (var i = 0; i < N; i++) {
      var t = origin + i;
      if (rng && cfg.mc.sample.market && U.yearOf(t) !== yr) {
        yr = U.yearOf(t);
        shock = 0.5 * shock + rng.normal(0, 0.012);
        gYear = g + shock;
      } else if (!rng) gYear = g;
      rentTrend[i] = (i === 0 ? 1 : rentTrend[i - 1] * U.monthlyFactor(gYear));
    }
    var norm = rentTrend[k(dataMonth)];
    for (i = 0; i < N; i++) rentTrend[i] /= norm;

    function recAt(t) { var i2 = k(t); return rec[i2] || null; }
    function intens(t) { return intensity[k(t)]; }
    function yearsFromData(t) { return (t - dataMonth) / 12; }

    /* ------------------------------------ rents, cap rates, prices (tabulated) */
    var rentIdx = new Float64Array(N), capIdx = new Float64Array(N), priceIdx = new Float64Array(N);
    for (i = 0; i < N; i++) {
      var ti = origin + i, ri = rec[i] || null, xi = intensity[i];
      rentIdx[i] = rentTrend[i] * (1 - (ri ? ri.rentDrop * xi : 0));
      var c = CAP0 + ((M.capRateDriftBps || 0) / 10000) * yearsFromData(ti);
      if (ri) c += (ri.capAddBps / 10000) * xi;
      capIdx[i] = Math.max(0.02, c);
      if (M.priceTracksRents !== false) priceIdx[i] = rentIdx[i] * CAP0 / capIdx[i];
      else priceIdx[i] = Math.pow(1 + M.appreciation, yearsFromData(ti)) * (ri ? CAP0 / (CAP0 + (ri.capAddBps / 10000) * xi) : 1);
    }
    function rentIndex(t) { return rentIdx[k(t)]; }
    function capRate(t) { return capIdx[k(t)]; }
    function priceIndex(t) { return priceIdx[k(t)]; }

    /* ------------------------------------------------- costs and insurance */
    var expIdx = new Float64Array(N), cpiIdx = new Float64Array(N);
    for (i = 0; i < N; i++) {
      expIdx[i] = Math.pow(1 + M.expenseInflation, (origin + i - dataMonth) / 12);
      cpiIdx[i] = Math.pow(1 + M.cpi, (origin + i - start) / 12);
    }
    function expenseIndex(t) { var j = t - origin; return j >= 0 && j < N ? expIdx[j] : Math.pow(1 + M.expenseInflation, yearsFromData(t)); }
    function cpiIndex(t) { var j = t - origin; return j >= 0 && j < N ? cpiIdx[j] : Math.pow(1 + M.cpi, (t - start) / 12); }
    var insIdx = new Float64Array(N);
    for (i = 0; i < N; i++) {
      var tt = origin + i;
      var insRate = U.yearOf(tt) <= M.insurance.nearTermUntil ? M.insurance.nearTermRate : M.insurance.longTermRate;
      insIdx[i] = i === 0 ? 1 : insIdx[i - 1] * U.monthlyFactor(insRate);
    }
    var insNorm = insIdx[k(dataMonth)];
    function insuranceIndex(t) { return insIdx[k(t)] / insNorm; }

    /* ------------------------------------------------------ interest rates
       A single "rate level" shared by every product: the path you set, a
       scheduled shock, and on a simulated path a mean-reverting walk.       */
    var level = new Float64Array(N), walk = 0;
    for (i = 0; i < N; i++) {
      var tm = origin + i, add = 0;
      if (RT.path.enabled) {
        (RT.path.points || []).forEach(function (pt) { if (U.yearOf(tm) >= pt.fromYear) add = pt.add; });
      }
      if (ST.rateShock.enabled && U.yearOf(tm) >= ST.rateShock.fromYear) add += ST.rateShock.add;
      if (rng && cfg.mc.sample.rates && tm > start) {
        walk = walk * (1 - 0.15 / 12) + rng.normal(0, (RT.randomSigma || 0) / Math.sqrt(12));
      }
      level[i] = add + (tm > start ? walk : 0);
    }
    var creditAdd = (FPE.data.LENDER.creditTierRateAdd[cfg.income.creditTier] || 0);
    function rateLevel(t) { return level[k(t)]; }
    function rate(product, t) {
      var base;
      switch (product) {
        case 'fha': base = RT.fha; break;
        case 'convOO': base = RT.convOO; break;
        case 'convInv': base = RT.convInv; break;
        case 'dscr': base = RT.dscr + (FPE.data.LENDER.dscrPrepayRateAdd[cfg.lending.dscr.prepayYears] || 0); break;
        case 'commercial': base = RT.commercial; break;
        case 'heloc': base = RT.heloc; break;
        case 'ownHome': base = RT.convOO; break;
        default: base = RT.convInv;
      }
      return Math.max(0.01, base + rateLevel(t) + (product === 'heloc' ? 0 : creditAdd));
    }

    function recession(t) { var r = recAt(t); return r && r.active ? r : null; }
    function vacancyAdd(t) {
      var r = recAt(t);
      return (cfg.ops.vacancy.marketPremium || 0) + (r ? r.vacancyAdd * intens(t) : 0);
    }
    function creditTight(t) {
      var r = recession(t);
      return r && r.credit ? { dscrAdd: 0.10, ltvCut: 0.05 } : null;
    }

    return {
      start: start, end: end, dataMonth: dataMonth,
      rentIndex: rentIndex, priceIndex: priceIndex, capRate: capRate,
      expenseIndex: expenseIndex, cpiIndex: cpiIndex, insuranceIndex: insuranceIndex,
      rate: rate, rateLevel: rateLevel, recession: recession, vacancyAdd: vacancyAdd,
      creditTight: creditTight, intensity: intens
    };
  }

  FPE.market = { create: create, CAP0: CAP0 };
})(FPE);
