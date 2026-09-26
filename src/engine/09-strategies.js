/* ============================================================================
   PORTFOLIO STRATEGIES — the levers that act on the whole portfolio or on a
   building after purchase: refinancing, HELOC, 1031, paydown, tax appeal,
   idle cash. Every one is off unless switched on (idle cash defaults to a
   money-market account, because 0% is not where anyone keeps savings).
   Building-level levers (RUBS, vouchers, heat, unit modes, ancillary) live in
   operations; the acquisition-side levers (seller financing, assumption,
   points, interest-only, license) are applied at purchase in the simulation.
   ========================================================================== */
(function (FPE) {
  'use strict';
  var U = FPE.util, L = FPE.lending;

  /* ------------------------------------------------------ idle-cash returns */
  function vehicleMonthly(env, vehicle, t) {
    var C = env.cfg.cash;
    switch (vehicle) {
      case 'moneyMarket': return { r: U.monthlyFactor(C.mmYield) - 1, kind: 'ordinary', reserve: 1 };
      case 'tbills': return { r: U.monthlyFactor(C.tbillYield) - 1, kind: 'tbill', reserve: 1 };
      case 'indexFund': {
        var mu = U.monthlyFactor(C.indexReturn) - 1, r = mu;
        if (env.rng) r = mu + new U.Rng(U.hash32(env.seed, 'index', t)).normal(0, C.indexVol / Math.sqrt(12));
        return { r: r, kind: 'index', reserve: 0.7 };
      }
      case 'metals': {
        var m2 = U.monthlyFactor(C.metalsReturn) - 1, r2 = m2;
        if (env.rng) r2 = m2 + new U.Rng(U.hash32(env.seed, 'metals', t)).normal(0, C.metalsVol / Math.sqrt(12));
        return { r: r2, kind: 'none', reserve: 0 };
      }
      case 'yours1': return { r: C.yours1Monthly, kind: 'ordinary', reserve: 1 };
      case 'yours2': return { r: C.yours2Monthly, kind: 'ordinary', reserve: 1 };
      default: return { r: 0, kind: 'none', reserve: 1 };
    }
  }
  function activeVehicle(cfg) { return cfg.cash.policy === 'bestUse' ? cfg.cash.bestUseVehicle : cfg.cash.policy; }

  /* --------------------------------------------------------- cash-out refi */
  function cashOut(env, S, p, t, ctx) {
    var X = env.cfg.strategies.cashOutRefi;
    if (!X.enabled || p.ownerOccupied) return null;
    if (t - p.purchaseMonth < X.seasoningMonths || t - (p.lastRefi || -999) < X.seasoningMonths) return null;
    if (X.beforeQuitOnly && ctx.stage === 'quit') return null;
    var view = FPE.ops.lenderView(env, p, t);
    var product = p.units >= 5 ? 'commercial' : 'dscr';
    var max = L.maxRefiLoan(env.cfg, env.M, t, view, product, X.maxLtv);
    var penalty = L.prepayPenalty(p.loan, t, p.loan.balance);
    var costs = max.amount * env.cfg.lending.refiCostPct;
    var net = max.amount - p.loan.balance - costs - penalty;
    if (net < X.minProceeds) return null;
    var old = p.loan;
    p.loan = L.makeLoan({ product: product, month: t, balance: max.amount, value: view.value, rate: max.rate, amortYears: max.amort,
                          balloonYears: product === 'commercial' ? env.cfg.lending.commercial.balloonYears : null,
                          prepayYears: product === 'dscr' ? env.cfg.lending.dscr.prepayYears : 0 });
    p.loan.refis = old.refis + 1;
    p.lastRefi = t; p.product = product;
    return { proceeds: net, costs: costs + penalty, text: p.nickname + ': cash-out refinance released ' + U.fmtMoney(net) +
             ' at ' + U.fmtPct(max.rate, 2) + (old.fha ? ' — FHA mortgage insurance ends' : '') };
  }

  /* ------------------------------------------------- rate-and-term refinance */
  function rateRefi(env, S, p, t) {
    var X = env.cfg.strategies.rateRefi;
    if (!X.enabled || p.loan.balance <= 0.005 || p.loan.sellerNote || p.loan.assumed) return null;
    if (t - p.purchaseMonth < 12 || t - (p.lastRateRefi || -999) < 18) return null;
    var product = p.loan.product === 'fha' || p.loan.product === 'convOO' || p.loan.product === 'convInv' ? p.loan.product : (p.units >= 5 ? 'commercial' : 'dscr');
    var newRate = env.M.rate(product, t);
    if (newRate > p.loan.rate - X.dropBps / 10000) return null;
    var term = X.resetTerm ? p.loan.amortYears : L.remainingYears(p.loan);
    var newPay = U.pmt(p.loan.balance, newRate, term);
    var relief = p.loan.payment - newPay;
    var cost = p.loan.balance * env.cfg.lending.refiCostPct + L.prepayPenalty(p.loan, t, p.loan.balance);
    if (relief <= 0 || cost / relief > X.maxBreakevenMonths) return null;
    p.loan.rate = newRate; p.loan.payment = newPay; p.loan.refis++;
    if (X.resetTerm) { p.loan.amortYears = term; p.loan.monthsElapsed = 0; }
    p.lastRateRefi = t;
    return { costs: cost, text: p.nickname + ': rate-and-term refinance to ' + U.fmtPct(newRate, 2) + ' — payment down ' + U.fmtDollars(relief) + '/mo' };
  }

  /* ------------------------------------- refinance out of FHA mortgage insurance */
  function fhaRefi(env, S, p, t, ctx) {
    var X = env.cfg.strategies.fhaRefi;
    if (!X.enabled || !p.loan.fha || p.loan.balance <= 0.005 || !p.loan.miRate) return null;
    var value = FPE.ops.value(env, p, t);
    if (p.loan.balance > 0.80 * value) return null;
    var product = p.ownerOccupied ? 'convOO' : (ctx.canConventional ? 'convInv' : 'dscr');
    var newRate = env.M.rate(product, t);
    var newPay = U.pmt(p.loan.balance, newRate, L.remainingYears(p.loan));
    var oldPay = p.loan.payment + p.loan.balance * p.loan.miRate / 12;
    var savings = oldPay - newPay;
    var cost = p.loan.balance * env.cfg.lending.refiCostPct;
    if (savings <= 0 || cost / savings > X.maxBreakevenMonths) return null;
    var old = p.loan;
    p.loan = L.makeLoan({ product: product, month: t, balance: old.balance, value: value, rate: newRate, amortYears: L.remainingYears(old),
                          prepayYears: product === 'dscr' ? env.cfg.lending.dscr.prepayYears : 0 });
    p.loan.refis = old.refis + 1; p.product = product;
    return { costs: cost, fhaEnded: true, text: p.nickname + ': refinanced out of FHA — mortgage insurance gone, payment down ' + U.fmtDollars(savings) + '/mo' };
  }

  /* ------------------------------------------------------------------ HELOC */
  function helocLimit(env, S, t) {
    var H = env.cfg.strategies.heloc;
    if (!H.enabled) return 0;
    var cap = 0;
    S.props.forEach(function (p) {
      if (t - p.purchaseMonth < H.seasoningMonths) return;
      var v = FPE.ops.value(env, p, t);
      var cltv = p.loan.balance <= 0.005 ? H.freeClearCltv : H.maxCltv;
      cap += Math.max(0, v * cltv - p.loan.balance);
    });
    return Math.min(cap, H.lineCap);
  }
  function helocFrozen(env, t) {
    var H = env.cfg.strategies.heloc;
    return H.enabled && H.freezeInRecession && !!env.M.recession(t);
  }

  /* --------------------------------------------------------------- paydown */
  function paydownTarget(env, S) {
    var P = env.cfg.strategies.paydown;
    var pool = S.props.filter(function (p) { return p.loan.balance > 0.005 && !p.ownerOccupied; });
    if (!pool.length) return null;
    if (P.order === 'target') { for (var i = 0; i < pool.length; i++) if (pool[i].seq === P.targetSeq) return pool[i]; return pool[0]; }
    var best = null, bk = -Infinity;
    pool.forEach(function (p) {
      var k;
      switch (P.order) {
        case 'snowball': k = -p.loan.balance; break;
        case 'highestPayment': k = p.loan.payment; break;
        case 'thinnest': k = -(p.lastCF || 0); break;
        default: k = p.loan.rate + (p.loan.miRate || 0);
      }
      if (k > bk) { bk = k; best = p; }
    });
    return best;
  }
  function applyPaydown(env, S, p, amount, t) {
    amount = Math.min(amount, p.loan.balance);
    if (amount <= 0.01) return null;
    var penalty = L.prepayPenalty(p.loan, t, amount) * 0;       // partial prepayments under 20% a year are usually penalty-free
    p.loan.balance -= amount; p.loan.extraPaid += amount;
    var ev = { amount: amount, relief: 0, fee: 0, paidOff: false };
    if (p.loan.balance <= 0.01) {
      p.loan.balance = 0; p.loan.payment = 0; p.loan.miRate = 0; ev.paidOff = true;
      p.freeAndClear = t;
    } else if (env.cfg.strategies.paydown.recast && env.cfg.lending.recastAllowed && p.loan.recastable &&
               amount >= env.cfg.strategies.paydown.recastMin) {
      ev.relief = L.recast(p.loan); ev.fee = env.cfg.lending.recastFee;
    }
    return ev;
  }

  /* ------------------------------------------------------------- 1031 exchange */
  function exchangeCandidate(env, S, t) {
    var X = env.cfg.strategies.exchange1031;
    if (!X.enabled || (S.exchanges || 0) >= X.maxExchanges || t - (S.lastExchange || -999) < 24) return null;
    var equity = U.sum(S.props, function (p) { return FPE.ops.value(env, p, t) - p.loan.balance; });
    if (equity < X.trigger) return null;
    var best = null, be = -Infinity;
    S.props.forEach(function (p) {
      if (p.ownerOccupied || t - p.purchaseMonth < 24 || p.units >= X.targetUnits) return;
      var e = FPE.ops.value(env, p, t) - p.loan.balance;
      if (e > be) { be = e; best = p; }
    });
    return best;
  }

  /* -------------------------------------------------------------- tax appeal */
  function taxAppeal(env, p, t) {
    var X = env.cfg.strategies.taxAppeal;
    if (!X.enabled || p.appealDone || p.appealAt == null || t < p.appealAt) return null;
    p.appealDone = true;
    var rate = p.units >= env.cfg.market.tax.commercialThreshold ? env.cfg.market.tax.commercialRate : env.cfg.market.tax.residentialRate;
    var formula = FPE.ops.value(env, p, t) * rate * env.cfg.market.tax.assessmentRatio;
    if (X.onlyOverAssessed && p.taxBill <= formula * 1.05) return { cost: 0, text: null };
    var cut = p.taxBill * X.reductionPct;
    p.taxBill -= cut; p.taxAppealCut = 0;                         // the lower base carries forward
    return { cost: X.cost, text: p.nickname + ': assessment appealed — ' + U.fmtMoney(cut) + '/yr off the tax bill' };
  }

  FPE.strategies = {
    vehicleMonthly: vehicleMonthly, activeVehicle: activeVehicle,
    cashOut: cashOut, rateRefi: rateRefi, fhaRefi: fhaRefi,
    helocLimit: helocLimit, helocFrozen: helocFrozen,
    paydownTarget: paydownTarget, applyPaydown: applyPaydown,
    exchangeCandidate: exchangeCandidate, taxAppeal: taxAppeal
  };
})(FPE);
