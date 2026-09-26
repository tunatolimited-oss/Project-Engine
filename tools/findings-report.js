/* The numbers behind docs/FINDINGS.md: what the rebuilt tool says about the
   default plan and the 7K plan — the headline, better plans, what the
   answer rests on, and what each strategy family is worth.
   node tools/findings-report.js > scratch.md                               */
var FPE = require('../test/loader.js').loadEngine();
var U = FPE.util;

function money(x) { return (x < 0 ? '−$' : '$') + Math.round(Math.abs(x)).toLocaleString('en-US'); }
function signed(x) { return (x >= 0 ? '+' : '−') + '$' + Math.round(Math.abs(x)).toLocaleString('en-US'); }
function k(x) { return '$' + (x >= 1e6 ? (x / 1e6).toFixed(2) + 'M' : Math.round(x / 1000) + 'K'); }
function pct(x) { return (x * 100).toFixed(x > 0 && x < 0.1 ? 1 : 0) + '%'; }
function when(t) { return t == null ? 'not within 15 years' : U.label(t); }
var out = [];
function p(s) { out.push(s == null ? '' : s); }

function headlineOf(cfg, paths) {
  var mc = FPE.mc.run(cfg, { paths: paths || 300 });
  var h = FPE.objective.headline(cfg, mc);
  h.forced = Array.prototype.filter.call(mc.forcedSales, function (x) { return x > 0; }).length / mc.paths;
  return h;
}
function section(title, cfg) {
  var base = FPE.runSimulation(cfg), sm = base.summary;
  var h = headlineOf(cfg);
  p('## ' + title); p();
  p('| | |'); p('|---|---|');
  p('| 80% case, after-tax income at Dec 2036 | **' + money(h.value) + '/mo** |');
  p('| Median future | ' + money(h.median) + '/mo |');
  p('| One future in ten below | ' + money(h.bad) + '/mo |');
  p('| Calm economy (the deterministic run) | ' + money(sm.incomeAtTargetReal) + '/mo |');
  p('| Runs out of cash / has to sell a building | ' + pct(h.pRuin) + ' / ' + pct(h.forced) + ' |');
  p('| Part-time, in 80% of futures, by | ' + when(h.partTimeAt) + ' |');
  p('| Quit, in 80% of futures, by | ' + when(h.quitAt) + ' |');
  p('| Units at the end (median) | ' + h.units.p50 + ' |');
  p('| Worth at the end if sold (median, today\'s dollars) | ' + k(h.sold.p50) + ' |');
  p();
  return { base: base, h: h };
}

var def = FPE.defaultConfig();
var seven = FPE.defaultConfig(); seven.plan.startingCash = 0; seven.plan.contributions = [{ from: '2027-01', monthly: 7000 }];

p('# Findings — generated numbers'); p();
p('_`node tools/findings-report.js`, ' + new Date().toISOString().slice(0, 10) + '. Money in today\'s dollars; 300 simulated futures per plan (seed ' + def.mc.seed + ')._'); p();
section('Your defaults as they stand', def);
section('The 7K plan ($7,000 a month from Jan 2027, zero start)', seven);

/* recommender */
p('## Better plans for your defaults'); p();
var rec = FPE.recommender.recommend(def, { paths: 200 });
rec.plans.forEach(function (pl) {
  p('**' + pl.name + '** — 80% case ' + money(pl.headline.value) + '/mo, median ' + money(pl.headline.median) + '/mo, forced sale ' + pct(pl.forcedShare) +
    ', ' + pl.headline.units.p50 + ' units at the end, ' + pl.hours.toFixed(1) + ' hrs/week');
  pl.why.forEach(function (w) { p('- ' + w.label + ': ' + signed(w.worth) + '/mo' + (w.viaFutures ? ' (judged on simulated futures)' : '')); });
  p();
});
p('Each change alone, on the calm run (top 15):'); p();
p('| Change | Calm run | Simulated futures |'); p('|---|---:|---:|');
rec.singles.slice(0, 15).forEach(function (x) { p('| ' + x.label + ' | ' + signed(x.gain) + ' | ' + (x.miniGain == null ? '—' : signed(x.miniGain)) + ' |'); });
p();

/* rests on */
p('## What the default answer rests on'); p();
var sens = FPE.sensitivity.restsOn(def);
p('| Input | Trust | Low → high | Income at 2036 moves |'); p('|---|---|---|---|');
sens.items.slice(0, 12).forEach(function (x) {
  var lo = typeof x.lo === 'number' ? +x.lo.toFixed(4) : x.lo, hi = typeof x.hi === 'number' ? +x.hi.toFixed(4) : x.hi;
  p('| ' + x.label + ' | ' + FPE.data.PROVENANCE[x.prov].label + ' | ' + lo + ' → ' + hi + ' | ' + signed(x.down) + ' to ' + signed(x.up) + ' |');
});
p(); p('Check first: ' + sens.verifyFirst.map(function (id) { return sens.items.filter(function (x) { return x.id === id; })[0].label; }).join('; ') + '.'); p();

/* strategy families, alone on the defaults (calm run and 120 futures) */
p('## Strategy families on the defaults (each alone)'); p();
var baseDet = FPE.runSimulation(def).summary.incomeAtTargetReal;
var baseMc = headlineOf(def, 150).value;
var FAM = [
  ['Vouchers on vacant units', { 'strategies.hcv.enabled': true }],
  ['RUBS on owner-paid utilities', { 'strategies.rubs.enabled': true }],
  ['Tenants on their own heat, at boiler end of life', { 'strategies.heatConversion.enabled': true }],
  ['Tenants on their own heat, soon after buying', { 'strategies.heatConversion.enabled': true, 'strategies.heatConversion.timing': 'afterPurchase' }],
  ['RUBS then heat at boiler end of life', { 'strategies.rubs.enabled': true, 'strategies.heatConversion.enabled': true }],
  ['Vouchers and own heat together', { 'strategies.hcv.enabled': true, 'strategies.heatConversion.enabled': true, 'strategies.heatConversion.timing': 'afterPurchase' }],
  ['One mid-term furnished unit per building', { 'strategies.unitModes.enabled': true }],
  ['Chain 3 house-hacks, 12 months each', { 'life.houseHack.count': 3, 'life.houseHack.stayMonths': 12 }],
  ['No house-hack', { 'life.houseHack.enabled': false }],
  ['Buy your own home after 4 purchases', { 'life.ownHome.enabled': true }],
  ['No part-time step (straight to quitting)', { 'life.career.partTime.enabled': false }],
  ['Portfolio HELOC', { 'strategies.heloc.enabled': true }],
  ['Cash-out refinance while employed', { 'strategies.cashOutRefi.enabled': true, 'strategies.cashOutRefi.beforeQuitOnly': true }],
  ['1031 into bigger buildings', { 'strategies.exchange1031.enabled': true }],
  ['Pay down after buying', { 'strategies.paydown.enabled': true }],
  ['Stop buying 2 years before the target', { 'strategies.stopBuying.enabled': true, 'strategies.stopBuying.month': '2034-12' }],
  ['Real estate license', { 'strategies.license.enabled': true }],
  ['Seller financing where offered', { 'strategies.sellerFinance.enabled': true }],
  ['Idle cash in your investments at 1%/month (your figure)', { 'cash.policy': 'yours1' }]
];
p('| Strategy | Calm run | 80% case | Units at end (calm) |'); p('|---|---:|---:|---:|');
FAM.forEach(function (f) {
  var c = U.clone(def); Object.keys(f[1]).forEach(function (kk) { U.setPath(c, kk, f[1][kk]); });
  var d = FPE.runSimulation(c).summary, m = headlineOf(c, 150);
  p('| ' + f[0] + ' | ' + signed(d.incomeAtTargetReal - baseDet) + ' | ' + signed(m.value - baseMc) + ' | ' + d.units + ' |');
});
p(); p('Base for this table: calm ' + money(baseDet) + '/mo, 80% case ' + money(baseMc) + '/mo (150 futures).');
process.stdout.write(out.join('\n') + '\n');
