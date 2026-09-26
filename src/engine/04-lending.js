/* ============================================================================
   LENDING — loan mechanics, and each product gated the way that product is
   actually underwritten.

     FHA          debt-to-income + 3–4 unit self-sufficiency on appraised rent
     conv OO      debt-to-income, 5% down, PMI to 78% of original value
     conv invest  debt-to-income with 75% of rents, Fannie reserves, 10 cap
     DSCR         gross rent (lesser of lease and market) ÷ PITIA
     commercial   NOI ÷ debt service
     seller       negotiated; no underwriter
     assumed      the seller's loan continues; the equity gap is cash

   The September 2026 audit found the previous engine used one NOI-based DSCR
   for every product and fed it the GREATER of in-place and market rent. Both
   halves were wrong in ways that partly cancelled.
   ========================================================================== */
(function (FPE) {
  'use strict';
  var U = FPE.util, D = FPE.data;

  var PREPAY = { 5: [0.05, 0.04, 0.03, 0.02, 0.01], 3: [0.03, 0.02, 0.01], 0: [] };

  /* ================================================================ loans */
  function makeLoan(o) {
    var io = Math.max(0, Math.round((o.ioYears || 0) * 12));
    var loan = {
      id: o.id || null, product: o.product, origMonth: o.month,
      origBalance: o.balance, origValue: o.value || o.balance, balance: o.balance,
      rate: o.rate, amortYears: o.amortYears, monthsElapsed: o.monthsElapsed || 0,
      payment: 0, ioLeft: io,
      miRate: o.miRate || 0, miKind: o.miKind || null, miCancelLtv: o.miCancelLtv == null ? null : o.miCancelLtv,
      balloonAt: o.balloonYears ? o.month + Math.round(o.balloonYears * 12) : null,
      prepay: o.prepayYears ? PREPAY[o.prepayYears] || null : null,
      recastable: o.recastable !== false, fha: !!o.fha,
      sellerNote: !!o.sellerNote, assumed: !!o.assumed,
      extraPaid: 0, recasts: 0, refis: 0, interestPaid: 0, mortgageInsurancePaid: 0,
      ioStepUp: 0
    };
    loan.payment = io > 0 ? loan.balance * loan.rate / 12
                          : U.pmt(loan.balance, loan.rate, remainingYears(loan));
    return loan;
  }
  function remainingYears(loan) { return Math.max(1 / 12, loan.amortYears - loan.monthsElapsed / 12); }
  function miMonthly(loan) {
    if (!loan.miRate || loan.balance <= 0.005) return 0;
    if (loan.miCancelLtv != null && loan.balance <= loan.miCancelLtv * loan.origValue) {
      loan.miRate = 0;                                       // cancelled for good
      return 0;
    }
    return loan.balance * loan.miRate / 12;
  }
  /* One month of a loan. Returns what was paid. */
  function step(loan) {
    if (loan.balance <= 0.005) { loan.balance = 0; return { interest: 0, principal: 0, mi: 0, pi: 0, ioEnded: false }; }
    var interest = loan.balance * loan.rate / 12, principal = 0, ioEnded = false;
    var mi = miMonthly(loan);
    if (loan.ioLeft > 0) {
      loan.payment = interest;
      loan.ioLeft--;
      if (loan.ioLeft === 0) {
        var before = loan.payment;
        loan.monthsElapsed++;
        loan.payment = U.pmt(loan.balance, loan.rate, remainingYears(loan));
        loan.monthsElapsed--;
        loan.ioStepUp = loan.payment - before;
        ioEnded = true;
      }
    } else {
      principal = Math.min(loan.balance, Math.max(0, loan.payment - interest));
      loan.balance -= principal;
    }
    loan.monthsElapsed++;
    loan.interestPaid += interest;
    loan.mortgageInsurancePaid += mi;
    return { interest: interest, principal: principal, mi: mi, pi: interest + principal, ioEnded: ioEnded };
  }
  function recast(loan) {
    if (loan.balance <= 0.005) { loan.payment = 0; return 0; }
    var before = loan.payment;
    loan.payment = U.pmt(loan.balance, loan.rate, remainingYears(loan));
    loan.recasts++;
    return before - loan.payment;
  }
  function prepayPenalty(loan, t, amount) {
    if (!loan.prepay || !loan.prepay.length) return 0;
    var yr = Math.floor((t - loan.origMonth) / 12);
    return yr < loan.prepay.length ? amount * loan.prepay[yr] : 0;
  }
  /* Payment + mortgage insurance, the "PI + MI" part of PITIA. */
  function debtService(loan) { return loan.balance > 0.005 ? loan.payment + (loan.miRate ? loan.balance * loan.miRate / 12 : 0) : 0; }

  /* ======================================================= qualification
     deal: {
       units, price, appraisedValue,
       rents: [{ lease, marketAsIs, occupied, owner }]   per unit, monthly
       taxMonthly, insMonthly, hoaMonthly, utilitiesMonthly, maintenancePct,
       otherIncome
     }
     book: the owner's finances, supplied by the simulation:
       { w2Monthly, incomeOk (bool), otherDebts, housingMonthly,
         rentals: [{ net75 }], financedCount, fhaActive,
         otherUPB, liquidAfter(cashSpent) }                                 */
  function subjectRents(deal, basis) {
    var s = 0;
    deal.rents.forEach(function (u) {
      if (u.owner) return;
      if (!u.occupied) { s += u.marketAsIs; return; }
      switch (basis) {
        case 'lease': s += u.lease; break;
        case 'market': s += u.marketAsIs; break;
        case 'greater': s += Math.max(u.lease, u.marketAsIs); break;
        default: s += Math.min(u.lease, u.marketAsIs);
      }
    });
    return s;
  }
  function appraisedRentAllUnits(deal) {
    return U.sum(deal.rents, function (u) { return u.marketAsIs; });
  }

  function productTerms(cfg, product, deal, M, t) {
    var L = cfg.lending, ST = cfg.strategies, T = {};
    var tight = M.creditTight(t);
    var ltvCut = tight ? tight.ltvCut : 0;
    switch (product) {
      case 'fha':
        T = { down: L.fha.downPct, rate: M.rate('fha', t), amort: L.amortYears, ufmip: L.fha.ufmip,
              miRate: L.fha.annualMip, miCancelLtv: null, recastable: false, fha: true, ownerOcc: true }; break;
      case 'convOO':
        T = { down: L.convOO.downPct, rate: M.rate('convOO', t), amort: L.amortYears, miRate: L.convOO.pmiRate,
              miCancelLtv: L.convOO.pmiCancelLtv, ownerOcc: true }; break;
      case 'convInv':
        T = { down: Math.max(L.convInv.downPct + ltvCut, 0), rate: M.rate('convInv', t), amort: L.amortYears }; break;
      case 'dscr':
        T = { down: L.dscr.downPct + ltvCut, rate: M.rate('dscr', t), amort: L.amortYears, prepayYears: L.dscr.prepayYears }; break;
      case 'commercial':
        T = { down: L.commercial.downPct + ltvCut, rate: M.rate('commercial', t), amort: L.commercial.amortYears,
              balloonYears: L.commercial.balloonYears }; break;
      case 'seller':
        T = { down: ST.sellerFinance.downPct, rate: ST.sellerFinance.rate, amort: ST.sellerFinance.amortYears,
              balloonYears: ST.sellerFinance.balloonYears, sellerNote: true,
              closingPct: ST.sellerFinance.closingCostPct }; break;
      case 'assumed':
        T = { assumed: true }; break;
    }
    if (!T.ownerOcc && product !== 'seller' && product !== 'assumed' && cfg.cash.biggerDown.enabled) {
      T.down = Math.max(T.down, cfg.cash.biggerDown.pct);
    }
    if (ST.points.enabled && product !== 'seller' && product !== 'assumed') {
      T.points = ST.points.points; T.rate -= ST.points.points * ST.points.ratePerPoint;
    }
    if (ST.interestOnly.enabled && (product === 'dscr' || product === 'commercial' || product === 'seller')) {
      T.ioYears = ST.interestOnly.years;
    }
    return T;
  }

  /* Underwrite one financing option. Returns everything the acquisition test
     and the deal card need, with each failed gate named. */
  function underwrite(cfg, M, t, deal, product, book, extras) {
    extras = extras || {};
    var L = cfg.lending, fails = [], T = productTerms(cfg, product, deal, M, t);
    var price = deal.price, loan, rate = T.rate, amort = T.amort;
    var closing = price * (T.closingPct != null ? T.closingPct : cfg.market.closingCostPct);
    var assumptionFee = 0, ufmip = 0;

    if (product === 'assumed') {
      var A = deal.assumable;
      loan = A.balance; rate = A.rate; amort = Math.max(1, A.termYears - A.monthsElapsed / 12);
      assumptionFee = cfg.strategies.assumption.fee;
      if (price - loan > cfg.strategies.assumption.maxEquityGap) fails.push({ code: 'equityGap', value: price - loan });
      T.down = price > 0 ? Math.max(0, (price - loan) / price) : 1;
    } else {
      loan = price * (1 - T.down);
      if (product === 'fha') {
        var limit = D.LENDER.fhaLoanLimits2026[Math.min(4, deal.units)] || Infinity;
        if (loan > limit) fails.push({ code: 'fhaLimit', value: loan });
        ufmip = loan * T.ufmip;
      }
    }
    var financed = loan + ufmip;
    var pointsCost = (T.points || 0) * 0.01 * loan;
    closing += pointsCost;

    var ioYears = T.ioYears || 0;
    var payment = ioYears > 0 ? financed * rate / 12 : U.pmt(financed, rate, amort);
    var amortPayment = U.pmt(financed, rate, amort);            // lenders qualify on the amortizing payment
    var mi = (T.miRate || 0) * financed / 12;
    var pitia = amortPayment + mi + deal.taxMonthly + deal.insMonthly + (deal.hoaMonthly || 0);
    var metrics = { pitia: pitia };

    /* ----- product gates ----- */
    var tight = M.creditTight(t);
    if (product === 'dscr') {
      var rentsDscr = subjectRents(deal, L.dscr.rentBasis);
      var dscr = pitia > 0 ? rentsDscr / pitia : 99;
      metrics.dscr = dscr; metrics.dscrRents = rentsDscr;
      var need = L.dscr.minDscr + (tight ? tight.dscrAdd : 0);
      if (dscr < need) fails.push({ code: 'dscr', value: dscr, need: need });
    }
    if (product === 'commercial') {
      var gross = subjectRents(deal, 'lease') + (deal.otherIncome || 0);
      var egi = gross * (1 - Math.max(0.05, extras.vacancy || 0));
      var opex = deal.taxMonthly + deal.insMonthly + (deal.hoaMonthly || 0) + (deal.utilitiesMonthly || 0) +
                 gross * (deal.maintenancePct || 0.08) + gross * 0.05 + 250 * deal.units / 12;
      var noiDscr = (egi - opex) / Math.max(1e-9, amortPayment);
      metrics.noiDscr = noiDscr;
      var needC = L.commercial.minDscr + (tight ? tight.dscrAdd : 0);
      if (noiDscr < needC) fails.push({ code: 'noiDscr', value: noiDscr, need: needC });
    }
    if (product === 'fha' && deal.units >= 3 && L.fha.selfSufficiency) {
      var ss = 0.75 * appraisedRentAllUnits(deal);
      metrics.selfSufficiency = ss / Math.max(1e-9, pitia);
      if (ss < pitia) fails.push({ code: 'selfSufficiency', value: metrics.selfSufficiency, need: 1 });
    }
    if (product === 'convInv') {
      if (book.financedCount + 1 > L.convInv.maxFinanced) fails.push({ code: 'financedCap', value: book.financedCount });
    }
    if (product === 'fha' && book.fhaActive) fails.push({ code: 'oneFha' });

    /* ----- debt-to-income: agency products only, and only with a W-2 ----- */
    if ((product === 'fha' || product === 'convOO' || product === 'convInv') &&
        cfg.income.w2.enabled && L.gates.dti) {
      if (!book.incomeOk) fails.push({ code: 'noIncomeHistory' });
      else {
        var income = book.w2Monthly, debts = book.otherDebts;
        (book.rentals || []).forEach(function (r) { if (r.net75 >= 0) income += r.net75; else debts -= r.net75; });
        if (T.ownerOcc) {
          debts += pitia;                                               // new housing payment
          income += 0.75 * subjectRents(deal, 'lease');                 // the other units' rent
        } else {
          debts += book.housingMonthly;
          var net = 0.75 * subjectRents(deal, 'lease') - pitia;
          if (net >= 0) income += net; else debts -= net;
        }
        var dti = income > 0 ? debts / income : 99;
        metrics.dti = dti;
        var maxDti = product === 'fha' ? L.fha.maxDti : (product === 'convOO' ? L.convOO.maxDti : L.convInv.maxDti);
        if (dti > maxDti) fails.push({ code: 'dti', value: dti, need: maxDti });
      }
    }

    /* ----- cash to close ----- */
    var downCash = product === 'assumed' ? price - loan : price * T.down;
    var cashToClose = downCash + closing + assumptionFee + (extras.addCash || 0) - (extras.creditAtClose || 0);

    /* ----- reserves after closing ----- */
    var reserves = 0;
    if (L.gates.reserves) {
      switch (product) {
        case 'fha': reserves = deal.units >= 3 ? L.fha.reservesMonths34 * pitia : 0; break;
        case 'convOO': reserves = L.convOO.reservesMonths * pitia; break;
        case 'convInv':
          reserves = L.convInv.reservesMonths * pitia;
          if (L.convInv.otherReserves) {
            /* Fannie B3-4.1-01: 2% / 4% / 6% of other financed balances for
               1–4 / 5–6 / 7–10 financed properties. */
            var n = book.financedCount + 1;
            var pct = n <= 4 ? 0.02 : (n <= 6 ? 0.04 : 0.06);
            reserves += pct * (book.otherUPB || 0);
          }
          break;
        case 'dscr': reserves = L.dscr.reservesMonths * pitia; break;
        case 'commercial': reserves = L.commercial.reservesMonths * pitia; break;
      }
    }

    return {
      product: product, ownerOcc: !!T.ownerOcc, ok: fails.length === 0, fails: fails,
      price: price, down: T.down, downCash: downCash, loanAmount: loan, ufmip: ufmip, financed: financed,
      rate: rate, amortYears: amort, ioYears: ioYears, payment: payment, amortPayment: amortPayment,
      miMonthly: mi, miRate: T.miRate || 0, miCancelLtv: T.miCancelLtv == null ? null : T.miCancelLtv,
      balloonYears: T.balloonYears || null, prepayYears: T.prepayYears || 0,
      recastable: T.recastable !== false, fha: !!T.fha, sellerNote: !!T.sellerNote, assumed: !!T.assumed,
      closing: closing, points: pointsCost, assumptionFee: assumptionFee,
      cashToClose: cashToClose, reservesRequired: reserves, pitia: pitia, metrics: metrics
    };
  }

  function loanFromUW(uw, t, value, deal) {
    var l = makeLoan({
      product: uw.product, month: t, balance: uw.financed, value: value, rate: uw.rate,
      amortYears: uw.amortYears, ioYears: uw.ioYears, miRate: uw.miRate, miKind: uw.fha ? 'mip' : (uw.miRate ? 'pmi' : null),
      miCancelLtv: uw.miCancelLtv, balloonYears: uw.balloonYears, prepayYears: uw.prepayYears,
      recastable: uw.recastable, fha: uw.fha, sellerNote: uw.sellerNote, assumed: uw.assumed
    });
    if (uw.assumed && deal && deal.assumable) {
      l.monthsElapsed = 0; l.amortYears = uw.amortYears;
      l.payment = U.pmt(l.balance, l.rate, l.amortYears);
    }
    return l;
  }

  /* ============================================== refinancing a building
     Largest new loan a lender will make on a property today, by product.
     `p` supplies: value, units, rents (like deal.rents), taxMonthly,
     insMonthly, hoaMonthly, utilitiesMonthly, maintenancePct, otherIncome. */
  function maxRefiLoan(cfg, M, t, p, product, ltv) {
    var rate = M.rate(product, t), amort = product === 'commercial' ? cfg.lending.commercial.amortYears : cfg.lending.amortYears;
    var tight = M.creditTight(t);
    var byLtv = p.value * Math.max(0, ltv - (tight ? tight.ltvCut : 0));
    var fixed = p.taxMonthly + p.insMonthly + (p.hoaMonthly || 0);
    var byCover;
    if (product === 'commercial') {
      var gross = subjectRents(p, 'lease') + (p.otherIncome || 0);
      var noi = gross * 0.95 - fixed - (p.utilitiesMonthly || 0) - gross * (p.maintenancePct || 0.08) - gross * 0.05 - 250 * p.units / 12;
      byCover = U.loanForPayment(Math.max(0, noi / (cfg.lending.commercial.minDscr + (tight ? tight.dscrAdd : 0))), rate, amort);
    } else {
      var rents = subjectRents(p, cfg.lending.dscr.rentBasis);
      var maxPay = rents / (cfg.lending.dscr.minDscr + (tight ? tight.dscrAdd : 0)) - fixed;
      byCover = U.loanForPayment(Math.max(0, maxPay), rate, amort);
    }
    return { amount: Math.max(0, Math.min(byLtv, byCover)), rate: rate, amort: amort, byLtv: byLtv, byCover: byCover };
  }

  FPE.lending = {
    makeLoan: makeLoan, step: step, recast: recast, remainingYears: remainingYears,
    prepayPenalty: prepayPenalty, debtService: debtService, miMonthly: miMonthly,
    underwrite: underwrite, loanFromUW: loanFromUW, subjectRents: subjectRents,
    appraisedRentAllUnits: appraisedRentAllUnits, maxRefiLoan: maxRefiLoan, productTerms: productTerms
  };
})(FPE);
