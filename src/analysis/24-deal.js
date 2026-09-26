/* ============================================================================
   SHOULD I BUY THIS ONE? — one listing, judged inside your plan.

   The listing is put on offer in your plan's own future (from the month you
   choose, for a short window). The engine buys it the first month it passes
   every gate — your cash, your lender, your hurdle — and the plan runs on.
   The verdict is the difference it makes to your headline, not a
   cap rate in isolation: a good building bought at the wrong time can still
   make the plan worse.

   Also: what each lender product says, day-one and stabilized cash flow,
   the highest price at which it still helps, and what to verify first.
   ========================================================================== */
(function (FPE) {
  'use strict';
  var U = FPE.util;

  /* ------------------------------------------------ fill the gaps, say so
     Every field ends up with a flag: stated (from the listing), derived
     (computed from stated facts), or estimated (a default you should
     replace). */
  function normalize(cfg, raw, asOf) {
    var L = U.clone(raw || {}), flags = U.clone((raw && raw.prov) || {});
    function flag(k, v) { if (!flags[k]) flags[k] = v; }
    L.units = Math.max(2, Math.min(8, Math.round(L.units || (L.unitRents ? L.unitRents.length : 2))));
    flag('units', raw && raw.units ? 'stated' : 'estimated');
    L.price = +L.price || 0; flag('price', L.price ? 'stated' : 'estimated');
    if (!L.unitBedrooms || L.unitBedrooms.length !== L.units) {
      L.unitBedrooms = []; for (var i = 0; i < L.units; i++) L.unitBedrooms.push((raw && raw.unitBedrooms && raw.unitBedrooms[i]) || 2);
      flag('unitBedrooms', raw && raw.unitBedrooms ? 'stated' : 'estimated');
    }
    if (!L.unitRents || L.unitRents.length !== L.units || L.unitRents.some(function (r) { return !(r > 0); })) {
      var given = (L.unitRents || []).filter(function (r) { return r > 0; });
      var avg = given.length ? U.sum(given) / given.length : null;
      L.unitRents = L.unitBedrooms.map(function (br, j) {
        return (raw && raw.unitRents && raw.unitRents[j] > 0) ? raw.unitRents[j] : (avg || FPE.data.rentByBedroom(br) * cfg.ops.asIsFactor);
      });
      flag('unitRents', given.length ? 'derived' : 'estimated');
    } else flag('unitRents', 'stated');
    L.vacantUnits = L.vacantUnits || [];
    var rate = L.units >= cfg.market.tax.commercialThreshold ? cfg.market.tax.commercialRate : cfg.market.tax.residentialRate;
    if (!(L.annualTax > 0)) { L.annualTax = L.price * rate * cfg.market.tax.assessmentRatio; flag('annualTax', 'derived'); } else flag('annualTax', 'stated');
    if (!(L.annualInsurance > 0)) { L.annualInsurance = cfg.market.insurancePerUnit * L.units; flag('annualInsurance', 'estimated'); } else flag('annualInsurance', 'stated');
    if (L.ownerUtilitiesMonthly == null) {
      L.ownerUtilitiesMonthly = (L.ownerPaysHeat ? 150 : 60) * L.units; flag('ownerUtilitiesMonthly', 'estimated');
    } else flag('ownerUtilitiesMonthly', 'stated');
    if (L.ownerPaysHeat == null) { L.ownerPaysHeat = false; flag('ownerPaysHeat', 'estimated'); }
    if (L.ownerPaysHeat && !L.heatShare) L.heatShare = 0.6;
    if (!L.yearBuilt) { L.yearBuilt = 1965; flag('yearBuilt', 'estimated'); } else flag('yearBuilt', 'stated');
    L.hoaMonthly = L.hoaMonthly || 0;
    L.otherMonthlyIncome = L.otherMonthlyIncome || 0;
    L.condition = L.condition || 'asis';
    L.id = L.id || 'listing';
    L.address = L.address || L.nickname || (L.units + '-unit listing');
    L.asOf = asOf || L.asOf || U.iso(U.parseMonth(cfg.plan.startMonth));
    L.enabled = true; L.status = 'active';
    L.prov = flags;
    return L;
  }

  function withInjection(cfg, listing, month, window) {
    return { inject: { listing: listing, month: month, window: window || 3 } };
  }
  function scoreWith(cfg, listing, month, window) {
    var r = FPE.runSimulation(cfg, Object.assign({ lean: true, series: cfg.plan.objective.kind === 'replaceSalary' }, withInjection(cfg, listing, month, window)));
    return { score: FPE.objective.scoreRun(cfg, r).score, run: r };
  }

  /* opts: { month (default: plan start), window (months on offer), paths (0 = no uncertainty), seed } */
  function analyze(cfg, raw, opts) {
    opts = opts || {};
    var month = opts.month != null ? opts.month : U.parseMonth(cfg.plan.startMonth);
    var listing = raw.prov && raw.asOf ? raw : normalize(cfg, raw, U.iso(month));
    var window = opts.window || 3;
    var without = FPE.runSimulation(cfg, { series: cfg.plan.objective.kind === 'replaceSalary' });
    var base = FPE.objective.scoreRun(cfg, without).score;
    var r = FPE.runSimulation(cfg, Object.assign({ series: cfg.plan.objective.kind === 'replaceSalary' }, withInjection(cfg, listing, month, window)));
    var withScore = FPE.objective.scoreRun(cfg, r).score;
    var bought = r.inject.bought;
    var log = r.inject.log;
    var first = log[0] || null;
    var lender = first ? first.options.map(function (o) {
      return { product: o.product, ownerOcc: o.ownerOcc, ok: !o.fails.length, fails: o.fails,
               rate: o.uw.rate, down: o.uw.downCash, cashToClose: o.uw.cashToClose, reserves: o.uw.reservesRequired,
               payment: o.uw.payment + o.uw.miMonthly, pitia: o.uw.pitia, metrics: o.uw.metrics,
               dayOneCF: o.st.dayOneCF, stabilizedCF: o.st.cf, stabilizedYield: o.st.yield, refreshCost: o.st.refreshCost };
    }) : [];
    var out = {
      listing: listing, month: month, window: window,
      bought: bought ? { t: bought.t, label: bought.label, product: bought.product, ownerOcc: bought.ownerOcc, cashToClose: bought.uw.cashToClose,
                         rate: bought.uw.rate, dayOneCF: bought.st.dayOneCF, stabilizedCF: bought.st.cf, stabilizedYield: bought.st.yield } : null,
      lender: lender, firstLook: first ? first.t : null,
      base: base, withDeal: withScore, delta: withScore - base, kind: cfg.plan.objective.kind,
      displaced: bought ? displaced(without, r, bought.t) : [],
      checklist: checklist(cfg, listing, lender)
    };
    /* not affordable in the window: when could you close, and would it still help? */
    if (!bought) {
      var late = FPE.runSimulation(cfg, Object.assign({ lean: true, series: cfg.plan.objective.kind === 'replaceSalary' }, withInjection(cfg, listing, month, 60)));
      var lb = late.inject.bought;
      out.earliest = lb ? { t: lb.t, label: lb.label, product: lb.product, delta: FPE.objective.scoreRun(cfg, late).score - base,
                            reason: whyNot(log) } : { t: null, reason: whyNot(log) };
    }
    if (opts.paths) {
      var seed = opts.seed != null ? opts.seed : cfg.mc.seed;
      var mcBase = FPE.mc.run(cfg, { paths: opts.paths, seed: seed, series: cfg.plan.objective.kind === 'replaceSalary' });
      var mcWith = runMcInjected(cfg, listing, month, window, opts.paths, seed);
      out.mc = { base: FPE.objective.headline(cfg, mcBase), withDeal: FPE.objective.headline(cfg, mcWith) };
      out.mc.delta = out.mc.withDeal.score - out.mc.base.score;
    }
    return out;
  }

  /* the same futures, with the listing on offer */
  function runMcInjected(cfg, listing, month, window, paths, seed) {
    var n = paths, out = { paths: n, months: Math.round(cfg.plan.horizonYears * 12), start: U.parseMonth(cfg.plan.startMonth),
      incomeAtTarget: new Float64Array(n), finalIncome: new Float64Array(n), heldNW: new Float64Array(n), soldNW: new Float64Array(n),
      units: new Float64Array(n), ruined: new Uint8Array(n), quit: [], partTime: [], freedom: [], forcedSales: new Float64Array(n),
      series: { income: [], nw: [], cash: [] } };
    for (var i = 0; i < n; i++) {
      var s = U.hash32(seed, i), c = FPE.mc.sampleConfig(cfg, s);
      var r = FPE.runSimulation(c, { rng: new U.Rng(U.hash32(s, 'market')), seed: s, lean: true, series: true,
                                     inject: { listing: listing, month: month, window: window } });
      var sm = r.summary;
      out.ruined[i] = sm.ruined ? 1 : 0;
      out.incomeAtTarget[i] = sm.ruined ? 0 : sm.incomeAtTargetReal; out.finalIncome[i] = sm.ruined ? 0 : sm.finalIncomeReal;
      out.heldNW[i] = sm.heldNWReal; out.soldNW[i] = sm.soldNWReal; out.units[i] = sm.units;
      out.quit.push(sm.quit); out.partTime.push(sm.partTime); out.freedom.push(sm.freedom); out.forcedSales[i] = sm.forcedSales;
      out.series.income.push(r.series.income); out.series.nw.push(r.series.nw); out.series.cash.push(r.series.cash);
    }
    return out;
  }

  var WHY = { cash: 'not enough cash yet (down payment, closing, reserves and your cushion)', dti: 'debt-to-income too high',
              dscr: 'rent does not cover the payment by the DSCR minimum', noiDscr: 'net income does not cover the bank\'s 1.20',
              selfSufficiency: 'fails FHA self-sufficiency', oneFha: 'you already have an FHA loan', financedCap: 'ten financed properties already',
              noIncomeHistory: 'no qualifying income history', fhaLimit: 'above the FHA loan limit', equityGap: 'equity gap too large to assume',
              hurdleYield: 'below your yield hurdle', hurdleCF: 'below your cash-flow hurdle', guardCashFlow: 'breaks your portfolio cash-flow guardrail',
              guardCoverage: 'breaks your coverage guardrail', guardLtv: 'breaks your leverage guardrail' };
  function whyNot(log) {
    var first = log && log[0];
    if (!first) return 'It was never on offer while you were buying (a stop rule, a pause, or the timing).';
    var best = first.options.slice().sort(function (a, b) { return a.fails.length - b.fails.length; })[0];
    return best ? best.product.toUpperCase() + ': ' + best.fails.map(function (f) { return WHY[f.code] || f.code; }).join('; ') : '';
  }

  /* purchases the plan would have made that this listing pushes out */
  function displaced(a, b, from) {
    var later = function (r) { return r.acquisitions.filter(function (x) { return x.t >= from && x.origin !== 'injected'; }); };
    var A = later(a), B = later(b);
    return A.slice(0, 3).map(function (x, i) { return { was: x.label + ' ' + x.nickname, now: B[i] ? B[i].label : 'not bought' }; });
  }

  /* ----------------------------------------------------------- max offer
     The highest price at which buying it leaves your headline no worse than
     not buying it (deterministic; refine with the uncertainty layer). */
  function maxOffer(cfg, raw, opts) {
    opts = opts || {};
    var month = opts.month != null ? opts.month : U.parseMonth(cfg.plan.startMonth);
    var listing = raw.prov && raw.asOf ? raw : normalize(cfg, raw, U.iso(month));
    var base = FPE.objective.scoreRun(cfg, FPE.runSimulation(cfg, { lean: true, series: cfg.plan.objective.kind === 'replaceSalary' })).score;
    var asked = listing.price;
    function at(price) {
      var L = U.clone(listing); L.price = price;
      if (listing.prov.annualTax !== 'stated') {
        var rate = L.units >= cfg.market.tax.commercialThreshold ? cfg.market.tax.commercialRate : cfg.market.tax.residentialRate;
        L.annualTax = price * rate * cfg.market.tax.assessmentRatio;
      }
      var s = scoreWith(cfg, L, month, opts.window);
      return { ok: !!s.run.inject.bought, score: s.score };
    }
    var lo = asked * 0.5, hi = asked * 1.3, best = null;
    var atLo = at(lo);
    if (!atLo.ok || atLo.score < base) return { price: null, asked: asked, reason: atLo.ok ? 'Even at half the asking price it does not beat your plan without it.' : 'Your plan cannot close on it in that window, even at half the price.' };
    var atHi = at(hi);
    if (atHi.ok && atHi.score >= base) return { price: hi, asked: asked, capped: true, reason: 'Still helps at 30% over asking — the limit is not the price.' };
    for (var k = 0; k < 14; k++) {
      var mid = (lo + hi) / 2, m = at(mid);
      if (m.ok && m.score >= base) { lo = mid; best = mid; } else hi = mid;
    }
    return { price: Math.floor((best || lo) / 1000) * 1000, asked: asked, base: base };
  }

  /* --------------------------------------------------- verify before offering */
  function checklist(cfg, L, lender) {
    var items = [], p = L.prov || {};
    var market = U.sum(L.unitBedrooms, function (br) { return FPE.data.rentByBedroom(br); });
    var inPlace = U.sum(L.unitRents);
    if (p.unitRents !== 'stated') items.push({ what: 'Rent roll', why: 'Rents are ' + p.unitRents + ', not from the listing. Get the rent roll and every lease.', weight: 3 });
    else if (inPlace < 0.75 * market) items.push({ what: 'Leases and estoppels', why: 'In-place rent is ' + Math.round(100 * inPlace / market) + '% of survey rent. The plan leans on turnover closing that gap; confirm lease end dates and that no tenant has a long lease or a side deal.', weight: 3 });
    if (L.ownerPaysHeat) items.push({ what: '24 months of utility bills', why: 'You pay the heat. Winter bills vary a lot; the engine uses ' + U.fmtDollars(L.ownerUtilitiesMonthly) + '/mo.', weight: 2 });
    else if (p.ownerUtilitiesMonthly !== 'stated') items.push({ what: 'Who pays which utility', why: 'Owner-paid utilities are estimated.', weight: 2 });
    if (p.annualTax !== 'stated') items.push({ what: 'Parcel tax statement', why: 'Tax is derived from price. Pull the Cass County statement, including special assessments.', weight: 2 });
    else items.push({ what: 'Special assessments', why: 'Fargo bills street and utility work outside the levy; check the parcel for current and pending specials.', weight: 1 });
    if (p.annualInsurance !== 'stated') items.push({ what: 'Insurance quote', why: 'Estimated at ' + U.fmtDollars(cfg.market.insurancePerUnit) + '/unit/yr; ND premiums are rising fast.', weight: 2 });
    if (L.yearBuilt && L.yearBuilt < 1950) items.push({ what: 'Inspection: wiring, foundation, sewer line, lead and asbestos', why: 'Built ' + L.yearBuilt + '. Knob-and-tube wiring or a failing sewer line can cost more than a year of cash flow.', weight: 3 });
    else if (L.yearBuilt && L.yearBuilt < 1980) items.push({ what: 'Inspection: roof, boiler or furnaces, water heaters', why: 'Built ' + L.yearBuilt + '. The engine assumes components are mid-life; their real ages move the cash flow more than the rent does.', weight: 2 });
    items.push({ what: 'Legal unit count and rental registration', why: 'Confirm every unit is legal and registered with the City of Fargo before paying for it.', weight: 1 });
    (lender || []).forEach(function (o) {
      if (o.ok) return;
      var codes = o.fails.map(function (f) { return f.code; });
      if (codes.indexOf('selfSufficiency') >= 0) items.push({ what: 'FHA self-sufficiency', why: 'At these rents a 3–4 unit FHA loan fails the 75%-of-rent test; ask a lender for the appraiser\'s market rents.', weight: 2 });
      if (codes.indexOf('dscr') >= 0) items.push({ what: 'DSCR at the lender', why: 'Gross rent does not cover the payment by the lender\'s minimum at this price.', weight: 2 });
    });
    return items.sort(function (a, b) { return b.weight - a.weight; });
  }

  FPE.deal = { normalize: normalize, analyze: analyze, maxOffer: maxOffer, checklist: checklist, WHY: WHY };
})(FPE);
