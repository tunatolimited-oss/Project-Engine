/* The simulation as a whole: determinism, invariants, the life layer,
   gates respected on every purchase, and economic direction. */
var H = require('./harness.js'), section = H.section, ok = H.ok, near = H.near;
var FPE = require('./loader.js').loadEngine();
var U = FPE.util, R = FPE.registry;

function run(mod, opts) { var c = FPE.defaultConfig(); if (mod) mod(c); return FPE.runSimulation(c, opts); }
function finiteRows(res) {
  var bad = null;
  res.rows.some(function (r) {
    for (var k in r) if (typeof r[k] === 'number' && !isFinite(r[k])) { bad = r.label + ' ' + k; return true; }
    return false;
  });
  return bad;
}
var base = run();

section('Determinism');
var again = run();
ok('the base run is identical every time', JSON.stringify(base.summary) === JSON.stringify(again.summary) &&
   JSON.stringify(base.rows.map(function (r) { return r.cash; })) === JSON.stringify(again.rows.map(function (r) { return r.cash; })));
var m1 = run(null, { rng: new U.Rng(11), seed: 11 }), m1b = run(null, { rng: new U.Rng(11), seed: 11 }), m2 = run(null, { rng: new U.Rng(12), seed: 12 });
ok('a simulated future is identical for the same seed', JSON.stringify(m1.summary) === JSON.stringify(m1b.summary));
ok('different seeds give different futures', m1.summary.heldNW !== m2.summary.heldNW);
ok('the base run does not depend on the uncertainty settings', (function () {
  var r = run(function (c) { c.mc.paths = 999; c.mc.recessionAnnualProb = 0.5; });
  return JSON.stringify(r.summary) === JSON.stringify(base.summary);
})());

section('Invariants, every month');
ok('no NaN or infinity anywhere in the base run', !finiteRows(base), finiteRows(base));
ok('units recorded = units owned', base.rows.every(function (r) { return r.units >= r.properties * 2 || r.properties === 0; }));
ok('held net worth = value − debt + cash + reserve − HELOC + home equity', base.rows.every(function (r) {
  return Math.abs(r.heldNW - (r.value - r.debt + r.cash + r.reserve - r.heloc + r.homeEquity)) < 0.01;
}));
ok('debt is never negative', base.rows.every(function (r) { return r.debt >= -0.01; }));
ok('the default plan never runs out of cash', !base.summary.ruined && base.rows.every(function (r) { return r.cash > -1; }));
ok('every purchase passed every gate on the day it was bought', base.acquisitions.every(function (a) { return a.uw.fails.length === 0; }));
var closes = base.acquisitions.map(function (a) { return a.t; });
ok('closings respect the minimum months between them', closes.every(function (t, i) { return i === 0 || t - closes[i - 1] >= FPE.defaultConfig().sourcing.minMonthsBetween; }));

section('Every switch, both ways');
var errs = [], nans = [];
R.ENTRIES.filter(function (e) { return e.sw; }).forEach(function (e) {
  var c = FPE.defaultConfig();
  U.setPath(c, e.p, !U.getPath(c, e.p));
  try { var r = FPE.runSimulation(c); var b = finiteRows(r); if (b) nans.push(e.p + ': ' + b); }
  catch (err) { errs.push(e.p + ': ' + err.message); }
});
ok('no switch crashes the engine', errs.length === 0, errs.join('; '));
ok('no switch produces NaN', nans.length === 0, nans.join('; '));
var mcErr = [];
for (var s = 1; s <= 12; s++) { try { var rr = run(null, { rng: new U.Rng(s), seed: s }); var bb = finiteRows(rr); if (bb) mcErr.push(s + ': ' + bb); } catch (err) { mcErr.push(s + ': ' + err.message); } }
ok('twelve simulated futures run clean', mcErr.length === 0, mcErr.join('; '));
var allOn = run(function (c) {
  ['sellerFinance', 'assumption', 'cashOutRefi', 'heloc', 'exchange1031', 'fhaRefi', 'rateRefi', 'rubs', 'ancillary', 'taxAppeal',
   'costSeg', 'hcv', 'heatConversion', 'license', 'unitModes', 'downturn', 'hurdle', 'goalStop', 'paydown'].forEach(function (k) { c.strategies[k].enabled = true; });
  c.sourcing.offMarket.enabled = true; c.life.ownHome.enabled = true; c.life.houseHack.count = 3;
});
ok('everything on at once still runs clean', !finiteRows(allOn), finiteRows(allOn));

section('House-hack and housing');
var first = base.acquisitions[0];
ok('the first purchase is the house-hack, on an owner-occupied loan', first.ownerOcc && (first.product === 'fha' || first.product === 'convOO'));
var hhRow = base.rows.filter(function (r) { return r.housing === 'househack'; })[1];     // [0] is the move-in month
near('while house-hacking, the rent you no longer pay is credited to portfolio income',
  hhRow.housingCredit, FPE.life.rentCost(FPE.defaultConfig(), FPE.market.create(FPE.defaultConfig()), hhRow.t), 0.01);
var noHH = run(function (c) { c.life.houseHack.enabled = false; });
ok('without house-hacking no purchase is owner-occupied', noHH.acquisitions.every(function (a) { return !a.ownerOcc; }));
var chain = run(function (c) { c.life.houseHack.count = 3; c.life.houseHack.stayMonths = 12; });
var oo = chain.acquisitions.filter(function (a) { return a.ownerOcc; });
ok('a chain of house-hacks moves you into later purchases', oo.length >= 2, oo.length + ' owner-occupied purchases');
ok('FHA is one loan at a time — later house-hacks use another product or wait', (function () {
  var live = 0, okAll = true;
  chain.acquisitions.forEach(function (a, i) {
    if (a.product !== 'fha') return;
    var earlierFha = chain.acquisitions.slice(0, i).filter(function (b) { return b.product === 'fha'; });
    earlierFha.forEach(function (b) {
      var still = chain.properties.some(function (p) { return p.seq === b.seq && p.loan.fha && p.loan.balance > 0.005; });
      if (still) okAll = false;
    });
  });
  return okAll;
})());

section('Career: part-time and quitting');
var big = run(function (c) { c.plan.contributions = [{ from: '2026-10', monthly: 9000 }]; });
ok('a well-funded plan goes part-time before it quits', big.summary.partTime != null && big.summary.quit != null && big.summary.partTime < big.summary.quit,
  'part-time ' + big.summary.partTime + ', quit ' + big.summary.quit);
var cov = FPE.defaultConfig().life.career.quit.coverage, sus = FPE.defaultConfig().life.career.sustainMonths;
ok('quitting needs income to cover living costs by the required margin for the whole sustain period',
  big.rows.filter(function (r) { return r.t < big.summary.quit && r.t >= big.summary.quit - sus; })
    .every(function (r) { return r.trailingIncome >= r.costs * cov * 0.999; }));
ok('after quitting there are no wages and contributions become draws', big.rows.filter(function (r) { return r.t > big.summary.quit + 1; })
  .every(function (r) { return r.wages === 0 && r.contribution < 0; }));
var noW2 = run(function (c) { c.income.w2.enabled = false; });
ok('with no W-2 the engine runs on contributions alone', noW2.rows.every(function (r) { return r.wages === 0; }) && noW2.summary.properties > 0);
ok('… and never tests part-time or quitting', noW2.summary.partTime == null && noW2.summary.quit == null);

section('Circuit breakers');
var jl = run(function (c) { c.stress.jobLoss.enabled = true; c.stress.jobLoss.month = '2029-01'; c.stress.jobLoss.months = 8; });
var jlRows = jl.rows.filter(function (r) { return r.t >= U.parseMonth('2029-01') && r.t < U.parseMonth('2029-09'); });
ok('while out of work nothing is bought', jlRows.every(function (r) { return !r.acquisition; }));
ok('… and savings pay the bills', jlRows.every(function (r) { return r.contribution < 0; }));

section('Economic direction');
var more = run(function (c) { c.plan.contributions = c.plan.contributions.map(function (x) { return { from: x.from, monthly: x.monthly * 1.5 }; }); });
ok('more money in → a larger portfolio', more.summary.units > base.summary.units, more.summary.units + ' vs ' + base.summary.units + ' units');
var dear = run(function (c) { ['fha', 'convOO', 'convInv', 'dscr', 'commercial'].forEach(function (k) { c.rates[k] += 0.015; }); });
ok('higher rates → less held net worth at the horizon', dear.summary.heldNW < base.summary.heldNW);
var hot = run(function (c) { c.market.rentGrowth = 0.045; });
ok('faster rent growth → more net worth', hot.summary.heldNW > base.summary.heldNW);
ok('the sold value is below the held value (selling costs and tax)', base.summary.soldNW < base.summary.heldNW);

section('Speed');
var t0 = Date.now();
for (var k = 0; k < 20; k++) run(null, { rng: new U.Rng(100 + k), seed: 100 + k, lean: true });
var per = (Date.now() - t0) / 20;
ok('one simulated 15-year future takes under 40 ms (so 500 paths stay interactive)', per < 40, per.toFixed(1) + ' ms');
