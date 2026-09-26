/* Lending: each product gated the way that product is actually underwritten.
   Sources: HUD Handbook 4000.1 (FHA), Fannie Mae Selling Guide (conventional),
   DSCR lender program guides (vendor terms), local-bank commercial practice. */
var H = require('./harness.js'), section = H.section, ok = H.ok, near = H.near;
var FPE = require('./loader.js').loadEngine();
var U = FPE.util, L = FPE.lending;

function setup(mod) {
  var cfg = FPE.defaultConfig();
  if (mod) mod(cfg);
  var M = FPE.market.create(cfg);
  return { cfg: cfg, M: M, t: M.start };
}
function deal(units, price, lease, market, extra) {
  var rents = [];
  for (var i = 0; i < units; i++) rents.push({ lease: lease, marketAsIs: market, occupied: true, owner: false });
  return Object.assign({ units: units, price: price, rents: rents, taxMonthly: 300, insMonthly: 200, hoaMonthly: 0,
                         utilitiesMonthly: 0, maintenancePct: 0.08, otherIncome: 0 }, extra || {});
}
function book(extra) {
  return Object.assign({ w2Monthly: 6000, incomeOk: true, otherDebts: 0, housingMonthly: 1100, rentals: [],
                         financedCount: 0, fhaActive: false, otherUPB: 0 }, extra || {});
}
function codes(uw) { return uw.fails.map(function (f) { return f.code; }); }

section('FHA — HUD 4000.1');
var s = setup();
var d3 = deal(3, 300000, 1000, 1200);
d3.rents[0].owner = true;
var fha = L.underwrite(s.cfg, s.M, s.t, d3, 'fha', book());
near('3.5% down', fha.downCash, 10500, 0.01);
near('1.75% upfront MIP is financed on top of the base loan', fha.financed, 289500 * 1.0175, 0.01);
near('annual MIP 0.55% of the balance, monthly', fha.miMonthly, 289500 * 1.0175 * 0.0055 / 12, 0.01);
ok('FHA mortgage insurance never cancels (life of loan under 10% down)', fha.miCancelLtv === null);
ok('FHA loans cannot be recast', fha.recastable === false);
var expectedPitia = U.pmt(289500 * 1.0175, s.M.rate('fha', s.t), 30) + fha.miMonthly + 300 + 200;
near('PITIA = P&I + MIP + tax + insurance', fha.pitia, expectedPitia, 0.01);
near('self-sufficiency counts 75% of appraised rent on ALL units, the owner\'s included',
  fha.metrics.selfSufficiency, 0.75 * 3 * 1200 / expectedPitia, 1e-9);
ok('a triplex whose rents cover the payment passes self-sufficiency', codes(fha).indexOf('selfSufficiency') < 0);
var d3weak = deal(3, 300000, 700, 720); d3weak.rents[0].owner = true;
ok('a triplex whose 75% rents fall short fails self-sufficiency',
  codes(L.underwrite(s.cfg, s.M, s.t, d3weak, 'fha', book())).indexOf('selfSufficiency') >= 0);
var d2weak = deal(2, 300000, 700, 720); d2weak.rents[0].owner = true;
ok('self-sufficiency does not apply to a duplex',
  codes(L.underwrite(s.cfg, s.M, s.t, d2weak, 'fha', book())).indexOf('selfSufficiency') < 0);
ok('one FHA loan at a time', codes(L.underwrite(s.cfg, s.M, s.t, d3, 'fha', book({ fhaActive: true }))).indexOf('oneFha') >= 0);
var limit4 = FPE.data.LENDER.fhaLoanLimits2026[4];
var over = deal(4, limit4 / 0.965 + 20000, 1500, 1500); over.rents[0].owner = true;
ok('loan above the county limit fails', codes(L.underwrite(s.cfg, s.M, s.t, over, 'fha', book())).indexOf('fhaLimit') >= 0);

section('Conventional — Fannie Mae Selling Guide');
var d4 = deal(4, 400000, 1100, 1150);
var ci = L.underwrite(s.cfg, s.M, s.t, d4, 'convInv', book({ financedCount: 1, otherUPB: 200000 }));
near('2–4 unit investment purchase: 25% down (max 75% LTV)', ci.downCash, 100000, 0.01);
near('reserves: 6 months PITIA on the subject + 2% of other financed balances (B3-4.1-01)',
  ci.reservesRequired, 6 * ci.pitia + 0.02 * 200000, 0.01);
var ci7 = L.underwrite(s.cfg, s.M, s.t, d4, 'convInv', book({ financedCount: 6, otherUPB: 1000000 }));
near('7–10 financed properties: 6% of other balances', ci7.reservesRequired, 6 * ci7.pitia + 0.06 * 1000000, 0.01);
ok('the 11th financed property is refused', codes(L.underwrite(s.cfg, s.M, s.t, d4, 'convInv', book({ financedCount: 10 }))).indexOf('financedCap') >= 0);
/* DTI with 75% of lease rents (B3-3.1-08): net rental income = 75% × rents − PITIA */
var net = 0.75 * 4 * 1100 - ci.pitia;
var inc = 6000 + Math.max(0, net), debts = 1100 + Math.max(0, -net);
near('DTI uses 75% of the subject\'s lease rents net of its payment', ci.metrics.dti, debts / inc, 1e-9);
ok('a buyer with no qualifying income history is refused an agency loan',
  codes(L.underwrite(s.cfg, s.M, s.t, d4, 'convInv', book({ incomeOk: false }))).indexOf('noIncomeHistory') >= 0);
var sNoW2 = setup(function (c) { c.income.w2.enabled = false; });
ok('with no W-2 modelled, debt-to-income is not checked at all',
  L.underwrite(sNoW2.cfg, sNoW2.M, sNoW2.t, d4, 'convInv', book({ incomeOk: false })).metrics.dti === undefined);
var oo = L.underwrite(s.cfg, s.M, s.t, (function () { var d = deal(3, 300000, 1000, 1100); d.rents[0].owner = true; return d; })(), 'convOO', book());
near('owner-occupied 2–4 unit: 5% down', oo.downCash, 15000, 0.01);
ok('owner-occupied PMI cancels at 78% of original value', oo.miCancelLtv === 0.78);

section('PMI and MIP over the life of the loan');
var loanOO = L.makeLoan({ product: 'convOO', month: 0, balance: 285000, value: 300000, rate: 0.068, amortYears: 30, miRate: 0.005, miCancelLtv: 0.78 });
var cancelled = null;
for (var k = 1; k <= 360; k++) { var st = L.step(loanOO); if (st.mi === 0 && cancelled == null) cancelled = k; }
var firstBelow = null, b = 285000;
for (k = 1; k <= 360; k++) { b = U.balanceAfter(285000, 0.068, 30, k); if (b <= 0.78 * 300000) { firstBelow = k; break; } }
ok('PMI stops once the scheduled balance reaches 78% of original value', cancelled != null && Math.abs(cancelled - firstBelow) <= 1,
  'cancelled month ' + cancelled + ', balance first ≤ 78% at month ' + firstBelow);
var loanF = L.makeLoan({ product: 'fha', month: 0, balance: 294566, value: 300000, rate: 0.0687, amortYears: 30, miRate: 0.0055, miCancelLtv: null, fha: true });
var miAt300 = 0; for (k = 1; k <= 300; k++) miAt300 = L.step(loanF).mi;
ok('FHA MIP still charged in year 25', miAt300 > 0);

section('DSCR — gross rent over PITIA, not NOI');
var dd = deal(3, 250000, 1300, 1100);            // leases ABOVE market
var ds = L.underwrite(s.cfg, s.M, s.t, dd, 'dscr', book());
near('occupied units count at the LESSER of lease and market', ds.metrics.dscrRents, 3 * 1100, 0.01);
near('DSCR = rents ÷ PITIA', ds.metrics.dscr, 3300 / ds.pitia, 1e-9);
var ddv = deal(3, 250000, 900, 1100); ddv.rents[2].occupied = false;
near('a vacant unit counts at market', L.underwrite(s.cfg, s.M, s.t, ddv, 'dscr', book()).metrics.dscrRents, 900 + 900 + 1100, 0.01);
var costly = deal(3, 250000, 1100, 1100, { utilitiesMonthly: 1500, maintenancePct: 0.2 });
ok('operating costs do not enter the DSCR test (it is not an NOI test)',
  Math.abs(L.underwrite(s.cfg, s.M, s.t, costly, 'dscr', book()).metrics.dscr - ds.metrics.dscr) < 1e-9);
var sGreater = setup(function (c) { c.lending.dscr.rentBasis = 'greater'; });
ok('the old engine\'s "greater of" basis is still available as a choice',
  L.underwrite(sGreater.cfg, sGreater.M, sGreater.t, dd, 'dscr', book()).metrics.dscrRents === 3 * 1300);
ok('debt-to-income is not a DSCR gate', ds.metrics.dti === undefined);
var dsLoan = L.makeLoan({ product: 'dscr', month: 100, balance: 100000, value: 150000, rate: 0.0735, amortYears: 30, prepayYears: 5 });
near('5-4-3-2-1 prepayment penalty, year 1', L.prepayPenalty(dsLoan, 100, 100000), 5000, 1e-9);
near('… year 3', L.prepayPenalty(dsLoan, 124, 100000), 3000, 1e-9);
near('… after year 5, none', L.prepayPenalty(dsLoan, 160, 100000), 0, 1e-9);
near('DSCR rate carries the prepayment-term add-on', s.M.rate('dscr', s.t),
  s.cfg.rates.dscr + (FPE.data.LENDER.dscrPrepayRateAdd[s.cfg.lending.dscr.prepayYears] || 0) + FPE.data.LENDER.creditTierRateAdd[s.cfg.income.creditTier], 1e-12);
var sEx = setup(function (c) { c.income.creditTier = 'excellent'; });
ok('a better credit band prices lower', sEx.M.rate('dscr', sEx.t) < s.M.rate('dscr', s.t));

section('Commercial (5–8 units) — NOI coverage and a balloon');
var d8 = deal(8, 560000, 1000, 1050, { utilitiesMonthly: 400 });
var cm = L.underwrite(s.cfg, s.M, s.t, d8, 'commercial', book());
ok('coverage is NOI ÷ debt service', cm.metrics.noiDscr > 0 && cm.metrics.dscr === undefined);
ok('balloon at 5 years', cm.balloonYears === 5);
ok('25-year amortisation', cm.amortYears === s.cfg.lending.commercial.amortYears && cm.amortYears === 25);
var thin = deal(8, 900000, 900, 900, { utilitiesMonthly: 900 });
ok('a thin building fails the 1.20 coverage', codes(L.underwrite(s.cfg, s.M, s.t, thin, 'commercial', book())).indexOf('noiDscr') >= 0);

section('Credit tightens in a recession');
var sRec = setup(function (c) { c.stress.recession.enabled = true; c.stress.recession.startYear = 2027; c.plan.startMonth = '2027-06'; });
var tight = sRec.M.creditTight(sRec.t);
ok('a scheduled recession tightens credit', !!tight);
var dsR = L.underwrite(sRec.cfg, sRec.M, sRec.t, dd, 'dscr', book());
near('DSCR loans need 5% more down', dsR.down, s.cfg.lending.dscr.downPct + 0.05, 1e-9);
var failR = dsR.fails.filter(function (f) { return f.code === 'dscr'; })[0];
ok('and a higher minimum DSCR', !failR || failR.need === s.cfg.lending.dscr.minDscr + 0.10);

section('Refinance sizing');
var view = { units: 3, value: 300000, rents: dd.rents, taxMonthly: 300, insMonthly: 200, hoaMonthly: 0, utilitiesMonthly: 0, maintenancePct: 0.08 };
var mr = L.maxRefiLoan(s.cfg, s.M, s.t, view, 'dscr', 0.75);
near('the smaller of the LTV limit and the coverage limit', mr.amount, Math.min(mr.byLtv, mr.byCover), 1e-6);
near('LTV limit is value × max LTV', mr.byLtv, 225000, 1e-6);
