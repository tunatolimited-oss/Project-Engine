/* Drive the built page in a real browser and assert it behaves. */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const FILE = 'file://' + path.join(__dirname, 'dist', 'index.html');
const SHOTS = path.join(__dirname, 'shots');
if (!fs.existsSync(SHOTS)) fs.mkdirSync(SHOTS, { recursive: true });

let pass = 0, fail = 0; const failures = [];
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; failures.push(name + (detail ? ' -> ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' -> ' + detail : '')); }
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox','--disable-dev-shm-usage'] });

  for (const theme of ['light', 'dark']) {
    console.log('\n===== ' + theme.toUpperCase() + ' =====');
    const ctx = await browser.newContext({
      viewport: { width: 1400, height: 1000 },
      colorScheme: theme,
      deviceScaleFactor: 1
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL|ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED|fonts\.googleapis/.test(m.text())) errors.push('console: ' + m.text()); });

    await page.goto(FILE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);

    ok('page loads with no JS errors', errors.length === 0, errors.slice(0, 4).join(' | '));

    /* --- KPI strip populated --- */
    const kpiCount = await page.locator('#kpis .kpi').count();
    ok('KPI strip renders', kpiCount >= 6, kpiCount + ' kpis');
    const firstBuy = await page.locator('#kpis .kpi').first().locator('.kpi-value').textContent();
    ok('first purchase date computed', /\w{3} \d{4}/.test(firstBuy), firstBuy);

    /* --- every tab renders --- */
    const tabs = await page.locator('#tabs .tab').count();
    ok('seven tabs present', tabs === 7, String(tabs));
    const tabNames = ['Setup', 'Properties', 'Rules', 'Strategies', 'Timeline', 'Portfolio', 'Compare & stress'];
    for (let i = 0; i < tabs; i++) {
      await page.locator('#tabs .tab').nth(i).click();
      await page.waitForTimeout(350);
      const visible = await page.locator('main > section:not([hidden])').count();
      ok('tab "' + tabNames[i] + '" shows exactly one panel set', visible === 1, String(visible));
      const panels = await page.locator('main > section:not([hidden]) .panel').count();
      ok('  ...and it has content', panels >= 1, panels + ' panels');
      if (theme === 'light') {
        await page.screenshot({ path: path.join(SHOTS, (i + 1) + '-' + tabNames[i].replace(/\W+/g, '') + '.png'), fullPage: false });
      }
    }
    ok('no errors after visiting every tab', errors.length === 0, errors.slice(0, 4).join(' | '));

    /* --- charts drew --- */
    await page.locator('#tabs .tab').nth(5).click();
    await page.waitForTimeout(400);
    const paths = await page.locator('#tab-portfolio svg path').count();
    ok('portfolio charts drew marks', paths >= 3, paths + ' paths');
    const texts = await page.locator('#tab-portfolio svg text').count();
    ok('charts have axis labels', texts >= 8, texts + ' labels');
    const noNaN = await page.evaluate(() => {
      const bad = [];
      document.querySelectorAll('#tab-portfolio svg path').forEach(p => {
        const d = p.getAttribute('d') || '';
        if (/NaN|Infinity|undefined/.test(d)) bad.push(d.slice(0, 40));
      });
      return bad;
    });
    ok('no NaN in any chart path', noNaN.length === 0, noNaN.join(' | '));

    /* every drawn label must sit inside its own viewBox */
    const clipped = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll('main > section:not([hidden]) svg.chart').forEach(svg => {
        const vb = svg.getAttribute('viewBox').split(/\s+/).map(Number);
        svg.querySelectorAll('text').forEach(t => {
          const b = t.getBBox();
          if (b.x < -1 || b.x + b.width > vb[2] + 1 || b.y < -1 || b.y + b.height > vb[3] + 1) {
            out.push(t.textContent + ' @' + Math.round(b.x) + '+' + Math.round(b.width) + ' of ' + vb[2]);
          }
        });
      });
      return out;
    });
    ok('no chart label overflows its viewBox', clipped.length === 0, clipped.join(' | '));

    const noNaNText = await page.evaluate(() =>
      [...document.querySelectorAll('main > section:not([hidden]) *')]
        .filter(e => e.children.length === 0 && /NaN|undefined|Infinity/.test(e.textContent))
        .map(e => e.textContent).slice(0, 5));
    ok('no NaN/undefined leaked into the UI', noNaNText.length === 0, noNaNText.join(' | '));

    /* --- contrast sanity: body text vs page background --- */
    const contrast = await page.evaluate(() => {
      function lum(c) {
        const m = c.match(/\d+(\.\d+)?/g).map(Number);
        const f = m.slice(0, 3).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); });
        return .2126 * f[0] + .7152 * f[1] + .0722 * f[2];
      }
      const bodyBg = getComputedStyle(document.body).backgroundColor;
      const el = document.querySelector('.tagline');
      const fg = getComputedStyle(el).color;
      const a = lum(bodyBg), b = lum(fg);
      return { ratio: (Math.max(a, b) + .05) / (Math.min(a, b) + .05), bodyBg, fg };
    });
    ok('muted text clears 4.5:1 on the page ground', contrast.ratio >= 4.5,
       contrast.ratio.toFixed(2) + ':1  (' + contrast.fg + ' on ' + contrast.bodyBg + ')');
    ok('body paints an explicit background', !/rgba\(0, 0, 0, 0\)/.test(contrast.bodyBg), contrast.bodyBg);

    /* --- timeline --- */
    await page.locator('#tabs .tab').nth(4).click();
    await page.waitForTimeout(400);
    const tlRows = await page.locator('#tab-timeline .tl-row').count();
    ok('timeline renders rows', tlRows > 5, String(tlRows));
    const deals = await page.locator('#tab-timeline .deal').count();
    ok('acquisitions expand into deal cards', deals >= 1, String(deals));
    await page.locator('#tab-timeline .btn', { hasText: 'Every month' }).click();
    await page.waitForTimeout(500);
    const allRows = await page.locator('#tab-timeline .tl-row').count();
    ok('"every month" shows every month', allRows === 181, String(allRows));
    await page.locator('#tab-timeline .btn', { hasText: 'Acquisitions only' }).click();
    await page.waitForTimeout(350);
    const acqRows = await page.locator('#tab-timeline .tl-row').count();
    ok('"acquisitions only" filters down', acqRows > 0 && acqRows < 20, String(acqRows));

    /* --- editing an input moves the answer --- */
    await page.locator('#tabs .tab').nth(0).click();
    await page.waitForTimeout(300);
    const before = await page.locator('#kpis .kpi').nth(1).locator('.kpi-value').textContent();
    const contrib = page.locator('#tab-setup input[type="number"]').nth(2); // monthly contribution
    await contrib.fill('9000');
    await page.waitForTimeout(600);
    const after = await page.locator('#kpis .kpi').nth(1).locator('.kpi-value').textContent();
    ok('changing the monthly contribution changes the outcome', before !== after, before + ' -> ' + after);
    const firstBuy2 = await page.locator('#kpis .kpi').first().locator('.kpi-value').textContent();
    ok('  and pulls the first purchase earlier', firstBuy2 !== firstBuy, firstBuy + ' -> ' + firstBuy2);
    ok('  acquisition months report the units bought that month', await page.evaluate(() => {
      const r = RES.rows[RES.acquisitions[0].monthIndex];
      return r.units === RES.acquisitions[0].property.units && r.properties === 1;
    }), 'engine row state on the purchase month');
    await contrib.fill('3000');
    await page.waitForTimeout(600);
    const restored = await page.locator('#kpis .kpi').nth(1).locator('.kpi-value').textContent();
    ok('  and restoring the value restores the answer', restored === before, before + ' vs ' + restored);

    /* --- properties tab live readouts --- */
    await page.locator('#tabs .tab').nth(1).click();
    await page.waitForTimeout(400);
    const cards = await page.locator('#liblist .card').count();
    ok('property library renders every entry', cards === 12, String(cards));
    const dscrTexts = await page.locator('#liblist .readout .v').allTextContents();
    ok('deal readouts compute', dscrTexts.length >= 20 && !dscrTexts.some(t => /NaN/.test(t)),
       dscrTexts.slice(0, 6).join(', '));

    /* changing a price updates that card's readout live */
    const dscrBefore = await page.locator('#liblist .card').first().locator('.readout .v').first().textContent();
    const priceInput = page.locator('#liblist .card').first().locator('input[type="number"]').nth(1);
    await priceInput.fill('220000');
    await page.waitForTimeout(600);
    const dscrAfter = await page.locator('#liblist .card').first().locator('.readout .v').first().textContent();
    ok('lowering the price raises DSCR live', parseFloat(dscrAfter) > parseFloat(dscrBefore),
       dscrBefore + ' -> ' + dscrAfter);
    await priceInput.fill('420000');
    await page.waitForTimeout(500);

    /* the fields the sold comps forced in */
    const utilField = await page.locator('#liblist label', { hasText: 'Utilities YOU pay' }).count();
    ok('owner-paid utilities field is present', utilField >= 12, String(utilField));
    const mktField = await page.locator('#liblist label', { hasText: 'Market rent per unit' }).count();
    ok('market rent field is present', mktField >= 12, String(mktField));
    const bothDscr = await page.locator('#liblist .readout .k', { hasText: 'DSCR today' }).count();
    ok('every card shows DSCR on rent collected today', bothDscr === 12, String(bothDscr));
    const gapCells = await page.locator('#liblist .readout .k', { hasText: 'Rent gap' }).count();
    ok('cards with a rent gap surface it', gapCells >= 10, String(gapCells));
    const marketTableRows = await page.locator('#tab-properties table tbody tr').count();
    ok('the sold-comp table lists all seven', marketTableRows === 7, String(marketTableRows));

    /* --- rules tab conditional fields --- */
    await page.locator('#tabs .tab').nth(2).click();
    await page.waitForTimeout(400);
    const selCount = await page.locator('#tab-rules select').count();
    ok('rules tab renders its selects', selCount >= 4, String(selCount));
    const profitSel = page.locator('#tab-rules select').last();
    await profitSel.selectOption('fixedDraw');
    await page.waitForTimeout(500);
    const drawVisible = await page.locator('#tab-rules label', { hasText: 'Monthly draw' }).count();
    ok('choosing a draw mode reveals the draw amount field', drawVisible >= 1, String(drawVisible));
    await profitSel.selectOption('reinvestAll');
    await page.waitForTimeout(400);

    /* --- strategies tab --- */
    await page.locator('#tabs .tab').nth(3).click();
    await page.waitForTimeout(450);
    const stratPanels = await page.locator('#tab-strategies .panel').count();
    ok('strategies tab renders every strategy', stratPanels >= 7, String(stratPanels));
    const stratChecks = await page.locator('#tab-strategies input[type="checkbox"]').count();
    ok('  with toggles', stratChecks >= 4, String(stratChecks));
    const offByDefault = await page.evaluate(() => {
      const s = CFG.strategies;
      return !s.cashOutRefi.enabled && !s.heloc.enabled && !s.exchange.enabled &&
             !s.costSeg.enabled && !s.buydownPoints && CFG.setup.repsFromYear == null;
    });
    ok('  and every one off by default', offByDefault);

    /* switching one on changes the plan */
    const nwBefore = await page.locator('#kpis .kpi').nth(4).locator('.kpi-value').textContent();
    await page.locator('#tab-strategies label', { hasText: 'Refinance to pull cash out' })
      .locator('input').check();
    await page.waitForTimeout(700);
    const nwAfter = await page.locator('#kpis .kpi').nth(4).locator('.kpi-value').textContent();
    ok('  turning on cash-out refi changes the outcome', nwBefore !== nwAfter,
       nwBefore + ' -> ' + nwAfter);
    const refiFields = await page.locator('#tab-strategies label', { hasText: 'Max loan-to-value' }).count();
    ok('  and reveals its controls', refiFields >= 1, String(refiFields));
    const refiEvents = await page.evaluate(() =>
      RES.rows.filter(r => r.events.some(e => e.type === 'refi')).length);
    ok('  refinances appear in the timeline', refiEvents > 0, String(refiEvents));
    await page.locator('#tab-strategies label', { hasText: 'Refinance to pull cash out' })
      .locator('input').uncheck();
    await page.waitForTimeout(600);

    /* ---- new strategy modules ---- */
    ok('strategies tab now carries the paydown and financing panels', stratPanels >= 15,
       String(stratPanels));
    const newOff = await page.evaluate(() => {
      const s = CFG.strategies;
      return !s.paydown.enabled && !s.rateRefi.enabled && !s.opportunityFund.enabled &&
             !s.counterCyclical.enabled && !s.rubs.enabled && !s.ancillary.enabled &&
             !s.taxAppeal.enabled && !s.sellerFinance.enabled && !s.assumable.enabled &&
             s.amortChoice.interestOnlyYears === 0 && !CFG.rules.hurdle.enabled;
    });
    ok('  every new strategy is off by default too', newOff);
    ok('  guardrails ship ON, as asked, and are switchable',
       await page.evaluate(() => CFG.rules.guardrails.enabled === true));

    /* debt paydown: switching it on must change the plan and reveal its controls */
    const nwPre = await page.locator('#kpis .kpi').nth(4).locator('.kpi-value').textContent();
    await page.locator('#tab-strategies label', { hasText: 'Throw surplus cash at principal' })
      .locator('input').check();
    await page.waitForTimeout(800);
    ok('  turning on debt paydown changes the outcome',
       (await page.locator('#kpis .kpi').nth(4).locator('.kpi-value').textContent()) !== nwPre);
    ok('  and reveals the allocation control',
       await page.locator('#tab-strategies label', { hasText: 'Who gets the cash first' }).count() >= 1);
    const paidOff = await page.evaluate(() =>
      RES.rows.filter(r => r.events.some(e => e.type === 'paidoff' || e.type === 'recast')).length);
    ok('  paydowns and recasts appear on the timeline', paidOff > 0, String(paidOff));
    ok('  the run reports principal retired',
       await page.evaluate(() => RES.rows[RES.rows.length - 1].extraPrincipalTotal > 0));
    await page.locator('#tab-strategies label', { hasText: 'Throw surplus cash at principal' })
      .locator('input').uncheck();
    await page.waitForTimeout(600);

    /* seller financing */
    await page.locator('#tab-strategies label', { hasText: 'Pursue seller-financed purchases' })
      .locator('input').check();
    await page.waitForTimeout(800);
    ok('  seller financing is used', await page.evaluate(() =>
      RES.rows[RES.rows.length - 1].sellerFinancedCount > 0));
    await page.locator('#tab-strategies label', { hasText: 'Pursue seller-financed purchases' })
      .locator('input').uncheck();
    await page.waitForTimeout(600);

    /* guardrails: tightening one must block a purchase and say why */
    await page.evaluate(() => { CFG.rules.guardrails.minPortfolioDSCR = 1.1; runNow(); });
    await page.waitForTimeout(900);
    ok('  a tightened guardrail blocks purchases and names itself', await page.evaluate(() =>
      RES.rows.some(r => r.blocked && /^guard/.test(r.blocked.reason))));
    await page.evaluate(() => { CFG.rules.guardrails.minPortfolioDSCR = 0.30; runNow(); });
    await page.waitForTimeout(700);

    /* the rental-mode selector on a property, and the seven-day tax split */
    await page.locator('#tabs button', { hasText: 'Properties' }).click();
    await page.waitForTimeout(400);
    ok('every property offers a rental mode',
       await page.locator('#tab-properties label', { hasText: 'Rental mode' }).count() >= 1);
    await page.evaluate(() => {
      CFG.properties.forEach(p => { p.rentalStrategy = 'str'; });
      Object.keys(CFG.archetypes).forEach(k => { CFG.archetypes[k].rentalStrategy = 'str'; });
      CFG.rules.management.trigger = 'never';
      runNow();
    });
    await page.waitForTimeout(900);
    ok('  a nightly rental books income to the non-passive bucket',
       await page.evaluate(() => RES.rows.some(r => r.taxableNonPassive !== 0)));
    await page.evaluate(() => {
      CFG.properties.forEach(p => { p.rentalStrategy = 'mtr'; });
      Object.keys(CFG.archetypes).forEach(k => { CFG.archetypes[k].rentalStrategy = 'mtr'; });
      runNow();
    });
    await page.waitForTimeout(900);
    ok('  a mid-term rental does not', await page.evaluate(() =>
      RES.rows.every(r => r.taxableNonPassive === 0)));
    await page.evaluate(() => {
      CFG.properties.forEach(p => { p.rentalStrategy = 'ltr'; });
      Object.keys(CFG.archetypes).forEach(k => { CFG.archetypes[k].rentalStrategy = 'ltr'; });
      CFG.rules.management.trigger = 'units';
      runNow(); render();
    });
    await page.waitForTimeout(900);
    await page.locator('#tabs button', { hasText: 'Strategies' }).click();
    await page.waitForTimeout(400);

    /* stack ranking */
    await page.locator('.btn', { hasText: 'Rank the strategies' }).click();
    await page.waitForTimeout(14000);
    const stackRows = await page.locator('#stack-out tbody tr').count();
    ok('strategy ranking reports every variant', stackRows >= 9, String(stackRows));
    if (theme === 'light') {
      await page.screenshot({ path: path.join(SHOTS, '4-Strategies.png') });
    }

    /* --- compare tab: sweep + resilience actually run --- */
    await page.locator('#tabs .tab').nth(6).click();
    await page.waitForTimeout(400);
    await page.locator('.btn', { hasText: 'Run sweep' }).click();
    await page.waitForTimeout(2500);
    const sweepRows = await page.locator('#sweep-out tbody tr').count();
    ok('sweep produces a row per step', sweepRows >= 4, String(sweepRows));
    const sweepBars = await page.locator('#sweep-out svg rect').count();
    ok('sweep draws bars', sweepBars >= 4, String(sweepBars));

    await page.locator('.btn', { hasText: 'Run resilience check' }).click();
    await page.waitForTimeout(4000);
    const resRows = await page.locator('#resilience-out tbody tr').count();
    ok('resilience check reports every shock', resRows === 7, String(resRows));
    const verdicts = await page.locator('#resilience-out .chip').allTextContents();
    ok('  and each carries a verdict', verdicts.length === 7, verdicts.join(' | '));

    /* stress switch changes things */
    const recCheck = page.locator('#tab-compare input[type="checkbox"]').first();
    await recCheck.check();
    await page.waitForTimeout(700);
    const recFields = await page.locator('#tab-compare label', { hasText: 'Rents fall by' }).count();
    ok('enabling a recession reveals its controls', recFields >= 1, String(recFields));
    await recCheck.uncheck();
    await page.waitForTimeout(500);

    if (theme === 'light') {
      await page.locator('#tabs .tab').nth(6).click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(SHOTS, '7-Compare-run.png') });
    }

    ok('still no JS errors after the full pass', errors.length === 0, errors.slice(0, 5).join(' | '));

    /* --- phone width --- */
    await page.setViewportSize({ width: 390, height: 850 });
    await page.locator('#tabs .tab').nth(5).click();
    await page.waitForTimeout(600);
    const overflow = await page.evaluate(() =>
      ({ doc: document.documentElement.scrollWidth, win: window.innerWidth }));
    ok('no horizontal page scroll at 390px', overflow.doc <= overflow.win + 1,
       overflow.doc + ' vs ' + overflow.win);
    const gutter = await page.evaluate(() => {
      const w = document.querySelector('main.wrap');
      return parseFloat(getComputedStyle(w).paddingLeft);
    });
    ok('side gutter is at least 16px', gutter >= 16, gutter + 'px');
    if (theme === 'light') await page.screenshot({ path: path.join(SHOTS, '7-phone.png'), fullPage: false });

    await ctx.close();
  }

  await browser.close();
  console.log('\n' + '='.repeat(56));
  console.log('PASS: ' + pass + '   FAIL: ' + fail);
  if (failures.length) { console.log('\nFAILURES:'); failures.forEach(f => console.log('  x ' + f)); process.exit(1); }
  console.log('Browser tests all passed.');
})();

