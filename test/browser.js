/* Drives the built page in Chromium. External requests (fonts) are blocked,
   so it runs anywhere; the page is wrapped in the same document skeleton the
   Artifact publish adds.
   node test/browser.js            all checks
   SHOTS=1 node test/browser.js    also write screenshots to shots/          */
var path = require('path');
var fs = require('fs');
var chromium = require('playwright').chromium;
var build = require('../tools/build.js');

var ROOT = path.join(__dirname, '..');
var SHOTS = process.env.SHOTS ? path.join(ROOT, 'shots') : null;
var pass = 0, fail = 0, failures = [];
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; failures.push(name + (detail ? ' — ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); }
}

function page() {
  var r = build.build();
  var html = fs.readFileSync(r.file, 'utf8');
  var doc = '<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover">' +
    '<style>:root{color-scheme:light}body{margin:0;font:14px -apple-system,sans-serif}[hidden]{display:none!important}</style></head><body>' + html + '</body></html>';
  var out = path.join(ROOT, 'dist', 'browser-test.html');
  fs.writeFileSync(out, doc);
  return 'file://' + out;
}

function executable() {
  var base = '/opt/pw-browsers';
  var dirs = fs.existsSync(base) ? fs.readdirSync(base).filter(function (d) { return /^chromium-\d+$/.test(d); }) : [];
  var p = dirs.length ? path.join(base, dirs.sort().pop(), 'chrome-linux', 'chrome') : null;
  return p && fs.existsSync(p) ? p : undefined;
}

(async function () {
  var url = page();
  if (SHOTS && !fs.existsSync(SHOTS)) fs.mkdirSync(SHOTS);
  var browser = await chromium.launch({ executablePath: executable(), args: ['--no-sandbox', '--disable-dev-shm-usage'] });

  async function open(opts) {
    var ctx = await browser.newContext({ viewport: opts.viewport || { width: 1440, height: 1000 }, colorScheme: opts.theme || 'light' });
    await ctx.route('**/*', function (route) { return route.request().url().indexOf('file://') === 0 || route.request().url().indexOf('blob:') === 0 ? route.continue() : route.abort(); });
    if (opts.working) await ctx.addInitScript(function (w) { try { localStorage.setItem('fpe2:working', JSON.stringify(w)); } catch (e) {} }, opts.working);
    var p = await ctx.newPage();
    var errors = [];
    p.on('pageerror', function (e) { errors.push('pageerror: ' + e.message); });
    p.on('console', function (m) { if (m.type() === 'error' && !/net::ERR_FAILED|ERR_BLOCKED|fonts\.g/.test(m.text())) errors.push('console: ' + m.text()); });
    await p.goto(url + (opts.hash || ''));
    return { ctx: ctx, page: p, errors: errors };
  }
  async function settle(p, ms) {
    await p.waitForFunction(function () {
      var hl = document.getElementById('headline');
      return hl && !hl.classList.contains('stale') && !document.getElementById('mc-label') && /\$|20\d\d|Not yet/.test(hl.textContent);
    }, null, { timeout: ms || 60000 });
  }

  for (var theme of ['light', 'dark']) {
    console.log('\n===== desktop, ' + theme + ' =====');
    var o = await open({ theme: theme });
    var p = o.page;
    await settle(p);
    ok('loads and settles with no errors', o.errors.length === 0, o.errors.slice(0, 3).join(' | '));
    var big = await p.textContent('#headline .bignum');
    ok('headline shows the 80% case', /\$[\d,]+/.test(big), big);
    ok('the fan chart draws its bands and lines', (await p.locator('#view-plan svg path').count()) >= 6);
    ok('"what this rests on" lists inputs', (await p.locator('.torow').count()) >= 8);
    var bodyBg = await p.evaluate(function () { return getComputedStyle(document.body).backgroundColor; });
    ok('body paints its own background (' + theme + ')', bodyBg && bodyBg !== 'rgba(0, 0, 0, 0)', bodyBg);
    if (SHOTS) await p.screenshot({ path: path.join(SHOTS, 'plan-' + theme + '.png'), fullPage: false });

    /* the rail drives the plan */
    var before = await p.textContent('#headline .trio');
    await p.fill('#rail [data-path="plan.startingCash"] input', '60000');
    await p.waitForTimeout(250);
    await settle(p);
    var after = await p.textContent('#headline .trio');
    ok('changing cash available now re-runs the plan', before !== after, before.slice(0, 60) + ' → ' + after.slice(0, 60));

    /* every view renders */
    for (var v of ['deal', 'next', 'strategies', 'assumptions', 'timeline', 'compare']) {
      await p.click('#tab-' + v);
      await p.waitForTimeout(250);
      var txt = await p.textContent('#view-' + v);
      ok('view "' + v + '" renders', txt && txt.length > (v === 'compare' ? 60 : 200), (txt || '').slice(0, 80));
      if (SHOTS) await p.screenshot({ path: path.join(SHOTS, v + '-' + theme + '.png') });
    }
    ok('no errors while switching views', o.errors.length === 0, o.errors.slice(0, 3).join(' | '));

    if (theme === 'light') {
      /* strategies switch through the catalogue and show in the rail */
      await p.click('#tab-strategies');
      await p.check('#sw-rubs');
      await p.waitForTimeout(200);
      ok('switching a strategy on shows it in the rail', /RUBS|Bill utilities/.test(await p.textContent('#rail-on')));
      /* assumptions search */
      await p.click('#tab-assumptions');
      await p.fill('#as-q', 'eviction');
      await p.waitForTimeout(150);
      var shown = await p.locator('.arow:not([hidden])').count();
      ok('assumption search narrows the list', shown >= 1 && shown < 6, shown + ' rows');
      /* deal check with the example listing; no Claude in this view */
      await p.click('#tab-deal');
      ok('paste-to-fill explains itself when Claude is unavailable', /cannot reach|by hand/.test(await p.textContent('#view-deal')));
      await p.click('#deal-run');
      await p.waitForFunction(function () { return /Change to your|Can.t close yet/.test(document.getElementById('view-deal').textContent); }, null, { timeout: 90000 });
      ok('the deal check returns a verdict', true);
      ok('it lists lender answers and a checklist', (await p.locator('#view-deal table.data tr').count()) >= 2 && (await p.locator('.checklist li').count()) >= 3);
      ok('no errors in the deal check', o.errors.length === 0, o.errors.slice(0, 3).join(' | '));
    }
    await o.ctx.close();
  }

  console.log('\n===== recommender (small run) =====');
  var cfg = null;
  var FPE = require('./loader.js').loadEngine();
  cfg = FPE.defaultConfig(); cfg.mc.paths = 60;
  var r = await open({ working: { cfg: cfg, wouldDo: null, planId: null, planName: 'Test plan', dirty: true } });
  await settle(r.page);
  await r.page.click('#find-btn');
  await r.page.waitForSelector('.plancard', { timeout: 180000 });
  var cards = await r.page.locator('.plancard').count();
  ok('"Find better plans" proposes plans', cards >= 2, cards + ' cards');
  var hasUse = await r.page.locator('.plancard button:has-text("Use this plan")').count();
  ok('proposals can be adopted', hasUse >= 1);
  if (hasUse) {
    await r.page.locator('.plancard button:has-text("Use this plan")').first().click();
    await r.page.waitForTimeout(300);
    ok('adopting a plan offers an undo', /Undo/.test(await r.page.textContent('#toast')));
  }
  ok('no errors in the recommender', r.errors.length === 0, r.errors.slice(0, 3).join(' | '));
  await r.ctx.close();

  console.log('\n===== phone width =====');
  var m = await open({ viewport: { width: 400, height: 860 } });
  await settle(m.page);
  for (var v2 of ['plan', 'deal', 'next', 'strategies', 'assumptions', 'timeline', 'compare']) {
    await m.page.evaluate(function (v) { UI.go(v); }, v2);
    await m.page.waitForTimeout(200);
    var over = await m.page.evaluate(function () { return document.documentElement.scrollWidth - document.documentElement.clientWidth; });
    var culprits = over > 1 ? await m.page.evaluate(function () {
      var W = document.documentElement.clientWidth, out = [];
      document.querySelectorAll('body *').forEach(function (e) { var r = e.getBoundingClientRect(); if (r.right > W + 1 && r.width > 0 && out.length < 4) out.push(e.tagName + '.' + (e.className && e.className.baseVal == null ? e.className : '') + ' ' + Math.round(r.right)); });
      return out.join(', ');
    }) : '';
    ok('no sideways scroll at 400px: ' + v2, over <= 1, over + 'px ' + culprits);
  }
  if (SHOTS) { await m.page.evaluate(function () { UI.go('plan'); }); await m.page.waitForTimeout(200); await m.page.screenshot({ path: path.join(SHOTS, 'phone-plan.png'), fullPage: false }); }
  ok('no errors at phone width', m.errors.length === 0, m.errors.slice(0, 3).join(' | '));
  await m.ctx.close();

  await browser.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (fail) { console.log('Failures:'); failures.forEach(function (f) { console.log('  - ' + f); }); }
  process.exit(fail ? 1 : 0);
})().catch(function (e) { console.error(e); process.exit(1); });
