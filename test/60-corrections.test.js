/* The September 2026 audit (docs/PHASE1-AUDIT.md) found errors in the
   engine as handed off. Each test here pins one correction so it cannot
   quietly come back. The section numbers refer to the audit. */
var H = require('./harness.js'), section = H.section, ok = H.ok, near = H.near;
var FPE = require('./loader.js').loadEngine();
var U = FPE.util, SRC = FPE.sourcing, OPS = FPE.ops;
var fs = require('fs'), path = require('path');

function cfgWith(mod) { var c = FPE.defaultConfig(); if (mod) mod(c); return c; }
function envFor(cfg, t) {
  var M = FPE.market.create(cfg);
  return { cfg: cfg, M: M, rng: null, seed: 0, start: M.start, managed: false, events: [], milestones: [] };
}
var def = FPE.defaultConfig();

section('§0.1 The plan no longer rests on a free rent ramp');
ok('rents reach market at turnover and renewal by default', def.ops.rentMethod === 'turnover');
ok('the old even ramp survives only as a labelled choice', FPE.registry.BY_PATH['ops.rentMethod'].o.some(function (o) { return o[0] === 'ramp' && /old engine/.test(o[1]); }));
ok('deals are ranked on stabilized yield, not day-one cash-on-cash', def.sourcing.score === 'stabilizedYield');

section('§0.2 / §3 DSCR and the agency gates');
ok('DSCR counts the lesser of lease and market rent', def.lending.dscr.rentBasis === 'lesser');
ok('conventional loans are gated on debt-to-income', def.lending.gates.dti === true);
ok('FHA 3–4 unit self-sufficiency is on', def.lending.fha.selfSufficiency === true);
near('conventional investment rate sits inside its own source (7.58–8.08%)', Math.min(Math.max(def.rates.convInv, 0.0758), 0.0808), def.rates.convInv, 1e-12);
ok('DSCR is not priced below agency', def.rates.dscr + (FPE.data.LENDER.dscrPrepayRateAdd[def.lending.dscr.prepayYears] || 0) >= 0.07);

section('§0.4 Seller financing comes from the market, not an id hash');
var cS = cfgWith(function (c) { c.strategies.sellerFinance.enabled = true; });
var eS = envFor(cS);
var SO = SRC.init();
var libs = SRC.candidates(eS, SO, eS.start).filter(function (x) { return x.origin === 'library'; });
ok('a library listing is seller-financeable only when its record says so',
  libs.every(function (x) { var rec = cS.properties.filter(function (p) { return p.id === x.sourceId; })[0]; return x.sellerEligible === !!rec.sellerFinanceEligible; }));
var r1 = FPE.runSimulation(cS), r2 = FPE.runSimulation(cfgWith(function (c) { c.strategies.sellerFinance.enabled = true; c.properties.forEach(function (p) { p.id = p.id + 'x'; }); }));
ok('renaming the listings does not change the result', Math.abs(r1.summary.heldNW - r2.summary.heldNW) < 1);

section('§0.5 / §0.6 Net worth after selling, income after tax');
var base = FPE.runSimulation(def);
ok('a sold value exists and is below the held value', base.summary.soldNW < base.summary.heldNW);
var liq = base.summary.liquidation;
ok('selling costs and exit tax are both counted', liq.sellCost > 0 && liq.tax !== 0);
var row = base.rows[base.rows.length - 1];
ok('cash flow (pre-tax) and income (after tax) are separate numbers', row.cashFlow !== row.income && typeof row.income === 'number');

section('§0.7 One price index — appreciation no longer secretly sets purchase prices');
var eP = envFor(def);
near('with constant cap rates, prices grow exactly with rents', eP.M.priceIndex(eP.start + 120) / eP.M.rentIndex(eP.start + 120), 1, 1e-12);

section('§0.8 Insurance');
ok('8% only through 2028, then 4%', def.market.insurance.nearTermUntil === 2028 && def.market.insurance.longTermRate === 0.04);

section('§3 Acquisition model');
var eL = envFor(def);
var late = SRC.candidates(eL, SRC.init(), FPE.data.dataMonth + def.sourcing.library.availableMonths + 1).filter(function (x) { return x.origin === 'library'; });
ok('library listings expire; they are not permanent inventory', late.length === 0);
var early = SRC.candidates(eL, SRC.init(), eL.start).filter(function (x) { return x.origin === 'library'; });
ok('the 5-unit listing (A5) can be bought', early.some(function (x) { return x.units === 5; }));
ok('listings the audit marked sold are never offered', early.every(function (x) { return !/^F/.test(x.sourceId); }));

section('§3 Operations');
var cR = cfgWith(function (c) { c.strategies.rubs.enabled = true; });
var eR = envFor(cR);
var cand = SRC.fromArchetype(eR, '3', eR.start, 'mls', 0.5);
var uw = FPE.lending.underwrite(cR, eR.M, eR.start, { units: 3, price: cand.price, rents: cand.unitRents.map(function (r) { return { lease: r, marketAsIs: r, occupied: true }; }),
  taxMonthly: 300, insMonthly: 200, hoaMonthly: 0 }, 'dscr', { w2Monthly: 6000, incomeOk: true, otherDebts: 0, housingMonthly: 0, rentals: [], financedCount: 0, fhaActive: false, otherUPB: 0 });
var p = OPS.newProperty(eR, cand, uw, eR.start, 1, false);
for (var t = eR.start; t < eR.start + 8; t++) OPS.month(eR, p, t);
ok('RUBS lowers the rent tenants will pay (no double dip)', p.rubs.active && OPS.achievable(eR, p, p.unitsArr[0], eR.start + 8) < p.unitsArr[0].base * eR.M.rentIndex(eR.start + 8));
var a1 = def.properties.filter(function (x) { return x.id === 'A1'; })[0];
ok('A1 already books laundry income, so ancillary laundry is not added again', a1.otherIncomeIsLaundry === true);
near('closing costs are in the depreciable basis', p.basis.building + p.basis.land, cand.price + uw.closing - (uw.points || 0), 0.01);

section('§3 Tax');
ok('no per-property 3% tax cap (HB 1176 caps levies, not bills)', FPE.registry.ENTRIES.every(function (e) { return !/levyCap|taxCap/.test(e.p); }));
ok('a stated tax bill is a floor that grows, never cut automatically', def.market.tax.statedIsFloor === true);
ok('the Primary Residence Credit is a property-tax credit on your own home, off for fourplexes by default', def.tax.prc.enabled && !def.tax.prc.fourplex);
var hh1 = FPE.runSimulation(def), hh0 = FPE.runSimulation(cfgWith(function (c) { c.tax.personalUse = false; }));
var y1 = hh1.years.filter(function (y) { return y.year === 2028; })[0], y0 = hh0.years.filter(function (y) { return y.year === 2028; })[0];
ok('your own unit\'s share of costs and depreciation is not deducted while you live there', y1.passiveNet > y0.passiveNet,
  Math.round(y1.passiveNet) + ' vs ' + Math.round(y0.passiveNet));
var mfj = cfgWith(function (c) { c.plan.filingStatus = 'mfj'; });
ok('filing status changes the tax', FPE.tax.yearTax(mfj, FPE.tax.tables(mfj, 2026), { ordinary: 150000, unrec1250: 0, ltcg: 0 }, 0).total <
   FPE.tax.yearTax(def, FPE.tax.tables(def, 2026), { ordinary: 150000, unrec1250: 0, ltcg: 0 }, 0).total);

section('§7 No dead configuration');
var src = fs.readdirSync(path.join(__dirname, '../src/engine')).filter(function (f) { return f !== '02-registry.js'; })
  .map(function (f) { return fs.readFileSync(path.join(__dirname, '../src/engine', f), 'utf8'); })
  .concat(fs.readdirSync(path.join(__dirname, '../src/analysis')).map(function (f) { return fs.readFileSync(path.join(__dirname, '../src/analysis', f), 'utf8'); }))
  .join('\n');
var dead = FPE.registry.ENTRIES.filter(function (e) {
  var last = e.p.split('.').pop();
  return !(new RegExp('(\\.' + last + '\\b|\\[\'' + last + '\'\\]|\'' + last + '\')')).test(src);
}).map(function (e) { return e.p; });
ok('every declared input is read somewhere in the engine', dead.length === 0, dead.join(', '));
