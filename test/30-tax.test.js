/* Tax: 2026 federal (IRS Rev. Proc. 2025-32 tables), North Dakota, the
   passive-activity rules (IRC §469), §461(l), §199A, NIIT (§1411), and the
   tax a sale triggers (§1245, unrecaptured §1250, capital gain). */
var H = require('./harness.js'), section = H.section, ok = H.ok, near = H.near;
var FPE = require('./loader.js').loadEngine();
var T = FPE.tax;

function cfgWith(mod) { var c = FPE.defaultConfig(); if (mod) mod(c); return c; }
function yr(o) {
  return Object.assign({ wages: 72000, deferrals: 0, passiveNet: 0, nonPassiveNet: 0, qbiEligibleIncome: 0,
    investOrdinary: 0, investTbill: 0, investLtcg: 0, commission: 0, ubia: 0, reps: false, qbiQualifies: false, rentalNII: true }, o || {});
}
var cfg = cfgWith();

section('Wages alone, 2026, single');
var tb = T.tables(cfg, 2026);
var w = T.yearTax(cfg, tb, { ordinary: 72000, unrec1250: 0, ltcg: 0 }, 0);
/* taxable 72,000 − 16,100 = 55,900: 10% of 12,400 + 12% of 38,000 + 22% of 5,500 */
near('federal tax on $72,000 of wages', w.federal, 1240 + 4560 + 1210, 0.01);
/* ND: 0% to $49,575, 1.95% above */
near('North Dakota tax on the same', w.state, 0.0195 * (55900 - 49575), 0.01);
var tb30 = T.tables(cfg, 2030);
near('brackets and the standard deduction index with CPI', tb30.std, 16100 * Math.pow(1 + cfg.market.cpi, 4), 0.01);
ok('the $25,000 passive allowance is never indexed', tb30.allowance.allowance === 25000 && tb30.allowance.phaseStart === 100000);
ok('the NIIT threshold is never indexed', tb30.niitThreshold === 200000);

section('Rental losses — §469');
var c0 = { passive: 0, nol: 0 };
var a1 = T.annual(cfg, 2026, yr({ passiveNet: -10000 }), c0);
near('MAGI under $100K: a $10K loss is fully usable against wages', a1.allowanceUsed, 10000, 0.01);
ok('nothing suspended', c0.passive === 0);
ok('and it lowers the tax you pay', a1.incremental < 0);
var c1 = { passive: 0, nol: 0 };
var a2 = T.annual(cfg, 2026, yr({ wages: 120000, passiveNet: -20000 }), c1);
near('MAGI $120K: allowance phases to $15K', a2.allowanceUsed, 15000, 0.01);
near('the other $5K is suspended', c1.passive, 5000, 0.01);
var c2 = { passive: 0, nol: 0 };
T.annual(cfg, 2026, yr({ wages: 160000, passiveNet: -8000 }), c2);
near('MAGI over $150K: all of it is suspended', c2.passive, 8000, 0.01);
var c3 = { passive: 10000, nol: 0 };
var a3 = T.annual(cfg, 2026, yr({ passiveNet: 4000 }), c3);
near('suspended losses absorb later rental income first', a3.released, 4000, 0.01);
near('… and nothing is taxed that year', a3.rentalTax, 0, 0.01);
var c4 = { passive: 10000, nol: 0 };
var a4 = T.annual(cfg, 2026, yr({ passiveNet: -5000, reps: true }), c4);
ok('REPS: this year\'s loss offsets wages', a4.rentalOrdinary === -5000);
ok('§469(f)(1): losses suspended before REPS stay suspended', c4.passive === 10000);
var cOff = cfgWith(function (c) { c.tax.allowance = false; });
var c5 = { passive: 0, nol: 0 };
T.annual(cOff, 2026, yr({ passiveNet: -10000 }), c5);
ok('allowance switched off: the loss is suspended instead', c5.passive === 10000);

section('§461(l) excess business loss');
var c6 = { passive: 0, nol: 0 };
var a6 = T.annual(cfg, 2026, yr({ passiveNet: -300000, reps: true }), c6);
near('a REPS loss above $256,000 (2026, single) becomes an NOL', a6.nolAdded, 44000, 0.01);
var c7 = { passive: 0, nol: 50000 };
var a7 = T.annual(cfg, 2026, yr({ wages: 72000 }), c7);
near('an NOL offsets at most 80% of taxable income', a7.nolUsed, 0.8 * (72000 - 16100), 0.01);

section('§199A QBI');
var q1 = T.annual(cfg, 2026, yr({ passiveNet: 40000, qbiEligibleIncome: 40000, qbiQualifies: true }), { passive: 0, nol: 0 });
near('20% of qualified rental income below the threshold', q1.qbiDeduction, 8000, 0.01);
var q2 = T.annual(cfg, 2026, yr({ passiveNet: 40000, qbiEligibleIncome: 40000, qbiQualifies: false }), { passive: 0, nol: 0 });
ok('no deduction when the rentals do not qualify as a trade or business', q2.qbiDeduction === 0);
ok('QBI lowers the tax on the same income', q1.rentalTax < q2.rentalTax);

section('NIIT §1411');
var n1 = T.annual(cfg, 2026, yr({ wages: 190000, passiveNet: 30000 }), { passive: 0, nol: 0 });
near('3.8% of the lesser of rental income and MAGI over $200K', n1.niit, 0.038 * 20000, 0.01);
var n2 = T.annual(cfg, 2026, yr({ wages: 190000, passiveNet: 30000, rentalNII: false }), { passive: 0, nol: 0 });
ok('no NIIT on rental income when you are REPS and materially participate', n2.niit === 0);

section('Incremental attribution — the tax the portfolio adds');
var z = T.annual(cfg, 2026, yr({}), { passive: 0, nol: 0 });
near('no rentals, no incremental tax', z.incremental, 0, 1e-9);
var r1 = T.annual(cfg, 2026, yr({ passiveNet: 12000 }), { passive: 0, nol: 0 });
var direct = T.yearTax(cfg, tb, { ordinary: 84000, unrec1250: 0, ltcg: 0 }, 0).total - w.total;
near('rental income is taxed at your marginal rate on top of wages', r1.rentalTax, direct, 0.01);
var noW = T.annual(cfg, 2026, yr({ wages: 0, passiveNet: 12000 }), { passive: 0, nol: 0 });
ok('without wages the same income is taxed less (it fills the low brackets)', noW.rentalTax < r1.rentalTax);

section('Selling — §1245, unrecaptured §1250, capital gain, ND exclusion');
/* $72K wages; $30K unrecaptured §1250 lands in the 22% bracket; $50K
   long-term gain lands above the 0% breakpoint → 15%. ND taxes 60% of both. */
var sale = T.saleTax(cfg, 2026, 72000, { rec1245: 0, unrec1250: 30000, capGain: 50000, releasedLosses: 0, reps: false });
var ndBefore = 0.0195 * (55900 - 49575), ndAfter = 0.0195 * (55900 + 0.6 * 80000 - 49575);
near('federal + ND on the sale', sale, 0.22 * 30000 + 0.15 * 50000 + (ndAfter - ndBefore), 0.01);
var hi = cfgWith(function (c) { c.tax.state = false; c.tax.niit = false; });
near('unrecaptured §1250 is capped at 25% even in the 35% bracket',
  T.saleTax(hi, 2026, 300000, { rec1245: 0, unrec1250: 50000, capGain: 0, releasedLosses: 0 }), 12500, 0.01);
near('§1245 recapture (cost segregation) is ordinary income',
  T.saleTax(hi, 2026, 300000, { rec1245: 10000, unrec1250: 0, capGain: 0, releasedLosses: 0 }), 3500, 0.01);
ok('released suspended losses can make a sale lower your tax',
  T.saleTax(cfg, 2026, 72000, { rec1245: 0, unrec1250: 0, capGain: 5000, releasedLosses: 40000 }) < 0);
var ltcg0 = T.saleTax(hi, 2026, 20000, { rec1245: 0, unrec1250: 0, capGain: 30000, releasedLosses: 0 });
near('gain inside the 0% breakpoint is untaxed federally', ltcg0, 0, 0.01);
