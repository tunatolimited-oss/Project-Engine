/* Minimal test harness: sections, named checks, a summary, exit code.
   Each check names the rule it protects; where the rule comes from law,
   a lender guide or data, the test says where. */
var results = { pass: 0, fail: 0, failures: [] };
var current = '';

function section(name) { current = name; console.log('\n=== ' + name + ' ==='); }

function ok(name, cond, detail) {
  if (cond) { results.pass++; console.log('  ok   ' + name); }
  else {
    results.fail++;
    results.failures.push(current + ' › ' + name + (detail ? ' — ' + detail : ''));
    console.log('  FAIL ' + name + (detail ? ' — ' + detail : ''));
  }
}

function near(name, actual, expected, tol, detail) {
  var good = typeof actual === 'number' && isFinite(actual) && Math.abs(actual - expected) <= tol;
  ok(name, good, (detail ? detail + '; ' : '') + 'got ' + (typeof actual === 'number' ? +actual.toFixed(4) : actual) +
     ', expected ' + expected + ' ± ' + tol);
}

function throwsNot(name, fn) {
  try { fn(); ok(name, true); } catch (e) { ok(name, false, e.message); }
}

function report() {
  console.log('\n' + results.pass + ' passed, ' + results.fail + ' failed');
  if (results.fail) {
    console.log('\nFailures:');
    results.failures.forEach(function (f) { console.log('  - ' + f); });
  }
  return results;
}

module.exports = { section: section, ok: ok, near: near, throwsNot: throwsNot, report: report, results: results };
