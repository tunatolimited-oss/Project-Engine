/* ============================================================================
   THE SIMULATION — one pass per month, deterministic unless a seed is given.

   runSimulation(cfg)                → the base run (expected values)
   runSimulation(cfg, {rng, seed})   → one simulated future (uncertainty layer)

   Order within a month (each step's reason is noted where it matters):
     1  January resets (tax bills, insurance, utilities)
     2  life: career stage, contribution or draw, wages
     3  housing moves (house-hack stays end; own home)
     4  each building: operations, debt service, balloon test,
        depreciation, capital work, reserve
     5  HELOC interest; refinances; appeals; 1031
     6  management trigger (hours against your budget)
     7  idle-cash returns
     8  draws before quitting
     9  deal supply accrues
    10  paydown when it outranks buying
    11  acquisition test — every candidate × every product × every gate
    12  December income tax, AFTER the acquisition so a December purchase
        counts in that year
    13  paydown / best use of what is left
    14  record the month
   ========================================================================== */
(function (FPE) {
  'use strict';
  var U = FPE.util, LEND = FPE.lending, OPS = FPE.ops, SRC = FPE.sourcing, STR = FPE.strategies,
      LIFE = FPE.life, EXIT = FPE.exit, TAX = FPE.tax;

  function runSimulation(cfg, opts) {
    opts = opts || {};
    var rng = opts.rng || null, seed = opts.seed || 0, lean = !!opts.lean;
    var M = FPE.market.create(cfg, { rng: rng });
    var start = M.start, months = Math.round(cfg.plan.horizonYears * 12), end = start + months;
    var env = { cfg: cfg, M: M, rng: rng, seed: seed, start: start, events: [], milestones: [], managed: false };
    var S = {
      cash: cfg.plan.startingCash, reserve: 0, fund: 0, heloc: { balance: 0, limit: 0, interest: 0, drawn: 0 },
      props: [], seq: 0, carry: { passive: 0, nol: 0 }, fhaActive: false, exchanges: 0, lastExchange: -999,
      home: null, taxAccrual: 0, marginal: 0.24, forcedSales: 0, extraPrincipal: 0, freeClear: 0,
      totalContributed: cfg.plan.startingCash, totalTax: 0, totalDraws: 0, commission: 0, licensed: false, licenseStarted: false
    };
    var LF = LIFE.init(cfg, start), SO = SRC.init();
    env.managed = LF.managed;
    var rows = [], acquisitions = [], years = [], milestones = env.milestones;
    var incomeHist = [], hoursHist = [], cfHist = [];
    var ya = newYear();
    var lastNeed = null;             // cash the most recent candidate needed — the paydown war chest

    function newYear() {
      return { wages: 0, w2Hours: 0, passiveNet: 0, nonPassiveNet: 0, investOrdinary: 0, investTbill: 0, investLtcg: 0,
               commission: 0, reHours: 0, rentalHours: 0, servicesHours: 0, cashFlow: 0, noi: 0, gpr: 0, collected: 0,
               debtService: 0, capital: 0, contributions: 0, acquisitions: 0, income: 0 };
    }
    function vehicle(t) { return STR.vehicleMonthly(env, STR.activeVehicle(cfg), t); }
    function efRequired(t) {
      var E = cfg.life.emergencyFund;
      if (!E.enabled) return 0;
      return E.months * monthlyCosts(t);
    }
    function monthlyCosts(t) { return LIFE.livingCost(cfg, M, t) + LIFE.housingNeed(cfg, M, t, LF); }
    function usable() { return S.cash - S.fund; }
    function eligibleLiquid(cashAfter, t) {
      var floor = cfg.cash.operatingFloor, v = vehicle(t);
      return Math.min(cashAfter, floor) + Math.max(0, cashAfter - floor) * v.reserve + S.reserve;
    }
    function pitiaOf(p) { return LEND.debtService(p.loan) + p.taxBill / 12 + p.specials / 12 + p.insurance / 12 + p.hoa; }
    function financedCount() {
      var n = 0;
      S.props.forEach(function (p) {
        if (p.loan.balance <= 0.005 || p.units > 4) return;
        if (p.loan.sellerNote && !cfg.lending.convInv.countSellerNotes) return;
        n++;
      });
      if (S.home && S.home.loan.balance > 0.005) n++;
      return n;
    }
    function book(t, jobless) {
      var stage = LF.stage, w2 = 0, incomeOk = true;
      if (cfg.income.w2.enabled) {
        if (jobless) { incomeOk = false; }
        else if (stage === 'full') w2 = LIFE.w2Annual(cfg, t) / 12;
        else if (stage === 'part') w2 = cfg.life.career.partTime.annualIncome * M.cpiIndex(t) / 12;
        else if (stage === 'quit') incomeOk = LF.quitFrom != null && (t - LF.quitFrom) >= cfg.lending.gates.historyAfterQuit;
      }
      var rentals = [], housing = LIFE.housingCost(cfg, M, t, LF), otherUPB = 0;
      S.props.forEach(function (p) {
        var lease = U.sum(p.unitsArr, function (u) { return u.owner ? 0 : u.rent; });
        if (p.ownerOccupied) { housing = pitiaOf(p); rentals.push({ net75: 0.75 * lease }); return; }
        rentals.push({ net75: 0.75 * lease - pitiaOf(p) });
        if (p.units <= 4) otherUPB += p.loan.balance;
      });
      if (S.home) housing = S.home.pitia;
      var helocPay = S.heloc.balance > 0.01 ? S.heloc.balance * M.rate('heloc', t) / 12 : 0;
      return { w2Monthly: w2, incomeOk: incomeOk, otherDebts: cfg.income.otherDebtsMonthly + helocPay, housingMonthly: housing,
               rentals: rentals, financedCount: financedCount(), fhaActive: S.fhaActive, otherUPB: otherUPB };
    }
    function trailing(hist, n) {
      if (!hist.length) return 0;
      var a = hist.slice(-n); return U.sum(a) / a.length;
    }
    function addEvent(t, type, text) { env.events.push({ type: type, text: text }); }
    function milestone(t, kind, text) {
      if (!milestones.some(function (m) { return m.kind === kind && kind !== 'acquisition' && kind !== 'forcedSale'; }))
        milestones.push({ t: t, kind: kind, text: text });
    }

    /* ------------------------------------------------------------ depreciation */
    function depreciate(p, t) {
      var b = p.basis, yrs = cfg.tax.depreciationYears, n = Math.round(yrs * 12), out = 0;
      var personal = (p.ownerOccupied && cfg.tax.personalUse) ? 1 / p.units : 0;
      if (b.accBuilding < b.building) { var d = Math.min(b.building / n, b.building - b.accBuilding); b.accBuilding += d * (1 - personal); out += d * (1 - personal); }
      if (b.shortLife > b.accShort && t - p.purchaseMonth < 60) {
        var s = Math.min(b.shortLife * (1 - cfg.strategies.costSeg.bonusPct) / 60, b.shortLife - b.accShort);
        b.accShort += s; out += s;
      }
      if (b.carryover > 0 && b.carryoverLeft > 0) {
        var c = b.carryover / b.carryoverLeft; b.carryover -= c; b.carryoverLeft--; b.accCarry += c; out += c;
      }
      b.improvements.forEach(function (im) {
        if (t <= im.month) return;
        var life = im.fiveYear ? 60 : n;
        if (im.acc < im.amount) { var x = Math.min(im.amount / life, im.amount - im.acc); im.acc += x; out += x; }
      });
      var pts = 0;
      if (b.pointsLeft > 0) { pts = Math.min(b.pointsLeft, b.pointsTotal / b.pointsMonths); b.pointsLeft -= pts; }
      return { dep: out, points: pts };
    }

    /* ------------------------------------------------------------- capital work */
    function spendCapital(p, r, t) {
      r.capitalItems.forEach(function (it) {
        p.basis.improvements.push({ amount: it.amount, month: t, acc: 0, fiveYear: !!it.fiveYear, name: it.name });
        if (!it.refresh && !it.fiveYear) p.improvementsValue.push({ amount: it.amount * cfg.market.valueCaptureImprovements, pi: M.priceIndex(t) });
      });
      var fromReserve = Math.min(S.reserve, r.capital);
      S.reserve -= fromReserve;
      S.cash -= (r.capital - fromReserve);
    }

    /* ----------------------------------------------------------------- sales */
    function sellProperty(p, t, reason, distress) {
      var s = EXIT.saleParts(env, p, t, OPS.value(env, p, t) * (1 - (distress || 0)));
      var totalBasis = U.sum(S.props, function (q) { return EXIT.basisParts(q).cost; }) || 1;
      var share = EXIT.basisParts(p).cost / totalBasis;
      var released = cfg.strategies.exchange1031.enabled ? 0 : S.carry.passive * share;
      S.carry.passive -= released;
      var tax = cfg.tax.enabled ? TAX.saleTax(cfg, U.yearOf(t), ya.wages * 12 / (U.monthOf(t) + 1),
        { rec1245: s.rec1245, unrec1250: s.unrec1250, capGain: s.capGain, releasedLosses: released, reps: false }) : 0;
      S.cash += s.netBeforeTax - tax;
      S.totalTax += tax;
      if (p.loan.fha) S.fhaActive = false;
      S.props.splice(S.props.indexOf(p), 1);
      if (LF.housing.mode === 'househack' && LF.housing.propSeq === p.seq) { LF.housing.mode = 'rent'; LF.housing.propSeq = null; }
      return { net: s.netBeforeTax - tax, tax: tax, parts: s };
    }

    /* --------------------------------------------------------------- balloon */
    function balloon(p, t) {
      var L = cfg.lending, view = OPS.lenderView(env, p, t);
      var product = p.units >= 5 ? 'commercial' : 'dscr';
      if (!L.balloon.test) {
        var r0 = M.rate(product, t);
        p.loan = LEND.makeLoan({ product: product, month: t, balance: p.loan.balance, value: view.value, rate: r0,
          amortYears: product === 'commercial' ? L.commercial.amortYears : L.amortYears,
          balloonYears: product === 'commercial' ? L.commercial.balloonYears : null });
        S.cash -= p.loan.balance * L.refiCostPct;
        addEvent(t, 'balloon', p.nickname + ': balloon refinanced at ' + U.fmtPct(r0, 2));
        return;
      }
      var max = LEND.maxRefiLoan(cfg, M, t, view, product, 0.75);
      var bal = p.loan.balance, costs = Math.min(bal, max.amount) * L.refiCostPct;
      var shortfall = Math.max(0, bal - max.amount);
      var room = usable() - efRequired(t);
      if (shortfall <= 0 || room >= shortfall + costs) {
        S.cash -= shortfall + costs;
        p.loan = LEND.makeLoan({ product: product, month: t, balance: bal - shortfall, value: view.value, rate: max.rate,
          amortYears: max.amort, balloonYears: product === 'commercial' ? L.commercial.balloonYears : null,
          prepayYears: product === 'dscr' ? L.dscr.prepayYears : 0 });
        p.product = product;
        addEvent(t, 'balloon', p.nickname + ': balloon refinanced at ' + U.fmtPct(max.rate, 2) +
          (shortfall > 0 ? ' — ' + U.fmtMoney(shortfall) + ' paid down to qualify' : ''));
        return;
      }
      if (L.balloon.onFailure === 'extend') {
        p.loan.balloonAt = t + 12; p.loan.rate += L.balloon.extendRateAdd;
        p.loan.payment = U.pmt(p.loan.balance, p.loan.rate, LEND.remainingYears(p.loan));
        addEvent(t, 'balloon', p.nickname + ': balloon could not refinance — extended a year at ' + U.fmtPct(p.loan.rate, 2));
        return;
      }
      var sale = sellProperty(p, t, 'balloon', 0.05);
      S.forcedSales++;
      addEvent(t, 'forcedSale', p.nickname + ': balloon could not refinance (lender would lend ' + U.fmtMoney(max.amount) +
        ' against ' + U.fmtMoney(bal) + ') — sold, netting ' + U.fmtMoney(sale.net) + ' after tax');
      milestones.push({ t: t, kind: 'forcedSale', text: 'Forced sale: ' + p.nickname });
    }

    /* ------------------------------------------------------------ acquisition */
    function houseHackIntent(t) {
      var H = cfg.life.houseHack;
      if (!H.enabled || LF.housing.hhCount >= H.count || S.home) return false;
      if (LF.housing.mode !== 'househack') return true;
      return (t - LF.housing.since) >= H.stayMonths;
    }
    function productsFor(cand, ownerOcc) {
      var L = cfg.lending, ST = cfg.strategies, list = [];
      if (ownerOcc) {
        var pref = cfg.life.houseHack.product;
        if ((pref === 'auto' || pref === 'fha') && L.fha.enabled) list.push('fha');
        if ((pref === 'auto' || pref === 'convOO') && L.convOO.enabled) list.push('convOO');
        return list;
      }
      if (cand.units <= 4) {
        if (L.convInv.enabled) list.push('convInv');
        if (L.dscr.enabled) list.push('dscr');
      } else if (L.commercial.enabled) list.push('commercial');
      if (ST.sellerFinance.enabled && cand.sellerEligible) list.push('seller');
      if (ST.assumption.enabled && cand.assumable && cand.assumable.balance > 0) list.push('assumed');
      return list;
    }
    function dealOf(cand, t, ownerOcc) {
      var rents = cand.unitRents.map(function (r, i) {
        var br = (cand.unitBedrooms && cand.unitBedrooms[i] != null) ? cand.unitBedrooms[i] : (cand.bedrooms || 2);
        var base = FPE.data.rentByBedroom(br);
        return { lease: r, marketAsIs: base * M.rentIndex(t) * cfg.ops.asIsFactor,
                 occupied: (cand.vacantUnits || []).indexOf(i) < 0, owner: false };
      });
      if (ownerOcc) {
        var best = 0; rents.forEach(function (x, j) { if (x.marketAsIs > rents[best].marketAsIs) best = j; });
        rents[best].owner = true;
      }
      return { units: cand.units, price: cand.price, rents: rents, taxMonthly: (cand.annualTax + cand.specials) / 12,
               insMonthly: cand.annualInsurance / 12, hoaMonthly: cand.hoaMonthly, utilitiesMonthly: cand.ownerUtilitiesMonthly,
               maintenancePct: OPS.maintenancePct(cfg, cand.yearBuilt), otherIncome: cand.otherMonthlyIncome, assumable: cand.assumable };
    }
    /* stabilized economics: every unit at achievable market rent, expected vacancy */
    function stabilized(cand, t, uw) {
      var O = cfg.ops, cn = OPS.costNow(env, t);
      var refresh = O.refresh.policy !== 'never' && O.rentMethod !== 'none';
      var gpr = 0, refreshCost = 0;
      cand.unitRents.forEach(function (r, i) {
        var br = (cand.unitBedrooms && cand.unitBedrooms[i] != null) ? cand.unitBedrooms[i] : (cand.bedrooms || 2);
        var m = FPE.data.rentByBedroom(br) * M.rentIndex(t);
        var already = cand.condition === 'refreshed';
        var target = (refresh || already) ? m : m * O.asIsFactor;
        if (O.rentMethod === 'none') target = r;
        gpr += Math.max(r, target);
        if (refresh && !already) refreshCost += O.refresh.costPerUnit * cn;
      });
      var vac = O.vacancy.enabled ? (O.vacancy.method === 'flat' ? O.vacancy.flatPct
                : O.turnover.atMarket * O.turnover.downtimeMonths / 12 + O.vacancy.creditLoss) : 0;
      var util = cand.ownerUtilitiesMonthly * (cand.rubsInPlace ? 1 - (cand.rubsRecoveryPct || 0.75) : 1);
      var fixed = (cand.annualTax + cand.specials + cand.annualInsurance) / 12 + cand.hoaMonthly + util +
                  O.turnover.turnCost * cn * O.turnover.atMarket * cand.units / 12;
      var pctOfRent = OPS.maintenancePct(cfg, cand.yearBuilt) + cfg.ops.capex.reservePct +
                      (env.managed && cfg.ops.management.enabled ? cfg.ops.management.feePct : 0);
      function noiAt(g) { return g * (1 - vac) + cand.otherMonthlyIncome - fixed - g * pctOfRent; }
      var noi = noiAt(gpr);
      var dayOneNoi = noiAt(U.sum(cand.unitRents));
      var totalCost = cand.price * (1 + cfg.market.closingCostPct) + refreshCost;
      var debt = uw ? uw.payment + uw.miMonthly : 0;
      return { noi: noi, yield: noi * 12 / totalCost, cf: uw ? noi - debt : null, refreshCost: refreshCost, gpr: gpr,
               dayOneNoi: dayOneNoi, dayOneCF: uw ? dayOneNoi - debt : null };
    }

    function tryAcquire(t, lm) {
      var why = null, ST = cfg.strategies;
      if (lm.jobless && cfg.life.breakers.jobLoss.enabled) why = 'jobLoss';
      else if (LF.breakers.negCF) why = 'negativeCashFlow';
      else if (ST.goalStop.enabled && trailing(incomeHist, 12) >= ST.goalStop.monthlyIncome) why = 'goalMet';
      else if (ST.downturn.enabled && ST.downturn.stance === 'stepBack' && M.recession(t)) why = 'downturnPause';
      else if (ST.paydown.enabled && ST.paydown.allocation === 'pauseBuying' && S.props.length >= ST.paydown.startAfterProperties && S.props.length > 0) why = 'paydownPause';
      else if (t - SO.lastClose < cfg.sourcing.minMonthsBetween) why = 'dealFlow';
      else if (cfg.sourcing.model === 'flatCap' && acquisitions.filter(function (a) { return U.yearOf(a.t) === U.yearOf(t); }).length >= cfg.sourcing.flatCap.maxPerYear) why = 'dealFlow';
      if (why) return { blocked: why };

      var cands = SRC.candidates(env, SO, t);
      if (!cands.length) return { blocked: 'noDeals' };
      var hh = houseHackIntent(t);
      var bk = book(t, lm.jobless);
      var ef = efRequired(t);
      var buffer = cfg.life.breakers.cashBuffer.enabled ? cfg.life.breakers.cashBuffer.months * monthlyCosts(t) : 0;
      var helocAvail = (ST.heloc.enabled && !STR.helocFrozen(env, t)) ? Math.max(0, S.heloc.limit - S.heloc.balance) : 0;
      var cn = OPS.costNow(env, t);
      var options = [], nearest = null;

      cands.forEach(function (cand) {
        var ownerOcc = hh && cand.units >= 2 && cand.units <= 4;
        productsFor(cand, ownerOcc).forEach(function (product) {
          var isOO = product === 'fha' || product === 'convOO';
          var deal = dealOf(cand, t, isOO);
          var addCash = 0;
          if (cfg.ops.refresh.policy === 'atPurchase' && cand.condition !== 'refreshed') addCash += cfg.ops.refresh.costPerUnit * cn * cand.units;
          if (ST.costSeg.enabled && cand.price >= ST.costSeg.minPrice) addCash += ST.costSeg.studyCost;
          var credit = 0;
          if (S.licensed && ST.license.enabled) credit = cand.price * ST.license.commissionPct * (1 - ST.license.brokerSplit);
          var uw = LEND.underwrite(cfg, M, t, deal, product, bk,
            { vacancy: cfg.ops.vacancy.flatPct, addCash: addCash, creditAtClose: credit });
          uw.commission = credit;
          var st = stabilized(cand, t, uw);
          var fails = uw.fails.slice();
          var cashAfter = usable() - uw.cashToClose;
          var shortfall = Math.max(0, ef + buffer - cashAfter, uw.reservesRequired - eligibleLiquid(cashAfter, t));
          var draw = 0;
          if (shortfall > 0) {
            if (fails.length === 0 && helocAvail >= shortfall && shortfall >= ST.heloc.minDraw) draw = shortfall;
            else fails.push({ code: 'cash', value: shortfall });
          }
          /* your own hurdle */
          if (ST.hurdle.enabled && !(ST.hurdle.exemptHouseHack && isOO)) {
            if (st.yield < ST.hurdle.minStabilizedYield) fails.push({ code: 'hurdleYield', value: st.yield });
            if (st.cf / cand.units < ST.hurdle.minCashFlowPerUnit) fails.push({ code: 'hurdleCF', value: st.cf / cand.units });
          }
          /* portfolio guardrails, after this purchase */
          if (ST.guardrails.enabled) {
            var noiAll = U.sum(S.props, function (p) { return p.lastNOI || 0; }) + st.noi;
            var dsAll = U.sum(S.props, function (p) { return LEND.debtService(p.loan); }) + uw.payment + uw.miMonthly;
            var cfAll = U.sum(S.props, function (p) { return p.lastCF || 0; }) + st.dayOneCF;
            var valAll = U.sum(S.props, function (p) { return OPS.value(env, p, t); }) + (cand.marketValue || cand.price);
            var debtAll = U.sum(S.props, function (p) { return p.loan.balance; }) + uw.financed + draw;
            if (cfAll < ST.guardrails.minCashFlow) fails.push({ code: 'guardCashFlow', value: cfAll });
            if (dsAll > 0 && noiAll / dsAll < ST.guardrails.minCoverage) fails.push({ code: 'guardCoverage', value: noiAll / dsAll });
            if (valAll > 0 && debtAll / valAll > ST.guardrails.maxLtv) fails.push({ code: 'guardLtv', value: debtAll / valAll });
          }
          var opt = { cand: cand, product: product, uw: uw, st: st, fails: fails, draw: draw, ownerOcc: isOO,
                      need: uw.cashToClose + Math.max(ef + buffer, uw.reservesRequired) };
          options.push(opt);
          if (fails.length && (!nearest || opt.need < nearest.need)) nearest = opt;
        });
      });
      var ok = options.filter(function (o) { return !o.fails.length; });
      if (hh && ok.some(function (o) { return o.ownerOcc; })) ok = ok.filter(function (o) { return o.ownerOcc; });
      if (!ok.length) {
        lastNeed = nearest ? nearest.need : null;
        return { blocked: nearest ? nearest.fails[0].code : 'noOption', detail: nearest };
      }
      /* best financing per candidate, then best candidate */
      var byCand = {};
      ok.forEach(function (o) {
        var k = o.cand.sourceId + '|' + o.cand.channel;
        var cur = byCand[k];
        var better = !cur ||
          (cfg.lending.productChoice === 'lowestPayment' ? o.uw.payment + o.uw.miMonthly < cur.uw.payment + cur.uw.miMonthly :
           cfg.lending.productChoice === 'bestCashFlow' ? o.st.cf > cur.st.cf :
           (o.uw.cashToClose < cur.uw.cashToClose - 1 || (Math.abs(o.uw.cashToClose - cur.uw.cashToClose) <= 1 && o.uw.payment < cur.uw.payment)));
        if (better) byCand[k] = o;
      });
      var best = null, bs = -Infinity;
      Object.keys(byCand).forEach(function (k) {
        var o = byCand[k], s;
        switch (cfg.sourcing.score) {
          case 'dayOneCoC': s = o.st.dayOneCF * 12 / Math.max(1, o.uw.cashToClose); break;
          case 'cashFlowPerUnit': s = o.st.cf / o.cand.units; break;
          case 'leastCash': s = -o.uw.cashToClose; break;
          default: s = o.st.yield;
        }
        if (s > bs) { bs = s; best = o; }
      });
      return { choice: best };
    }

    function purchase(o, t) {
      var cand = o.cand, uw = o.uw, ST = cfg.strategies, cn = OPS.costNow(env, t);
      if (o.draw > 0) { S.heloc.balance += o.draw; S.heloc.drawn += o.draw; S.cash += o.draw;
        addEvent(t, 'heloc', 'Drew ' + U.fmtMoney(o.draw) + ' on the HELOC to close'); }
      S.seq++;
      var p = OPS.newProperty(env, cand, uw, t, S.seq, o.ownerOcc);
      S.cash -= uw.cashToClose;
      if (uw.commission > 0) { ya.commission += uw.commission; S.commission += uw.commission; }
      if (cfg.ops.refresh.policy === 'atPurchase' && cand.condition !== 'refreshed') {
        var rc = cfg.ops.refresh.costPerUnit * cn * cand.units;
        p.basis.improvements.push({ amount: rc, month: t, acc: 0, name: 'Refresh at purchase' });
        p.unitsArr.forEach(function (u) { u.refreshed = 1; });
      }
      if (ST.costSeg.enabled && cand.price >= ST.costSeg.minPrice) {
        var sl = p.basis.building * ST.costSeg.shortLifePct;
        p.basis.building -= sl; p.basis.shortLife = sl;
        var bonus = sl * ST.costSeg.bonusPct;
        p.basis.accShort += bonus;
        p.bonusTaken = bonus;
        ya.passiveNet -= bonus + ST.costSeg.studyCost;
      }
      if (ST.unitModes.enabled) {
        var n = 0;
        for (var i = p.unitsArr.length - 1; i >= 0 && n < ST.unitModes.unitsPerProperty; i--) {
          if (p.unitsArr[i].owner) continue;
          p.unitsArr[i].convertTo = ST.unitModes.mode; n++;
        }
      }
      if (uw.fha) S.fhaActive = true;
      if (o.ownerOcc) {
        S.props.forEach(function (q) { if (q.ownerOccupied) q.ownerUntil = t + 1; });
        LF.housing = { mode: 'househack', propSeq: p.seq, since: t, hhCount: LF.housing.hhCount + 1, home: null };
      }
      SRC.consume(env, SO, cand, t, uw.product === 'seller');
      S.props.push(p);
      ya.reHours += cfg.life.hours.perAcquisition;
      ya.acquisitions++;
      var rec = { t: t, label: U.label(t), seq: p.seq, nickname: p.nickname, origin: p.origin, channel: cand.channel,
                  units: p.units, price: cand.price, product: uw.product, ownerOcc: o.ownerOcc, uw: uw, st: o.st,
                  cashAfter: S.cash, heloc: o.draw };
      acquisitions.push(rec);
      addEvent(t, 'acquisition', 'Bought ' + p.nickname + ' — ' + U.fmtMoney(cand.price) + ', ' + p.units + ' units, ' +
        ({ fha: 'FHA', convOO: 'conventional 5% down', convInv: 'conventional investment', dscr: 'DSCR loan', commercial: 'local bank loan', seller: 'seller financing', assumed: 'assumed loan' }[uw.product]) +
        (o.ownerOcc ? ' — you move in' : ''));
      milestones.push({ t: t, kind: 'acquisition', text: 'Property #' + p.seq + ': ' + p.nickname });
      return rec;
    }

    /* ---------------------------------------------------------- own home */
    function maybeBuyHome(t, jobless) {
      var H = cfg.life.ownHome;
      if (!H.enabled || S.home) return;
      var due = H.trigger === 'date' ? t >= U.parseMonth(H.date) : acquisitions.length >= H.afterPurchases;
      if (!due) return;
      var price = H.price * M.priceIndex(t) / M.priceIndex(start);
      var loanAmt = price * (1 - H.downPct), rate = M.rate('ownHome', t);
      var pmi = H.downPct < 0.2 ? cfg.lending.convOO.pmiRate : 0;
      var tax = price * cfg.market.tax.residentialRate * cfg.market.tax.assessmentRatio;
      var ins = H.insurance * M.insuranceIndex(t) / M.insuranceIndex(FPE.data.dataMonth);
      var pay = U.pmt(loanAmt, rate, cfg.lending.amortYears);
      var pitia = pay + loanAmt * pmi / 12 + tax / 12 + ins / 12;
      var cashNeed = price * H.downPct + price * cfg.market.closingCostPct;
      if (usable() - cashNeed < efRequired(t) + 2 * pitia) return;
      if (cfg.income.w2.enabled && cfg.lending.gates.dti) {
        var bk = book(t, jobless);
        if (!bk.incomeOk) return;
        var inc = bk.w2Monthly, debts = bk.otherDebts + pitia;
        bk.rentals.forEach(function (r) { if (r.net75 >= 0) inc += r.net75; else debts -= r.net75; });
        if (inc <= 0 || debts / inc > cfg.lending.convOO.maxDti) return;
      }
      S.cash -= cashNeed;
      var loan = LEND.makeLoan({ product: 'ownHome', month: t, balance: loanAmt, value: price, rate: rate, amortYears: cfg.lending.amortYears,
                                 miRate: pmi, miCancelLtv: 0.78 });
      S.home = { price: price, value: price, pi0: M.priceIndex(t), loan: loan, taxBill: tax, insurance: ins, pitia: pitia, since: t };
      S.props.forEach(function (q) { if (q.ownerOccupied) q.ownerUntil = t + 1; });
      LF.housing = { mode: 'home', propSeq: null, since: t, hhCount: LF.housing.hhCount, home: S.home };
      addEvent(t, 'home', 'You buy your own home — ' + U.fmtMoney(price) + ', ' + U.fmtPct(H.downPct, 0) + ' down');
      milestone(t, 'home', 'Bought your own home');
    }

    /* ================================================================= LOOP */
    for (var t = start; t < end; t++) {
      env.events = [];
      var year = U.yearOf(t), mon = U.monthOf(t);
      var recNow = M.recession(t);

      /* 1. January */
      if (mon === 0 && t > start) {
        S.props.forEach(function (p) { OPS.january(env, p, t); });
        if (S.home) {
          S.home.insurance *= M.insuranceIndex(t) / M.insuranceIndex(t - 12);
          S.home.taxBill = Math.max(S.home.taxBill * M.priceIndex(t) / M.priceIndex(t - 12),
                                    S.home.value * cfg.market.tax.residentialRate * cfg.market.tax.assessmentRatio);
        }
      }
      /* license starts */
      if (cfg.strategies.license.enabled && !S.licenseStarted && t >= U.parseMonth(cfg.strategies.license.startMonth)) {
        S.licenseStarted = true; S.licensed = true;
        S.cash -= cfg.strategies.license.courseCost; ya.reHours += cfg.life.hours.licenseCourse;
        addEvent(t, 'license', 'Real estate license — ' + U.fmtMoney(cfg.strategies.license.courseCost) + ' and ' + cfg.life.hours.licenseCourse + ' hours of coursework');
      }

      /* 2. life */
      env.liquid = function () { return usable(); };
      var lm = LIFE.month(env, LF, t, trailing(incomeHist, 12));
      S.cash += lm.contribution;
      if (lm.contribution > 0) S.totalContributed += lm.contribution;
      ya.contributions += lm.contribution;
      ya.wages += lm.wages;
      ya.w2Hours += LIFE.w2HoursYear(cfg, LF) / 12;

      /* 3. housing: own home, and moving out of the last house-hack */
      maybeBuyHome(t, lm.jobless);
      if (S.home) {
        S.home.value = S.home.price * M.priceIndex(t) / S.home.pi0;
        var hs = LEND.step(S.home.loan);
        var hPitia = hs.pi + hs.mi + S.home.taxBill / 12 + S.home.insurance / 12;
        var prcHome = cfg.tax.prc.enabled ? Math.min(cfg.tax.prc.amount / 12, S.home.taxBill / 12) : 0;
        S.home.pitia = hPitia - prcHome;
      }
      if (LF.housing.mode === 'househack' && cfg.life.houseHack.afterLast === 'rent' &&
          LF.housing.hhCount >= cfg.life.houseHack.count && t - LF.housing.since >= cfg.life.houseHack.stayMonths) {
        S.props.forEach(function (q) { if (q.ownerOccupied) q.ownerUntil = t; });
        LF.housing = { mode: 'rent', propSeq: null, since: t, hhCount: LF.housing.hhCount, home: null };
      }

      /* 4. buildings */
      var agg = { gpr: 0, collected: 0, vacancy: 0, other: 0, opex: 0, noi: 0, interest: 0, principal: 0, mi: 0, ds: 0,
                  capital: 0, reserveIn: 0, cf: 0, value: 0, debt: 0, units: 0, turnovers: 0, refreshes: 0, hcv: 0,
                  atMarket: 0, rented: 0, prc: 0, taxParts: { tax: 0, specials: 0, insurance: 0, hoa: 0, utilities: 0, maintenance: 0, management: 0, leasing: 0, turn: 0, modeOpex: 0 },
                  selfHours: 0, strNet: 0 };
      var props = S.props.slice();
      for (var pi = 0; pi < props.length; pi++) {
        var p = props[pi];
        if (S.props.indexOf(p) < 0) continue;
        var r = OPS.month(env, p, t);
        var ls = LEND.step(p.loan);
        if (ls.ioEnded) addEvent(t, 'io', p.nickname + ': interest-only ends — payment steps up ' + U.fmtDollars(p.loan.ioStepUp) + '/mo');
        var dp = depreciate(p, t);
        spendCapital(p, r, t);
        var ds = ls.pi + ls.mi;
        var cf = r.noi - ds;
        p.lastCF = cf; p.lastNOI = r.noi; p.cumCashFlow += cf;
        /* taxable income, split by character */
        var personal = (p.ownerOccupied && cfg.tax.personalUse) ? 1 / p.units : 0;
        var deductible = (r.opexTotal - (cfg.tax.deMinimisTurnCosts ? 0 : r.opex.turn)) * (1 - personal) + (ls.interest + ls.mi) * (1 - personal) + dp.dep + dp.points;
        var taxable = r.collected + r.other - deductible;
        var strShare = 0;
        if (r.strIncome !== 0 && cfg.strategies.unitModes.enabled && cfg.strategies.unitModes.mode === 'str' &&
            cfg.strategies.unitModes.avgStayDays <= 7 && !env.managed) {
          strShare = r.collected > 0 ? Math.max(0, Math.min(1, r.strIncome / Math.max(1, r.collected - r.opex.modeOpex))) : 0;
        }
        ya.nonPassiveNet += taxable * strShare;
        ya.passiveNet += taxable * (1 - strShare);
        if (!cfg.tax.deMinimisTurnCosts && r.opex.turn > 0) p.basis.improvements.push({ amount: r.opex.turn, month: t, acc: 0, name: 'Turn costs' });
        /* hours */
        var managedHere = env.managed;
        var H = cfg.life.hours, units = p.units - (p.ownerOccupied ? 1 : 0);
        var hrs = managedHere ? units * H.managedPerUnit / 12 : units * H.selfManagePerUnit / 12 + r.turnovers * H.perTurnover;
        hrs += r.refreshes * H.perRefresh + r.hcvUnits * H.hcvPerUnit / 12;
        p.unitsArr.forEach(function (u) {
          if (u.mode === 'mtr') hrs += H.mtrPerUnit / 12 * (managedHere ? 0.3 : 1);
          if (u.mode === 'str') hrs += H.strPerUnit / 12 * (managedHere ? 0.2 : 1);
          if (u.mode === 'room') hrs += H.roomPerUnit / 12 * (managedHere ? 0.3 : 1);
        });
        agg.selfHours += hrs;
        ya.rentalHours += hrs; ya.reHours += hrs;
        ya.servicesHours += hrs + (managedHere ? units * 12 / 12 : 0);
        /* tax appeal */
        var ap = STR.taxAppeal(env, p, t);
        if (ap) { S.cash -= ap.cost; if (ap.text) addEvent(t, 'appeal', ap.text); }
        /* balloon */
        if (p.loan.balloonAt != null && t >= p.loan.balloonAt && p.loan.balance > 0.005) balloon(p, t);
        if (S.props.indexOf(p) < 0) continue;
        /* aggregate */
        agg.gpr += r.gpr; agg.collected += r.collected; agg.vacancy += r.vacancyLoss; agg.other += r.other;
        agg.opex += r.opexTotal; agg.noi += r.noi; agg.interest += ls.interest; agg.principal += ls.principal;
        agg.mi += ls.mi; agg.ds += ds; agg.capital += r.capital; agg.cf += cf; agg.turnovers += r.turnovers;
        agg.refreshes += r.refreshes; agg.hcv += r.hcvUnits; agg.atMarket += r.unitsAtMarket; agg.rented += r.rentedUnits;
        agg.prc += r.prc;
        for (var key in agg.taxParts) agg.taxParts[key] += r.opex[key] || 0;
        r.events.forEach(function (e) { env.events.push(e); });
      }
      /* reserve: funded from cash until it reaches its target */
      if (cfg.ops.capex.reserve) {
        var target = U.sum(S.props, function (p) { return cfg.ops.capex.reserveTarget * p.units; }) * OPS.costNow(env, t);
        var want = Math.min(agg.gpr * cfg.ops.capex.reservePct, Math.max(0, target - S.reserve));
        agg.reserveIn = want;
        S.reserve += want;
      }
      S.cash += agg.cf - agg.reserveIn;

      /* 5. HELOC, refinances, exchange */
      S.heloc.limit = STR.helocLimit(env, S, t);
      var helocInt = 0;
      if (S.heloc.balance > 0.01) {
        helocInt = S.heloc.balance * M.rate('heloc', t) / 12;
        S.cash -= helocInt; S.heloc.interest += helocInt;
        ya.passiveNet -= helocInt;
      }
      var canConv = cfg.income.w2.enabled && LF.stage !== 'quit' && financedCount() < cfg.lending.convInv.maxFinanced;
      S.props.slice().forEach(function (p) {
        var fr = STR.fhaRefi(env, S, p, t, { canConventional: canConv });
        if (fr) { S.cash -= fr.costs; if (fr.fhaEnded) S.fhaActive = S.props.some(function (q) { return q.loan.fha; }); addEvent(t, 'refi', fr.text); }
        var co = STR.cashOut(env, S, p, t, { stage: LF.stage });
        if (co) { S.cash += co.proceeds; S.fhaActive = S.props.some(function (q) { return q.loan.fha; }); addEvent(t, 'refi', co.text); }
        var rr = STR.rateRefi(env, S, p, t);
        if (rr) { S.cash -= rr.costs; addEvent(t, 'refi', rr.text); }
      });
      var xc = STR.exchangeCandidate(env, S, t);
      if (xc) exchange(xc, t);

      /* 6. management */
      hoursHist.push(agg.selfHours);
      if (!env.managed && cfg.ops.management.enabled && S.props.length) {
        var MG = cfg.ops.management, fire = false;
        switch (MG.trigger) {
          case 'always': fire = true; break;
          case 'units': fire = U.sum(S.props, function (p) { return p.units; }) >= MG.units; break;
          case 'properties': fire = S.props.length >= MG.properties; break;
          case 'cashFlow': fire = agg.cf >= MG.cashFlow; break;
          case 'date': fire = t >= U.parseMonth(MG.date); break;
          default: fire = trailing(hoursHist, 3) > LIFE.hourBudgetMonthly(cfg, LF);
        }
        if (fire) {
          env.managed = true;
          addEvent(t, 'management', 'Property management hired — ' + U.fmtPct(MG.feePct, 0) + ' of collected rent' +
            (MG.trigger === 'timeBudget' ? ' (your hours passed ' + LIFE.hourBudgetMonthly(cfg, LF).toFixed(0) + '/month)' : ''));
          milestone(t, 'management', 'Hired property management');
        }
      }

      /* 7. idle cash earns */
      var v = vehicle(t);
      var parked = Math.max(0, S.cash - cfg.cash.operatingFloor);
      var ret = parked * v.r + S.reserve * (U.monthlyFactor(cfg.cash.mmYield) - 1);
      S.cash += ret;
      if (cfg.cash.taxReturns) {
        if (v.kind === 'ordinary') ya.investOrdinary += parked * v.r;
        else if (v.kind === 'tbill') ya.investTbill += parked * v.r;
        else if (v.kind === 'index') ya.investLtcg += Math.max(0, parked * v.r) * 0.25;
        ya.investOrdinary += S.reserve * (U.monthlyFactor(cfg.cash.mmYield) - 1);
      }

      /* 8. draws before quitting */
      var draw = 0, DR = cfg.life.draws;
      if (S.props.length && LF.stage !== 'quit' && DR.mode !== 'none') {
        if (DR.mode === 'fixed' || (DR.mode === 'afterThreshold' && agg.cf >= DR.threshold)) draw = DR.amount;
        S.cash -= draw; S.totalDraws += draw;
      }

      /* 9. deal supply, license costs */
      var acc = SRC.accrue(env, SO, t, S.licensed);
      S.cash -= acc.cost; ya.passiveNet -= acc.cost; ya.reHours += acc.hours;
      if (S.licensed) {
        S.cash -= cfg.strategies.license.annualCost / 12;
        ya.reHours += cfg.life.hours.licenseAgentYear / 12;
      }

      /* 10. breakers — cash flow counts the rent a house-hack saves you */
      var housingCredit = LIFE.housingCredit(cfg, M, t, LF);
      if (S.props.length) cfHist.push(agg.cf - helocInt + housingCredit);
      var nb = cfg.life.breakers.negativeCF.months;
      LF.breakers.negCF = cfg.life.breakers.negativeCF.enabled && cfHist.length >= nb && trailing(cfHist, nb) < 0;

      /* 11. downturn dry powder */
      var DS = cfg.strategies.downturn;
      if (DS.enabled && DS.stance === 'dryPowder') {
        var armed = !!recNow || (t - start) >= DS.releaseAfterMonths;
        if (armed && S.fund > 0) { addEvent(t, 'fund', 'Dry powder released — ' + U.fmtMoney(S.fund)); S.fund = 0; }
        else if (!armed && S.fund < DS.fundTarget) {
          var free = S.cash - S.fund - efRequired(t);
          if (free > 0) S.fund += Math.min(free * DS.fundFillPct, DS.fundTarget - S.fund);
        }
      }

      /* 12. paydown that outranks buying */
      var PD = cfg.strategies.paydown, paid = 0;
      if (PD.enabled && PD.allocation === 'pauseBuying' && S.props.length >= PD.startAfterProperties && S.freeClear < PD.stopAfterFreeClear) {
        paid += paydown(t, usable() - efRequired(t));
      }

      /* 13. acquisition */
      var got = null, blocked = null;
      if (t < end - 1) {
        var res = tryAcquire(t, lm);
        if (res.choice) { got = purchase(res.choice, t); lastNeed = null; }
        else blocked = res;
      }

      /* 14. December tax */
      var taxPaid = 0, yr = null;
      if (mon === 11 || t === end - 1) {
        var reHours = ya.reHours, repsMode = cfg.tax.reps.mode;
        var reps = repsMode === 'never' ? false : (repsMode === 'fromYear' ? year >= cfg.tax.reps.fromYear
                   : (reHours > FPE.data.TAX.reps.hours && reHours > ya.w2Hours));
        var material = ya.rentalHours >= cfg.tax.reps.materialHours;
        var qbiOk = cfg.tax.qbi.enabled && (cfg.tax.qbi.qualify === 'assume' || (cfg.tax.qbi.qualify === 'hours' && ya.servicesHours >= FPE.data.TAX.qbi.safeHarborHours));
        var ubia = U.sum(S.props, function (p) { return p.basis.building + p.basis.shortLife + U.sum(p.basis.improvements, function (x) { return x.amount; }); });
        var ty = {
          wages: ya.wages, deferrals: cfg.income.w2.enabled ? cfg.income.w2.preTaxDeferrals * Math.min(1, ya.wages / Math.max(1, LIFE.w2Annual(cfg, t))) : 0,
          passiveNet: ya.passiveNet, nonPassiveNet: ya.nonPassiveNet,
          qbiEligibleIncome: Math.max(0, ya.passiveNet + ya.nonPassiveNet),
          investOrdinary: ya.investOrdinary, investTbill: ya.investTbill, investLtcg: ya.investLtcg,
          commission: ya.commission, ubia: ubia, reps: reps && material, qbiQualifies: qbiOk, rentalNII: !(reps && material)
        };
        yr = TAX.annual(cfg, year, ty, S.carry);
        taxPaid = cfg.tax.enabled ? yr.incremental : 0;
        S.cash -= taxPaid; S.totalTax += taxPaid;
        S.taxAccrual = cfg.tax.enabled ? yr.rentalTax / 12 : 0;
        var tb = TAX.tables(cfg, year);
        var baseOrd = ya.wages + yr.rentalOrdinary;
        S.marginal = cfg.tax.enabled ? (TAX.yearTax(cfg, tb, { ordinary: baseOrd + 1000, unrec1250: 0, ltcg: 0 }, 0).total -
                                        TAX.yearTax(cfg, tb, { ordinary: baseOrd, unrec1250: 0, ltcg: 0 }, 0).total) / 1000 : 0;
        if (reps && material && !S.repsAnnounced) {
          S.repsAnnounced = true;
          addEvent(t, 'reps', 'Real Estate Professional Status: ' + Math.round(reHours) + ' real-estate hours vs ' + Math.round(ya.w2Hours) +
            ' job hours — rental losses now offset other income. Losses suspended earlier stay suspended (§469(f)(1)).');
          milestone(t, 'reps', 'Qualified for REPS');
        }
      }

      /* 15. repay the HELOC from this month's surplus, then paydown / best use */
      if (S.heloc.balance > 0.01) {
        var surplus = Math.max(0, lm.contribution + agg.cf - helocInt);
        var roomH = usable() - efRequired(t) - (cfg.life.breakers.cashBuffer.enabled ? cfg.life.breakers.cashBuffer.months * monthlyCosts(t) : 0);
        var rp = Math.max(0, Math.min(S.heloc.balance, surplus * cfg.strategies.heloc.repayShare, roomH));
        if (rp > 0) { S.heloc.balance -= rp; S.cash -= rp; }
      }
      if (!got) {
        var warChest = efRequired(t) + (lastNeed != null ? lastNeed : 0) +
                       (cfg.life.breakers.cashBuffer.enabled ? cfg.life.breakers.cashBuffer.months * monthlyCosts(t) : 0);
        if (PD.enabled && PD.allocation !== 'pauseBuying' && S.props.length >= PD.startAfterProperties && S.freeClear < PD.stopAfterFreeClear) {
          var spare = usable() - warChest;
          if (PD.allocation === 'split') spare = Math.min(spare, Math.max(0, lm.contribution + agg.cf) * PD.splitPct);
          paid += paydown(t, spare);
        } else if (cfg.cash.policy === 'bestUse' && blocked && ['dealFlow', 'noDeals', 'goalMet', 'jobLoss', 'downturnPause', 'negativeCashFlow'].indexOf(blocked.blocked) >= 0) {
          var tgt = STR.paydownTarget(env, S);
          if (tgt) {
            var loanAfterTax = (tgt.loan.rate + (tgt.loan.miRate || 0)) * (1 - S.marginal);
            var vAfterTax = (Math.pow(1 + v.r, 12) - 1) * (1 - (cfg.cash.taxReturns && v.kind !== 'none' ? S.marginal : 0));
            if (loanAfterTax > vAfterTax) paid += paydown(t, usable() - Math.max(warChest, efRequired(t) + 6 * monthlyCosts(t)));
          }
        }
      }

      /* 16. income metric: sustainable after-tax real-estate income */
      var normCapex = (cfg.ops.capex.reserve || cfg.ops.capex.components) ? agg.gpr * cfg.ops.capex.reservePct : 0;
      var income = agg.noi - agg.ds - helocInt - normCapex - S.taxAccrual + housingCredit;
      incomeHist.push(income);
      ya.income += income; ya.cashFlow += agg.cf - helocInt; ya.noi += agg.noi; ya.gpr += agg.gpr; ya.collected += agg.collected;
      ya.debtService += agg.ds; ya.capital += agg.capital;

      /* 17. record */
      var value = U.sum(S.props, function (p) { return OPS.value(env, p, t); });
      var debt = U.sum(S.props, function (p) { return p.loan.balance; });
      var homeEq = S.home ? S.home.value - S.home.loan.balance : 0;
      var held = value - debt + S.cash + S.reserve - S.heloc.balance + homeEq;
      if (S.cash < 0) milestone(t, 'shortfall', 'Cash went negative — the plan breaks here');
      var real = M.cpiIndex(t);
      var costsNow = monthlyCosts(t) + (LF.stage === 'quit' ? cfg.life.career.healthInsurance * M.cpiIndex(t) : 0);
      if (trailing(incomeHist, 12) >= costsNow && S.props.length) milestone(t, 'freedom', 'After-tax portfolio income covers your living costs');
      if (!lean) {
        rows.push({
          t: t, label: U.label(t), year: year, recession: !!recNow,
          cash: S.cash, reserve: S.reserve, fund: S.fund, heloc: S.heloc.balance, helocLimit: S.heloc.limit,
          contribution: lm.contribution, wages: lm.wages, stage: LF.stage, housing: LF.housing.mode,
          properties: S.props.length, units: U.sum(S.props, function (p) { return p.units; }),
          gpr: agg.gpr, collected: agg.collected, vacancy: agg.vacancy, vacancyPct: agg.gpr > 0 ? agg.vacancy / agg.gpr : 0,
          other: agg.other, opex: agg.opex, opexParts: agg.taxParts, prc: agg.prc,
          noi: agg.noi, interest: agg.interest, principal: agg.principal, mi: agg.mi, debtService: agg.ds,
          helocInterest: helocInt, reserveIn: agg.reserveIn, capital: agg.capital, cashFlow: agg.cf - helocInt,
          income: income, incomeReal: income / real, trailingIncome: trailing(incomeHist, 12), trailingIncomeReal: trailing(incomeHist, 12) / real,
          costs: costsNow, taxPaid: taxPaid, extraPrincipal: paid, draw: draw, housingCredit: housingCredit,
          value: value, debt: debt, equity: value - debt, homeEquity: homeEq, heldNW: held, heldNWReal: held / real,
          turnovers: agg.turnovers, refreshes: agg.refreshes, hcvUnits: agg.hcv, unitsAtMarket: agg.atMarket, rentedUnits: agg.rented,
          managed: env.managed, selfHours: agg.selfHours, breakers: { negCF: LF.breakers.negCF, jobless: lm.jobless },
          suspended: S.carry.passive, nol: S.carry.nol, cpi: real, rateLevel: M.rateLevel(t),
          events: env.events, acquisition: got, blocked: blocked
        });
      }
      if (mon === 11 || t === end - 1) {
        years.push({ year: year, tax: yr, taxPaid: taxPaid, wages: ya.wages, reHours: ya.reHours, w2Hours: ya.w2Hours,
                     rentalHours: ya.rentalHours, servicesHours: ya.servicesHours, income: ya.income, cashFlow: ya.cashFlow,
                     noi: ya.noi, gpr: ya.gpr, collected: ya.collected, debtService: ya.debtService, capital: ya.capital,
                     contributions: ya.contributions, acquisitions: ya.acquisitions, endNW: held, endCash: S.cash,
                     endUnits: U.sum(S.props, function (p) { return p.units; }), endDebt: debt, endValue: value,
                     passiveNet: ya.passiveNet, nonPassiveNet: ya.nonPassiveNet, stage: LF.stage });
        ya = newYear();
      }
    }

    /* ---------------------------------------------------------------- paydown */
    function paydown(t, budget) {
      if (budget <= 1) return 0;
      var total = 0, guard = 0;
      while (budget > 1 && guard++ < 5) {
        var tg = STR.paydownTarget(env, S);
        if (!tg) break;
        var ev = STR.applyPaydown(env, S, tg, budget, t);
        if (!ev) break;
        S.cash -= ev.amount + ev.fee; budget -= ev.amount + ev.fee; total += ev.amount;
        S.extraPrincipal += ev.amount;
        if (ev.paidOff) { S.freeClear++; addEvent(t, 'paidoff', tg.nickname + ' is free and clear'); milestone(t, 'paidoff' + tg.seq, 'Paid off ' + tg.nickname); }
        else if (ev.relief > 0) addEvent(t, 'recast', tg.nickname + ': paid down ' + U.fmtMoney(ev.amount) + ' and recast — payment falls ' + U.fmtDollars(ev.relief) + '/mo');
        if (!ev.paidOff) break;
      }
      return total;
    }

    /* ------------------------------------------------------------------ 1031
       Sell one building and put every dollar of the proceeds into a larger
       one of equal or greater value, so no gain is recognised. The size is
       the largest the proceeds can carry at the product's down payment,
       between one more unit than the old building and your target, using
       the archetype for that size (5–8 only when that archetype is on). */
    function exchange(old, t) {
      var X = cfg.strategies.exchange1031, L = cfg.lending;
      var s = EXIT.saleParts(env, old, t);
      if (s.gain < X.minGain) return;
      var proceeds = s.netBeforeTax - X.qiFee;
      var q = cfg.sourcing.archetypeQuality, pick = null;
      for (var u = X.targetUnits; u > old.units && !pick; u--) {
        if (!SRC.allowed(cfg, u) || (u >= 5 && !cfg.sourcing.archetype58)) continue;
        var cand = SRC.fromArchetype(env, SRC.typeKey(u), t, 'exchange', q);
        if (!cand) continue;
        var scale = u / cand.units;
        cand.units = u; cand.price *= scale; cand.marketValue *= scale;
        cand.annualTax *= scale; cand.annualInsurance *= scale; cand.ownerUtilitiesMonthly *= scale;
        var r0 = cand.unitRents[0]; cand.unitRents = []; for (var i = 0; i < u; i++) cand.unitRents.push(r0);
        var product = u >= 5 ? 'commercial' : 'dscr';
        var T = LEND.productTerms(cfg, product, null, M, t);
        var closing = cand.price * cfg.market.closingCostPct;
        var loanAmt = cand.price + closing - proceeds;
        if (cand.price < s.price || loanAmt > cand.price * (1 - T.down) || loanAmt <= 0) continue;
        var pay = U.pmt(loanAmt, T.rate, T.amort);
        var pitia = pay + cand.annualTax / 12 + cand.annualInsurance / 12;
        var rents = U.sum(cand.unitRents);
        var cover = product === 'dscr' ? rents / pitia
                  : (rents * 0.95 - cand.annualTax / 12 - cand.annualInsurance / 12 - cand.ownerUtilitiesMonthly - rents * 0.13) / pay;
        if (cover < (product === 'dscr' ? L.dscr.minDscr : L.commercial.minDscr)) continue;
        pick = { cand: cand, product: product, T: T, loanAmt: loanAmt, closing: closing };
      }
      if (!pick) return;
      var cand2 = pick.cand, T2 = pick.T;
      cand2.nickname = cand2.units + '-unit (1031 replacement)';
      var uw = { product: pick.product, financed: pick.loanAmt, rate: T2.rate, amortYears: T2.amort,
                 ioYears: 0, miRate: 0, miCancelLtv: null, balloonYears: T2.balloonYears || null, prepayYears: T2.prepayYears || 0,
                 recastable: true, fha: false, sellerNote: false, assumed: false, closing: pick.closing,
                 points: 0, cashToClose: 0 };
      var bp = EXIT.basisParts(old);
      S.props.splice(S.props.indexOf(old), 1);
      if (old.loan.fha) S.fhaActive = S.props.some(function (q2) { return q2.loan.fha; });
      if (LF.housing.mode === 'househack' && LF.housing.propSeq === old.seq) { LF.housing.mode = 'rent'; LF.housing.propSeq = null; }
      S.seq++;
      var np = OPS.newProperty(env, cand2, uw, t, S.seq, false);
      /* basis: the replacement's cost less the deferred gain. The carried-over
         part keeps depreciating on the old schedule; only new money starts a
         fresh 27.5 years (Treas. Reg. §1.168(i)-6). */
      var totalBasis = cand2.price + pick.closing - s.gain;
      var carry = Math.min(bp.adjusted, totalBasis), excess = Math.max(0, totalBasis - carry);
      var bs = cfg.market.buildingShare;
      np.basis.building = excess * bs;
      np.basis.land = excess * (1 - bs) + carry * (1 - bs);
      np.basis.carryover = carry * bs; np.basis.carryoverOriginal = carry * bs;
      np.basis.carryoverLeft = Math.max(1, Math.round(cfg.tax.depreciationYears * 12) - (t - old.purchaseMonth));
      np.basis.deferredGain = 0;
      np.origin = 'exchange';
      S.props.push(np);
      S.exchanges++; S.lastExchange = t;
      addEvent(t, 'exchange', '1031 exchange: sold ' + old.nickname + ' for ' + U.fmtMoney(s.price) + ', deferred ' + U.fmtMoney(s.gain) +
        ' of gain, bought ' + cand2.units + ' units for ' + U.fmtMoney(cand2.price) + ' (' + (pick.product === 'commercial' ? 'bank loan' : 'DSCR loan') + '). Suspended losses stay suspended.');
      milestones.push({ t: t, kind: 'exchange', text: 'Traded up: ' + old.units + ' units → ' + cand2.units });
    }

    /* =============================================================== SUMMARY */
    var lastT = end - 1;
    var target = U.parseMonth(cfg.plan.objective.targetMonth);
    var tIdx = Math.min(incomeHist.length - 1, Math.max(0, target - start));
    var incomeAtTarget = (function () {
      var a = incomeHist.slice(Math.max(0, tIdx - 11), tIdx + 1);
      return a.length ? U.sum(a) / a.length : 0;
    })();
    var cpiTarget = M.cpiIndex(Math.min(target, lastT));
    var ruined = S.cash < -1 || milestones.some(function (m) { return m.kind === 'shortfall'; });
    var liq = EXIT.liquidate(env, S, lastT, (years.length ? years[years.length - 1].wages : 0), false);
    var lastRow = rows.length ? rows[rows.length - 1] : null;
    var held = U.sum(S.props, function (p) { return OPS.value(env, p, lastT) - p.loan.balance; }) + S.cash + S.reserve - S.heloc.balance +
               (S.home ? S.home.value - S.home.loan.balance : 0);
    var ms = function (k) { var m = milestones.filter(function (x) { return x.kind === k; })[0]; return m ? m.t : null; };
    return {
      cfg: cfg, rows: rows, years: years, acquisitions: acquisitions, milestones: milestones, properties: S.props, state: S,
      summary: {
        start: start, end: lastT, target: target,
        incomeAtTarget: incomeAtTarget, incomeAtTargetReal: incomeAtTarget / cpiTarget,
        ruined: ruined, forcedSales: S.forcedSales,
        properties: S.props.length, units: U.sum(S.props, function (p) { return p.units; }),
        heldNW: held, heldNWReal: held / M.cpiIndex(lastT), soldNW: liq.soldNetWorth, soldNWReal: liq.soldNetWorth / M.cpiIndex(lastT),
        liquidation: liq, cash: S.cash, reserve: S.reserve, heloc: S.heloc.balance,
        debt: U.sum(S.props, function (p) { return p.loan.balance; }), value: U.sum(S.props, function (p) { return OPS.value(env, p, lastT); }),
        totalContributed: S.totalContributed, totalTax: S.totalTax, totalDraws: S.totalDraws,
        suspended: S.carry.passive, nol: S.carry.nol, extraPrincipal: S.extraPrincipal, freeClear: S.freeClear,
        firstAcquisition: acquisitions[0] || null, partTime: LF.partFrom, quit: LF.quitFrom,
        freedom: ms('freedom'), management: ms('management'), reps: ms('reps'), home: ms('home'),
        finalIncome: incomeHist.length ? U.sum(incomeHist.slice(-12)) / Math.min(12, incomeHist.length) : 0,
        finalIncomeReal: (incomeHist.length ? U.sum(incomeHist.slice(-12)) / Math.min(12, incomeHist.length) : 0) / M.cpiIndex(lastT),
        stage: LF.stage, jobLosses: LF.jobLossCount
      }
    };
  }

  FPE.runSimulation = runSimulation;
})(FPE);
