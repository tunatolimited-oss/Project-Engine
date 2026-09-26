/* ============================================================================
   TAX — federal and North Dakota income tax, computed INCREMENTALLY: the tax
   the portfolio adds on top of the tax your wages already bear. That is the
   amount the plan's cash actually pays.

   Kept from the verified earlier engine (they encode the law, not a choice):
     - two buckets: rental activity (passive unless REPS) and non-rental
       short-term rentals averaging ≤ 7 days with material participation
     - §469(f)(1): losses suspended before REPS only offset income from the
       same activity, never the W-2
     - the $25,000 allowance, phased out $100K–$150K of MAGI, never indexed
     - §461(l) on the combined business loss; the excess becomes an NOL
       usable against 80% of later taxable income
   Added in the rebuild: brackets instead of a flat rate, §199A QBI, NIIT,
   indexing, and an exit calculator for the "if sold" view.
   ========================================================================== */
(function (FPE) {
  'use strict';
  var U = FPE.util, T = FPE.data.TAX;

  /* ------------------------------------------------ tables for a year */
  function tables(cfg, year) {
    var fs = cfg.plan.filingStatus === 'mfj' ? 'mfj' : 'single';
    var f = (cfg.tax && cfg.tax.indexBrackets !== false)
      ? Math.pow(1 + cfg.market.cpi, Math.max(0, year - T.baseYear)) : 1;
    function scale(br) { return br.map(function (b) { return [b[0] === Infinity ? Infinity : b[0] * f, b[1]]; }); }
    var fed = T.federal[fs];
    return {
      fs: fs,
      std: fed.std * f,
      brackets: scale(fed.brackets),
      ltcg: scale(fed.ltcg),
      nd: scale(T.nd[fs]),
      qbiThreshold: T.qbi[fs].threshold * f, qbiRange: T.qbi[fs].range,
      niitThreshold: T.niit[fs],                     // statutory, not indexed
      ebl: T.ebl[fs] * f,
      allowance: T.passive                           // never indexed
    };
  }

  /* Tax on `amount` of income stacked on top of `base`, by bracket.
     `cap` limits the rate (used for unrecaptured §1250 gain at 25%). */
  function stacked(brackets, base, amount, cap) {
    if (amount <= 0) return 0;
    var tax = 0, lo = base, hi = base + amount, prev = 0;
    for (var i = 0; i < brackets.length; i++) {
      var top = brackets[i][0], r = brackets[i][1];
      if (cap != null) r = Math.min(r, cap);
      var a = Math.max(lo, prev), b = Math.min(hi, top);
      if (b > a) tax += (b - a) * r;
      prev = top;
      if (top >= hi) break;
    }
    return tax;
  }

  /* Federal + ND tax for one year.
     parts: { ordinary, unrec1250, ltcg, tbill (in ordinary already; state-exempt) }
     `ordinary` is AGI's ordinary part before the standard deduction.        */
  function yearTax(cfg, tb, parts, qbiDed) {
    var ordTI = Math.max(0, parts.ordinary - tb.std - (qbiDed || 0));
    var spill = Math.max(0, tb.std + (qbiDed || 0) - parts.ordinary);          // unused deduction reduces gains
    var g1250 = Math.max(0, parts.unrec1250 - spill); spill = Math.max(0, spill - parts.unrec1250);
    var gCap = Math.max(0, parts.ltcg - spill);
    var fed = stacked(tb.brackets, 0, ordTI, null) +
              stacked(tb.brackets, ordTI, g1250, T.unrecaptured1250Max);
    /* long-term gain: 0/15/20 by where it lands in the capital-gain breakpoints */
    fed += stacked(tb.ltcg, ordTI + g1250, gCap, null);
    var nd = 0;
    if (cfg.tax.state !== false) {
      var ndTI = Math.max(0, ordTI + g1250 + gCap - T.nd.ltcgExclusion * (g1250 + gCap) - (parts.tbill || 0));
      nd = stacked(tb.nd, 0, ndTI, null);
    }
    return { federal: fed, state: nd, total: fed + nd, taxable: ordTI + g1250 + gCap };
  }

  /* ================================================================ annual
     y (the year's totals, all from the simulation):
       wages, deferrals, passiveNet, nonPassiveNet (STR), qbiEligibleIncome,
       investOrdinary, investTbill, investLtcg, commission, ubia,
       reps (bool), qbiQualifies (bool), rentalNII (bool: rental income is
       investment income for NIIT)
     carry: { passive, nol }  — updated in place.                           */
  function annual(cfg, year, y, carry) {
    var tb = tables(cfg, year);
    var TX = cfg.tax;
    var wages = Math.max(0, (y.wages || 0) - (y.deferrals || 0));
    var invest = (y.investOrdinary || 0) + (y.investTbill || 0);
    var commission = y.commission || 0;
    var seTax = commission > 0 ? commission * 0.9235 * 0.153 : 0;
    var seDed = seTax / 2;
    var magi = wages + invest + (y.investLtcg || 0) + commission - seDed;

    /* ---- the rental activity ---- */
    var passiveNet = y.passiveNet || 0, rentalOrdinary = 0, released = 0, suspendedAdded = 0;
    var businessLoss = 0;                       // non-passive losses subject to §461(l)
    if (passiveNet >= 0) {
      released = Math.min(carry.passive, passiveNet);           // §469(f)(1): same-activity income only
      carry.passive -= released;
      rentalOrdinary += passiveNet - released;
    } else if (y.reps) {
      rentalOrdinary += passiveNet;
      businessLoss += -passiveNet;
    } else {
      var allow = 0;
      if (TX.allowance !== false) {
        allow = Math.max(0, tb.allowance.allowance - 0.5 * Math.max(0, magi - tb.allowance.phaseStart));
      }
      var usable = Math.min(-passiveNet, allow);
      suspendedAdded = -passiveNet - usable;
      carry.passive += suspendedAdded;
      rentalOrdinary -= usable;
    }
    /* short-term rentals that are not rental activities (non-passive, no REPS needed) */
    var np = y.nonPassiveNet || 0;
    rentalOrdinary += np;
    if (np < 0) businessLoss += -np;

    /* ---- §461(l): cap the business loss against non-business income ---- */
    var nolAdded = 0;
    if (TX.ebl !== false && businessLoss > tb.ebl) {
      nolAdded = businessLoss - tb.ebl;
      rentalOrdinary += nolAdded;
      carry.nol += nolAdded;
    }

    /* ---- ordinary income before prior NOL ---- */
    var ordinary = wages + rentalOrdinary + invest + commission - seDed;
    var nolUsed = 0;
    if (carry.nol > 0 && ordinary > tb.std) {
      var room = 0.8 * Math.max(0, ordinary - tb.std);
      nolUsed = Math.min(carry.nol - nolAdded > 0 ? carry.nol - nolAdded : 0, room);
      carry.nol -= nolUsed;
      ordinary -= nolUsed;
    }

    /* ---- §199A QBI on qualifying positive rental income ---- */
    var qbiDed = 0;
    if (TX.qbi && TX.qbi.enabled && y.qbiQualifies) {
      var qbi = Math.max(0, Math.min(y.qbiEligibleIncome || 0, Math.max(0, rentalOrdinary)));
      var tiBefore = Math.max(0, ordinary - tb.std) + (y.investLtcg || 0);
      var full = T.qbi.rate * qbi;
      var limitByWageProperty = T.qbi.ubiaPct * (y.ubia || 0);
      var ded = full;
      if (tiBefore > tb.qbiThreshold) {
        var phase = Math.min(1, (tiBefore - tb.qbiThreshold) / tb.qbiRange);
        if (limitByWageProperty < full) ded = full - phase * (full - limitByWageProperty);
      }
      qbiDed = Math.min(ded, T.qbi.rate * Math.max(0, tiBefore - (y.investLtcg || 0)));
    }

    var all = yearTax(cfg, tb, { ordinary: ordinary, unrec1250: 0, ltcg: y.investLtcg || 0, tbill: y.investTbill || 0 }, qbiDed);

    /* ---- NIIT ---- */
    var niit = 0, niitRental = 0;
    if (TX.niit !== false) {
      var rentalNII = y.rentalNII ? Math.max(0, rentalOrdinary) : 0;
      var nii = invest + (y.investLtcg || 0) + rentalNII;
      var agi = ordinary + (y.investLtcg || 0);
      niit = T.niit.rate * Math.max(0, Math.min(nii, agi - tb.niitThreshold));
      niitRental = nii > 0 ? niit * rentalNII / nii : 0;
    }

    /* ---- incremental attribution ----
       wages alone → + the real-estate activity (rentals, license commission)
       → + idle-cash returns. Each step's difference is charged to it.      */
    var wagesOnly = yearTax(cfg, tb, { ordinary: wages, unrec1250: 0, ltcg: 0, tbill: 0 }, 0).total;
    var reOrdinary = wages + rentalOrdinary + commission - seDed - nolUsed;
    var withRE = yearTax(cfg, tb, { ordinary: reOrdinary, unrec1250: 0, ltcg: 0, tbill: 0 }, qbiDed).total + niitRental + seTax;
    var total = all.total + niit + seTax;
    var rentalTax = withRE - wagesOnly;
    var incremental = total - wagesOnly;

    return {
      year: year, total: total, incremental: incremental, rentalTax: rentalTax,
      investTax: incremental - rentalTax, wageTax: wagesOnly,
      federal: all.federal, state: all.state, niit: niit, seTax: seTax,
      rentalOrdinary: rentalOrdinary, suspendedAdded: suspendedAdded, released: released,
      nolAdded: nolAdded, nolUsed: nolUsed, qbiDeduction: qbiDed, magi: magi,
      allowanceUsed: passiveNet < 0 && !y.reps ? (-passiveNet - suspendedAdded) : 0
    };
  }

  /* ================================================================== exit
     Tax on selling properties in `year`, on top of `otherOrdinary` income.
     sale: { gain parts } = { rec1245, unrec1250, capGain, releasedLosses, reps } */
  function saleTax(cfg, year, otherOrdinary, s) {
    var tb = tables(cfg, year);
    var baseOrd = Math.max(0, otherOrdinary);
    var before = yearTax(cfg, tb, { ordinary: baseOrd, unrec1250: 0, ltcg: 0 }, 0).total;
    var ord = baseOrd + Math.max(0, s.rec1245) - Math.max(0, s.releasedLosses || 0);
    var after = yearTax(cfg, tb, { ordinary: ord, unrec1250: Math.max(0, s.unrec1250), ltcg: Math.max(0, s.capGain) }, 0).total;
    var niit = 0;
    if (cfg.tax.niit !== false && !s.reps) {
      var gain = Math.max(0, s.rec1245) + Math.max(0, s.unrec1250) + Math.max(0, s.capGain);
      var agi = ord + Math.max(0, s.unrec1250) + Math.max(0, s.capGain);
      niit = T.niit.rate * Math.max(0, Math.min(gain, agi - tb.niitThreshold));
    }
    /* Can be negative: released suspended losses shelter other income. */
    return (after - before) + niit;
  }

  FPE.tax = { tables: tables, stacked: stacked, yearTax: yearTax, annual: annual, saleTax: saleTax };
})(FPE);
