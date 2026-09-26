/* ============================================================================
   EXIT — what the portfolio is worth two ways, at any date:
     held   unrealised equity + cash − HELOC (heirs take a stepped-up basis,
            so this is also the "hold for life" value)
     sold   after selling costs, loan payoffs and prepayment penalties, and
            the tax a sale triggers: §1245 recapture on cost-segregated
            property at ordinary rates, unrecaptured §1250 at up to 25%,
            capital gain at 0/15/20%, NIIT, ND with its 40% exclusion, and
            suspended passive losses released by a full disposition.
   Also used for forced sales (a balloon that cannot refinance).
   ========================================================================== */
(function (FPE) {
  'use strict';
  var U = FPE.util;

  function basisParts(p) {
    var b = p.basis;
    var impr = U.sum(b.improvements, function (x) { return x.amount; });
    var accImpr1250 = U.sum(b.improvements, function (x) { return x.fiveYear ? 0 : x.acc; });
    var accImpr1245 = U.sum(b.improvements, function (x) { return x.fiveYear ? x.acc : 0; });
    var cost = b.land + b.building + b.shortLife + b.carryoverOriginal + impr;
    var acc1245 = b.accShort + accImpr1245;
    var acc1250 = b.accBuilding + b.accCarry + accImpr1250;
    return { cost: cost, acc1245: acc1245, acc1250: acc1250, adjusted: cost - acc1245 - acc1250 - (b.deferredGain || 0) };
  }

  function saleParts(env, p, t, price) {
    var cfg = env.cfg;
    var v = price != null ? price : FPE.ops.value(env, p, t);
    var sellCost = v * cfg.market.sellingCostPct;
    var prepay = FPE.lending.prepayPenalty(p.loan, t, p.loan.balance);
    var bp = basisParts(p);
    var gain = v - sellCost - bp.adjusted;
    var g = Math.max(0, gain);
    var rec1245 = Math.min(g, bp.acc1245);
    var unrec1250 = Math.min(g - rec1245, bp.acc1250);
    var capGain = g - rec1245 - unrec1250;
    return { price: v, sellCost: sellCost, payoff: p.loan.balance, prepay: prepay, gain: gain,
             rec1245: rec1245, unrec1250: unrec1250, capGain: capGain, loss: Math.min(0, gain),
             netBeforeTax: v - sellCost - p.loan.balance - prepay };
  }

  /* Sell everything at month t. `ordinaryIncome` is the owner's other taxable
     income that year (wages); `carry` holds suspended losses and NOLs. */
  function liquidate(env, S, t, ordinaryIncome, reps) {
    var cfg = env.cfg, parts = { rec1245: 0, unrec1250: 0, capGain: 0 }, net = 0, sellCost = 0, gross = 0, prepay = 0, debt = 0;
    S.props.forEach(function (p) {
      var s = saleParts(env, p, t);
      parts.rec1245 += s.rec1245; parts.unrec1250 += s.unrec1250; parts.capGain += s.capGain + s.loss;
      net += s.netBeforeTax; sellCost += s.sellCost; gross += s.price; prepay += s.prepay; debt += s.payoff;
    });
    parts.capGain = Math.max(0, parts.capGain);
    var tax = 0;
    if (cfg.tax.enabled && S.props.length) {
      tax = FPE.tax.saleTax(cfg, U.yearOf(t), ordinaryIncome, {
        rec1245: parts.rec1245, unrec1250: parts.unrec1250, capGain: parts.capGain,
        releasedLosses: (S.carry.passive || 0) + (S.carry.nol || 0), reps: reps
      });
    }
    var other = S.cash + S.reserve - S.heloc.balance + (S.fund || 0);
    var home = S.home ? (S.home.value - S.home.loan.balance) : 0;
    return { gross: gross, sellCost: sellCost, prepay: prepay, debt: debt, tax: tax,
             netProperties: net - tax, other: other, home: home,
             soldNetWorth: net - tax + other + home, parts: parts };
  }

  FPE.exit = { basisParts: basisParts, saleParts: saleParts, liquidate: liquidate };
})(FPE);
