/* Market indices and building operations: turnover-driven rents, vacancy as
   an output, vouchers, heat, property tax. */
var H = require('./harness.js'), section = H.section, ok = H.ok, near = H.near;
var FPE = require('./loader.js').loadEngine();
var U = FPE.util, OPS = FPE.ops, SRC = FPE.sourcing, LEND = FPE.lending;

function envFor(mod, opts) {
  var cfg = FPE.defaultConfig();
  if (mod) mod(cfg);
  var M = FPE.market.create(cfg, opts || {});
  return { cfg: cfg, M: M, rng: (opts || {}).rng || null, seed: (opts || {}).seed || 0, start: M.start, managed: false, events: [], milestones: [] };
}
function building(env, key, q, product) {
  var t = env.start;
  var cand = SRC.fromArchetype(env, key || '3', t, 'mls', q == null ? 0.5 : q);
  var d = { units: cand.units, price: cand.price, rents: cand.unitRents.map(function (r) { return { lease: r, marketAsIs: r, occupied: true, owner: false }; }),
            taxMonthly: cand.annualTax / 12, insMonthly: cand.annualInsurance / 12, hoaMonthly: 0, utilitiesMonthly: 0, maintenancePct: 0.08, otherIncome: 0 };
  var uw = LEND.underwrite(env.cfg, env.M, t, d, product || 'dscr', { w2Monthly: 6000, incomeOk: true, otherDebts: 0, housingMonthly: 1100, rentals: [], financedCount: 0, fhaActive: false, otherUPB: 0 });
  return { p: OPS.newProperty(env, cand, uw, t, 1, false), cand: cand, t: t };
}

section('Market indices');
var e = envFor();
var dm = FPE.data.dataMonth;
near('rent index is 1 at the data month', e.M.rentIndex(dm), 1, 1e-12);
near('consumer prices are 1 at the plan start ("today\'s dollars")', e.M.cpiIndex(e.start), 1, 1e-12);
near('market rents grow at the rent-growth setting', e.M.rentIndex(dm + 12), 1 + e.cfg.market.rentGrowth, 1e-9);
near('constant cap rates: building prices move with rents', e.M.priceIndex(dm + 60) / e.M.rentIndex(dm + 60), 1, 1e-12);
var e2 = envFor(function (c) { c.market.capRateDriftBps = 10; });
ok('a rising cap-rate drift lowers prices relative to rents', e2.M.priceIndex(dm + 60) < e2.M.rentIndex(dm + 60));
var jan = function (y) { return U.mk(y, 0); };
near('insurance: +8%/yr through 2028 (ND Insurance Commissioner)', e.M.insuranceIndex(jan(2028)) / e.M.insuranceIndex(jan(2027)), 1.08, 1e-9);
near('insurance: +4%/yr after 2028 (estimate, not an extrapolation)', e.M.insuranceIndex(jan(2032)) / e.M.insuranceIndex(jan(2031)), 1.04, 1e-9);
var er = envFor(function (c) { c.stress.recession.enabled = true; c.stress.recession.startYear = 2028; c.stress.recession.months = 24; });
var peak = er.M.rentIndex(jan(2029)) / e.M.rentIndex(jan(2029));
near('a scheduled recession cuts market rents by its depth at full intensity', 1 - peak, er.cfg.stress.recession.rentDrop, 1e-9);
near('… and they are back on trend a year after it ends', er.M.rentIndex(jan(2031) + 12) / e.M.rentIndex(jan(2031) + 12), 1, 1e-9);
ok('the recession is flagged while it lasts', !!er.M.recession(jan(2029)) && !er.M.recession(jan(2031) + 1));

section('Property tax — Cass County');
var b3 = building(e, '3');
near('1–3 units: residential rate on assessed value', b3.cand.annualTax,
  b3.cand.marketValue * e.cfg.market.tax.residentialRate * e.cfg.market.tax.assessmentRatio, 0.01);
var b4 = building(e, '4');
near('4+ units: commercial class — 5% vs 4.5% of true and full value, 11% more tax at the same price',
  e.cfg.market.tax.commercialRate / e.cfg.market.tax.residentialRate, 5 / 4.5, 0.001);
near('fourplex uses the commercial rate', b4.cand.annualTax,
  b4.cand.marketValue * e.cfg.market.tax.commercialRate * e.cfg.market.tax.assessmentRatio, 0.01);

section('Rents reach market only through leases');
var eb = envFor();
var bb = building(eb, '3', 0.5);
var p = bb.p, u = p.unitsArr[0];
var before = u.rent, leaseEnd = u.leaseEnd;
var jumped = false;
for (var t = bb.t; t < leaseEnd; t++) { OPS.month(eb, p, t); if (Math.abs(u.rent - before) > 1e-6) jumped = true; }
ok('no rent change before the lease ends (no free ramp)', !jumped);
var target = OPS.achievable(eb, p, u, leaseEnd);
var X = eb.cfg.ops;
var incPct = X.renewal.pushPct;
var pLeave = X.turnover.belowMarket + X.turnover.sensitivity * (incPct - eb.cfg.market.rentGrowth);
var renewal = Math.min(target, before * (1 + incPct));
OPS.month(eb, p, leaseEnd);
var refreshedTarget = u.base * eb.M.rentIndex(leaseEnd);           // a refresh at turnover brings survey rent
near('expected rent after the lease ends = stay × pushed renewal + leave × new-tenant rent',
  u.rent, (1 - pLeave) * renewal + pLeave * refreshedTarget, 0.5);
near('below-market tenants leave more often when pushed harder than normal', pLeave, 0.25 + 1.5 * (0.08 - 0.03), 1e-9);

section('Turnover on a simulated path');
var leaves = 0, N = 400;
for (var s = 1; s <= N; s++) {
  var em = envFor(null, { rng: new U.Rng(s), seed: s });
  var bm = building(em, '3', 0.5);
  var um = bm.p.unitsArr[0], le = um.leaseEnd;
  for (var tt = bm.t; tt <= le; tt++) OPS.month(em, bm.p, tt);
  if (!um.occupied) leaves++;
}
near('the share of below-market tenants who leave matches the move-out probability', leaves / N, pLeave, 0.06);

section('Vacancy is an output');
var base = FPE.runSimulation(FPE.defaultConfig());
var gpr = U.sum(base.rows, function (r) { return r.gpr; }), vac = U.sum(base.rows, function (r) { return r.vacancy; });
ok('portfolio vacancy lands in Fargo\'s observed 3–8% band', vac / gpr > 0.03 && vac / gpr < 0.08, (100 * vac / gpr).toFixed(1) + '%');
var flat = FPE.defaultConfig(); flat.ops.vacancy.method = 'flat'; flat.ops.vacancy.flatPct = 0.07;
var rf = FPE.runSimulation(flat);
var vf = U.sum(rf.rows, function (r) { return r.vacancy; }) / U.sum(rf.rows, function (r) { return r.gpr; });
ok('a flat vacancy setting still works, as an option', vf > 0.065 && vf < 0.09, (100 * vf).toFixed(1) + '%');

section('Housing Choice Vouchers');
var eh = envFor(function (c) { c.strategies.hcv.enabled = true; });
var bh = building(eh, '3', 0.5);
var uh = bh.p.unitsArr[0];
var vr = OPS.voucherRent(eh, bh.p, uh, bh.t);
var ps = FPE.data.paymentStandard(uh.br) * eh.M.rentIndex(bh.t) / eh.M.rentIndex(U.mk(2026, 0));
var ua = FPE.data.utilityAllowance(uh.br, !bh.p.ownerPaysHeat) * OPS.costNow(eh, bh.t);
near('voucher rent = the lesser of (payment standard − utility allowance) and rent reasonableness',
  vr, Math.min(ps - ua, OPS.achievable(eh, bh.p, uh, bh.t) * (1 + eh.cfg.strategies.hcv.rrPremium)), 0.01);
var bh2 = building(eh, '3', 0.5);
bh2.p.ownerPaysHeat = true; bh2.p.heatConverted = false;
var before2 = FPE.data.paymentStandard(2) - FPE.data.utilityAllowance(2, false);
var after2 = FPE.data.paymentStandard(2) - FPE.data.utilityAllowance(2, true);
ok('moving tenants onto their own heat raises the allowance and LOWERS the voucher ceiling', after2 < before2);

section('Primary Residence Credit (ND, 2025)');
var ep = envFor();
var bp = building(ep, '3', 0.5, 'fha');
bp.p.ownerOccupied = true; bp.p.unitsArr[0].owner = true;
var rp = OPS.month(ep, bp.p, bp.t);
near('an owner-occupied triplex gets the credit against its tax', rp.prc, Math.min(ep.cfg.tax.prc.amount / 12, bp.p.taxBill / 12), 0.01);
var bp4 = building(ep, '4', 0.5, 'fha');
bp4.p.ownerOccupied = true; bp4.p.unitsArr[0].owner = true;
ok('a fourplex is commercial property: no credit unless you say otherwise', OPS.month(ep, bp4.p, bp4.t).prc === 0);
var bp5 = building(ep, '3', 0.5);
ok('no credit on a building you do not live in', OPS.month(ep, bp5.p, bp5.t).prc === 0);

section('Big-ticket components');
var comps = OPS.defaultComponents(3);
var roof = comps.filter(function (c) { return /roof/i.test(c.name); })[0];
near('roof cost scales with units', roof.cost, 9000 + 2600 * 3, 1);
ok('components start mid-life when their age is unknown', comps.every(function (c) { return c.ageYears === Math.floor(c.lifeYears / 2); }));
