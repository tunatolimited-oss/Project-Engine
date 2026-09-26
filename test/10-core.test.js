/* Core arithmetic and the field registry. */
var H = require('./harness.js'), section = H.section, ok = H.ok, near = H.near;
var FPE = require('./loader.js').loadEngine();
var U = FPE.util, R = FPE.registry;

section('Loan arithmetic');
/* Standard fixed-rate payment: $200,000 at 7% over 30 years = $1,330.60/mo
   (any amortisation table). */
near('payment on $200K at 7%, 30 years', U.pmt(200000, 0.07, 30), 1330.60, 0.01);
near('payment at 0% is principal / months', U.pmt(120000, 0, 10), 1000, 1e-9);
near('balance after 12 payments', U.balanceAfter(200000, 0.07, 30, 12), 197968.44, 0.5);
near('loanForPayment inverts pmt', U.loanForPayment(U.pmt(250000, 0.0735, 30), 0.0735, 30), 250000, 0.01);
near('monthly factor compounds to the annual rate', Math.pow(U.monthlyFactor(0.04), 12), 1.04, 1e-12);

section('Months');
ok('parseMonth / iso round trip', U.iso(U.parseMonth('2031-07')) === '2031-07');
ok('label reads naturally', U.label(U.parseMonth('2026-10')) === 'Oct 2026');
ok('month index arithmetic', U.parseMonth('2027-01') - U.parseMonth('2026-10') === 3);

section('Deterministic randomness');
var a = new U.Rng(42), b = new U.Rng(42), c = new U.Rng(43);
var sa = [a.next(), a.next(), a.next()], sb = [b.next(), b.next(), b.next()];
ok('same seed, same sequence', sa.join() === sb.join());
ok('different seed, different sequence', sa[0] !== c.next());
ok('keyed draws are stable', U.keyed(7, 'turn', 3, 1, 24400) === U.keyed(7, 'turn', 3, 1, 24400));
ok('keyed draws differ by key', U.keyed(7, 'turn', 3, 1, 24400) !== U.keyed(7, 'turn', 3, 2, 24400));
var rp = new U.Rng(9), n = 20000, s = 0;
for (var i = 0; i < n; i++) s += rp.poisson(0.6);
near('Poisson sampler mean', s / n, 0.6, 0.02);
var qs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
near('quantile interpolates', U.quantile(qs, 0.5), 5.5, 1e-9);

section('Field registry — every input declared once, completely');
var E = R.ENTRIES;
ok('registry has entries', E.length > 300, E.length + ' entries');
var paths = {};
var dup = E.filter(function (e) { if (paths[e.p]) return true; paths[e.p] = 1; return false; });
ok('no path declared twice', dup.length === 0, dup.map(function (e) { return e.p; }).join(', '));
var noLabel = E.filter(function (e) { return !e.l; });
ok('every field has a label', noLabel.length === 0, noLabel.map(function (e) { return e.p; }).join(', '));
var noGroup = E.filter(function (e) { return !R.GROUPS.some(function (g) { return g[0] === e.g; }); });
ok('every field belongs to a known group', noGroup.length === 0, noGroup.map(function (e) { return e.p; }).join(', '));
var badProv = E.filter(function (e) { return !FPE.data.PROVENANCE[e.c]; });
ok('every field carries a provenance class', badProv.length === 0, badProv.map(function (e) { return e.p + ':' + e.c; }).join(', '));
var badNote = E.filter(function (e) { return e.n && !FPE.data.NOTES[e.n]; });
ok('every note key exists in the notes', badNote.length === 0, badNote.map(function (e) { return e.p + '→' + e.n; }).join(', '));
var cfg = FPE.defaultConfig();
var missing = E.filter(function (e) { return U.getPath(cfg, e.p) === undefined; });
ok('defaultConfig has every declared path', missing.length === 0, missing.map(function (e) { return e.p; }).join(', '));
var outOfRange = E.filter(function (e) {
  var v = U.getPath(cfg, e.p);
  return typeof v === 'number' && ((e.min != null && v < e.min) || (e.max != null && v > e.max));
});
ok('every default lies inside its own range', outOfRange.length === 0, outOfRange.map(function (e) { return e.p; }).join(', '));
var badSelect = E.filter(function (e) {
  return e.t === 'select' && !(e.o || []).some(function (o) { return o[0] === U.getPath(cfg, e.p); });
});
ok('every select default is one of its options', badSelect.length === 0, badSelect.map(function (e) { return e.p; }).join(', '));
function condPaths(w, out) {
  if (!w) return out;
  if (Array.isArray(w)) { out.push(w[0]); return out; }
  (w.all || w.any || []).forEach(function (x) { condPaths(x, out); });
  return out;
}
var badCond = E.filter(function (e) { return condPaths(e.w, []).some(function (p) { return !R.BY_PATH[p]; }); });
ok('relevance conditions refer only to declared fields', badCond.length === 0, badCond.map(function (e) { return e.p; }).join(', '));
var distBad = E.filter(function (e) { return e.dist && ['tri', 'triRel', 'triAdd', 'normal', 'uniform'].indexOf(e.dist.k) < 0; });
ok('every uncertainty distribution is a known kind', distBad.length === 0, distBad.map(function (e) { return e.p; }).join(', '));
var unav = E.filter(function (e) { return e.unav; }).map(function (e) { return e.p; });
ok('unavoidable costs are marked (tax, insurance) and cannot be switched off', unav.indexOf('market.tax.residentialRate') >= 0 &&
   E.filter(function (e) { return e.unav && e.sw; }).length === 0, unav.join(', '));

section('Relevance follows the switches');
var c2 = FPE.defaultConfig();
c2.income.w2.enabled = false;
ok('career settings hide without a W-2', !R.isRelevant(c2, 'life.career.partTime.coverage'));
ok('the switch that hides them is named', R.blockingSwitch(c2, 'life.career.partTime.coverage') === 'income.w2.enabled');
c2.income.w2.enabled = true;
ok('career settings show with a W-2', R.isRelevant(c2, 'life.career.partTime.coverage'));
ok('HELOC details hidden while HELOC is off', !R.isRelevant(c2, 'strategies.heloc.maxCltv'));
c2.strategies.heloc.enabled = true;
ok('HELOC details shown once on', R.isRelevant(c2, 'strategies.heloc.maxCltv'));

section('Saved scenarios survive schema changes');
var old = FPE.defaultConfig();
delete old.strategies.heloc.lineCap;
delete old.plan.objective;
var m = R.migrate(old);
ok('migrate fills a field added later', m.strategies.heloc.lineCap === R.BY_PATH['strategies.heloc.lineCap'].d);
ok('migrate restores a whole missing branch', m.plan.objective && m.plan.objective.kind === 'incomeByDate');
var legacyShape = { setup: { horizonYears: 12 }, rules: {} };
ok('a pre-rebuild scenario becomes fresh defaults, not a half-read mix', R.migrate(legacyShape).version === 2 && R.migrate(legacyShape).plan.horizonYears === 15);
