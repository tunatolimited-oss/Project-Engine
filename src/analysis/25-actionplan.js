/* ============================================================================
   WHAT DO I DO NEXT? — the next 18 months of the chosen plan, as actions.

   Read off the plan's own base run: the next purchase (what, when your cash
   is ready, the cash it takes and where it comes from, the loan and what to
   ask the lender), the other dated events in the window, and the triggers
   worth watching because they would change the plan.
   ========================================================================== */
(function (FPE) {
  'use strict';
  var U = FPE.util;

  var ASK = {
    fha: ['Will the appraiser\'s market rents pass FHA self-sufficiency on a 3–4 unit? (75% of all units\' rent must cover the payment.)',
          'Current FHA rate and the 1.75% upfront premium financed into the loan.',
          'Can the other units\' leases count toward my income for debt-to-income?'],
    convOO: ['Rate and PMI at 5% down on a 2–4 unit owner-occupied loan.', 'Reserves required after closing.', 'How do you count the other units\' rent (75% of leases or Form 1025)?'],
    convInv: ['Rate at 25% down on a 2–4 unit investment property.', 'Reserves: 6 months on this one plus 2/4/6% of my other balances — what do you count as reserves?',
              'How many financed properties will you allow (Fannie\'s cap is ten)?'],
    dscr: ['Rate by prepayment term (none, 3-year, 5-year) — the plan assumes ' + '%PREPAY%' + '.', 'Minimum DSCR, and do you use the lease or market rent for occupied units?',
           'Reserves, and whether seasoning is needed before a cash-out refinance.'],
    commercial: ['Rate, amortisation and balloon (the plan assumes 25 years and a 5-year balloon).', 'Minimum debt coverage and how you underwrite expenses.', 'Recourse and any prepayment terms.'],
    seller: ['Rate, balloon date and whether the note can be extended.', 'Will the seller subordinate to a bank loan later?', 'Have a real estate attorney draft the note and mortgage.'],
    assumed: ['Servicer\'s assumption fee and timeline (60–120 days is common).', 'Confirm the balance, rate and remaining term in writing.']
  };
  var PRODUCT = { fha: 'FHA', convOO: 'conventional, 5% down, owner-occupied', convInv: 'conventional investment', dscr: 'DSCR loan', commercial: 'local bank loan', seller: 'seller financing', assumed: 'loan assumption' };

  function next(cfg, res, opts) {
    opts = opts || {};
    var run = res || FPE.runSimulation(cfg);
    var start = run.summary.start, now = opts.from != null ? opts.from : start, end = now + (opts.months || 18);
    var acq = run.acquisitions.filter(function (a) { return a.t >= now; });
    var nextBuy = acq[0] || null;
    var out = { from: now, to: end, next: null, events: [], watch: [], savings: null };

    if (nextBuy) {
      var uw = nextBuy.uw, row = run.rows.filter(function (r) { return r.t === nextBuy.t; })[0];
      var prevRow = run.rows.filter(function (r) { return r.t === nextBuy.t - 1; })[0];
      out.next = {
        t: nextBuy.t, label: nextBuy.label, inMonths: nextBuy.t - now, nickname: nextBuy.nickname, units: nextBuy.units, origin: nextBuy.origin,
        price: nextBuy.price, product: nextBuy.product, productName: PRODUCT[nextBuy.product] || nextBuy.product, ownerOcc: nextBuy.ownerOcc,
        rate: uw.rate, down: uw.downCash, closing: uw.closing, reserves: uw.reservesRequired, cashToClose: uw.cashToClose,
        heloc: nextBuy.heloc || 0, cashBefore: prevRow ? prevRow.cash : null, cashAfter: nextBuy.cashAfter,
        payment: uw.payment + uw.miMonthly, pitia: uw.pitia, dayOneCF: nextBuy.st.dayOneCF, stabilizedCF: nextBuy.st.cf, stabilizedYield: nextBuy.st.yield,
        metrics: uw.metrics,
        ask: (ASK[nextBuy.product] || []).filter(function (q) { return nextBuy.units >= 3 || q.indexOf('self-sufficiency') < 0; })
          .map(function (q) { return q.replace('%PREPAY%', cfg.lending.dscr.prepayYears ? cfg.lending.dscr.prepayYears + '-year' : 'no'); }),
        verify: FPE.deal.checklist(cfg, { unitBedrooms: [], unitRents: [], prov: { unitRents: 'stated', annualTax: 'derived', annualInsurance: 'estimated' },
                                          ownerPaysHeat: nextBuy.origin !== 'library' ? false : false, yearBuilt: null }, []).slice(0, 3)
      };
      /* the months before it: what has to be true */
      out.next.blockers = run.rows.filter(function (r) { return r.t >= now && r.t < nextBuy.t && r.blocked; })
        .reduce(function (acc, r) { acc[r.blocked.blocked] = (acc[r.blocked.blocked] || 0) + 1; return acc; }, {});
    }
    /* dated events in the window */
    run.rows.filter(function (r) { return r.t >= now && r.t < end; }).forEach(function (r) {
      r.events.forEach(function (e) {
        if (['acquisition', 'career', 'management', 'refi', 'exchange', 'balloon', 'forcedSale', 'home', 'moveout', 'license', 'heat', 'rubs', 'io', 'paidoff', 'reps'].indexOf(e.type) >= 0)
          out.events.push({ t: r.t, label: r.label, type: e.type, text: e.text });
      });
    });
    /* triggers worth watching */
    var s = run.summary;
    if (s.partTime) out.watch.push({ t: s.partTime, text: 'Part-time from ' + U.label(s.partTime) + ' — the trigger is ' + (cfg.life.career.partTime.trigger === 'date' ? 'your date' : 'portfolio income covering ' + cfg.life.career.partTime.coverage + '× the pay you give up, for ' + cfg.life.career.sustainMonths + ' months') + '.' });
    if (s.quit) out.watch.push({ t: s.quit, text: 'Quit from ' + U.label(s.quit) + '. Do anything that needs W-2 income first: owner-occupied purchases, conventional loans, a cash-out refinance.' });
    if (s.management) out.watch.push({ t: s.management, text: 'A property manager from ' + U.label(s.management) + ' (' + U.fmtPct(cfg.ops.management.feePct, 0) + ' of rent plus leasing fees).' });
    run.properties.forEach(function (p) {
      if (p.loan.balloonAt) out.watch.push({ t: p.loan.balloonAt, text: p.nickname + ': balloon due ' + U.label(p.loan.balloonAt) + ' — it must refinance or be paid.' });
    });
    if (cfg.life.breakers.negativeCF.enabled) out.watch.push({ t: null, text: 'If your rentals\' cash flow averages negative over ' + cfg.life.breakers.negativeCF.months + ' months, the plan stops buying until it recovers.' });
    out.watch.sort(function (a, b) { return (a.t || 1e9) - (b.t || 1e9); });
    /* what you need to keep putting in */
    var contr = run.rows.filter(function (r) { return r.t >= now && r.t < end; });
    out.savings = contr.length ? U.sum(contr, function (r) { return r.contribution; }) / contr.length : null;
    return out;
  }

  FPE.actionPlan = { next: next, PRODUCT: PRODUCT };
})(FPE);
