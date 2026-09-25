/* ============================================================================
   UI — state, forms, timeline, charts, scenarios, persistence
   ========================================================================== */

var CFG = defaultConfig();
var RES = null;
var SCENARIOS = {};
var ACTIVE_ID = null;
var DB = null;
var saveTimer = null, runTimer = null;
var TAB = 'setup';
var TL_FILTER = 'key';

/* -------------------------------------------------------------- dom helper */
function h(tag, attrs, kids) {
  var el = document.createElement(tag);
  if (attrs) for (var k in attrs) {
    var v = attrs[k];
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2).toLowerCase(), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  if (kids != null) (Array.isArray(kids) ? kids : [kids]).forEach(function (c) {
    if (c == null || c === false) return;
    el.appendChild((typeof c === 'string' || typeof c === 'number')
      ? document.createTextNode(String(c)) : c);
  });
  return el;
}
function $(id) { return document.getElementById(id); }
function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

function getByPath(obj, path) {
  var parts = path.replace(/\[(\d+)\]/g, '.$1').split('.'), cur = obj;
  for (var i = 0; i < parts.length; i++) { if (cur == null) return undefined; cur = cur[parts[i]]; }
  return cur;
}

/* ------------------------------------------------------------------ toast */
var toastEl = null, toastTimer = null;
function toast(msg) {
  if (toastEl) toastEl.remove();
  toastEl = h('div', { class: 'toast', text: msg });
  document.body.appendChild(toastEl);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { if (toastEl) { toastEl.remove(); toastEl = null; } }, 2200);
}

/* ------------------------------------------------------------------ fields */
function info(text) {
  return h('button', { class: 'info', type: 'button', title: text,
                       'aria-label': 'About this field', onclick: function () { toast(text); } }, '?');
}

var FIELD_SEQ = 0;
function field(path, o) {
  o = o || {};
  var id = 'f' + (++FIELD_SEQ);
  var kind = o.kind || 'num';
  var raw = getByPath(CFG, path);
  var input;

  function commit(val) {
    setByPath(CFG, path, val);
    if (o.after) o.after();
    scheduleRun();
    scheduleSave();
  }

  if (kind === 'check') {
    input = h('input', { type: 'checkbox', id: id });
    input.checked = !!raw;
    input.addEventListener('change', function () { commit(input.checked); if (o.rerender) render(); });
    return h('div', { class: 'field' }, [
      h('label', { class: 'check', for: id }, [input, h('span', {}, [o.label, o.note ? ' ' : null, o.note ? info(o.note) : null])]),
      o.hint ? h('div', { class: 'hint' }, o.hint) : null
    ]);
  }

  if (kind === 'select') {
    input = h('select', { class: 'ctl', id: id });
    (o.options || []).forEach(function (op) {
      var opt = h('option', { value: op.v }, op.t);
      if (String(op.v) === String(raw)) opt.selected = true;
      input.appendChild(opt);
    });
    input.addEventListener('change', function () {
      var v = input.value;
      if (o.numeric) v = parseFloat(v);
      commit(v); if (o.rerender) render();
    });
  } else if (kind === 'textarea') {
    input = h('textarea', { class: 'ctl', id: id, rows: 2 });
    input.value = raw == null ? '' : raw;
    input.addEventListener('input', function () { commit(input.value); });
  } else {
    var type = (kind === 'month') ? 'month' : (kind === 'text' ? 'text' : 'number');
    input = h('input', { class: 'ctl', id: id, type: type,
                         step: o.step != null ? o.step : (kind === 'pct' ? 0.05 : (kind === 'money' ? 500 : 1)),
                         min: o.min, max: o.max, inputmode: type === 'number' ? 'decimal' : null });
    input.value = (kind === 'pct') ? round4(raw * 100) : (raw == null ? '' : raw);
    input.addEventListener('input', function () {
      if (kind === 'text' || kind === 'month') { commit(input.value); return; }
      var n = parseFloat(input.value);
      if (isNaN(n)) return;
      commit(kind === 'pct' ? n / 100 : n);
    });
  }

  var wrapped = input;
  if (kind === 'money') wrapped = h('div', { class: 'affix' }, [h('span', { class: 'affix-sym' }, '$'), input]);
  if (kind === 'pct')   wrapped = h('div', { class: 'affix pct' }, [h('span', { class: 'affix-sym' }, '%'), input]);

  return h('div', { class: 'field' }, [
    h('label', { for: id }, [o.label, o.note ? info(o.note) : null]),
    wrapped,
    o.hint ? h('div', { class: 'hint' }, o.hint) : null
  ]);
}
function round4(x) { return Math.round(x * 10000) / 10000; }

/* ------------------------------------------------------------- run + save */
function scheduleRun() {
  clearTimeout(runTimer);
  runTimer = setTimeout(runNow, 140);
}
function runNow() {
  try {
    RES = runSimulation(CFG);
    renderKPIs();
    if (TAB === 'timeline') renderTimeline();
    else if (TAB === 'portfolio') renderPortfolio();
    else if (TAB === 'compare') renderCompare();
    else if (TAB === 'properties') renderDealReadouts();
  } catch (e) {
    console.error('simulation failed', e);
    toast('Simulation error — check the console');
  }
}

function setSaveState(cls, text) {
  var el = $('savestate');
  if (!el) return;
  el.className = 'savestate ' + cls;
  clear(el).appendChild(h('span', { class: 'dot' }));
  el.appendChild(document.createTextNode(text));
}
function scheduleSave() {
  setSaveState('pending', 'Saving…');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveActive, 900);
}
async function saveActive() {
  CFG.meta.updated = new Date().toISOString();
  var payload = { name: CFG.meta.name, config: CFG, updatedAt: CFG.meta.updated };
  try { localStorage.setItem('fpe.active', JSON.stringify({ id: ACTIVE_ID, config: CFG })); } catch (e) {}
  if (!DB || !ACTIVE_ID) { setSaveState('off', 'Saved locally'); return; }
  try {
    await DB.doc('scenarios/' + ACTIVE_ID).set(payload);
    SCENARIOS[ACTIVE_ID] = payload;
    setSaveState('', 'Saved');
  } catch (e) {
    setSaveState('off', 'Saved locally');
  }
}

/* ============================================================================
   KPI STRIP
   ========================================================================== */
function renderKPIs() {
  var el = $('kpis'); if (!el || !RES) return;
  var s = RES.summary;
  var first = s.firstAcquisition;
  var items = [
    { l: 'First purchase', v: first ? first.label : 'Never',
      s: first ? first.property.units + '-unit · ' + fmtMoney(first.property.purchasePrice) : 'nothing clears your rules',
      bad: !first },
    { l: 'Portfolio', v: s.finalProperties + ' / ' + s.finalUnits,
      s: 'properties / units' },
    { l: 'Monthly cash flow', v: fmtDollars(s.finalMonthlyCashFlow),
      s: 'at ' + (RES.rows[RES.rows.length - 1].date.y),
      good: s.finalMonthlyCashFlow > 0, bad: s.finalMonthlyCashFlow < 0 },
    { l: 'Equity', v: fmtMoney(s.finalEquity), s: fmtMoney(s.finalValue) + ' value' },
    { l: 'Net worth', v: fmtMoney(s.finalNetWorth),
      s: 'on ' + fmtMoney(s.totalContributed) + ' contributed' },
    { l: 'Freedom date', v: s.freedomDate ? fmtMonth(s.freedomDate.date) : '—',
      s: s.freedomDate ? 'cash flow covers living costs' : 'not within horizon',
      good: !!s.freedomDate }
  ];
  if (s.brokeAt) items.push({ l: 'Cash shortfall', v: fmtMonth(s.brokeAt.date), s: 'plan breaks here', bad: true });

  clear(el);
  items.forEach(function (k) {
    el.appendChild(h('div', { class: 'kpi' + (k.bad ? ' is-bad' : (k.good ? ' is-good' : '')) }, [
      h('div', { class: 'kpi-label' }, k.l),
      h('div', { class: 'kpi-value' }, k.v),
      h('div', { class: 'kpi-sub' }, k.s)
    ]));
  });
}

/* ============================================================================
   SETUP TAB
   ========================================================================== */
function panel(title, note, body, headExtra) {
  return h('section', { class: 'panel' }, [
    h('div', { class: 'panel-head' }, [
      h('div', {}, [h('h2', { class: 'panel-title' }, title), note ? h('div', { class: 'panel-note' }, note) : null]),
      headExtra || null
    ]),
    h('div', { class: 'panel-body' }, body)
  ]);
}
function src(label, text) {
  return h('details', { class: 'src' }, [h('summary', {}, label), h('div', {}, text)]);
}

function renderSetup() {
  var root = clear($('tab-setup'));

  /* --- horizon & capital --- */
  root.appendChild(panel('Timeline and capital', 'When this starts, how far out it runs, and what you put in.', [
    h('div', { class: 'grid' }, [
      field('setup.startMonth', { kind: 'month', label: 'Start month' }),
      field('setup.horizonYears', { kind: 'num', label: 'Horizon (years)', min: 1, max: 30, step: 1,
        hint: '1–30. Longer runs stay fast.' }),
      field('setup.startingCapital', { kind: 'money', label: 'Starting capital' })
    ]),
    h('div', { class: 'subhead' }, 'Monthly contribution schedule'),
    h('div', { class: 'hint', style: 'font-size:11px;color:var(--faint);margin-bottom:2px' },
      'Add a row each time your savings rate changes. The most recent row on or before a given month applies.'),
    contributionEditor(),
    h('div', { class: 'grid' }, [
      field('setup.personalMonthlyExpenses', { kind: 'money', label: 'Your monthly living expenses',
        note: 'Used for the freedom date and, if you pick the months-based emergency fund, for your cash cushion.' }),
      field('setup.currentHousingCost', { kind: 'money', label: 'Rent you pay now',
        note: 'Only used while you owner-occupy: the rent you stop paying is credited back into the plan.' })
    ])
  ]));

  /* --- tax --- */
  root.appendChild(panel('Taxes', 'Estimate only — not tax advice. Verify with a CPA before acting.', [
    field('setup.modelTaxes', { kind: 'check', label: 'Model income tax and depreciation', rerender: true,
      hint: 'Off = every figure is pre-tax.' }),
    h('div', { class: 'grid' }, [
      field('setup.annualW2Income', { kind: 'money', label: 'Annual W-2 income',
        note: 'Drives the passive-loss allowance, which phases out between $100K and $150K of income.' }),
      field('setup.federalMarginalRate', { kind: 'pct', label: 'Federal marginal rate' }),
      field('setup.stateMarginalRate', { kind: 'pct', label: 'ND marginal rate',
        note: DATA_NOTES.ndIncomeTax })
    ]),
    src('North Dakota income tax, 2026', DATA_NOTES.ndIncomeTax)
  ]));

  /* --- market --- */
  root.appendChild(panel('Fargo market assumptions', 'Researched September 2026. Every value is editable.', [
    h('div', { class: 'grid' }, [
      field('market.appreciation', { kind: 'pct', label: 'Appreciation / yr', note: DATA_NOTES.appreciation }),
      field('market.rentGrowth', { kind: 'pct', label: 'Rent growth / yr', note: DATA_NOTES.rentGrowth }),
      field('market.vacancy', { kind: 'pct', label: 'Vacancy', note: DATA_NOTES.vacancy }),
      field('market.expenseInflation', { kind: 'pct', label: 'General expense inflation / yr' }),
      field('market.insuranceInflation', { kind: 'pct', label: 'Insurance inflation / yr',
        note: DATA_NOTES.insuranceInflation }),
      field('market.insurancePerUnit', { kind: 'money', label: 'Insurance $/unit/yr', step: 25 })
    ]),
    h('div', { class: 'callout warn' }, [
      h('b', {}, 'Insurance is the quiet killer here. '),
      'North Dakota premiums rose 14% in 2024–25 and are projected up another 26% through 2028 — about 8%/yr, not the 3% most models assume. Over a 15-year hold that compounds into real money.'
    ]),
    h('div', { class: 'subhead' }, 'Property tax'),
    h('div', { class: 'grid' }, [
      field('market.propTaxRateResidential', { kind: 'pct', label: 'Rate — 1–3 units', step: 0.01,
        note: DATA_NOTES.propTaxResidential }),
      field('market.propTaxRateCommercial', { kind: 'pct', label: 'Rate — 4+ units', step: 0.01,
        note: DATA_NOTES.propTaxCommercial }),
      field('market.commercialUnitThreshold', { kind: 'num', label: 'Commercial starts at (units)', min: 2, max: 20 }),
      field('market.propTaxCapPct', { kind: 'pct', label: 'Annual increase cap', step: 0.5 })
    ]),
    field('market.applyTaxCap', { kind: 'check', label: 'Apply the 3% annual increase cap (ND HB 1176, 2025)' }),
    field('market.reassessOnSale', { kind: 'check', rerender: true,
      label: 'Reassess to the purchase price after you buy',
      hint: 'A sale is what triggers a reassessment. Across the seven Fargo comps, assessed value ran about 93% of the sale price \u2014 so the seller\u2019s tax bill understates what you will pay.' }),
    CFG.market.reassessOnSale ? h('div', { class: 'grid' }, [
      field('market.assessedToSaleRatio', { kind: 'pct', label: 'Assessed value as % of sale price', step: 1,
        note: 'Measured at 93% across the seven comps. One of them, 1629 2nd Ave S, is assessed ABOVE its sale price at 1.615% effective \u2014 that one is worth appealing.' })
    ]) : null,
    h('div', { class: 'callout' }, [
      h('b', {}, 'North Dakota draws the commercial line at four units, not five. '),
      'A fourplex is taxed as commercial property here — 1.492% of value versus 1.343% for a duplex or triplex, about 11% more tax at the same price. Almost every national underwriting template gets this wrong.'
    ]),
    h('div', { class: 'callout warn' }, [
      h('b', {}, 'Special assessments are not modeled. '),
      'Fargo funds street and utility work through special assessments billed on the tax statement but outside the mill levy. They vary parcel by parcel and can add hundreds to thousands a year. Pull the actual parcel statement before you commit to any property.'
    ]),
    h('div', { class: 'subhead' }, 'Modeling knobs'),
    h('div', { class: 'grid' }, [
      field('market.buildingPctOfValue', { kind: 'pct', label: 'Building share of value', step: 1,
        note: 'Land is not depreciable. 80% building / 20% land is a common split; your assessor statement gives the real one.' }),
      field('market.depreciationYears', { kind: 'num', label: 'Depreciation years', step: 0.5 }),
      field('market.lenderReplacementReservePerUnit', { kind: 'money', label: 'Lender reserve $/unit/yr', step: 25,
        note: 'What the LENDER subtracts when computing DSCR. Lenders use a standard figure like this, not your fuller CapEx accrual — using yours would block deals a bank would actually fund.' }),
      field('market.capexValueCapture', { kind: 'pct', label: 'CapEx recovered in value', step: 5,
        note: 'A new roof costs $14K but rarely adds $14K of value. 50% is a reasonable default.' }),
      field('market.primaryResidenceCredit', { kind: 'money', label: 'ND primary residence credit', step: 100,
        note: DATA_NOTES.primaryResidenceCredit })
    ]),
    field('market.driftListingPrices', { kind: 'check', label: 'Age listing prices with the market',
      hint: 'On: a listing bought in 2032 costs 2032 money. Off: prices stay frozen at what you entered.' }),
    src('Where these Fargo numbers come from', [
      h('p', {}, DATA_NOTES.appreciation), h('p', {}, DATA_NOTES.vacancy),
      h('p', {}, DATA_NOTES.rentGrowth), h('p', {}, DATA_NOTES.insuranceInflation)
    ])
  ]));

  /* --- financing --- */
  root.appendChild(panel('Financing', 'Rates as of September 2026.', [
    h('div', { class: 'subhead' }, 'Rate path'),
    h('div', { class: 'hint', style: 'font-size:11px;color:var(--faint);margin-bottom:2px' },
      'Each purchase locks the rate in effect that year. Add rows to model rates moving over time, or flatten them to test "what if rates never drop".'),
    ratePathEditor(),
    h('div', { class: 'callout' }, [
      h('b', {}, 'DSCR loans currently price below agency investment loans '),
      '— about 6.75% versus 7.75%. That inversion is unusual and worth exploiting on a non-owner-occupied 2–4 unit. It is also unstable, so confirm with live quotes.'
    ]),
    h('div', { class: 'subhead' }, 'Terms'),
    h('div', { class: 'grid' }, [
      field('financing.defaultDownPct', { kind: 'pct', label: 'Down payment — investment', step: 1 }),
      field('financing.ownerOccDownPct', { kind: 'pct', label: 'Down payment — owner-occupied', step: 0.5 }),
      field('financing.loanTermYears', { kind: 'num', label: 'Loan term (years)' }),
      field('financing.closingCostPct', { kind: 'pct', label: 'Closing costs', step: 0.25,
        note: DATA_NOTES.closingCosts }),
      field('financing.conventionalLoanCap', { kind: 'num', label: 'Conventional loan cap',
        note: 'Fannie/Freddie cap you at 10 financed properties. After that the engine switches products.' }),
      field('financing.postCapProduct', { kind: 'select', label: 'After the cap, use',
        options: [{ v: 'dscr', t: 'DSCR loans' }, { v: 'commercial', t: 'Portfolio / commercial' }] })
    ]),
    h('div', { class: 'subhead' }, 'Commercial (5+ units)'),
    h('div', { class: 'grid' }, [
      field('financing.commercialAmortYears', { kind: 'num', label: 'Amortization (years)' }),
      field('financing.commercialBalloonYears', { kind: 'num', label: 'Balloon at (years)' }),
      field('financing.commercialMaxLTV', { kind: 'pct', label: 'Max LTV', step: 1 }),
      field('financing.refiCostPct', { kind: 'pct', label: 'Refinance cost', step: 0.25 })
    ]),
    h('div', { class: 'callout warn' }, [
      h('b', {}, 'A $600K 8-unit does not qualify for agency financing. '),
      'Fannie and Freddie small-balance programs start at $2M. Your 8-unit will be a local bank portfolio loan — expect a higher rate, 20–25 year amortization rather than 30, a 5-year balloon, and recourse. These terms are extrapolated from regional patterns; confirm with Bell Bank, Gate City, Bremer or Choice Bank.'
    ]),
    h('div', { class: 'subhead' }, 'FHA (owner-occupied)'),
    h('div', { class: 'grid' }, [
      field('financing.fhaUpfrontMIP', { kind: 'pct', label: 'Upfront MIP', step: 0.05,
        note: 'Financed into the loan balance.' }),
      field('financing.fhaAnnualMIP', { kind: 'pct', label: 'Annual MIP', step: 0.05 })
    ])
  ]));
}

function contributionEditor() {
  var wrap = h('div', { class: 'rowset' });
  CFG.setup.contributions.forEach(function (c, i) {
    wrap.appendChild(h('div', { class: 'rowitem' }, [
      field('setup.contributions[' + i + '].fromMonth', { kind: 'month', label: 'From' }),
      field('setup.contributions[' + i + '].monthly', { kind: 'money', label: 'Monthly' }),
      h('div', { class: 'rm' }, CFG.setup.contributions.length > 1
        ? h('button', { class: 'btn sm danger', type: 'button', onclick: function () {
            CFG.setup.contributions.splice(i, 1); render(); scheduleRun(); scheduleSave();
          } }, 'Remove') : null)
    ]));
  });
  wrap.appendChild(h('button', { class: 'btn sm', type: 'button', style: 'justify-self:start', onclick: function () {
    var last = CFG.setup.contributions[CFG.setup.contributions.length - 1];
    var d = addMonths(parseMonth(last.fromMonth), 12);
    CFG.setup.contributions.push({ fromMonth: d.y + '-' + String(d.m + 1).padStart(2, '0'), monthly: last.monthly });
    render(); scheduleRun(); scheduleSave();
  } }, '+ Add a change'));
  return wrap;
}

function ratePathEditor() {
  var wrap = h('div', { class: 'rowset' });
  CFG.financing.ratePath.forEach(function (r, i) {
    wrap.appendChild(h('div', { class: 'rowitem' }, [
      field('financing.ratePath[' + i + '].fromYear', { kind: 'num', label: 'From year', step: 1 }),
      field('financing.ratePath[' + i + '].investment', { kind: 'pct', label: 'Investment' }),
      field('financing.ratePath[' + i + '].fha', { kind: 'pct', label: 'FHA' }),
      field('financing.ratePath[' + i + '].dscr', { kind: 'pct', label: 'DSCR' }),
      field('financing.ratePath[' + i + '].commercial', { kind: 'pct', label: 'Commercial' }),
      h('div', { class: 'rm' }, CFG.financing.ratePath.length > 1
        ? h('button', { class: 'btn sm danger', type: 'button', onclick: function () {
            CFG.financing.ratePath.splice(i, 1); render(); scheduleRun(); scheduleSave();
          } }, 'Remove') : null)
    ]));
  });
  wrap.appendChild(h('button', { class: 'btn sm', type: 'button', style: 'justify-self:start', onclick: function () {
    var last = CFG.financing.ratePath[CFG.financing.ratePath.length - 1];
    CFG.financing.ratePath.push(Object.assign({}, last, { fromYear: last.fromYear + 2 }));
    render(); scheduleRun(); scheduleSave();
  } }, '+ Add a rate change'));
  return wrap;
}

/* ============================================================================
   PROPERTIES TAB
   ========================================================================== */
function quickUnderwrite(p) {
  /* Live snapshot at today's rates, so each card shows whether the deal works. */
  var units = p.units || 1;
  var rents = p.unitRents && p.unitRents.length ? p.unitRents : [];
  var gross = rents.reduce(function (a, b) { return a + (+b || 0); }, 0) + (+p.otherMonthlyIncome || 0);
  var price = +p.price || 0;
  var M = CFG.market, F = CFG.financing, R = CFG.rules;
  var taxRate = units >= M.commercialUnitThreshold ? M.propTaxRateCommercial : M.propTaxRateResidential;
  var tax = (p.annualTax != null ? p.annualTax : price * taxRate) / 12;
  var ins = (p.annualInsurance != null ? p.annualInsurance : M.insurancePerUnit * units) / 12;
  var vac = p.rentIsCollected ? 0 : (p.vacancyOverride != null ? p.vacancyOverride : M.vacancy);
  var util = +p.ownerUtilitiesMonthly || 0;
  var egi = gross * (1 - vac);
  var maint = gross * R.maintenancePctOfRent, capex = gross * R.capexPctOfRent;
  var opex = tax + ins + (+p.hoaMonthly || 0) + util + maint + capex;
  var noi = egi - opex;
  var commercial = units >= 5;
  var product = commercial ? 'commercial' : 'investment';
  var rate = rateAt(CFG, product, parseMonth(CFG.setup.startMonth));
  var downPct = commercial ? (1 - F.commercialMaxLTV) : F.defaultDownPct;
  var amort = commercial ? F.commercialAmortYears : F.loanTermYears;
  var pay = pmt(price * (1 - downPct), rate, amort);
  var reserve = M.lenderReplacementReservePerUnit * units / 12;
  var inPlaceDSCR = pay > 0 ? (egi - (opex - capex) - reserve) / pay : 0;

  /* what an underwriter uses: the appraiser's market-rent schedule */
  var mkt = (+p.marketRentPerUnit || 0);
  var lenderGross = gross;
  if (R.dscrUsesMarketRent !== false && mkt > 0) {
    var mg = mkt * units + (+p.otherMonthlyIncome || 0);
    if (mg > lenderGross) lenderGross = mg;
  }
  var lEgi = lenderGross * (1 - vac);
  var lOpex = tax + ins + (+p.hoaMonthly || 0) + util + lenderGross * R.maintenancePctOfRent;
  var lenderNOI = lEgi - lOpex - reserve;

  var cashIn = price * downPct + price * F.closingCostPct + (+p.rehabCost || 0);
  var mktGrossFull = mkt > 0 ? mkt * units : 0;
  return {
    gross: gross, noi: noi, pay: pay, dscr: pay > 0 ? lenderNOI / pay : 0,
    dscrInPlace: inPlaceDSCR, usedMarketRent: lenderGross > gross,
    rentGap: mktGrossFull > 0 ? mktGrossFull - (gross - (+p.otherMonthlyIncome || 0)) : 0,
    rentGapPct: mktGrossFull > 0 && gross > 0 ? (mktGrossFull / (gross - (+p.otherMonthlyIncome || 0)) - 1) : 0,
    util: util,
    cf: noi - pay, cashIn: cashIn, coc: cashIn > 0 ? (noi - pay) * 12 / cashIn : 0,
    cap: price > 0 ? noi * 12 / price : 0, rate: rate, product: product,
    perUnit: units > 0 ? price / units : 0, tax: tax * 12
  };
}

function renderProperties() {
  var root = clear($('tab-properties'));

  root.appendChild(h('div', { class: 'callout' }, [
    h('b', {}, 'These are seven real Fargo sales from June to August 2026. '),
    'Every price, rent, tax bill and stated expense is transcribed from the listing. Where a listing did not give insurance it is estimated at $800 per unit per year, the average of the three that did. Component ages are estimates except the roof on 1629 2nd Ave S, which the listing put at under 8 years.'
  ]));
  root.appendChild(h('div', { class: 'callout warn' }, [
    h('b', {}, 'Read the two DSCR figures together. '),
    '"DSCR today" is what these buildings cover at the rent they actually collect. "DSCR (market rent)" is what a lender computes, because on a 1\u20134 unit investment purchase the underwriter uses the appraiser\u2019s market-rent schedule, not in-place rent. Every one of these seven fails on in-place rent. Most pass on market rent. The gap between those two numbers is your entire business plan.'
  ]));

  root.appendChild(panel('Property library', 'Real listings you could actually go buy. The engine picks the best-scoring affordable one that fits your ladder.', [
    h('div', { class: 'cardlist', id: 'liblist' }, CFG.properties.map(propertyCard))
  ], h('button', { class: 'btn sm primary', type: 'button', onclick: addProperty }, '+ Add property')));

  root.appendChild(panel('Archetypes', 'Used when the library runs out of a given type, so the timeline keeps going. Prices drift with the market over time.', [
    h('div', { class: 'cardlist' }, ['2', '3', '4', '8'].filter(function (k) { return CFG.archetypes[k]; }).map(archetypeCard))
  ]));

  root.appendChild(panel('What the market looks like', 'Sept 2026 asking prices, small sample sizes.', [
    h('div', { class: 'tablewrap' }, marketTable()),
    h('div', { class: 'callout' }, [
      h('b', {}, 'Duplexes are the worst per-unit value in Fargo. '),
      'They price around $128K/unit while triplexes and fourplexes go for about $77K/unit — Fargo duplexes are newer twin-home product competing with owner-occupants, while the 3–4 unit stock is older university-corridor rental. At market prices a Fargo duplex does not clear a 1.25 DSCR test.'
    ]),
    src('Sample sizes and caveats', [h('p', {}, DATA_NOTES.prices), h('p', {}, DATA_NOTES.eightUnit), h('p', {}, DATA_NOTES.rents)])
  ]));
}

function marketTable() {
  var rows = [
    ['915 9th St S', 4, '$420,000', '$105,000', '$1,038', '$1,175', '$4,802', '1.143%', '$0', 1987],
    ['1605 5th Ave S', 4, '$324,000', '$81,000', '$581', '$1,175', '$4,275', '1.319%', '$2,400', 1984],
    ['2814 8th St N', 4, '$325,000', '$81,250', '$835', '$1,175', '$4,501', '1.385%', '$7,400', 1958],
    ['817 9th St S', 3, '$194,500', '$64,833', '$683', '$1,175', '$2,535', '1.303%', '$9,862', 1898],
    ['1629 2nd Ave S', 3, '$224,000', '$74,667', '$900', '$1,175', '$3,617', '1.615%', '$3,240', 1949],
    ['3119-21 10th Ave N', 2, '$267,000', '$133,500', '$1,000', '$1,550', '$2,887', '1.081%', '$1,320', 1975],
    ['3025 18th St S', 2, '$295,000', '$147,500', '$1,318', '$1,550', '$3,861', '1.309%', '$2,460', 1983]
  ];
  return h('table', {}, [
    h('thead', {}, h('tr', {}, ['Sold comp', 'Units', 'Price', 'Per unit', 'Rent now', 'Market rent',
      'Tax/yr', 'Eff. rate', 'Owner utils/yr', 'Built']
      .map(function (x) { return h('th', {}, x); }))),
    h('tbody', {}, rows.map(function (r) {
      return h('tr', {}, r.map(function (c, i) {
        return h('td', { class: i ? 'n' : '' }, String(c));
      }));
    })),
    h('tfoot', {}, h('tr', {}, [
      h('td', {}, '7 sales, 22 units'), h('td', { class: 'n' }, '22'),
      h('td', { class: 'n' }, '$2,049,500'), h('td', { class: 'n' }, '$93,159'),
      h('td', { class: 'n' }, '$873'), h('td', { class: 'n' }, '—'),
      h('td', { class: 'n' }, '$3,782'), h('td', { class: 'n' }, '1.308%'),
      h('td', { class: 'n' }, '$3,812'), h('td', { class: 'n' }, '—')
    ]))
  ]);
}

function propertyCard(p, idx) {
  var u = quickUnderwrite(p);
  var base = 'properties[' + idx + ']';
  var pass = u.dscr >= CFG.rules.minDSCR;
  var card = h('div', { class: 'card' + (p.enabled === false ? ' off' : ''), 'data-idx': idx }, [
    h('div', { class: 'card-head' }, [
      h('input', { class: 'ctl', type: 'text', value: p.nickname || '', style: 'flex:1;min-width:130px;font-family:var(--sans)',
        oninput: function (e) { CFG.properties[idx].nickname = e.target.value; scheduleSave(); } }),
      h('label', { class: 'check', style: 'margin:0' }, [
        (function () {
          var c = h('input', { type: 'checkbox' });
          c.checked = p.enabled !== false;
          c.addEventListener('change', function () {
            CFG.properties[idx].enabled = c.checked; render(); scheduleRun(); scheduleSave();
          });
          return c;
        })(), h('span', {}, 'In play')
      ]),
      h('button', { class: 'btn sm ghost', type: 'button', title: 'Duplicate',
        onclick: function () {
          var copy = JSON.parse(JSON.stringify(CFG.properties[idx]));
          copy.id = 'L' + Date.now().toString(36);
          copy.nickname = (copy.nickname || 'Property') + ' (copy)';
          CFG.properties.splice(idx + 1, 0, copy); render(); scheduleRun(); scheduleSave();
        } }, 'Copy'),
      h('button', { class: 'btn sm danger', type: 'button', onclick: function () {
        CFG.properties.splice(idx, 1); render(); scheduleRun(); scheduleSave();
      } }, 'Delete')
    ]),
    h('div', { class: 'card-body' }, [
      h('div', { class: 'readout', 'data-readout': idx }, dealReadoutCells(u, pass)),
      h('div', { class: 'grid' }, [
        field(base + '.units', { kind: 'num', label: 'Units', min: 1, max: 60, rerender: true,
          after: function () { syncRents(idx); } }),
        field(base + '.price', { kind: 'money', label: 'Purchase price', step: 1000 })
      ]),
      h('div', { class: 'subhead' }, 'Monthly rent per unit — what it collects TODAY'),
      rentEditor(idx),
      h('div', { class: 'grid' }, [
        field(base + '.marketRentPerUnit', { kind: 'money', label: 'Market rent per unit', step: 25,
          note: 'What these units should command. Blank if in-place rent is already market. The gap between the two is the biggest lever in Fargo: 1BR $1,000, 2BR $1,175, 3BR $1,550.' }),
        field(base + '.monthsToMarket', { kind: 'num', label: 'Months to get there', step: 1,
          hint: 'Rents ramp evenly over this window.' }),
        field(base + '.ownerUtilitiesMonthly', { kind: 'money', label: 'Utilities YOU pay / mo', step: 25,
          note: 'Heat, water, sewer, trash, lawn — whatever the landlord covers. In a North Dakota winter this line decides whether a deal works. Five of seven Fargo comps had the owner paying something.' })
      ]),
      field(base + '.rentIsCollected', { kind: 'check',
        label: 'The rent above is already net of vacancy',
        hint: 'Tick this if the listing\u2019s income figure is actual collections rather than scheduled rent, so vacancy is not counted twice.' }),
      h('div', { class: 'grid' }, [
        field(base + '.annualTax', { kind: 'money', label: 'Property tax / yr', step: 50,
          hint: 'Blank = estimate from price at ' + (p.units >= CFG.market.commercialUnitThreshold ? '1.492% (commercial)' : '1.343% (residential)'),
          note: 'A real bill from the listing is treated as the truth and grown from there, never overwritten by the estimate.' }),
        field(base + '.annualInsurance', { kind: 'money', label: 'Insurance / yr', step: 50 }),
        field(base + '.hoaMonthly', { kind: 'money', label: 'HOA / mo', step: 10 }),
        field(base + '.otherMonthlyIncome', { kind: 'money', label: 'Other income / mo', step: 10,
          note: 'Coin laundry, parking, storage.' })
      ]),
      h('div', { class: 'grid' }, [
        field(base + '.rehabCost', { kind: 'money', label: 'Rehab budget', step: 500,
          note: 'Paid in cash at closing, added to the depreciable basis.' }),
        field(base + '.rehabRentBump', { kind: 'money', label: 'Rent bump after rehab', step: 25,
          hint: 'Per unit, per month.' }),
        field(base + '.yearBuilt', { kind: 'num', label: 'Year built', step: 1 }),
        field(base + '.yearRenovated', { kind: 'num', label: 'Year renovated', step: 1 })
      ]),
      h('div', { class: 'subhead' }, 'How you would operate it'),
      h('div', { class: 'grid' }, [
        field(base + '.rentalStrategy', { kind: 'select', label: 'Rental mode', rerender: true,
          options: [{ v: 'ltr', t: 'Long-term lease' },
                    { v: 'mtr', t: 'Mid-term, furnished (30–120 days)' },
                    { v: 'byroom', t: 'By the room' },
                    { v: 'str', t: 'Short-term, nightly' }],
          note: 'Only the nightly mode gets the seven-day tax treatment. Mid-term and by-the-room are rental activities like any lease, so their losses are passive and need REPS. Set the numbers behind each mode on the Strategies tab.' })
      ]),
      (p.rentalStrategy && p.rentalStrategy !== 'ltr')
        ? h('div', { class: 'callout ' + (p.rentalStrategy === 'str' ? 'good' : 'warn') },
            p.rentalStrategy === 'str'
              ? [h('b', {}, 'Nightly: the only mode that escapes the passive rules. '),
                 'Averaging seven days or less of customer use means this is not a rental activity ' +
                 'at all — with material participation the loss offsets your W-2 without REPS. ' +
                 'Furnishing is real cash at closing, and a lender will underwrite this building ' +
                 'on its long-term rent, not on nightly projections.']
              : [h('b', {}, 'Still a rental activity. '),
                 'This mode earns a rent premium but no tax advantage: the average stay is well ' +
                 'over seven days, so losses stay passive and REPS is the only way to use them.'])
        : null,
      h('details', { class: 'src' }, [
        h('summary', {}, 'Big-ticket items — roof, HVAC, water heaters'),
        h('div', {}, [componentEditor(idx)])
      ]),
      h('details', { class: 'src' }, [
        h('summary', {}, 'Alternative financing — seller paper and assumable loans'),
        h('div', {}, [
          field(base + '.sellerFinanceEligible', { kind: 'check',
            label: 'This seller would carry paper',
            hint: 'Leave unset to let the availability share on the Strategies tab decide. Most likely on a long-held, free-and-clear building with a retiring owner.' }),
          h('div', { class: 'grid' }, [
            field(base + '.assumableBalance', { kind: 'money', label: 'Assumable loan balance', step: 5000,
              note: 'Only FHA, VA and USDA loans are assumable. You must pay the seller the whole difference between price and balance in cash.' }),
            field(base + '.assumableRate', { kind: 'pct', label: 'Rate on that loan', step: 0.125 }),
            field(base + '.assumableMonthsElapsed', { kind: 'num', label: 'Months already paid', step: 12 })
          ]),
          p.assumableBalance > 0
            ? h('div', { class: 'callout warn' }, 'Equity gap to fund in cash: ' +
                fmtMoney(Math.max(0, (p.price || 0) - p.assumableBalance)) +
                '. Compare that with the ' + fmtMoney((p.price || 0) * CFG.financing.defaultDownPct) +
                ' you would put down on a normal investment purchase.')
            : null
        ])
      ]),
      field(base + '.notes', { kind: 'textarea', label: 'Notes' })
    ])
  ]);
  return card;
}

function dealReadoutCells(u, pass) {
  var cells = [
    h('div', {}, [h('div', { class: 'k' }, u.usedMarketRent ? 'DSCR (market rent)' : 'DSCR'),
      h('div', { class: 'v ' + (pass ? 'good' : 'bad') }, u.dscr.toFixed(2))]),
    h('div', {}, [h('div', { class: 'k' }, 'DSCR today'),
      h('div', { class: 'v ' + (u.dscrInPlace >= 1.25 ? 'good' : 'bad') }, u.dscrInPlace.toFixed(2))]),
    h('div', {}, [h('div', { class: 'k' }, 'Cash flow/mo'),
      h('div', { class: 'v ' + (u.cf >= 0 ? 'good' : 'bad') }, fmtDollars(u.cf))]),
    h('div', {}, [h('div', { class: 'k' }, 'Cash needed'), h('div', { class: 'v' }, fmtMoney(u.cashIn))]),
    h('div', {}, [h('div', { class: 'k' }, 'Cap rate'), h('div', { class: 'v' }, fmtPct(u.cap))]),
    h('div', {}, [h('div', { class: 'k' }, '$ / unit'), h('div', { class: 'v' }, fmtMoney(u.perUnit))])
  ];
  if (u.rentGap > 0) {
    cells.push(h('div', {}, [h('div', { class: 'k' }, 'Rent gap'),
      h('div', { class: 'v good' }, '+' + fmtDollars(u.rentGap) + '/mo')]));
  }
  if (u.util > 0) {
    cells.push(h('div', {}, [h('div', { class: 'k' }, 'Owner utilities'),
      h('div', { class: 'v bad' }, fmtDollars(u.util) + '/mo')]));
  }
  return cells;
}
function renderDealReadouts() {
  document.querySelectorAll('[data-readout]').forEach(function (el) {
    var idx = +el.getAttribute('data-readout');
    var p = CFG.properties[idx]; if (!p) return;
    var u = quickUnderwrite(p);
    clear(el);
    dealReadoutCells(u, u.dscr >= CFG.rules.minDSCR).forEach(function (c) { el.appendChild(c); });
  });
}

function syncRents(idx) {
  var p = CFG.properties[idx];
  var n = Math.max(1, Math.min(60, Math.round(p.units || 1)));
  p.units = n;
  if (!p.unitRents) p.unitRents = [];
  var fill = p.unitRents.length ? p.unitRents[p.unitRents.length - 1] : 1075;
  while (p.unitRents.length < n) p.unitRents.push(fill);
  p.unitRents.length = n;
}

function rentEditor(idx) {
  var p = CFG.properties[idx];
  syncRents(idx);
  var wrap = h('div', { class: 'grid', style: 'grid-template-columns:repeat(auto-fit,minmax(96px,1fr))' });
  p.unitRents.forEach(function (r, i) {
    wrap.appendChild(field('properties[' + idx + '].unitRents[' + i + ']',
      { kind: 'money', label: 'Unit ' + (i + 1), step: 25 }));
  });
  if (p.unitRents.length > 2) {
    wrap.appendChild(h('div', { class: 'field' }, [
      h('label', {}, 'All units'),
      h('button', { class: 'btn sm', type: 'button', onclick: function () {
        var v = prompt('Set every unit to what monthly rent?', String(p.unitRents[0]));
        var n = parseFloat(v); if (isNaN(n)) return;
        for (var i = 0; i < p.unitRents.length; i++) p.unitRents[i] = n;
        render(); scheduleRun(); scheduleSave();
      } }, 'Set all…')
    ]));
  }
  return wrap;
}

function componentEditor(idx) {
  var p = CFG.properties[idx];
  if (!p.components) p.components = defaultComponents(p.units);
  var wrap = h('div', { class: 'rowset' });
  p.components.forEach(function (c, i) {
    var b = 'properties[' + idx + '].components[' + i + ']';
    wrap.appendChild(h('div', { class: 'rowitem' }, [
      field(b + '.enabled', { kind: 'check', label: c.name }),
      field(b + '.ageYears', { kind: 'num', label: 'Age (yrs)', step: 1 }),
      field(b + '.lifeYears', { kind: 'num', label: 'Life (yrs)', step: 1 }),
      field(b + '.cost', { kind: 'money', label: 'Replace cost', step: 250 })
    ]));
  });
  wrap.appendChild(h('div', { class: 'hint' },
    'Leave an item off when you do not know its age. A checked item is scheduled at age reaching life, drained from the CapEx reserve in that exact month, then recurs on its own cycle.'));
  return wrap;
}

function addProperty() {
  CFG.properties.push({
    id: 'L' + Date.now().toString(36), enabled: true, nickname: 'New listing', units: 4,
    price: 356000, unitRents: [850, 850, 850, 850], marketRentPerUnit: 1175, monthsToMarket: 18,
    annualTax: null, annualInsurance: 3200, hoaMonthly: 0, ownerUtilitiesMonthly: 0,
    yearBuilt: null, yearRenovated: null, rehabCost: 0, rehabRentBump: 0,
    otherMonthlyIncome: 0, vacancyOverride: null, rentIsCollected: false, notes: '', components: null
  });
  render(); scheduleRun(); scheduleSave();
}

function archetypeCard(key) {
  var a = CFG.archetypes[key];
  var b = 'archetypes.' + key;
  var fake = { units: a.units, price: a.price, unitRents: new Array(a.units).fill(a.rentPerUnit),
               marketRentPerUnit: a.marketRentPerUnit || null,
               ownerUtilitiesMonthly: a.ownerUtilitiesMonthly || 0,
               annualInsurance: a.annualInsurance, hoaMonthly: a.hoaMonthly || 0, otherMonthlyIncome: 0,
               annualTax: null, rehabCost: 0 };
  var u = quickUnderwrite(fake);
  return h('div', { class: 'card' }, [
    h('div', { class: 'card-head' }, [h('div', { class: 'nm' }, a.nickname),
      h('span', { class: 'chip' }, a.units + ' units')]),
    h('div', { class: 'card-body' }, [
      h('div', { class: 'readout' }, dealReadoutCells(u, u.dscr >= CFG.rules.minDSCR)),
      h('div', { class: 'grid' }, [
        field(b + '.price', { kind: 'money', label: 'Typical price', step: 1000 }),
        field(b + '.rentPerUnit', { kind: 'money', label: 'In-place rent / unit', step: 25 }),
        field(b + '.marketRentPerUnit', { kind: 'money', label: 'Market rent / unit', step: 25 }),
        field(b + '.annualInsurance', { kind: 'money', label: 'Insurance / yr', step: 50 }),
        field(b + '.ownerUtilitiesMonthly', { kind: 'money', label: 'Owner utilities / mo', step: 25 })
      ])
    ])
  ]);
}

/* ============================================================================
   RULES TAB
   ========================================================================== */
function renderRules() {
  var root = clear($('tab-rules'));

  root.appendChild(panel('Acquisition ladder', 'Which property types you will buy, and when you step up.', [
    ladderEditor(),
    h('div', { class: 'grid' }, [
      field('rules.dealScore', { kind: 'select', label: 'When several deals qualify, buy the best',
        options: [{ v: 'coc', t: 'Cash-on-cash return' }, { v: 'capRate', t: 'Cap rate' },
                  { v: 'dscr', t: 'DSCR (safest)' }, { v: 'cashFlow', t: 'Total monthly cash flow' },
                  { v: 'cashPerUnit', t: 'Cash flow per unit' }] })
    ]),
    h('div', { class: 'subhead' }, 'Deal flow — how many buildings actually exist to buy'),
    field('rules.dealFlow.enabled', { kind: 'check', label: 'Limit how fast you can buy', rerender: true,
      hint: 'Without this the engine assumes an unlimited supply of Fargo multifamily.' }),
    CFG.rules.dealFlow.enabled ? h('div', { class: 'grid' }, [
      field('rules.dealFlow.maxPerYear', { kind: 'num', label: 'Most purchases in one year', step: 1, min: 1 }),
      field('rules.dealFlow.minMonthsBetween', { kind: 'num', label: 'Minimum months between closings', step: 1, min: 0 })
    ]) : null,
    h('div', { class: 'callout crit' }, [
      h('b', {}, 'This is the constraint every projection forgets. '),
      'The seven sold comps in your library span June to August 2026, so the whole Fargo 2–4 unit ' +
      'market turns over on the order of 25 to 30 buildings a year — and you are bidding against ' +
      'people who already own in it. Winning three in a year would be an exceptional year. With ' +
      'this switched off, a fully stacked strategy run buys twelve buildings in a single year, ' +
      'which is not a plan; it is the model running out of market.'
    ])
  ]));

  root.appendChild(panel('Lender gates', 'What has to be true before a purchase can happen.', [
    h('div', { class: 'grid' }, [
      field('rules.minDSCR', { kind: 'num', label: 'Minimum DSCR', step: 0.05,
        note: 'Net operating income divided by debt service, as the lender computes it. 1.20–1.25 is typical.' }),
      field('rules.lenderReserveMonths', { kind: 'num', label: 'Lender reserve (months PITI)', step: 1,
        note: 'Held per financed property. Six months is standard.' }),
      field('rules.defaultMonthsToMarket', { kind: 'num', label: 'Default months to reach market rent', step: 1,
        hint: 'Used for any property without its own figure.' })
    ]),
    field('rules.dscrUsesMarketRent', { kind: 'check',
      label: 'Underwrite DSCR on market rent, as a lender does',
      hint: 'On a 1\u20134 unit investment purchase the underwriter uses the appraiser\u2019s Form 1007 market-rent schedule, not in-place rent. Turn this off to test the harsher question: does the deal work on what it collects today?' }),
    h('div', { class: 'subhead' }, 'Your own emergency fund'),
    h('div', { class: 'grid' }, [
      field('rules.emergencyFund.mode', { kind: 'select', label: 'Sized by', rerender: true,
        options: [{ v: 'months', t: 'Months of living expenses' }, { v: 'dollars', t: 'Fixed amount' }] }),
      CFG.rules.emergencyFund.mode === 'months'
        ? field('rules.emergencyFund.months', { kind: 'num', label: 'Months', step: 1 })
        : field('rules.emergencyFund.dollars', { kind: 'money', label: 'Amount' })
    ]),
    field('rules.requirePositiveCashFlow', { kind: 'check', label: 'Also require the deal to cash flow positive on day one' }),
    h('div', { class: 'callout' }, 'Cash is held in three separate buckets: the lender reserve, your emergency fund, and the CapEx reserve. Only what is left over can go toward a down payment — which is why the timeline sometimes shows you sitting on cash you cannot spend.')
  ]));

  root.appendChild(panel('Operating assumptions', null, [
    h('div', { class: 'grid' }, [
      field('rules.maintenancePctOfRent', { kind: 'pct', label: 'Routine maintenance', step: 0.5,
        note: 'Percent of gross rent. Routine repairs only — big-ticket items are scheduled separately per property.' }),
      field('rules.capexPctOfRent', { kind: 'pct', label: 'CapEx reserve', step: 0.5,
        note: 'Accrues into a pool that pays for component replacements. Maintenance plus CapEx together usually runs 13–18% of gross rent.' })
    ]),
    h('div', { class: 'subhead' }, 'Property management'),
    h('div', { class: 'grid' }, [
      field('rules.management.trigger', { kind: 'select', label: 'Hire when', rerender: true,
        options: [{ v: 'units', t: 'Unit count reaches' }, { v: 'properties', t: 'Property count reaches' },
                  { v: 'profit', t: 'Monthly cash flow reaches' }, { v: 'always', t: 'From day one' },
                  { v: 'never', t: 'Never — self-manage' }] }),
      (CFG.rules.management.trigger === 'units' || CFG.rules.management.trigger === 'properties' || CFG.rules.management.trigger === 'profit')
        ? field('rules.management.threshold', { kind: CFG.rules.management.trigger === 'profit' ? 'money' : 'num', label: 'Threshold', step: CFG.rules.management.trigger === 'profit' ? 250 : 1 })
        : null,
      field('rules.management.feePct', { kind: 'pct', label: 'Management fee', step: 0.5, note: DATA_NOTES.management }),
      field('rules.management.leasingFeePct', { kind: 'pct', label: 'Leasing fee', step: 5,
        hint: 'Percent of one month’s rent, per turnover.' }),
      field('rules.management.turnoverPerYear', { kind: 'num', label: 'Turnover / unit / yr', step: 0.1,
        note: 'Fargo’s university-corridor stock turns over faster than average.' })
    ])
  ]));

  root.appendChild(panel('Owner-occupancy', 'Living in one unit cuts the cash you need to start, but one unit earns nothing while you are in it.', [
    field('rules.ownerOccupyFirst', { kind: 'check', label: 'Owner-occupy the first property', rerender: true,
      hint: 'Uses an FHA loan at a much lower down payment. Applies only to purchase #1; everything after is a standard investment purchase.' }),
    CFG.rules.ownerOccupyFirst ? h('div', { class: 'grid' }, [
      field('rules.ownerOccupyMonths', { kind: 'num', label: 'Months you live there', step: 1,
        note: 'FHA requires 12 months of occupancy.' })
    ]) : null,
    CFG.rules.ownerOccupyFirst ? h('div', { class: 'callout good' }, [
      h('b', {}, 'A bonus specific to North Dakota: '),
      'while you owner-occupy a duplex or triplex you qualify for the $1,600/yr Primary Residence Credit. Investment property does not qualify. A fourplex is commercial-classified here, which likely complicates it — verify with the Tax Commissioner before counting on it.'
    ]) : null
  ]));

  root.appendChild(panel('What happens to the profit', null, [
    h('div', { class: 'grid' }, [
      field('rules.profitMode', { kind: 'select', label: 'Mode', rerender: true,
        options: [{ v: 'reinvestAll', t: 'Reinvest everything' },
                  { v: 'drawAfterThreshold', t: 'Reinvest, then draw after a threshold' },
                  { v: 'fixedDraw', t: 'Draw a fixed amount from day one' }] }),
      CFG.rules.profitMode === 'drawAfterThreshold'
        ? field('rules.drawThreshold', { kind: 'money', label: 'Start drawing once cash flow passes', step: 250 }) : null,
      CFG.rules.profitMode !== 'reinvestAll'
        ? field('rules.drawAmount', { kind: 'money', label: 'Monthly draw', step: 250 }) : null
    ])
  ]));

  root.appendChild(panel('Goals', 'Shown as milestones on the timeline.', [
    h('div', { class: 'grid' }, [
      field('rules.goalMonthlyProfit', { kind: 'money', label: 'Target monthly profit', step: 500 }),
      field('rules.goalEquity', { kind: 'money', label: 'Target equity', step: 50000 })
    ]),
    field('rules.stopWhenGoalMet', { kind: 'check', label: 'Stop acquiring once a goal is met',
      hint: 'Off: keep buying to the horizon and treat goals as markers you pass.' })
  ]));
}

var LADDER_TYPES = [2, 3, 4, 8];
function ladderEditor() {
  var wrap = h('div', { class: 'rowset' });
  CFG.rules.ladder.forEach(function (step, i) {
    var b = 'rules.ladder[' + i + ']';
    var typeBoxes = h('div', { class: 'field' }, [
      h('label', {}, 'Buy these types'),
      h('div', { style: 'display:flex;gap:10px;flex-wrap:wrap;padding-top:3px' }, LADDER_TYPES.map(function (t) {
        var c = h('input', { type: 'checkbox' });
        c.checked = step.types.indexOf(t) >= 0;
        c.addEventListener('change', function () {
          var s = CFG.rules.ladder[i];
          if (c.checked) { if (s.types.indexOf(t) < 0) s.types.push(t); s.types.sort(function (a, b2) { return a - b2; }); }
          else s.types = s.types.filter(function (x) { return x !== t; });
          scheduleRun(); scheduleSave();
        });
        return h('label', { class: 'check', style: 'margin:0' }, [c, h('span', {}, t + 'u')]);
      }))
    ]);
    wrap.appendChild(h('div', { class: 'rowitem', style: 'grid-template-columns:repeat(auto-fit,minmax(130px,1fr))' }, [
      field(b + '.triggerType', { kind: 'select', label: 'Starting when', rerender: true,
        options: [{ v: 'purchases', t: 'Purchase number' }, { v: 'units', t: 'Units owned' },
                  { v: 'profit', t: 'Monthly cash flow' }] }),
      field(b + '.triggerValue', { kind: step.triggerType === 'profit' ? 'money' : 'num', label: 'Reaches',
        step: step.triggerType === 'profit' ? 250 : 1 }),
      typeBoxes,
      h('div', { class: 'rm' }, CFG.rules.ladder.length > 1
        ? h('button', { class: 'btn sm danger', type: 'button', onclick: function () {
            CFG.rules.ladder.splice(i, 1); render(); scheduleRun(); scheduleSave();
          } }, 'Remove') : null)
    ]));
  });
  wrap.appendChild(h('button', { class: 'btn sm', type: 'button', style: 'justify-self:start', onclick: function () {
    var last = CFG.rules.ladder[CFG.rules.ladder.length - 1];
    CFG.rules.ladder.push({ triggerType: 'purchases', triggerValue: (last.triggerValue || 1) + 3, types: [4] });
    render(); scheduleRun(); scheduleSave();
  } }, '+ Add a ladder step'));
  return wrap;
}

