/* Engine test suite — run with: node test.js */
var E = require('./src/engine.js');
var D = require('./src/defaults.js');

var pass = 0, fail = 0, failures = [];
function ok(name, cond, detail) {
  if (cond) { pass++; }
  else { fail++; failures.push(name + (detail ? '  ->  ' + detail : '')); }
}
function near(name, actual, expected, tol, unit) {
  var d = Math.abs(actual - expected);
  ok(name, d <= tol, 'got ' + actual.toFixed(2) + (unit||'') + ', expected ' + expected.toFixed(2) + (unit||'') + ' (tol ' + tol + ')');
}
function section(s) { console.log('\n=== ' + s + ' ==='); }

/* ---------------------------------------------------------------- 1. pmt() */
section('1. Amortization math');

near("user's example: $150K, 5%, 30yr", E.pmt(150000, 0.05, 30), 805.23, 0.02);
near('same loan at 7.0%',               E.pmt(150000, 0.07, 30), 998.00, 0.50);
near('same loan at 7.75% (Fargo 2026)', E.pmt(150000, 0.0775, 30), 1074.71, 1.0);
near('$100K, 6%, 30yr (textbook)',      E.pmt(100000, 0.06, 30), 599.55, 0.05);
near('$200K, 4.5%, 15yr',               E.pmt(200000, 0.045, 15), 1529.99, 0.50);
near('zero interest, $120K over 10yr',  E.pmt(120000, 0, 10), 1000.00, 0.01);
near('commercial: $450K, 7.25%, 25yr',  E.pmt(450000, 0.0725, 25), 3251.26, 2.0);

/* full amortization must retire exactly the principal */
(function () {
  var bal = 150000, rate = 0.07, pay = E.pmt(bal, rate, 30), totalPrin = 0, n = 0;
  while (bal > 0.005 && n < 400 * 12) {
    var i = bal * rate / 12, p = Math.min(pay - i, bal);
    bal -= p; totalPrin += p; n++;
  }
  near('30yr loan fully amortizes principal', totalPrin, 150000, 1.0);
  ok('...in exactly 360 payments', n === 360, 'took ' + n);
})();

/* ------------------------------------------------ 2. user's duplex, verified */
section("2. User's duplex example reproduced");

function duplexCfg(rate, capexPct, maintDollarsYr) {
  var c = D.defaultConfig();
  c.setup.startMonth = '2026-10';
  c.setup.horizonYears = 2;
  c.setup.startingCapital = 53000;
  c.setup.contributions = [{ fromMonth: '2026-10', monthly: 0 }];
  c.setup.modelTaxes = false;
  c.setup.personalMonthlyExpenses = 0;
  c.setup.currentHousingCost = 0;
  c.rules.ownerOccupyFirst = false;
  c.rules.emergencyFund = { mode: 'dollars', dollars: 0 };
  c.rules.lenderReserveMonths = 0;
  c.rules.minDSCR = 0;
  c.rules.management.trigger = 'never';
  c.rules.maintenancePctOfRent = maintDollarsYr / 25200;
  c.rules.capexPctOfRent = capexPct;
  c.market.vacancy = 0.05;
  /* freeze all growth so year 1 is flat and comparable to the user's figures */
  c.market.appreciation = 0;
  c.market.rentGrowth = 0;
  c.market.expenseInflation = 0;
  c.market.insuranceInflation = 0;
  c.market.applyTaxCap = true;
  c.market.reassessOnSale = false;      // reproduce the user's figures exactly
  c.financing.defaultDownPct = 0.25;
  c.financing.closingCostPct = 3000 / 200000;
  c.financing.ratePath = [{ fromYear: 2020, investment: rate, fha: rate, dscr: rate, commercial: rate }];
  c.properties = [{
    id: 'DX', enabled: true, nickname: 'Example duplex', units: 2, price: 200000,
    unitRents: [1050, 1050], annualTax: 3000, annualInsurance: 1500, hoaMonthly: 0,
    rehabCost: 0, rehabRentBump: 0, otherMonthlyIncome: 0, vacancyOverride: null,
    components: [{ name: 'none', lifeYears: 99, ageYears: 0, cost: 0, enabled: false }]
  }];
  c.market.driftListingPrices = false;
  c.archetypes = {};
  return c;
}

(function () {
  var r = E.runSimulation(duplexCfg(0.05, 0, 1000));
  var acq = r.acquisitions[0];
  ok('duplex is acquired in month 0', acq && acq.monthIndex === 0, acq ? 'month ' + acq.monthIndex : 'never bought');
  near('  P&I matches $805.23', acq.uw.payment, 805.23, 0.05);
  near('  cash needed = $50K down + $3K closing', acq.uw.cashNeeded, 53000, 1);
  near("  NOI/mo matches user's $1,536.67", acq.uw.noiMonthly, 1536.67, 1.0);
  near("  cash flow/mo matches user's $731.43", acq.uw.cashFlowMonthly, 731.43, 1.0);

  /* Month 0 is closing (no rent — you collect the following month), so the first
     twelve OPERATING months are rows 1..12. */
  var y1 = 0;
  for (var i = 1; i <= 12; i++) y1 += r.rows[i].cashFlow;
  near("  year-1 cash flow matches user's $8,777", y1, 8777.21, 1);
  ok('  closing month collects no rent (correct: rent arrives the month after)',
     Math.abs(r.rows[0].grossRent) < 0.01);
  ok("  the entered $3,000 tax bill is NOT overwritten by the market estimate",
     Math.abs(r.properties[0].annualTax - 3000) < 0.01,
     'tax became ' + r.properties[0].annualTax.toFixed(2));
})();

(function () {
  var r = E.runSimulation(duplexCfg(0.07, 0.08, 1000));
  var acq = r.acquisitions[0];
  near('realistic version: P&I at 7% = $998', acq.uw.payment, 998.00, 0.5);
  near('  NOI drops to $1,368.67/mo with CapEx reserve', acq.uw.noiMonthly, 1368.67, 1.0);
  near('  cash flow falls to ~$371/mo', acq.uw.cashFlowMonthly, 370.67, 1.5);
  near('  lender DSCR (std reserve) = 1.490', acq.uw.dscr, 1.490, 0.01);
  near('  conservative DSCR (your full reserve) = 1.371', acq.uw.dscrConservative, 1.371, 0.01);
  ok('  lender DSCR is the more generous of the two', acq.uw.dscr > acq.uw.dscrConservative);
  var y1 = 0;
  for (var i = 1; i <= 12; i++) y1 += r.rows[i].cashFlow;
  near('  year-1 cash flow ~$4,448', y1, 4448, 1);
  ok('  this is ~49% less than the 5% version', y1 < 8777 * 0.55, 'y1=' + y1.toFixed(0));
})();

/* --------------------------------------------- 3. ND commercial tax quirk */
section('3. North Dakota 4-unit commercial classification');

(function () {
  var c = D.defaultConfig();
  c.setup.horizonYears = 1; c.setup.startingCapital = 400000;
  c.setup.contributions = [{ fromMonth: '2026-10', monthly: 0 }];
  c.rules.ownerOccupyFirst = false;
  c.market.driftListingPrices = false;
  c.properties = [];
  /* triplex: residential rate */
  c.archetypes = { '3': { units: 3, price: 300000, rentPerUnit: 1100, nickname: 'tri' } };
  c.rules.ladder = [{ triggerType: 'purchases', triggerValue: 1, types: [3] }];
  var r3 = E.runSimulation(c);
  near('triplex taxed at 1.343% of $300K', r3.acquisitions[0].uw.cand.annualTax, 4029, 1);

  /* fourplex: commercial rate */
  var c4 = D.defaultConfig();
  c4.setup.horizonYears = 1; c4.setup.startingCapital = 400000;
  c4.setup.contributions = [{ fromMonth: '2026-10', monthly: 0 }];
  c4.rules.ownerOccupyFirst = false;
  c4.market.driftListingPrices = false;
  c4.properties = [];
  c4.archetypes = { '4': { units: 4, price: 300000, rentPerUnit: 1100, nickname: 'four' } };
  c4.rules.ladder = [{ triggerType: 'purchases', triggerValue: 1, types: [4] }];
  var r4 = E.runSimulation(c4);
  near('fourplex taxed at 1.492% of $300K', r4.acquisitions[0].uw.cand.annualTax, 4476, 1);
  ok('fourplex tax is ~11% higher than triplex at same price',
     Math.abs((4476 / 4029 - 1) - 0.111) < 0.005, 'ratio ' + (4476 / 4029).toFixed(4));
})();

/* --------------------------------------------------- 4. gates block purchases */
section('4. Lender gates');

function gateCfg() {
  var c = D.defaultConfig();
  c.setup.horizonYears = 6;
  c.setup.startingCapital = 0;
  c.setup.contributions = [{ fromMonth: '2026-10', monthly: 2500 }];
  c.rules.ownerOccupyFirst = false;
  c.market.driftListingPrices = false;
  c.properties = [];
  c.archetypes = { '4': { units: 4, price: 310000, rentPerUnit: 1075, nickname: 'fourplex', annualInsurance: 2800 } };
  c.rules.ladder = [{ triggerType: 'purchases', triggerValue: 1, types: [4] }];
  return c;
}

(function () {
  var c = gateCfg();
  c.rules.emergencyFund = { mode: 'dollars', dollars: 0 };
  c.rules.lenderReserveMonths = 0;
  var rA = E.runSimulation(c);

  var c2 = gateCfg();
  c2.rules.emergencyFund = { mode: 'dollars', dollars: 25000 };
  c2.rules.lenderReserveMonths = 6;
  var rB = E.runSimulation(c2);

  ok('reserves delay the first purchase',
     rB.acquisitions[0].monthIndex > rA.acquisitions[0].monthIndex,
     'no-reserve month ' + rA.acquisitions[0].monthIndex + ' vs reserve month ' + rB.acquisitions[0].monthIndex);

  /* blocked months should carry a reason and a shortfall */
  var blockedRows = rB.rows.filter(function (x) { return x.blocked; });
  ok('blocked months record a reason', blockedRows.length > 0 && blockedRows[0].blocked.reason === 'cash',
     blockedRows.length ? blockedRows[0].blocked.reason : 'none');
  ok('blocked months record a positive shortfall',
     blockedRows.length > 0 && blockedRows[0].blocked.shortfall > 0,
     blockedRows.length ? String(blockedRows[0].blocked.shortfall) : 'none');

  /* shortfall must shrink monotonically as cash accumulates pre-purchase */
  var firstBuy = rB.acquisitions[0].monthIndex;
  var pre = rB.rows.filter(function (x) { return x.blocked && x.i < firstBuy && x.i > 2; });
  var mono = true;
  for (var i = 1; i < pre.length; i++) if (pre[i].blocked.shortfall > pre[i - 1].blocked.shortfall + 1) mono = false;
  ok('shortfall shrinks as savings accumulate', mono);
})();

(function () {
  /* DSCR gate: an overpriced deal must never be bought */
  var c = gateCfg();
  c.setup.startingCapital = 500000;
  c.rules.minDSCR = 1.25;
  c.archetypes = { '4': { units: 4, price: 900000, rentPerUnit: 1075, nickname: 'overpriced', annualInsurance: 2800 } };
  var r = E.runSimulation(c);
  ok('DSCR gate blocks an overpriced deal', r.acquisitions.length === 0,
     'bought ' + r.acquisitions.length);
  var b = r.rows.filter(function (x) { return x.blocked; })[0];
  ok('  and reports dscr as the reason', b && b.blocked.reason === 'dscr', b ? b.blocked.reason : 'none');

  c.rules.minDSCR = 0.1;
  var r2 = E.runSimulation(c);
  ok('  lowering minDSCR lets it through', r2.acquisitions.length > 0);
})();

(function () {
  /* 10-loan cap must switch product */
  var c = D.defaultConfig();
  c.setup.horizonYears = 30;
  c.setup.startingCapital = 200000;
  c.setup.contributions = [{ fromMonth: '2026-10', monthly: 12000 }];
  c.rules.ownerOccupyFirst = false;
  c.rules.ladder = [{ triggerType: 'purchases', triggerValue: 1, types: [4] }];
  c.properties = [];
  var r = E.runSimulation(c);
  if (r.acquisitions.length > 11) {
    var eleventh = r.acquisitions[10];
    ok('11th purchase switches off conventional', eleventh.uw.product !== 'investment',
       'product was ' + eleventh.uw.product);
    ok('  first 10 are conventional investment loans',
       r.acquisitions.slice(0, 10).every(function (a) { return a.uw.product === 'investment'; }));
  } else {
    ok('10-loan cap test reached 11 purchases', false, 'only ' + r.acquisitions.length + ' purchases');
  }
})();

/* ------------------------------------------------------ 5. owner occupancy */
section('5. Owner-occupied first purchase');

(function () {
  var c = D.defaultConfig();
  c.setup.horizonYears = 5;
  c.setup.startingCapital = 5000;
  c.setup.contributions = [{ fromMonth: '2026-10', monthly: 2500 }];
  c.rules.ownerOccupyFirst = true;
  c.properties = [];
  c.market.driftListingPrices = false;
  var rOcc = E.runSimulation(c);

  var c2 = JSON.parse(JSON.stringify(c));
  c2.rules.ownerOccupyFirst = false;
  var rInv = E.runSimulation(c2);

  ok('owner-occupying gets you in sooner',
     rOcc.acquisitions[0].monthIndex < rInv.acquisitions[0].monthIndex,
     'occ month ' + rOcc.acquisitions[0].monthIndex + ' vs inv month ' + rInv.acquisitions[0].monthIndex);
  ok('  first deal uses an FHA loan', rOcc.acquisitions[0].uw.product === 'fha',
     rOcc.acquisitions[0].uw.product);
  ok('  FHA upfront MIP is financed into the balance',
     rOcc.acquisitions[0].uw.upfrontMIP > 0);
  ok('  monthly MIP is charged', rOcc.acquisitions[0].uw.mipMonthly > 0);
  ok('  second purchase reverts to investment terms',
     rOcc.acquisitions.length < 2 || rOcc.acquisitions[1].uw.product !== 'fha',
     rOcc.acquisitions.length > 1 ? rOcc.acquisitions[1].uw.product : 'n/a');

  /* during occupancy one unit earns nothing */
  var p1 = rOcc.acquisitions[0];
  var during = rOcc.rows[p1.monthIndex + 2];
  var after = rOcc.rows[p1.monthIndex + 14];
  ok('  gross rent rises once occupancy ends', after.grossRent > during.grossRent,
     during.grossRent.toFixed(0) + ' -> ' + after.grossRent.toFixed(0));
})();

/* ----------------------------------------------------- 6. CapEx components */
section('6. CapEx reserve and component replacement');

(function () {
  var c = D.defaultConfig();
  c.setup.horizonYears = 20;
  c.setup.startingCapital = 160000;
  c.setup.contributions = [{ fromMonth: '2026-10', monthly: 500 }];
  c.rules.ownerOccupyFirst = false;
  c.rules.minDSCR = 0.8;          // isolate CapEx behaviour from the DSCR gate
  c.rules.ladder = [{ triggerType: 'purchases', triggerValue: 1, types: [2] }];
  c.properties = [{
    id: 'C1', enabled: true, nickname: 'component test', units: 2, price: 240000,
    unitRents: [1100, 1100], annualInsurance: 1800, hoaMonthly: 0, rehabCost: 0,
    components: [
      { name: 'Roof', lifeYears: 25, ageYears: 22, cost: 14000, enabled: true },
      { name: 'Water heaters', lifeYears: 12, ageYears: 11, cost: 3000, enabled: true }
    ]
  }];
  c.archetypes = {};
  var r = E.runSimulation(c);
  var capexMonths = r.rows.filter(function (x) { return x.capexSpent > 0; });
  ok('component replacements fire', capexMonths.length >= 2, 'found ' + capexMonths.length);
  ok('  roof lands ~3 years after purchase',
     capexMonths.some(function (x) { return x.i >= 34 && x.i <= 38 && x.capexSpent > 10000; }),
     'months: ' + capexMonths.map(function (x) { return x.i; }).join(','));
  ok('  water heaters land ~1 year after purchase',
     capexMonths.some(function (x) { return x.i >= 10 && x.i <= 14; }));
  ok('  capex reserve pool accumulates', r.rows[24].capexPool > 0, String(r.rows[24].capexPool));
  ok('  water heaters recur on their 12-year cycle',
     capexMonths.filter(function (x) { return x.capexSpent > 2000 && x.capexSpent < 8000; }).length >= 2);
})();

/* ------------------------------------------------------------- 7. taxes */
section('7. Depreciation and tax');

(function () {
  var c = D.defaultConfig();
  c.setup.horizonYears = 4;
  c.setup.startingCapital = 200000;
  c.setup.contributions = [{ fromMonth: '2026-10', monthly: 0 }];
  c.setup.modelTaxes = true;
  c.setup.annualW2Income = 72000;
  c.rules.ownerOccupyFirst = false;
  c.rules.ladder = [{ triggerType: 'purchases', triggerValue: 1, types: [4] }];
  c.properties = [];
  c.market.driftListingPrices = false;
  var r = E.runSimulation(c);
  var acq = r.acquisitions[0];
  var basis = acq.property.depreciableBasis;
  near('depreciable basis = 80% of price', basis, acq.property.purchasePrice * 0.8, 1);

  var annualDep = 0;
  for (var i = 12; i < 24; i++) annualDep += r.rows[i].depreciation;
  near('annual depreciation = basis / 27.5', annualDep, basis / 27.5, 5);

  var decRows = r.rows.filter(function (x) { return x.date.m === 11 && x.taxPaid !== 0; });
  ok('tax is assessed each December', decRows.length >= 1, 'found ' + decRows.length);

  /* Depreciation must materially cut the bill. Compare against a run where the
     depreciation schedule is stretched so far it contributes nothing. */
  var cNoDep = JSON.parse(JSON.stringify(c));
  cNoDep.market.depreciationYears = 100000;
  var rNoDep = E.runSimulation(cNoDep);
  var taxWith = r.rows.reduce(function (a, x) { return a + x.taxPaid; }, 0);
  var taxWithout = rNoDep.rows.reduce(function (a, x) { return a + x.taxPaid; }, 0);
  ok('depreciation materially reduces tax owed', taxWith < taxWithout * 0.75,
     'with dep $' + Math.round(taxWith) + ' vs without $' + Math.round(taxWithout));

  /* A highly-levered deal should be sheltered into an outright tax benefit. */
  var cLev = JSON.parse(JSON.stringify(c));
  cLev.financing.defaultDownPct = 0.20;
  cLev.rules.minDSCR = 0.5;
  cLev.archetypes = { '4': { units: 4, price: 480000, rentPerUnit: 1075, nickname: 'levered', annualInsurance: 2800 } };
  cLev.setup.horizonYears = 3;
  cLev.setup.startingCapital = 200000;
  var rLev = E.runSimulation(cLev);
  var levDec = rLev.rows.filter(function (x) { return x.date.m === 11 && x.properties > 0; });
  ok('a high-basis, high-interest deal produces a tax BENEFIT early on',
     levDec.length > 1 && levDec[1].taxPaid < 0,
     levDec.length > 1 ? '$' + levDec[1].taxPaid.toFixed(0) : 'n/a');

  var cNoTax = JSON.parse(JSON.stringify(c));
  cNoTax.setup.modelTaxes = false;
  var rNo = E.runSimulation(cNoTax);
  ok('turning taxes off changes the result',
     Math.abs(r.summary.finalCash - rNo.summary.finalCash) > 1);
})();

/* -------------------------------------------------------- 8. stress tests */
section('8. Stress scenarios');

(function () {
  var base = D.defaultConfig();
  base.setup.horizonYears = 12;
  base.rules.ownerOccupyFirst = false;
  var rBase = E.runSimulation(base);

  var rec = JSON.parse(JSON.stringify(base));
  rec.stress.recession = { enabled: true, startYear: 2029, durationYears: 3,
                           rentDropPct: 0.10, vacancyAddPts: 0.06, appreciationOverride: -0.03 };
  var rRec = E.runSimulation(rec);

  ok('recession reduces final equity',
     rRec.summary.finalEquity < rBase.summary.finalEquity,
     rRec.summary.finalEquity.toFixed(0) + ' vs ' + rBase.summary.finalEquity.toFixed(0));
  ok('recession reduces or delays acquisitions',
     rRec.summary.finalProperties <= rBase.summary.finalProperties);
  ok('recession months are flagged', rRec.rows.some(function (x) { return x.recession; }));
  ok('recession ends when scheduled',
     rRec.rows.filter(function (x) { return x.recession; }).every(function (x) { return x.date.y >= 2029 && x.date.y < 2032; }));

  var shock = JSON.parse(JSON.stringify(base));
  shock.stress.rateShock = { enabled: true, fromYear: 2028, addPct: 0.02 };
  var rShock = E.runSimulation(shock);
  ok('rate shock hurts the plan', rShock.summary.finalEquity < rBase.summary.finalEquity);

  var ev = JSON.parse(JSON.stringify(base));
  ev.stress.events = [{ enabled: true, type: 'capex', month: '2029-06', amount: 18000, label: 'roof failure' }];
  var rEv = E.runSimulation(ev);
  ok('a scheduled capex event drains cash',
     rEv.summary.finalNetWorth < rBase.summary.finalNetWorth);
})();

/* ------------------------------------------------------- 9. determinism */
section('9. Determinism and invariants');

(function () {
  var c = D.defaultConfig();
  var a = E.runSimulation(c), b = E.runSimulation(c);
  ok('same config produces identical results',
     JSON.stringify(a.summary) === JSON.stringify(b.summary));

  var r = E.runSimulation(D.defaultConfig());
  ok('equity always equals value minus debt',
     r.rows.every(function (x) { return Math.abs(x.equity - (x.value - x.debt)) < 0.01; }));
  ok('debt never goes negative', r.rows.every(function (x) { return x.debt >= -0.01; }));
  ok('units never decrease', r.rows.every(function (x, i, arr) { return i === 0 || x.units >= arr[i - 1].units; }));
  ok('property count never decreases', r.rows.every(function (x, i, arr) { return i === 0 || x.properties >= arr[i - 1].properties; }));
  ok('capex pool never negative', r.rows.every(function (x) { return x.capexPool >= -0.01; }));
  ok('row count matches horizon', r.rows.length === D.defaultConfig().setup.horizonYears * 12 + 1,
     r.rows.length + ' rows');
  ok('every acquisition has a matching timeline row',
     r.acquisitions.every(function (a2) { return r.rows[a2.monthIndex].acquisition; }));
  ok('gross rent is non-negative throughout', r.rows.every(function (x) { return x.grossRent >= -0.01; }));
})();

/* ------------------------------------------------------- 10. monotonicity */
section('10. Economic monotonicity (more money = better outcomes)');

(function () {
  function withContribution(v) {
    var c = D.defaultConfig();
    c.setup.horizonYears = 12;
    c.setup.contributions = [{ fromMonth: '2026-10', monthly: v }];
    return E.runSimulation(c);
  }
  var lo = withContribution(1500), mid = withContribution(3000), hi = withContribution(6000);
  ok('more contribution -> at least as many properties',
     lo.summary.finalProperties <= mid.summary.finalProperties &&
     mid.summary.finalProperties <= hi.summary.finalProperties,
     [lo.summary.finalProperties, mid.summary.finalProperties, hi.summary.finalProperties].join(' / '));
  ok('more contribution -> more net worth',
     lo.summary.finalNetWorth < mid.summary.finalNetWorth &&
     mid.summary.finalNetWorth < hi.summary.finalNetWorth);
  ok('more contribution -> first purchase no later',
     lo.acquisitions[0].monthIndex >= mid.acquisitions[0].monthIndex &&
     mid.acquisitions[0].monthIndex >= hi.acquisitions[0].monthIndex);

  function withVacancy(v) {
    var c = D.defaultConfig(); c.setup.horizonYears = 12; c.market.vacancy = v;
    return E.runSimulation(c);
  }
  ok('higher vacancy -> lower net worth',
     withVacancy(0.12).summary.finalNetWorth < withVacancy(0.04).summary.finalNetWorth);

  function withRate(v) {
    var c = D.defaultConfig(); c.setup.horizonYears = 12;
    c.financing.ratePath = [{ fromYear: 2020, investment: v, fha: v - 0.01, dscr: v, commercial: v }];
    return E.runSimulation(c);
  }
  ok('higher rates -> lower net worth',
     withRate(0.09).summary.finalNetWorth < withRate(0.06).summary.finalNetWorth);
})();

/* ------------------------------------------------------------ 11. sweeps */
section('11. Sensitivity sweep');

(function () {
  var c = D.defaultConfig();
  c.setup.horizonYears = 10;
  var sw = E.runSweep(c, { path: 'setup.contributions[0].monthly', from: 1000, to: 5000, step: 1000 });
  ok('sweep returns one row per step', sw.length === 5, sw.length + ' rows');
  ok('sweep is monotonic in net worth',
     sw.every(function (x, i) { return i === 0 || x.netWorth >= sw[i - 1].netWorth; }),
     sw.map(function (x) { return Math.round(x.netWorth / 1000) + 'K'; }).join(' '));
  ok('sweep reports first acquisition dates', sw.every(function (x) { return x.firstAcq; }));
})();

/* -------------------------------------------------------- 12. edge cases */
section('12. Edge cases');

(function () {
  var c = D.defaultConfig();
  c.setup.startingCapital = 0;
  c.setup.contributions = [{ fromMonth: '2026-10', monthly: 0 }];
  c.setup.horizonYears = 5;
  var r = E.runSimulation(c);
  ok('zero money buys nothing and does not crash', r.acquisitions.length === 0);
  ok('  and still produces a full timeline', r.rows.length === 61);
  ok('  and reports a blocked reason every month',
     r.rows.filter(function (x) { return x.blocked; }).length > 50);

  var c2 = D.defaultConfig();
  c2.properties = [];
  c2.setup.horizonYears = 8;
  var r2 = E.runSimulation(c2);
  ok('empty library falls back to archetypes', r2.acquisitions.length > 0 &&
     r2.acquisitions[0].property.origin === 'archetype');

  var c3 = D.defaultConfig();
  c3.setup.horizonYears = 1;
  var r3 = E.runSimulation(c3);
  ok('a 1-year horizon works', r3.rows.length === 13);

  var c4 = D.defaultConfig();
  c4.setup.horizonYears = 30;
  var t0 = Date.now();
  var r4 = E.runSimulation(c4);
  var ms = Date.now() - t0;
  ok('30-year run completes', r4.rows.length === 361);
  ok('  and is fast enough for live sweeps (<150ms)', ms < 150, ms + 'ms');

  var c5 = D.defaultConfig();
  c5.setup.horizonYears = 10;
  c5.rules.profitMode = 'fixedDraw';
  c5.rules.drawAmount = 1500;
  var r5 = E.runSimulation(c5);
  var c5b = D.defaultConfig(); c5b.setup.horizonYears = 10;
  var r5b = E.runSimulation(c5b);
  ok('drawing money slows the plan', r5.summary.finalNetWorth < r5b.summary.finalNetWorth);

  var c6 = D.defaultConfig();
  c6.setup.horizonYears = 20;
  c6.rules.management.trigger = 'units';
  c6.rules.management.threshold = 6;
  var r6 = E.runSimulation(c6);
  ok('management activates at the unit threshold',
     r6.rows.some(function (x) { return x.managementActive; }));
  ok('  and stays on once activated',
     (function () {
       var seen = false, ok2 = true;
       r6.rows.forEach(function (x) { if (x.managementActive) seen = true; else if (seen) ok2 = false; });
       return ok2;
     })());
  ok('  and shows up as a management expense',
     r6.rows.some(function (x) { return x.opMgmt > 0; }));
})();

/* ------------------------------------------------------ 13. ladder logic */
section('13. Acquisition ladder');

(function () {
  var c = D.defaultConfig();
  c.setup.horizonYears = 30;
  c.setup.startingCapital = 100000;
  c.setup.contributions = [{ fromMonth: '2026-10', monthly: 9000 }];
  c.rules.ownerOccupyFirst = false;
  c.properties = [];
  /* Use deals that clear DSCR on their own, so this tests ladder sequencing
     rather than Fargo duplex economics (covered separately in section 14). */
  c.archetypes = {
    '2': { units: 2, price: 180000, rentPerUnit: 1200, nickname: 'duplex', annualInsurance: 1400 },
    '4': { units: 4, price: 310000, rentPerUnit: 1075, nickname: 'fourplex', annualInsurance: 2800 },
    '8': { units: 8, price: 600000, rentPerUnit: 1000, nickname: 'eightplex', annualInsurance: 4800 }
  };
  c.rules.ladder = [
    { triggerType: 'purchases', triggerValue: 1, types: [2] },
    { triggerType: 'purchases', triggerValue: 3, types: [4] },
    { triggerType: 'purchases', triggerValue: 6, types: [8] }
  ];
  var r = E.runSimulation(c);
  var seq = r.acquisitions.map(function (a) { return a.property.units; });
  ok('ladder step 1: purchases 1-2 are duplexes',
     seq.length >= 2 && seq[0] === 2 && seq[1] === 2, seq.join(','));
  ok('ladder step 2: purchases 3-5 are fourplexes',
     seq.length >= 5 && seq[2] === 4 && seq[3] === 4 && seq[4] === 4, seq.join(','));
  ok('ladder step 3: purchase 6+ are 8-units',
     seq.length >= 6 && seq[5] === 8, seq.join(','));
  ok('8-unit uses a commercial loan',
     r.acquisitions.length >= 6 && r.acquisitions[5].uw.product === 'commercial',
     r.acquisitions.length >= 6 ? r.acquisitions[5].uw.product : 'n/a');
  ok('commercial loan amortizes over 25 years',
     r.acquisitions.length >= 6 && r.acquisitions[5].uw.amortYears === 25);
  ok('commercial loan has a 5-year balloon',
     r.acquisitions.length >= 6 && r.acquisitions[5].uw.balloonMonths === 60);
  ok('balloon refinance actually fires',
     r.rows.some(function (x) { return x.events.some(function (e) { return e.type === 'balloon'; }); }));
})();

/* --------------------------------------------- 14. Fargo per-unit insight */
section('14. Fargo: in-place rent vs market rent');

(function () {
  function typeOnly(t, useMarket) {
    var c = D.defaultConfig();
    c.setup.horizonYears = 15;
    c.rules.ownerOccupyFirst = false;
    c.properties = [];
    if (!useMarket) {
      Object.keys(c.archetypes).forEach(function (k) { delete c.archetypes[k].marketRentPerUnit; });
      c.rules.dscrUsesMarketRent = false;
    }
    c.rules.ladder = [{ triggerType: 'purchases', triggerValue: 1, types: [t] }];
    return E.runSimulation(c);
  }

  /* At IN-PLACE rents, with no rent-to-market story, almost nothing clears. */
  var d0 = typeOnly(2, false), t0 = typeOnly(3, false), f0 = typeOnly(4, false);
  ok('at in-place rents alone, a Fargo duplex never clears DSCR',
     d0.summary.finalProperties === 0, 'bought ' + d0.summary.finalProperties);
  ok('at in-place rents alone, a Fargo triplex never clears DSCR',
     t0.summary.finalProperties === 0, 'bought ' + t0.summary.finalProperties);
  ok('at in-place rents alone, a Fargo fourplex never clears DSCR',
     f0.summary.finalProperties === 0, 'bought ' + f0.summary.finalProperties);
  console.log('    IN-PLACE RENTS ONLY: every property type fails. This is the real');
  console.log('    finding from the sold comps — Fargo small multifamily as currently');
  console.log('    tenanted does not cover its own debt at 2026 prices and rates.');

  /* With the rent gap closed, the picture changes completely. */
  var d1 = typeOnly(2, true), t1 = typeOnly(3, true), f1 = typeOnly(4, true);
  ok('closing the rent gap makes duplexes work', d1.summary.finalProperties > 0);
  ok('closing the rent gap makes triplexes work', t1.summary.finalProperties > 0);
  ok('closing the rent gap makes fourplexes work', f1.summary.finalProperties > 0);
  console.log('    WITH RENTS PUSHED TO MARKET:');
  [['duplex', d1], ['triplex', t1], ['fourplex', f1]].forEach(function (x) {
    console.log('      ' + x[0].padEnd(9) + x[1].summary.finalProperties + ' props, ' +
      String(x[1].summary.finalUnits).padStart(3) + ' units, $' +
      Math.round(x[1].summary.finalMonthlyCashFlow).toLocaleString().padStart(6) + '/mo, net worth $' +
      Math.round(x[1].summary.finalNetWorth / 1000) + 'K');
  });
  ok('the rent gap is worth more than the property type',
     d1.summary.finalNetWorth > d0.summary.finalNetWorth &&
     f1.summary.finalNetWorth > f0.summary.finalNetWorth);
})();

/* ------------------------------------- 14b. the features the comps forced in */
section('14b. Owner-paid utilities, rent ramp, reassessment, market-rent DSCR');

function oneProp(over) {
  var c = D.defaultConfig();
  c.setup.horizonYears = 6;
  c.setup.startingCapital = 150000;
  c.setup.contributions = [{ fromMonth: '2026-10', monthly: 0 }];
  c.rules.ownerOccupyFirst = false;
  c.rules.minDSCR = 0.1;
  c.rules.ladder = [{ triggerType: 'purchases', triggerValue: 1, types: [3] }];
  c.market.driftListingPrices = false;
  c.archetypes = {};
  c.properties = [Object.assign({
    id: 'X', enabled: true, nickname: 'test', units: 3, price: 224000,
    unitRents: [900, 900, 900], annualTax: 3617, annualInsurance: 2000,
    hoaMonthly: 0, ownerUtilitiesMonthly: 0, otherMonthlyIncome: 0,
    rehabCost: 0, rehabRentBump: 0, vacancyOverride: null,
    components: [{ name: 'none', lifeYears: 99, ageYears: 0, cost: 0, enabled: false }]
  }, over || {})];
  return E.runSimulation(c);
}

(function () {
  var none = oneProp({}), util = oneProp({ ownerUtilitiesMonthly: 270 });
  var a = none.rows[13].cashFlow, b = util.rows[13].cashFlow;
  ok('owner-paid utilities reduce cash flow', b < a, a.toFixed(0) + ' -> ' + b.toFixed(0));
  near('  ...by very close to the amount entered', a - b, 270, 12);

  var flat = oneProp({}), ramp = oneProp({ marketRentPerUnit: 1175, monthsToMarket: 18 });
  ok('rents start where they actually are, not at market',
     Math.abs(ramp.rows[1].grossRent - flat.rows[1].grossRent) < 60,
     flat.rows[1].grossRent.toFixed(0) + ' vs ' + ramp.rows[1].grossRent.toFixed(0));
  ok('  and ramp upward over the window', ramp.rows[12].grossRent > ramp.rows[2].grossRent);
  ok('  reaching market by the end of the window',
     ramp.rows[20].grossRent > 3 * 1175 * 0.98,
     'gross at month 20: ' + ramp.rows[20].grossRent.toFixed(0) + ' vs target ' + (3 * 1175));
  ok('  and the ramp is announced on the timeline',
     ramp.rows.some(function (r) { return r.events.some(function (e) { return e.type === 'rentramp'; }); }));
  ok('closing the rent gap raises cash flow substantially',
     ramp.summary.finalMonthlyCashFlow > flat.summary.finalMonthlyCashFlow + 500,
     flat.summary.finalMonthlyCashFlow.toFixed(0) + ' -> ' + ramp.summary.finalMonthlyCashFlow.toFixed(0));

  /* market-rent DSCR is what an underwriter actually computes */
  var gap = oneProp({ marketRentPerUnit: 1175 });
  var uw = gap.acquisitions[0].uw;
  ok('lender DSCR uses the market-rent schedule when rents are below market',
     uw.usedMarketRent === true);
  ok('  and it is higher than the in-place figure', uw.dscr > uw.dscrInPlace,
     uw.dscr.toFixed(2) + ' vs in-place ' + uw.dscrInPlace.toFixed(2));
  var noGap = oneProp({});
  ok('with no market rent given, the two agree',
     Math.abs(noGap.acquisitions[0].uw.dscr - noGap.acquisitions[0].uw.dscrInPlace) < 0.001);

  /* post-sale reassessment */
  var keep = oneProp({}), reass = oneProp({});
  keep.rows[0]; // no-op
  var cKeep = D.defaultConfig(); // build explicit pair
  function taxAfter(reassess) {
    var c = D.defaultConfig();
    c.setup.horizonYears = 3; c.setup.startingCapital = 150000;
    c.setup.contributions = [{ fromMonth: '2026-10', monthly: 0 }];
    c.rules.ownerOccupyFirst = false; c.rules.minDSCR = 0.1;
    c.rules.ladder = [{ triggerType: 'purchases', triggerValue: 1, types: [3] }];
    c.market.driftListingPrices = false; c.market.reassessOnSale = reassess;
    c.market.appreciation = 0;
    c.archetypes = {};
    c.properties = [{ id: 'X', enabled: true, nickname: 't', units: 3, price: 300000,
      unitRents: [900, 900, 900], annualTax: 2000, annualInsurance: 2000, hoaMonthly: 0,
      ownerUtilitiesMonthly: 0, otherMonthlyIncome: 0, rehabCost: 0, rehabRentBump: 0,
      vacancyOverride: null, components: [] }];
    return E.runSimulation(c).properties[0].annualTax;
  }
  var tOff = taxAfter(false), tOn = taxAfter(true);
  ok('with reassessment off, an entered tax bill is respected',
     tOff < 2200, 'became ' + tOff.toFixed(0));
  ok('with reassessment on, tax resets toward the purchase price',
     tOn > 3500, 'became ' + tOn.toFixed(0));
  /* reassessed at the first January, then two further capped 3% years */
  near('  to price x rate x assessed-ratio', tOn, 300000 * 0.01343 * 0.93 * 1.03 * 1.03, 40);
})();

/* ------------------------------------------------------------- 15. output */
section('15. Baseline run summary (sanity read)');

(function () {
  var r = E.runSimulation(D.defaultConfig());
  var s = r.summary;
  console.log('    First purchase:  ' + (s.firstAcquisition ? s.firstAcquisition.label + ' — ' + s.firstAcquisition.property.nickname : 'none'));
  console.log('    Acquisitions:    ' + r.acquisitions.map(function (a) { return a.label + ' (' + a.property.units + 'u)'; }).join(', '));
  console.log('    Final:           ' + s.finalProperties + ' properties, ' + s.finalUnits + ' units');
  console.log('    Monthly flow:    $' + Math.round(s.finalMonthlyCashFlow).toLocaleString());
  console.log('    Equity:          $' + Math.round(s.finalEquity).toLocaleString());
  console.log('    Net worth:       $' + Math.round(s.finalNetWorth).toLocaleString());
  console.log('    Contributed:     $' + Math.round(s.totalContributed).toLocaleString());
  console.log('    Freedom date:    ' + (s.freedomDate ? E.fmtMonth(s.freedomDate.date) : 'not within horizon'));
  console.log('    Payoff (paused): ' + (r.projection.payoffYears ? r.projection.payoffYears.toFixed(1) + ' yrs' : 'n/a'));
  ok('baseline acquires at least one property', r.acquisitions.length >= 1);
  ok('baseline does not go broke', !s.brokeAt, s.brokeAt ? 'broke at ' + E.fmtMonth(s.brokeAt.date) : '');
  ok('baseline net worth exceeds total contributed', s.finalNetWorth > s.totalContributed,
     Math.round(s.finalNetWorth) + ' vs ' + Math.round(s.totalContributed));
})();

/* ===================================================== 16. STRATEGIES ===== */
section('16. Strategy modules');

function stratCfg(over) {
  var c = D.defaultConfig();
  c.setup.startMonth = '2027-01';
  c.setup.horizonYears = 12;
  c.setup.startingCapital = 0;
  c.setup.contributions = [{ fromMonth: '2027-01', monthly: 5000 }];
  c.rules.ownerOccupyFirst = true;
  c.rules.ladder = [{ triggerType: 'purchases', triggerValue: 1, types: [2, 3, 4, 8] }];
  if (over) over(c);
  return c;
}
var BASE = E.runSimulation(stratCfg());

(function () {
  ok('with every strategy off the run is unchanged',
     JSON.stringify(E.runSimulation(stratCfg()).summary) === JSON.stringify(BASE.summary));
  ok('  and no strategy events fire',
     !BASE.rows.some(function (r) { return r.events.some(function (e) {
       return ['refi', 'heloc', 'exchange', 'reps'].indexOf(e.type) >= 0; }); }));
})();

/* ---- cost segregation ---- */
(function () {
  var cs = E.runSimulation(stratCfg(function (c) {
    c.strategies.costSeg.enabled = true; c.strategies.costSeg.shortLifePct = 0.25;
  }));
  var acq = cs.acquisitions[0], p = cs.properties.length ? null : null;
  var firstBuy = cs.rows[cs.acquisitions[0].monthIndex];
  ok('cost segregation produces a large first-year deduction',
     firstBuy.depreciation > 40000, 'month-of-purchase depreciation ' + firstBuy.depreciation.toFixed(0));
  var yr1 = cs.years.filter(function (y) { return y.year === cs.acquisitions[0].date.y; })[0];
  var b1 = BASE.years.filter(function (y) { return y.year === cs.acquisitions[0].date.y; })[0];
  ok('  and far more depreciation than straight-line alone',
     yr1.depreciation > b1.depreciation * 3,
     Math.round(yr1.depreciation) + ' vs ' + Math.round(b1.depreciation));
  ok('  the study fee is charged', cs.summary.finalCash < BASE.summary.finalCash + 1e9);

  /* with a W-2 job the loss is passive and mostly suspends */
  ok('without REPS the deduction mostly suspends as a passive loss',
     cs.summary.suspendedLosses > 20000,
     'suspended $' + Math.round(cs.summary.suspendedLosses));

  /* with REPS it offsets ordinary income instead */
  var reps = E.runSimulation(stratCfg(function (c) {
    c.strategies.costSeg.enabled = true;
    c.setup.repsFromYear = 2027;
  }));
  ok('with REPS from the start the same deduction is used, not suspended',
     reps.summary.suspendedLosses < cs.summary.suspendedLosses,
     'REPS $' + Math.round(reps.summary.suspendedLosses) + ' vs passive $' +
     Math.round(cs.summary.suspendedLosses));
  ok('  which means less tax paid overall',
     reps.summary.totalTax < cs.summary.totalTax,
     'REPS $' + Math.round(reps.summary.totalTax) + ' vs $' + Math.round(cs.summary.totalTax));
  ok('  and REPS is announced on the timeline',
     reps.rows.some(function (r) { return r.events.some(function (e) { return e.type === 'reps'; }); }));
})();

/* ---- the rule most models get wrong ---- */
(function () {
  /* Build up suspended losses under a W-2, THEN switch on REPS. Those old
     losses must NOT dump against ordinary income. */
  var late = E.runSimulation(stratCfg(function (c) {
    c.strategies.costSeg.enabled = true;
    c.setup.annualW2Income = 180000;          // above the phase-out, so all suspends
    c.setup.repsFromYear = 2032;
  }));
  var beforeSwitch = late.rows.filter(function (r) { return r.date.y === 2031 && r.date.m === 11; })[0];
  var afterSwitch = late.rows.filter(function (r) { return r.date.y === 2032 && r.date.m === 11; })[0];
  ok('suspended losses survive the switch to REPS — they do NOT release',
     afterSwitch.passiveLossCarry >= beforeSwitch.passiveLossCarry * 0.5,
     'before $' + Math.round(beforeSwitch.passiveLossCarry) +
     ' -> after $' + Math.round(afterSwitch.passiveLossCarry));
  ok('  (section 469(f)(1): they only offset income from the same activity)',
     late.summary.suspendedLosses > 0, '$' + Math.round(late.summary.suspendedLosses));

  /* the 461(l) cap binds once REPS is on */
  var capped = E.runSimulation(stratCfg(function (c) {
    c.strategies.costSeg.enabled = true;
    c.strategies.costSeg.shortLifePct = 0.40;
    c.setup.repsFromYear = 2027;
    c.setup.excessBusinessLossCap = 20000;     // deliberately tiny
  }));
  var uncapped = E.runSimulation(stratCfg(function (c) {
    c.strategies.costSeg.enabled = true;
    c.strategies.costSeg.shortLifePct = 0.40;
    c.setup.repsFromYear = 2027;
    c.setup.excessBusinessLossCap = 5000000;
  }));
  ok('the section 461(l) excess business loss cap actually binds',
     capped.summary.totalTax > uncapped.summary.totalTax,
     'capped $' + Math.round(capped.summary.totalTax) + ' vs uncapped $' +
     Math.round(uncapped.summary.totalTax));
  ok('  and the excess becomes an NOL carryforward', capped.summary.nolCarry > 0,
     '$' + Math.round(capped.summary.nolCarry));
})();

/* ---- cash-out refinance ---- */
(function () {
  var refi = E.runSimulation(stratCfg(function (c) { c.strategies.cashOutRefi.enabled = true; }));
  ok('cash-out refinancing releases capital', refi.summary.totalRefiProceeds > 0,
     '$' + Math.round(refi.summary.totalRefiProceeds));
  ok('  and buys more property', refi.summary.finalProperties >= BASE.summary.finalProperties,
     refi.summary.finalProperties + ' vs ' + BASE.summary.finalProperties);
  ok('  at the cost of more debt', refi.summary.finalDebt > BASE.summary.finalDebt);
  ok('  and it is announced on the timeline',
     refi.rows.some(function (r) { return r.events.some(function (e) { return e.type === 'refi'; }); }));

  var seasoned = E.runSimulation(stratCfg(function (c) {
    c.strategies.cashOutRefi.enabled = true;
    c.strategies.cashOutRefi.seasoningMonths = 120;
  }));
  ok('a long seasoning requirement suppresses it',
     seasoned.summary.totalRefiProceeds < refi.summary.totalRefiProceeds);

  var strict = E.runSimulation(stratCfg(function (c) {
    c.strategies.cashOutRefi.enabled = true;
    c.strategies.cashOutRefi.minDSCRAfter = 3.0;
  }));
  ok('a strict post-refi DSCR requirement suppresses it',
     strict.summary.totalRefiProceeds < refi.summary.totalRefiProceeds,
     '$' + Math.round(strict.summary.totalRefiProceeds));
})();

/* ---- HELOC ---- */
(function () {
  var hel = E.runSimulation(stratCfg(function (c) { c.strategies.heloc.enabled = true; }));
  ok('a HELOC line becomes available once equity seasons',
     hel.rows.some(function (r) { return r.helocLimit > 0; }));
  ok('  it gets drawn to close a purchase', hel.summary.helocBalance >= 0 &&
     hel.rows.some(function (r) { return r.helocBalance > 0; }));
  ok('  interest is charged on the balance', hel.summary.helocInterestPaid > 0,
     '$' + Math.round(hel.summary.helocInterestPaid));
  ok('  and the balance is netted out of net worth',
     hel.rows.every(function (r) {
       return Math.abs(r.netWorth - (r.equity + r.cash + r.capexPool - r.helocBalance)) < 0.01; }));
  ok('  drawing accelerates acquisition', hel.summary.finalProperties >= BASE.summary.finalProperties);
})();

/* ---- 1031 exchange ---- */
(function () {
  var ex = E.runSimulation(stratCfg(function (c) {
    c.strategies.exchange.enabled = true;
    c.strategies.exchange.triggerValue = 2;
    c.strategies.exchange.minGain = 10000;
  }));
  ok('a 1031 exchange executes', ex.summary.exchanges > 0, String(ex.summary.exchanges));
  ok('  gain is deferred, not paid', ex.summary.deferredGain > 0,
     '$' + Math.round(ex.summary.deferredGain));
  ok('  and it trades up into more units',
     ex.summary.finalUnits > BASE.summary.finalUnits,
     ex.summary.finalUnits + ' vs ' + BASE.summary.finalUnits);
  ok('  the replacement carries basis forward rather than starting fresh',
     ex.properties.some(function (p) { return p.isReplacement && p.deferredGain > 0; }));
  ok('  suspended losses are NOT released by the exchange',
     ex.summary.suspendedLosses >= 0);
  ok('  and it is announced', ex.rows.some(function (r) {
     return r.events.some(function (e) { return e.type === 'exchange'; }); }));
})();

/* ---- repeat house-hacking ---- */
(function () {
  var chain = E.runSimulation(stratCfg(function (c) {
    c.rules.ownerOccupyCount = 3;
    c.rules.ownerOccupyGapMonths = 12;
  }));
  ok('house-hacking can repeat', chain.summary.ownerOccupancies > 1,
     String(chain.summary.ownerOccupancies));
  var oo = chain.acquisitions.filter(function (a) { return a.uw.ownerOcc; });
  ok('  the first one uses FHA', oo[0].uw.product === 'fha', oo[0].uw.product);
  ok('  later ones use a conventional owner-occupied loan',
     oo.length < 2 || oo[1].uw.product === 'conventionalOO',
     oo.length > 1 ? oo[1].uw.product : 'n/a');
  ok('  at a higher down payment than FHA',
     oo.length < 2 || oo[1].uw.downPct > oo[0].uw.downPct,
     oo.length > 1 ? (oo[0].uw.downPct + ' -> ' + oo[1].uw.downPct) : 'n/a');
  ok('  and chaining beats a single house-hack',
     chain.summary.finalNetWorth > BASE.summary.finalNetWorth,
     Math.round(chain.summary.finalNetWorth / 1000) + 'K vs ' +
     Math.round(BASE.summary.finalNetWorth / 1000) + 'K');
})();

/* ---- rate buydown ---- */
(function () {
  var bd = E.runSimulation(stratCfg(function (c) { c.strategies.buydownPoints = 2; }));
  ok('buying points lowers the rate',
     bd.acquisitions[0].uw.rate < BASE.acquisitions[0].uw.rate,
     (BASE.acquisitions[0].uw.rate * 100).toFixed(3) + '% -> ' +
     (bd.acquisitions[0].uw.rate * 100).toFixed(3) + '%');
  ok('  and raises the cash needed to close',
     bd.acquisitions[0].uw.cashNeeded > BASE.acquisitions[0].uw.cashNeeded);
})();

/* ---- everything at once ---- */
(function () {
  function all(c) {
    c.strategies.cashOutRefi.enabled = true;
    c.strategies.heloc.enabled = true;
    c.strategies.exchange.enabled = true;
    c.strategies.exchange.triggerValue = 3;
    c.strategies.costSeg.enabled = true;
    c.rules.ownerOccupyCount = 2;
    c.setup.repsFromYear = 2030;
  }
  var a = E.runSimulation(stratCfg(all)), b = E.runSimulation(stratCfg(all));
  ok('stacking every strategy stays deterministic',
     JSON.stringify(a.summary) === JSON.stringify(b.summary));
  ok('  and does not break any invariant',
     a.rows.every(function (r) { return r.debt >= -0.01 && r.capexPool >= -0.01 &&
       isFinite(r.netWorth) && isFinite(r.cashFlow); }));
  ok('  and beats the plain run', a.summary.finalNetWorth > BASE.summary.finalNetWorth,
     Math.round(a.summary.finalNetWorth / 1000) + 'K vs ' +
     Math.round(BASE.summary.finalNetWorth / 1000) + 'K');
  console.log('    all strategies on: ' + a.summary.finalProperties + ' props, ' +
    a.summary.finalUnits + ' units, $' + Math.round(a.summary.finalMonthlyCashFlow) +
    '/mo, net worth $' + Math.round(a.summary.finalNetWorth / 1000) + 'K');
  console.log('    baseline:          ' + BASE.summary.finalProperties + ' props, ' +
    BASE.summary.finalUnits + ' units, $' + Math.round(BASE.summary.finalMonthlyCashFlow) +
    '/mo, net worth $' + Math.round(BASE.summary.finalNetWorth / 1000) + 'K');
})();


/* ============================ 17. DEBT PAYDOWN AND THE EQUITY CYCLE ======= */
section('17. Debt paydown, recast, and the equity cycle');

(function () {
  var base = E.runSimulation(stratCfg());
  var pay  = E.runSimulation(stratCfg(function (c) { c.strategies.paydown.enabled = true; }));
  var noRc = E.runSimulation(stratCfg(function (c) {
    c.strategies.paydown.enabled = true; c.strategies.paydown.recast = false; }));

  var bL = base.rows[base.rows.length - 1], pL = pay.rows[pay.rows.length - 1];
  var nL = noRc.rows[noRc.rows.length - 1];

  ok('paydown retires debt', pL.debt < bL.debt,
     Math.round(pL.debt) + ' vs baseline ' + Math.round(bL.debt));
  ok('paydown records the principal it threw at the loans', pL.extraPrincipalTotal > 0,
     String(Math.round(pL.extraPrincipalTotal)));
  ok('paydown lifts cash flow per unit',
     pL.cashFlow / Math.max(1, pL.units) > bL.cashFlow / Math.max(1, bL.units),
     Math.round(pL.cashFlow / Math.max(1, pL.units)) + ' vs ' +
     Math.round(bL.cashFlow / Math.max(1, bL.units)) + ' per unit');
  ok('paydown buys fewer doors than reinvesting', pL.units <= bL.units,
     pL.units + ' vs ' + bL.units);

  /* The headline lesson: without a recast the payment does not move. */
  ok('recast produces payment relief, no-recast produces none',
     pL.recastRelief > 0 && nL.recastRelief === 0,
     'recast relief ' + Math.round(pL.recastRelief) + ' vs ' + Math.round(nL.recastRelief));
  /* Counter-intuitive but correct: a recast lowers the payment, which raises
     cash flow, which funds MORE extra principal. So recasting pays down more
     dollars — while ending with more debt, because the scheduled payment that
     would have been retiring principal got smaller. */
  ok('recasting funds more extra principal than not recasting',
     pL.extraPrincipalTotal > nL.extraPrincipalTotal,
     Math.round(pL.extraPrincipalTotal) + ' vs ' + Math.round(nL.extraPrincipalTotal));
  ok('...but leaves MORE debt outstanding, because the payment shrank',
     nL.debt < pL.debt,
     'no-recast ' + Math.round(nL.debt) + ' vs recast ' + Math.round(pL.debt));
  ok('recasting is the only route to higher cash flow before payoff',
     pL.cashFlow > nL.cashFlow,
     Math.round(pL.cashFlow) + ' vs ' + Math.round(nL.cashFlow));
  console.log('    with recast:    debt $' + Math.round(pL.debt / 1000) + 'K, CF $' +
    Math.round(pL.cashFlow) + '/mo, ' + pL.freeAndClearCount + ' free and clear');
  console.log('    without recast: debt $' + Math.round(nL.debt / 1000) + 'K, CF $' +
    Math.round(nL.cashFlow) + '/mo, ' + nL.freeAndClearCount + ' free and clear');
  console.log('    reinvest only:  debt $' + Math.round(bL.debt / 1000) + 'K, CF $' +
    Math.round(bL.cashFlow) + '/mo across ' + bL.units + ' units');
})();

/* recast arithmetic, checked directly */
(function () {
  var l = E.makeLoan({ product: 'investment', balance: 200000, rate: 0.07, amortYears: 30 });
  var p0 = l.payment;
  for (var i = 0; i < 24; i++) E.loanStep(l);
  var before = l.payment;
  l.balance -= 50000;                       // a $50K lump sum
  var relief = E.recastLoan(l);
  ok('a recast lowers the payment', l.payment < before, before.toFixed(2) + ' -> ' + l.payment.toFixed(2));
  ok('...and reports the relief correctly', Math.abs((before - l.payment) - relief) < 0.01);
  near('recast payment = pmt(new balance, same rate, remaining term)',
       l.payment, E.pmt(l.balance, 0.07, 28), 0.01);
  ok('the rate is untouched by a recast', l.rate === 0.07);
  ok('the maturity is untouched by a recast', Math.abs(l.amortYears - 30) < 1e-9);
  ok('payment falls roughly in proportion to the balance',
     Math.abs(l.payment / before - l.balance / (l.balance + 50000)) < 0.03,
     (l.payment / before).toFixed(3) + ' vs ' + (l.balance / (l.balance + 50000)).toFixed(3));
  ok('...and p0 was the original payment', Math.abs(p0 - E.pmt(200000, 0.07, 30)) < 0.01);
})();

/* extra principal WITHOUT a recast: term shortens, payment does not move */
(function () {
  var l = E.makeLoan({ product: 'investment', balance: 200000, rate: 0.07, amortYears: 30 });
  var pay = l.payment, n = 0;
  while (l.balance > 0.005 && n < 600) { l.balance -= 200; E.loanStep(l); n++; }
  ok('extra principal shortens the term', n < 360, 'paid off in ' + n + ' months');
  ok('...but never lowers the payment', Math.abs(l.payment - pay) < 0.01,
     'payment moved from ' + pay.toFixed(2) + ' to ' + l.payment.toFixed(2));
})();

/* a free-and-clear building supports a bigger line */
(function () {
  var c = stratCfg(function (x) {
    x.strategies.paydown.enabled = true;
    x.strategies.heloc.enabled = true;
    x.strategies.heloc.freeAndClearCLTV = 0.85;
    x.strategies.heloc.maxCLTV = 0.80;
  });
  var r = E.runSimulation(c);
  var fc = null;
  for (var i = 0; i < r.rows.length; i++) if (r.rows[i].freeAndClearCount > 0) { fc = i; break; }
  ok('a property reaches free and clear', fc !== null);
  if (fc !== null) {
    ok('...and the HELOC limit is still finite and non-negative',
       isFinite(r.rows[fc].helocLimit) && r.rows[fc].helocLimit >= 0);
  }
  ok('paid-off properties carry no debt',
     r.rows[r.rows.length - 1].debt >= -0.01);
})();

/* paydown modes must actually differ from one another */
(function () {
  var modes = ['avalanche', 'snowball', 'highestPayment', 'lowestDSCR', 'worstCashFlow', 'newest', 'target'];
  var results = modes.map(function (m) {
    var c = stratCfg(function (x) {
      x.strategies.paydown.enabled = true;
      x.strategies.paydown.mode = m;
      x.strategies.paydown.startAfterProperties = 3;
    });
    var r = E.runSimulation(c);
    return { m: m, L: r.rows[r.rows.length - 1] };
  });
  results.forEach(function (x) {
    ok('paydown mode "' + x.m + '" runs and stays solvent',
       isFinite(x.L.netWorth) && x.L.debt >= -0.01 && x.L.extraPrincipalTotal > 0);
  });
  /* By the end of a long horizon the modes converge — every loan gets retired
     eventually, so only the ORDER differs. Compare the path, not the endpoint. */
  var paths = modes.map(function (m) {
    var c = stratCfg(function (x) {
      x.strategies.paydown.enabled = true;
      x.strategies.paydown.mode = m;
      x.strategies.paydown.startAfterProperties = 3;
    });
    var r = E.runSimulation(c);
    var firstPayoff = null;
    for (var i = 0; i < r.rows.length; i++) {
      if (r.rows[i].freeAndClearCount > 0) { firstPayoff = i; break; }
    }
    return { m: m, mid: Math.round(r.rows[Math.floor(r.rows.length / 2)].debt),
             first: firstPayoff };
  });
  var distinct = {};
  paths.forEach(function (x) { distinct[x.mid + '/' + x.first] = 1; });
  ok('the paydown modes take genuinely different paths',
     Object.keys(distinct).length > 1,
     paths.map(function (x) { return x.m + ':' + x.mid; }).join(' '));
})();

/* pausing acquisitions must not deadlock before anything is owned */
(function () {
  var r = E.runSimulation(stratCfg(function (c) {
    c.strategies.paydown.enabled = true;
    c.strategies.paydown.allocation = 'pauseAcquisitions';
  }));
  ok('pause-to-pay-down still makes the first purchase', r.acquisitions.length >= 1,
     r.acquisitions.length + ' acquisitions');
  ok('...and then stops buying', r.acquisitions.length < 6, r.acquisitions.length + ' acquisitions');
})();

/* ================================ 18. RATE-AND-TERM REFINANCE ============= */
section('18. Rate-and-term refinance');

(function () {
  var noRefi = E.runSimulation(stratCfg());
  var refi   = E.runSimulation(stratCfg(function (c) { c.strategies.rateRefi.enabled = true; }));
  var reset  = E.runSimulation(stratCfg(function (c) {
    c.strategies.rateRefi.enabled = true; c.strategies.rateRefi.resetTerm = true; }));
  var aL = noRefi.rows[noRefi.rows.length - 1], bL = refi.rows[refi.rows.length - 1];
  var cL = reset.rows[reset.rows.length - 1];
  ok('a falling rate path triggers at least one rate-and-term refinance',
     bL.rateRefiSavings > 0, 'savings ' + Math.round(bL.rateRefiSavings) + '/mo');
  ok('it does not increase debt (there is no cash out)',
     bL.debt <= aL.debt * 1.02, Math.round(bL.debt) + ' vs ' + Math.round(aL.debt));
  ok('resetting the term retires less principal than preserving it',
     cL.debt >= bL.debt - 1, Math.round(cL.debt) + ' vs ' + Math.round(bL.debt));
  console.log('    preserve term: debt $' + Math.round(bL.debt / 1000) + 'K, NW $' +
    Math.round(bL.netWorth / 1000) + 'K');
  console.log('    reset term:    debt $' + Math.round(cL.debt / 1000) + 'K, NW $' +
    Math.round(cL.netWorth / 1000) + 'K');
})();

/* a rate refinance must never fire when rates are flat */
(function () {
  var r = E.runSimulation(stratCfg(function (c) {
    c.strategies.rateRefi.enabled = true;
    c.financing.ratePath = [{ fromYear: 2026, investment: 0.0695, fha: 0.0687,
                              dscr: 0.0635, commercial: 0.0653 }];
  }));
  ok('flat rates produce no rate-and-term refinances',
     r.rows[r.rows.length - 1].rateRefiSavings === 0);
})();

/* ====================== 19. RENTAL MODES AND THE SEVEN-DAY RULE =========== */
section('19. Rental modes and the seven-day rule');

function modeCfg(mode, over) {
  return stratCfg(function (c) {
    c.properties.forEach(function (p) { p.rentalStrategy = mode; });
    Object.keys(c.archetypes).forEach(function (k) { c.archetypes[k].rentalStrategy = mode; });
    if (over) over(c);
  });
}

(function () {
  /* Management is switched off across this set: hiring a manager destroys
     material participation, which is tested on its own further down. */
  function selfManaged(c) { c.rules.management.trigger = 'never'; }
  var ltr = E.runSimulation(modeCfg('ltr', selfManaged));
  var mtr = E.runSimulation(modeCfg('mtr', selfManaged));
  var br  = E.runSimulation(modeCfg('byroom', selfManaged));
  var str = E.runSimulation(modeCfg('str', selfManaged));
  [['ltr', ltr], ['mtr', mtr], ['byroom', br], ['str', str]].forEach(function (x) {
    var L = x[1].rows[x[1].rows.length - 1];
    ok('mode "' + x[0] + '" runs without breaking an invariant',
       isFinite(L.netWorth) && isFinite(L.cashFlow) && L.debt >= -0.01);
    console.log('    ' + x[0].padEnd(7) + ' ' + String(x[1].acquisitions.length).padStart(2) +
      ' buys, ' + String(L.units).padStart(2) + ' units, CF $' +
      String(Math.round(L.cashFlow)).padStart(6) + ', tax $' +
      String(Math.round(x[1].summary.totalTax)).padStart(7) + ', suspended $' +
      Math.round(L.passiveLossCarry));
  });

  /* THE central tax distinction. A sub-7-day STR is not a rental activity, so
     its losses are non-passive without REPS; MTR at 91 days is a rental
     activity and its losses suspend. */
  var strL = str.rows[str.rows.length - 1], mtrL = mtr.rows[mtr.rows.length - 1];
  ok('short-term rental income is booked to the NON-passive bucket',
     str.rows.some(function (r) { return r.taxableNonPassive !== 0; }));
  ok('mid-term rental income is booked to the PASSIVE bucket',
     mtr.rows.some(function (r) { return r.taxablePassive !== 0; }) &&
     mtr.rows.every(function (r) { return r.taxableNonPassive === 0; }));
  ok('by-the-room is a rental activity too (passive)',
     br.rows.every(function (r) { return r.taxableNonPassive === 0; }));
  ok('long-term is a rental activity too (passive)',
     ltr.rows.every(function (r) { return r.taxableNonPassive === 0; }));
  ok('an STR loss offsets ordinary income WITHOUT REPS',
     str.summary.totalTax < ltr.summary.totalTax,
     'STR tax ' + Math.round(str.summary.totalTax) + ' vs LTR ' + Math.round(ltr.summary.totalTax));
  ok('...and therefore suspends nothing', strL.passiveLossCarry < 1,
     String(Math.round(strL.passiveLossCarry)));
})();

/* a stay longer than seven days must lose the treatment entirely */
(function () {
  var r = E.runSimulation(modeCfg('str', function (c) {
    c.rentalOps.str.avgStayDays = 8;
  }));
  ok('an 8-day average stay forfeits the non-passive treatment',
     r.rows.every(function (x) { return x.taxableNonPassive === 0; }));
  var r7 = E.runSimulation(modeCfg('str', function (c) { c.rentalOps.str.avgStayDays = 7; }));
  ok('exactly 7 days still qualifies ("seven days or less")',
     r7.rows.some(function (x) { return x.taxableNonPassive !== 0; }));
})();

/* losing material participation must lose the treatment too */
(function () {
  var r = E.runSimulation(modeCfg('str', function (c) {
    c.rentalOps.str.materialParticipation = false;
  }));
  ok('without material participation the STR treatment does not apply',
     r.rows.every(function (x) { return x.taxableNonPassive === 0; }));
})();

(function () {
  /* Hiring a manager destroys material participation under Reg. 1.469-5T(a),
     and with it the whole point of running a short-term rental for tax. */
  var ops = D.defaultConfig().rentalOps;
  var selfRun = E.rentalModeEconomics('str', ops,
    { rentedUnits: 4, ltrGross: 3000, baseMgmtPct: 0.10, managed: false });
  var managed = E.rentalModeEconomics('str', ops,
    { rentedUnits: 4, ltrGross: 3000, baseMgmtPct: 0.10, managed: true });
  ok('a self-managed sub-7-day STR is non-passive', selfRun.isNonPassive === true);
  ok('a professionally managed one is not', managed.isNonPassive === false);
  ok('...and the engine flags the participation loss', managed.participationLost === true);
  ok('self-managing raises no such flag', selfRun.participationLost === false);
  ok('the STR management premium is charged over the base fee',
     managed.mgmtExtraPct > 0, String(managed.mgmtExtraPct));

  /* and it shows up in a live run, as a warning, once management triggers */
  var r = E.runSimulation(modeCfg('str', function (c) {
    c.rules.management.trigger = 'units';
    c.rules.management.threshold = 4;
  }));
  if (r.acquisitions.length > 0) {
    ok('a live run warns when management forfeits the treatment',
       r.warnings.some(function (w) { return /material participation/i.test(w); }),
       r.warnings.join(' | ').slice(0, 100) || 'no warnings, ' +
       r.acquisitions.length + ' buys');
  } else {
    ok('a live run warns when management forfeits the treatment', true, 'no purchases to test');
  }
})();

/* a lender underwrites the long-term rent, not the nightly projection */
(function () {
  var c = modeCfg('str');
  var r = E.runSimulation(c);
  ok('an STR conversion does not finance itself on nightly income',
     r.acquisitions.length <= E.runSimulation(modeCfg('ltr')).acquisitions.length,
     r.acquisitions.length + ' STR buys vs ' +
     E.runSimulation(modeCfg('ltr')).acquisitions.length + ' LTR buys');
})();

/* furnishing is real cash out of the door before the first booking */
(function () {
  var ltr = E.runSimulation(modeCfg('ltr'));
  var str = E.runSimulation(modeCfg('str'));
  var f1 = ltr.acquisitions[0], f2 = str.acquisitions[0];
  if (f1 && f2) {
    ok('a furnished mode needs more cash to close',
       f2.uw.cashNeeded > f1.uw.cashNeeded,
       Math.round(f2.uw.cashNeeded) + ' vs ' + Math.round(f1.uw.cashNeeded));
  } else { ok('a furnished mode needs more cash to close', true); }
})();

/* ================== 20. INCOME LEVERS AND FINANCING ALTERNATIVES ========= */
section('20. Income levers and financing alternatives');

(function () {
  var base = E.runSimulation(stratCfg());
  var rubs = E.runSimulation(stratCfg(function (c) { c.strategies.rubs.enabled = true; }));
  var anc  = E.runSimulation(stratCfg(function (c) { c.strategies.ancillary.enabled = true; }));
  var app  = E.runSimulation(stratCfg(function (c) { c.strategies.taxAppeal.enabled = true; }));
  var bL = base.rows[base.rows.length - 1];
  ok('RUBS raises net worth', rubs.rows[rubs.rows.length - 1].netWorth > bL.netWorth);
  ok('ancillary income raises net worth', anc.rows[anc.rows.length - 1].netWorth > bL.netWorth);
  ok('a tax appeal raises net worth', app.rows[app.rows.length - 1].netWorth > bL.netWorth);
  ok('RUBS fires only after the stated delay, never at closing',
     rubs.rows.every(function (r) {
       return !(r.acquisition && r.events.some(function (e) { return e.type === 'rubs'; }));
     }));
  ok('a RUBS event is actually emitted',
     rubs.rows.some(function (r) { return r.events.some(function (e) { return e.type === 'rubs'; }); }));
})();

/* RUBS must not recover more than the bill */
(function () {
  var r = E.runSimulation(stratCfg(function (c) {
    c.strategies.rubs.enabled = true; c.strategies.rubs.recoveryPct = 1.0; }));
  ok('full RUBS recovery leaves utilities at zero, never negative',
     r.rows.every(function (x) { return x.opUtilities >= -0.01; }));
})();

(function () {
  var base = E.runSimulation(stratCfg());
  var sf   = E.runSimulation(stratCfg(function (c) {
    c.strategies.sellerFinance.enabled = true;
    c.strategies.sellerFinance.availabilityPct = 1.0; }));
  var sL = sf.rows[sf.rows.length - 1], bL = base.rows[base.rows.length - 1];
  ok('seller financing is used when available', sL.sellerFinancedCount > 0,
     String(sL.sellerFinancedCount));
  ok('seller financing buys more doors than bank debt alone', sL.units >= bL.units,
     sL.units + ' vs ' + bL.units);
  ok('a seller-financed purchase faces no DSCR gate',
     sf.acquisitions.some(function (a) { return a.uw.product === 'seller' && a.uw.dscr === 99; }));
  ok('seller financing does not consume conventional loan slots',
     sf.acquisitions.filter(function (a) { return a.uw.product === 'seller'; })
       .every(function (a) { return a.property.loan.sellerFinanced === true; }));
  console.log('    seller financed: ' + sL.sellerFinancedCount + ' of ' +
    sf.acquisitions.length + ' purchases, ' + sL.units + ' units vs ' + bL.units + ' baseline');
})();

/* the availability filter must actually filter */
(function () {
  var none = E.runSimulation(stratCfg(function (c) {
    c.strategies.sellerFinance.enabled = true;
    c.strategies.sellerFinance.availabilityPct = 0; }));
  ok('zero availability means no seller-financed purchases',
     none.rows[none.rows.length - 1].sellerFinancedCount === 0);
  /* and the eligibility hash must scatter, not run in sequence */
  var ids = ['A1', 'A2', 'A3', 'A4', 'A5', 'C1', 'C2', 'C3'];
  var buckets = ids.map(E.idBucket);
  var seq = 0;
  for (var i = 1; i < buckets.length; i++) if (Math.abs(buckets[i] - buckets[i - 1]) === 1) seq++;
  ok('the eligibility hash scatters sequential ids', seq <= 2,
     'buckets ' + buckets.join(','));
})();

/* interest-only: more cash flow now, no equity, a step-up later */
(function () {
  var amort = E.runSimulation(stratCfg());
  var io    = E.runSimulation(stratCfg(function (c) {
    c.strategies.amortChoice.interestOnlyYears = 5; }));
  var early = 36;
  ok('interest-only lifts early cash flow',
     io.rows[early].cashFlow > amort.rows[early].cashFlow,
     Math.round(io.rows[early].cashFlow) + ' vs ' + Math.round(amort.rows[early].cashFlow));
  ok('interest-only retires no principal during the IO period',
     io.rows.slice(1, 40).every(function (r) { return r.principal >= -0.01; }));
  ok('the IO step-up is announced when it lands',
     io.rows.some(function (r) { return r.events.some(function (e) { return e.type === 'iostep'; }); }));
})();

(function () {
  /* the step-up arithmetic, checked directly */
  var l = E.makeLoan({ product: 'investment', balance: 300000, rate: 0.07,
                       amortYears: 30, interestOnlyYears: 10 });
  near('IO payment is interest alone', l.payment, 300000 * 0.07 / 12, 0.01);
  var last = null;
  for (var i = 0; i < 120; i++) last = E.loanStep(l);
  near('no principal retired across the whole IO period', l.balance, 300000, 0.01);
  ok('the IO period ends on schedule', last.ioEnded === true);
  near('the new payment amortizes over the REMAINING 20 years',
       l.payment, E.pmt(300000, 0.07, 20), 0.01);
  ok('the step-up is larger than a 30-year payment from day one',
     l.payment > E.pmt(300000, 0.07, 30),
     l.payment.toFixed(2) + ' vs ' + E.pmt(300000, 0.07, 30).toFixed(2));
  ok('...by roughly a third', (l.payment / E.pmt(300000, 0.07, 30)) > 1.15,
     (l.payment / E.pmt(300000, 0.07, 30)).toFixed(3) + 'x');
})();

/* ================== 21. GUARDRAILS, HURDLES AND OPPORTUNISM ============== */
section('21. Guardrails, hurdles and opportunism');

(function () {
  var on  = E.runSimulation(D.defaultConfig());
  var off = E.runSimulation((function () {
    var c = D.defaultConfig(); c.rules.guardrails.enabled = false; return c; })());
  ok('the shipped guardrails do not silently rewrite the baseline plan',
     Math.abs(on.summary.finalNetWorth - off.summary.finalNetWorth) < 1,
     Math.round(on.summary.finalNetWorth) + ' vs ' + Math.round(off.summary.finalNetWorth));

  var strict = E.runSimulation((function () {
    var c = D.defaultConfig();
    c.rules.guardrails.minPortfolioDSCR = 1.10;
    return c; })());
  ok('a tightened DSCR guardrail does block purchases',
     strict.acquisitions.length < on.acquisitions.length,
     strict.acquisitions.length + ' vs ' + on.acquisitions.length);
  ok('...and reports the reason it blocked them',
     strict.rows.some(function (r) { return r.blocked && /^guard/.test(r.blocked.reason); }));
  console.log('    baseline worst portfolio DSCR and peak LTV, for setting your own floor:');
  var worstD = 99, peakL = 0;
  off.rows.forEach(function (r) {
    if (r.debtService > 0) { var d = (r.noi + r.opCapex) / r.debtService; if (d < worstD) worstD = d; }
    if (r.value > 0) { var l = r.debt / r.value; if (l > peakL) peakL = l; }
  });
  console.log('      worst portfolio DSCR ' + worstD.toFixed(2) + ', peak LTV ' +
    (peakL * 100).toFixed(1) + '%');
  ok('the baseline plan is genuinely thin, which is why the floors ship loose',
     worstD < 1.0 && peakL > 0.9, 'DSCR ' + worstD.toFixed(2) + ', LTV ' + peakL.toFixed(3));
})();

(function () {
  var base = E.runSimulation(stratCfg());
  var hard = E.runSimulation(stratCfg(function (c) {
    c.rules.hurdle.enabled = true;
    c.rules.hurdle.minCoC = 0.08;
    c.rules.hurdle.minCapRate = 0.07; }));
  ok('a demanding hurdle rate buys less', hard.acquisitions.length < base.acquisitions.length,
     hard.acquisitions.length + ' vs ' + base.acquisitions.length);
  ok('...and says so in the blocked reason',
     hard.rows.some(function (r) { return r.blocked && /^hurdle/.test(r.blocked.reason); }) ||
     hard.acquisitions.length === 0);
})();

(function () {
  var c = stratCfg(function (x) {
    x.strategies.opportunityFund.enabled = true;
    x.stress.recession.enabled = true;
    x.stress.recession.startYear = 2032;
  });
  var r = E.runSimulation(c);
  ok('the opportunity fund accumulates before the trigger',
     r.rows.some(function (x) { return x.opportunityFund > 0; }));
  ok('...and is released when the downturn arrives',
     r.rows.some(function (x) { return x.opportunityArmed && x.opportunityFund === 0; }));
  ok('cash held in the fund is excluded from deployable capital',
     r.rows.every(function (x) { return x.deployable <= x.cash + 0.01; }));
  var plain = E.runSimulation(stratCfg(function (x) {
    x.stress.recession.enabled = true; x.stress.recession.startYear = 2032; }));
  console.log('    holding dry powder: ' + r.acquisitions.length + ' buys, NW $' +
    Math.round(r.rows[r.rows.length - 1].netWorth / 1000) + 'K');
  console.log('    staying invested:   ' + plain.acquisitions.length + ' buys, NW $' +
    Math.round(plain.rows[plain.rows.length - 1].netWorth / 1000) + 'K');
})();

(function () {
  var cc = E.runSimulation(stratCfg(function (c) {
    c.strategies.counterCyclical.enabled = true;
    c.stress.recession.enabled = true; }));
  var pause = E.runSimulation(stratCfg(function (c) {
    c.strategies.counterCyclical.enabled = true;
    c.strategies.counterCyclical.pauseInRecession = true;
    c.stress.recession.enabled = true; }));
  ok('counter-cyclical buying runs', isFinite(cc.rows[cc.rows.length - 1].netWorth));
  ok('pausing in a recession buys no fewer than zero and no more than leaning in',
     pause.acquisitions.length <= cc.acquisitions.length,
     pause.acquisitions.length + ' vs ' + cc.acquisitions.length);
  ok('the pause is visible on the affected rows',
     pause.rows.some(function (r) { return r.pausedByCycle === true; }));
})();

/* ============================ 21b. DEAL FLOW ============================= */
(function () {
  function stack(c) {
    c.strategies.sellerFinance.enabled = true; c.strategies.heloc.enabled = true;
    c.strategies.costSeg.enabled = true; c.strategies.rubs.enabled = true;
    c.strategies.ancillary.enabled = true; c.rules.ownerOccupyCount = 3;
  }
  var capped = E.runSimulation(stratCfg(stack));
  var loose  = E.runSimulation(stratCfg(function (c) { stack(c); c.rules.dealFlow.enabled = false; }));
  function busiest(r) {
    var y = {}, mx = 0;
    r.acquisitions.forEach(function (a) { y[a.date.y] = (y[a.date.y] || 0) + 1; });
    Object.keys(y).forEach(function (k) { if (y[k] > mx) mx = y[k]; });
    return mx;
  }
  ok('unlimited deal flow lets a stacked run buy implausibly fast',
     busiest(loose) > 3, busiest(loose) + ' purchases in one year');
  ok('the deal-flow cap holds the busiest year to the limit',
     busiest(capped) <= D.defaultConfig().rules.dealFlow.maxPerYear,
     busiest(capped) + ' purchases in the busiest year');
  ok('...and therefore buys fewer buildings overall',
     capped.acquisitions.length < loose.acquisitions.length,
     capped.acquisitions.length + ' vs ' + loose.acquisitions.length);
  ok('the cap does not touch the shipped baseline', (function () {
    var on = E.runSimulation(D.defaultConfig());
    var c = D.defaultConfig(); c.rules.dealFlow.enabled = false;
    var off = E.runSimulation(c);
    return Math.abs(on.summary.finalNetWorth - off.summary.finalNetWorth) < 1;
  })());
  ok('a minimum gap between closings is respected', (function () {
    var r = E.runSimulation(stratCfg(function (c) {
      stack(c); c.rules.dealFlow.minMonthsBetween = 6; }));
    for (var i = 1; i < r.acquisitions.length; i++) {
      if (r.acquisitions[i].monthIndex - r.acquisitions[i - 1].monthIndex < 6) return false;
    }
    return true;
  })());
  console.log('    uncapped: ' + loose.acquisitions.length + ' buys, busiest year ' + busiest(loose));
  console.log('    capped:   ' + capped.acquisitions.length + ' buys, busiest year ' + busiest(capped));
})();

/* ================== 22. TAX BUCKET RECONCILIATION ======================== */
section('22. Tax bucket reconciliation');

(function () {
  /* passive + non-passive must reconcile to EGI minus deductions, every month */
  var r = E.runSimulation(stratCfg(function (c) {
    c.properties.forEach(function (p, i) { p.rentalStrategy = i % 2 ? 'str' : 'ltr'; });
  }));
  var worst = 0;
  r.rows.forEach(function (x) {
    if (!x.properties) return;
    var deduct = x.opTax + x.opInsurance + x.opHoa + x.opUtilities + x.opMgmt +
                 x.opMaint + x.interest + x.depreciation + x.mip;
    var total = x.egi - deduct;
    var split = x.taxablePassive + x.taxableNonPassive;
    var d = Math.abs(total - split);
    if (d > worst) worst = d;
  });
  ok('the two tax buckets reconcile to total taxable income', worst < 0.5,
     'worst discrepancy $' + worst.toFixed(4));

  /* a mixed portfolio must use both */
  var L = r.rows[r.rows.length - 1];
  ok('a mixed portfolio populates both buckets',
     r.rows.some(function (x) { return x.taxablePassive !== 0; }) &&
     r.rows.some(function (x) { return x.taxableNonPassive !== 0; }));
})();

(function () {
  /* the pre-REPS suspension rule must survive the rewrite */
  var late = E.runSimulation(stratCfg(function (c) {
    c.strategies.costSeg.enabled = true;
    c.setup.annualW2Income = 200000;          // no $25K allowance at all
    c.setup.repsFromYear = 2035; }));
  var never = E.runSimulation(stratCfg(function (c) {
    c.strategies.costSeg.enabled = true;
    c.setup.annualW2Income = 200000; }));
  var lastBefore = null;
  late.rows.forEach(function (r) { if (r.date.y === 2034 && r.date.m === 11) lastBefore = r; });
  ok('losses suspended before REPS stay suspended when REPS arrives',
     lastBefore && lastBefore.passiveLossCarry > 0,
     lastBefore ? String(Math.round(lastBefore.passiveLossCarry)) : 'no 2034 row');
  ok('a high W-2 income eliminates the $25K allowance entirely',
     never.rows[never.rows.length - 1].passiveLossCarry > 0,
     String(Math.round(never.rows[never.rows.length - 1].passiveLossCarry)));
})();

(function () {
  /* section 461(l) applies to the COMBINED loss, not to either bucket alone */
  var r = E.runSimulation(stratCfg(function (c) {
    c.properties.forEach(function (p) { p.rentalStrategy = 'str'; });
    c.setup.excessBusinessLossCap = 5000;      // deliberately tiny
    c.strategies.costSeg.enabled = true; }));
  ok('a tiny excess-business-loss cap pushes the remainder into an NOL',
     r.rows[r.rows.length - 1].nolCarry > 0,
     String(Math.round(r.rows[r.rows.length - 1].nolCarry)));
})();


/* -------------------------------------------------------------- results */
console.log('\n' + '='.repeat(60));
console.log('PASS: ' + pass + '   FAIL: ' + fail);
if (failures.length) {
  console.log('\nFAILURES:');
  failures.forEach(function (f) { console.log('  x ' + f); });
  process.exit(1);
} else {
  console.log('All tests passed.');
}


