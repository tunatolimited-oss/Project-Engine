/* The layers on top of the engine: uncertainty, objective, sensitivity,
   catalogue, recommender, deal analyzer, action plan. */
var H = require('./harness.js'), section = H.section, ok = H.ok, near = H.near;
var FPE = require('./loader.js').loadEngine();
var U = FPE.util;

var cfg = FPE.defaultConfig();

section('Uncertainty layer');
var a = FPE.mc.run(cfg, { paths: 40, seed: 7 }), b = FPE.mc.run(cfg, { paths: 40, seed: 7 }), c = FPE.mc.run(cfg, { paths: 40, seed: 8 });
ok('same seed and inputs → the same distribution', Array.prototype.join.call(a.incomeAtTarget) === Array.prototype.join.call(b.incomeAtTarget));
ok('another seed → another sample', Array.prototype.join.call(a.incomeAtTarget) !== Array.prototype.join.call(c.incomeAtTarget));
var s1 = FPE.mc.sampleConfig(cfg, 123), s2 = FPE.mc.sampleConfig(cfg, 123);
ok('an input draw depends only on the path seed and the input', s1.market.rentGrowth === s2.market.rentGrowth && s1.market.rentGrowth !== cfg.market.rentGrowth);
var cOff = FPE.defaultConfig(); cOff.mc.sample.market = false;
ok('switching a category off stops its inputs varying', FPE.mc.sampleConfig(cOff, 123).market.rentGrowth === cOff.market.rentGrowth);
var cPlan = FPE.defaultConfig(); cPlan.strategies.ancillary.enabled = true;
ok('common random numbers: a strategy switch does not change the inputs drawn', FPE.mc.sampleConfig(cPlan, 99).market.rentGrowth === FPE.mc.sampleConfig(cfg, 99).market.rentGrowth);
var e = FPE.registry.BY_PATH['ops.turnover.turnCost'];
ok('the 10th/90th percentiles bracket the default', FPE.mc.fieldQuantile(e, 1500, 0.1) < 1500 && FPE.mc.fieldQuantile(e, 1500, 0.9) > 1500);

section('Objective and headline');
var h = FPE.objective.headline(cfg, a);
ok('the headline is the value the chosen share of futures meets or beats',
  Math.abs(h.value - FPE.mc.atConfidence(a.incomeAtTarget, 0.8)) < 1e-9 && h.value <= h.median);
ok('a failed future scores zero, never a negative income', Array.prototype.every.call(a.incomeAtTarget, function (x, i) { return !a.ruined[i] || x === 0; }));
var cS = FPE.defaultConfig(); cS.plan.objective.kind = 'replaceSalary';
var tgt = FPE.objective.salaryTarget(cS);
var net = FPE.life.netPay(cS, 2026, 72000) / 12;
near('replace-salary target = take-home pay plus the cushion', tgt, net * (1 + cS.plan.objective.salaryBuffer), 0.01);
var hs = FPE.objective.headline(cS, FPE.mc.run(cS, { paths: 30, seed: 3 }));
ok('replace-salary headline is a date (or none within the horizon)', hs.unit === 'month' && (hs.value === null || hs.value > U.parseMonth(cS.plan.startMonth)));

section('What this rests on');
var sens = FPE.sensitivity.restsOn(cfg);
ok('ranked by swing, largest first', sens.items.every(function (x, i) { return i === 0 || sens.items[i - 1].swing >= x.swing; }));
ok('every item carries its provenance class', sens.items.every(function (x) { return FPE.data.PROVENANCE[x.prov]; }));
ok('only inputs relevant to this plan are tested', sens.items.every(function (x) { return !x.path || FPE.registry.isRelevant(cfg, x.path); }));
ok('the "verify first" list holds only estimates and guesses', sens.verifyFirst.every(function (id) { var it = sens.items.filter(function (x) { return x.id === id; })[0]; return it.prov === 'estimate' || it.prov === 'guess'; }));

section('Strategy catalogue');
var bad = [];
FPE.catalogue.ENTRIES.forEach(function (en) {
  (en.params || []).forEach(function (p) { if (!FPE.registry.BY_PATH[p]) bad.push(en.id + ' ' + p); });
  (en.explore || []).forEach(function (x) {
    var pt = typeof x.patch === 'function' ? x.patch(cfg) : x.patch;
    Object.keys(pt).forEach(function (p) { var r = FPE.registry.BY_PATH[p]; if (!r || (r.t === 'select' && !r.o.some(function (o) { return o[0] === pt[p]; }))) bad.push(en.id + ' ' + p); });
  });
});
ok('every catalogue path and option exists in the registry', bad.length === 0, bad.join(', '));
ok('about thirty real choices', FPE.catalogue.ENTRIES.length >= 28 && FPE.catalogue.ENTRIES.length <= 40, FPE.catalogue.ENTRIES.length + ' entries');
ok('lifestyle choices are never explored by the recommender', FPE.catalogue.ENTRIES.filter(function (x) { return x.lifestyle; }).every(function (x) { return !x.explore.length; }));
var st = FPE.catalogue.state(cfg);
ok('the state view reports every entry', st.length === FPE.catalogue.ENTRIES.length);
var cW = FPE.defaultConfig(); cW.strategies.hcv.enabled = true; cW.strategies.heatConversion.enabled = true;
ok('interaction warnings fire: own heat vs voucher ceiling', FPE.catalogue.state(cW).filter(function (x) { return x.id === 'hcv'; })[0].warnings.length > 0);

section('Recommender');
var rec = FPE.recommender.recommend(cfg, { paths: 30, maxSteps: 2, miniPaths: 12 });
ok('it always includes your plan as it stands', rec.plans.some(function (p) { return p.id === 'yours'; }));
ok('plans are ranked by the headline', rec.plans.every(function (p, i) { return i === 0 || rec.plans[i - 1].headline.score >= p.headline.score; }));
ok('every proposed change is spelled out', rec.plans.every(function (p) { return p.changes.length === p.taken.length; }));
ok('nothing outside the would-do set is proposed', (function () {
  var wd = {}; FPE.catalogue.ENTRIES.forEach(function (x) { wd[x.id] = x.wouldDo; });
  return rec.plans.every(function (p) { return p.taken.every(function (m) { return wd[m.entry]; }); });
})());
var noRubs = FPE.recommender.moves(cfg, { rubs: false }).filter(function (m) { return m.entry === 'rubs'; });
ok('a strategy you rule out is never tried', noRubs.length === 0);

section('Should I buy this one?');
var listing = { address: 'Test', units: 3, price: 240000, unitRents: [800, 820, 780], unitBedrooms: [2, 2, 2], yearBuilt: 1948, ownerPaysHeat: true, ownerUtilitiesMonthly: 450 };
var n = FPE.deal.normalize(cfg, listing, '2027-06');
ok('missing facts are filled and flagged', n.prov.annualTax === 'derived' && n.prov.annualInsurance === 'estimated' && n.prov.unitRents === 'stated');
var an = FPE.deal.analyze(cfg, listing, { month: U.parseMonth('2027-06') });
ok('it reports what each lender product says', an.lender.length > 0 && an.lender.every(function (l) { return typeof l.ok === 'boolean'; }));
ok('the verdict is the change to your headline', typeof an.delta === 'number');
ok('if it cannot close in the window it says when it could, and why not', an.bought || (an.earliest && an.earliest.reason));
ok('an old building puts the inspection near the top of the checklist', an.checklist.slice(0, 3).some(function (x) { return /Inspection/.test(x.what); }));

section('What do I do next?');
var ap = FPE.actionPlan.next(cfg);
ok('names the next purchase with its cash and loan', ap.next && ap.next.cashToClose > 0 && ap.next.productName);
ok('lists questions for that lender', ap.next.ask.length > 0);
ok('a duplex house-hack is not asked the 3–4 unit self-sufficiency question', ap.next.units >= 3 || ap.next.ask.every(function (q) { return q.indexOf('self-sufficiency') < 0; }));
