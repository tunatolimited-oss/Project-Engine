/* ============================================================================
   SHOULD I BUY THIS ONE? — a listing, filled by hand or from pasted text
   (Claude reads it and says which facts were stated and which it worked
   out), judged inside your plan: the change to your headline, what each
   lender says, when you could close, the most it is worth to you, and
   what to verify before an offer.
   ========================================================================== */
(function (UI) {
  'use strict';
  var h = UI.h, S = UI.state, U = FPE.util;
  var D = S.deal = { form: null, flags: {}, month: null, window: 3, result: null, progress: null, error: null, paste: '', filling: false, fillError: null, fillNote: null, example: null };
  var el = {};

  var FIELDS = [
    ['address', 'Address', 'text'], ['price', 'Asking price', 'money'], ['yearBuilt', 'Year built', 'int'],
    ['annualTax', 'Property tax', 'money', 'a year'], ['annualInsurance', 'Insurance', 'money', 'a year'],
    ['ownerUtilitiesMonthly', 'Utilities you pay', 'money', 'a month'], ['otherMonthlyIncome', 'Other income', 'money', 'a month']
  ];

  function fromLibrary(id) {
    var rec = (S.cfg.properties || []).filter(function (p) { return p.id === id; })[0];
    if (!rec) return blank();
    return {
      address: rec.address || rec.nickname || rec.id, units: rec.units, price: rec.price, yearBuilt: rec.yearBuilt,
      annualTax: rec.annualTax, annualInsurance: rec.annualInsurance, ownerUtilitiesMonthly: rec.ownerUtilitiesMonthly || 0,
      otherMonthlyIncome: rec.otherMonthlyIncome || 0, otherIncomeIsLaundry: !!rec.otherIncomeIsLaundry,
      ownerPaysHeat: !!rec.ownerPaysHeat, condition: rec.condition || 'asis',
      unitBedrooms: (rec.unitBedrooms || []).slice(), unitRents: rec.unitRents.slice(), vacantUnits: (rec.vacantUnits || []).slice()
    };
  }
  function blank() {
    return { address: '', units: 3, price: null, yearBuilt: null, annualTax: null, annualInsurance: null, ownerUtilitiesMonthly: null,
             otherMonthlyIncome: null, otherIncomeIsLaundry: false, ownerPaysHeat: false, condition: 'asis',
             unitBedrooms: [2, 2, 2], unitRents: [null, null, null], vacantUnits: [] };
  }
  function ensure() {
    if (D.form) return;
    var active = (S.cfg.properties || []).filter(function (p) { return p.status === 'active'; });
    D.example = active[0] ? active[0].id : null;
    D.form = D.example ? fromLibrary(D.example) : blank();
    D.flags = {};
    if (D.example) { var rec = active[0]; Object.keys(rec.prov || {}).forEach(function (k) { D.flags[k] = rec.prov[k] === 'verified' || rec.prov[k] === 'stated' ? 'stated' : 'estimated'; }); }
    D.month = S.cfg.plan.startMonth;
  }

  /* ---------------------------------------------------------- the listing */
  function listing() {
    var f = D.form, L = { units: f.units, price: num(f.price), address: f.address || null };
    ['yearBuilt', 'annualTax', 'annualInsurance', 'ownerUtilitiesMonthly', 'otherMonthlyIncome'].forEach(function (k) { var v = num(f[k]); if (v != null) L[k] = v; });
    L.ownerPaysHeat = !!f.ownerPaysHeat; L.otherIncomeIsLaundry = !!f.otherIncomeIsLaundry; L.condition = f.condition;
    L.unitBedrooms = f.unitBedrooms.slice(0, f.units).map(function (b) { return +b; });
    L.unitRents = f.unitRents.slice(0, f.units).map(function (r, i) { return f.vacantUnits.indexOf(i) >= 0 ? 0 : (num(r) || 0); });
    L.vacantUnits = f.vacantUnits.filter(function (i) { return i < f.units; });
    var prov = {};
    Object.keys(D.flags).forEach(function (k) { if (D.flags[k]) prov[k] = D.flags[k]; });
    L.prov = prov;
    return L;
  }
  function num(v) { var x = parseFloat(v); return isFinite(x) ? x : null; }

  /* --------------------------------------------------------------- mount */
  function mount(root) {
    ensure();
    UI.clear(root);
    el.form = h('div');
    el.result = h('div');
    root.appendChild(h('div', { class: 'dealgrid' },
      h('div', { class: 'panel' },
        h('div', { class: 'panel-head' }, h('h2', { class: 'panel-title' }, 'The listing'),
          h('p', { class: 'panel-sub' }, 'Every fact carries a flag: stated in the listing, worked out from what was stated, or estimated because it was missing.')),
        h('div', { class: 'panel-body' }, el.form)),
      h('div', { class: 'panel' },
        h('div', { class: 'panel-head' }, h('h2', { class: 'panel-title' }, 'Against your plan'),
          h('p', { class: 'panel-sub' }, 'The listing is put on offer inside your plan\'s own future; your plan buys it the first month it clears every gate.')),
        h('div', { class: 'panel-body' }, el.result))));
    renderForm();
    renderResult();
  }

  function flagChip(k) {
    var f = D.flags[k];
    return f ? h('span', { class: 'flag', dataset: { f: f } }, f) : h('span', { class: 'flag', dataset: { f: 'estimated' } }, 'missing');
  }
  function setField(k, v) { D.form[k] = v; D.flags[k] = 'stated'; D.result = null; renderResult(); }

  function renderForm() {
    var box = el.form; UI.clear(box);
    /* paste to fill */
    var paste = h('textarea', { class: 'ctl', id: 'deal-paste', placeholder: 'Paste the listing: MLS sheet, broker email, Zillow text, a rent roll…', value: D.paste });
    paste.addEventListener('input', function () { D.paste = paste.value; });
    var fillBtn = h('button', { type: 'button', class: 'btn primary', disabled: D.filling, onclick: fill }, D.filling ? 'Reading the listing…' : 'Fill the form from this text');
    var sampleOk = !!S.caps.sample;
    box.appendChild(h('div', { class: 'field' },
      h('div', { class: 'field-head' }, h('label', { class: 'field-label', for: 'deal-paste' }, 'Paste a listing')),
      paste,
      sampleOk ? h('div', { class: 'btnrow' }, fillBtn, D.filling ? h('button', { type: 'button', class: 'btn ghost', onclick: function () { if (D.ctl) D.ctl.abort(); } }, 'Stop') : null)
               : h('p', { class: 'field-hint' }, 'Reading pasted text needs Claude, which this view of the page cannot reach. Fill the form by hand below.'),
      D.fillError ? h('div', { class: 'callout crit' }, D.fillError) : null,
      D.fillNote ? h('div', { class: 'callout' }, D.fillNote) : null));

    /* start from a library listing */
    var libs = (S.cfg.properties || []).filter(function (p) { return p.status === 'active'; });
    var pick = h('select', { class: 'ctl', id: 'deal-lib' }, h('option', { value: '' }, 'Blank form'),
      libs.map(function (p) { return h('option', { value: p.id, selected: D.example === p.id }, p.id + ' · ' + (p.address || p.nickname) + ' · ' + p.units + ' units'); }));
    pick.addEventListener('change', function () {
      D.example = pick.value || null;
      D.form = pick.value ? fromLibrary(pick.value) : blank();
      D.flags = {};
      var rec = libs.filter(function (p) { return p.id === pick.value; })[0];
      if (rec) Object.keys(rec.prov || {}).forEach(function (k) { D.flags[k] = rec.prov[k] === 'verified' || rec.prov[k] === 'stated' ? 'stated' : 'estimated'; });
      D.result = null; renderForm(); renderResult();
    });
    box.appendChild(h('div', { class: 'field', style: { marginTop: '14px' } },
      h('div', { class: 'field-head' }, h('label', { class: 'field-label', for: 'deal-lib' }, 'Or start from your listings library')), pick,
      D.example ? h('p', { class: 'field-hint' }, 'Example loaded from your library (collected September 2026). Replace any figure with what you know.') : null));

    /* facts */
    var grid = h('div', { class: 'formgrid', style: { marginTop: '14px' } });
    var units = h('select', { class: 'ctl', id: 'deal-units' }, [2, 3, 4, 5, 6, 7, 8].map(function (n) { return h('option', { value: n, selected: D.form.units === n }, n + ' units'); }));
    units.addEventListener('change', function () {
      var n = +units.value; D.form.units = n;
      while (D.form.unitBedrooms.length < n) D.form.unitBedrooms.push(2);
      while (D.form.unitRents.length < n) D.form.unitRents.push(null);
      D.flags.units = 'stated'; D.result = null; renderForm(); renderResult();
    });
    grid.appendChild(h('div', { class: 'field' }, h('div', { class: 'field-head' }, h('label', { class: 'field-label', for: 'deal-units' }, 'Units'), flagChip('units')), units));
    FIELDS.forEach(function (f) {
      var id = 'deal-' + f[0];
      var inp = h('input', { class: 'ctl', id: id, type: f[2] === 'text' ? 'text' : 'number', value: D.form[f[0]] == null ? '' : D.form[f[0]], step: f[2] === 'money' ? 'any' : 1 });
      inp.addEventListener('change', function () { setField(f[0], f[2] === 'text' ? inp.value : (inp.value === '' ? null : +inp.value)); renderFlags(); });
      var ctl = f[2] === 'money' ? h('div', { class: 'affix pre' }, h('span', null, '$'), inp) : inp;
      grid.appendChild(h('div', { class: 'field', style: f[0] === 'address' ? { gridColumn: '1 / -1' } : null },
        h('div', { class: 'field-head' }, h('label', { class: 'field-label', for: id }, f[1], f[3] ? h('span', { style: { color: 'var(--faint)', fontWeight: '500' } }, ' · ' + f[3]) : null), f[0] === 'address' ? null : flagChip(f[0])), ctl));
    });
    var heat = h('input', { type: 'checkbox', id: 'deal-heat', checked: D.form.ownerPaysHeat });
    heat.addEventListener('change', function () { setField('ownerPaysHeat', heat.checked); renderFlags(); });
    var cond = h('select', { class: 'ctl', id: 'deal-cond' }, h('option', { value: 'asis', selected: D.form.condition !== 'refreshed' }, 'Units not updated'),
      h('option', { value: 'refreshed', selected: D.form.condition === 'refreshed' }, 'Units recently updated'));
    cond.addEventListener('change', function () { setField('condition', cond.value); });
    grid.appendChild(h('div', { class: 'field' }, h('div', { class: 'field-head' }, h('label', { class: 'field-label', for: 'deal-cond' }, 'Condition')), cond));
    grid.appendChild(h('div', { class: 'field', style: { alignSelf: 'end' } }, h('label', { class: 'switch', for: 'deal-heat' }, heat, h('span', null, 'You pay the heat (central boiler)'), flagChip('ownerPaysHeat'))));
    box.appendChild(grid);

    /* units */
    var rows = h('div', { class: 'unitrows', style: { marginTop: '14px' } },
      h('div', { class: 'unitrow', style: { color: 'var(--faint)', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em' } },
        h('span', null, 'Unit'), h('span', null, 'Bedrooms'), h('span', null, 'Rent now'), h('span', null, 'Empty')));
    for (var i = 0; i < D.form.units; i++) (function (i) {
      var br = h('select', { class: 'ctl', 'aria-label': 'Unit ' + (i + 1) + ' bedrooms' }, [0, 1, 2, 3, 4].map(function (b) { return h('option', { value: b, selected: +D.form.unitBedrooms[i] === b }, b === 0 ? 'Studio' : b + ' BR'); }));
      br.addEventListener('change', function () { D.form.unitBedrooms[i] = +br.value; D.flags.unitBedrooms = 'stated'; D.result = null; renderResult(); renderFlags(); });
      var vac = D.form.vacantUnits.indexOf(i) >= 0;
      var rent = h('input', { class: 'ctl', type: 'number', 'aria-label': 'Unit ' + (i + 1) + ' rent', value: D.form.unitRents[i] == null ? '' : D.form.unitRents[i], disabled: vac });
      rent.addEventListener('change', function () { D.form.unitRents[i] = rent.value === '' ? null : +rent.value; D.flags.unitRents = 'stated'; D.result = null; renderResult(); renderFlags(); });
      var vc = h('input', { type: 'checkbox', checked: vac, 'aria-label': 'Unit ' + (i + 1) + ' is empty' });
      vc.addEventListener('change', function () {
        var a = D.form.vacantUnits.filter(function (x) { return x !== i; });
        if (vc.checked) a.push(i);
        D.form.vacantUnits = a; rent.disabled = vc.checked; D.result = null; renderResult();
      });
      rows.appendChild(h('div', { class: 'unitrow' }, h('span', null, '#' + (i + 1)), br, h('div', { class: 'affix pre' }, h('span', null, '$'), rent), vc));
    })(i);
    box.appendChild(h('div', { class: 'field-head', style: { marginTop: '14px' } }, h('span', { class: 'field-label' }, 'Units and rents'), flagChip('unitRents')));
    box.appendChild(rows);
    var mkt = D.form.unitBedrooms.slice(0, D.form.units).map(function (b) { return FPE.data.rentByBedroom(b); });
    box.appendChild(h('p', { class: 'field-hint', style: { marginTop: '6px' } }, 'Fargo survey rent for these units: ' + mkt.map(function (m) { return UI.money(m); }).join(', ') + ' (a refreshed unit reaches it; an unrenovated one about ' + Math.round(S.cfg.ops.asIsFactor * 100) + '%).'));

    /* when */
    var when = h('input', { class: 'ctl', type: 'month', id: 'deal-month', value: D.month });
    when.addEventListener('change', function () { if (when.value) { D.month = when.value; D.result = null; renderResult(); } });
    var win = h('input', { class: 'ctl', type: 'number', id: 'deal-window', min: 1, max: 24, value: D.window });
    win.addEventListener('change', function () { D.window = Math.max(1, Math.min(24, +win.value || 3)); D.result = null; renderResult(); });
    box.appendChild(h('div', { class: 'formgrid', style: { marginTop: '14px' } },
      h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'deal-month' }, 'On the market from'), when),
      h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'deal-window' }, 'For how many months'), win)));
    box.appendChild(h('div', { class: 'btnrow', style: { marginTop: '16px' } },
      h('button', { type: 'button', class: 'btn primary', id: 'deal-run', onclick: analyze, disabled: !!D.progress }, D.progress ? 'Checking…' : 'Check it against my plan')));
  }
  function renderFlags() { /* flags live inside the form; re-render cheaply */ var y = window.scrollY; renderForm(); window.scrollTo(0, y); }

  /* ------------------------------------------------------ paste to fill */
  var PROMPT = [
    'You read a real estate listing for a small multifamily building in Fargo, North Dakota, and extract facts for an investment model.',
    'Reply with only one JSON object with exactly these keys:',
    '{"address": string|null, "units": integer|null, "price": number|null, "yearBuilt": integer|null,',
    ' "unitBedrooms": [integer per unit]|null, "unitRents": [monthly rent per unit, 0 for an empty unit]|null, "vacantUnits": [zero-based indexes of empty units],',
    ' "annualTax": number|null, "annualInsurance": number|null, "ownerUtilitiesMonthly": number|null (all utilities the OWNER pays, per month, whole building),',
    ' "ownerPaysHeat": true|false|null, "otherMonthlyIncome": number|null (laundry, garages, storage, per month), "otherIncomeIsLaundry": true|false,',
    ' "condition": "refreshed"|"asis", "notes": string (one or two sentences a buyer should check),',
    ' "prov": {key: "stated"|"derived"} for every non-null key above}',
    'Rules: never invent a number the text does not support — use null. "stated" means the text gives the value directly; "derived" means you computed it from stated numbers',
    '(an annual figure from a monthly one, a total rent split evenly across units — say so in notes). A studio is 0 bedrooms. condition is "refreshed" only if the units are described as recently updated.',
    '', 'Listing text:', '<<<', '%TEXT%', '>>>'
  ].join('\n');

  function fill() {
    var text = (D.paste || '').trim();
    if (!text) { D.fillError = 'Paste some listing text first.'; renderForm(); return; }
    D.filling = true; D.fillError = null; D.fillNote = null;
    D.ctl = new AbortController();
    renderForm();
    S.caps.sample.json(PROMPT.replace('%TEXT%', text.slice(0, 12000)), { signal: D.ctl.signal }).then(function (j) {
      D.filling = false;
      if (!j || typeof j !== 'object') throw { code: 'invalid_json' };
      var f = blank(), flags = {};
      var n = parseInt(j.units, 10);
      f.units = n >= 2 && n <= 8 ? n : (Array.isArray(j.unitRents) && j.unitRents.length >= 2 ? Math.min(8, j.unitRents.length) : 3);
      ['address', 'price', 'yearBuilt', 'annualTax', 'annualInsurance', 'ownerUtilitiesMonthly', 'otherMonthlyIncome'].forEach(function (k) {
        if (j[k] != null && j[k] !== '') { f[k] = k === 'address' ? String(j[k]) : +j[k]; flags[k] = (j.prov && j.prov[k]) === 'derived' ? 'derived' : 'stated'; }
      });
      if (typeof j.ownerPaysHeat === 'boolean') { f.ownerPaysHeat = j.ownerPaysHeat; flags.ownerPaysHeat = (j.prov && j.prov.ownerPaysHeat) === 'derived' ? 'derived' : 'stated'; }
      f.otherIncomeIsLaundry = !!j.otherIncomeIsLaundry;
      f.condition = j.condition === 'refreshed' ? 'refreshed' : 'asis';
      f.unitBedrooms = []; f.unitRents = [];
      for (var i = 0; i < f.units; i++) {
        f.unitBedrooms.push(Array.isArray(j.unitBedrooms) && j.unitBedrooms[i] != null ? Math.max(0, Math.min(4, +j.unitBedrooms[i])) : 2);
        f.unitRents.push(Array.isArray(j.unitRents) && j.unitRents[i] != null ? +j.unitRents[i] : null);
      }
      if (Array.isArray(j.unitBedrooms)) flags.unitBedrooms = (j.prov && j.prov.unitBedrooms) === 'derived' ? 'derived' : 'stated';
      if (Array.isArray(j.unitRents)) flags.unitRents = (j.prov && j.prov.unitRents) === 'derived' ? 'derived' : 'stated';
      f.vacantUnits = Array.isArray(j.vacantUnits) ? j.vacantUnits.map(Number).filter(function (x) { return x >= 0 && x < f.units; }) : [];
      if (j.units != null) flags.units = 'stated';
      D.form = f; D.flags = flags; D.example = null; D.result = null;
      D.fillNote = 'Filled from the text. Facts marked "missing" will be estimated — replace them if you know better.' + (j.notes ? ' Claude noted: ' + j.notes : '');
      renderForm(); renderResult();
    }).catch(function (e) {
      D.filling = false;
      var code = e && e.code;
      if (code === 'cancelled') { renderForm(); return; }
      D.fillError = code === 'not_granted' || code === 'sampling_disabled' ? 'Claude is not allowed for this page, so fill the form by hand.'
        : code === 'rate_limited' ? 'Too many requests just now — try again in a minute.'
        : code === 'invalid_json' ? 'Claude\'s answer could not be read as listing facts. Try again, or paste less text.'
        : code === 'prompt_too_large' ? 'That text is too long — paste just the listing details.'
        : 'Reading the listing failed' + (e && e.message ? ': ' + e.message : '.');
      renderForm();
    });
  }

  /* ------------------------------------------------------------ analysis */
  function analyze() {
    if (!(num(D.form.price) > 0)) { D.error = 'Enter an asking price first.'; renderResult(); return; }
    D.error = null; D.result = null; D.progress = { done: 0, total: 3 };
    renderForm(); renderResult();
    var cfg = U.clone(S.cfg);
    UI.jobs.run('deal', { type: 'deal', cfg: cfg, listing: listing(), month: U.parseMonth(D.month), window: D.window, paths: Math.min(150, cfg.mc.paths), seed: cfg.mc.seed },
      function (stage, d, t) { D.progress = { done: d, total: t }; })
      .then(function (res) { D.progress = null; D.result = res; renderForm(); renderResult(); },
            function (err) { if (err && err.cancelled) return; D.progress = null; D.error = 'The check failed: ' + ((err && err.message) || 'unknown error'); renderForm(); renderResult(); });
  }

  var WHY = FPE.deal.WHY;
  function renderResult() {
    var box = el.result; if (!box) return; UI.clear(box);
    if (D.error) box.appendChild(h('div', { class: 'callout crit' }, D.error));
    if (D.progress) { box.appendChild(h('div', { class: 'empty' }, 'Running your plan with and without it, on the calm run and on simulated futures…')); return; }
    var R = D.result;
    if (!R) {
      box.appendChild(h('div', { class: 'empty' }, 'Fill in the listing and press "Check it against my plan". The answer is the change to your headline — a good building bought at the wrong moment can still make your plan worse.'));
      return;
    }
    var salary = R.kind === 'replaceSalary';
    var fmt = function (v) { return salary ? (v > 0 ? Math.round(v) + ' months sooner' : v < 0 ? Math.round(-v) + ' months later' : 'no change') : UI.money(v, { plus: true }) + '/mo'; };
    var mcD = R.mc ? R.mc.delta : null, d = mcD != null ? mcD : R.delta;
    var cls = d > 0.5 ? 'good' : d < -0.5 ? 'crit' : 'warn';
    if (R.bought) {
      box.appendChild(h('div', { class: 'eyebrow' }, 'Change to your ' + (R.mc ? Math.round(R.mc.base.confidence * 100) + '% case' : 'calm-run headline')));
      box.appendChild(h('div', { class: 'verdict ' + cls }, fmt(d)));
      box.appendChild(h('p', { class: 'sentence', style: { marginTop: '8px', maxWidth: '64ch' } },
        'Your plan buys it in ' + R.bought.label + ' with ' + (FPE.actionPlan.PRODUCT[R.bought.product] || R.bought.product) + (R.bought.ownerOcc ? ' as your home' : '') +
        ', putting ' + UI.money(R.bought.cashToClose) + ' in at closing. ' +
        (R.mc ? 'Calm run: ' + fmt(R.delta) + '. ' : '') +
        (d > 0.5 ? 'It improves the plan.' : d < -0.5 ? 'It makes the plan worse than waiting for what the plan would otherwise buy.' : 'It makes little difference to the plan.')));
    } else {
      box.appendChild(h('div', { class: 'eyebrow' }, 'Not in that window'));
      box.appendChild(h('div', { class: 'verdict warn' }, 'Can\'t close yet'));
      var E = R.earliest || {};
      box.appendChild(h('p', { class: 'sentence', style: { marginTop: '8px', maxWidth: '64ch' } },
        'Offered from ' + UI.monthLabel(R.month) + ' for ' + UI.plural(R.window, 'month') + ', your plan cannot buy it: ' + (E.reason || 'it never clears the gates') + '. ' +
        (E.t != null ? 'On the market longer, your plan could close in ' + UI.monthLabel(E.t) + ' (' + (FPE.actionPlan.PRODUCT[E.product] || E.product) + '), which would change your calm-run headline by ' + fmt(E.delta) + '.'
                     : 'Within five years your plan never could.')));
    }

    /* lenders */
    if (R.lender.length) {
      box.appendChild(h('h3', { style: { fontSize: '14px', margin: '18px 0 8px' } }, 'What each lender says' + (R.firstLook != null ? ' in ' + UI.monthLabel(R.firstLook) : '')));
      box.appendChild(h('div', { class: 'tablewrap' }, h('table', { class: 'data' },
        h('thead', null, h('tr', null, ['Loan', 'Answer', 'Rate', 'Cash to close', 'Payment', 'Test', 'Day one', 'Stabilized'].map(function (x) { return h('th', null, x); }))),
        h('tbody', null, R.lender.map(function (l) {
          var m = l.metrics || {}, test = m.dscr != null ? 'DSCR ' + m.dscr.toFixed(2) : m.noiDscr != null ? 'Coverage ' + m.noiDscr.toFixed(2)
                 : m.selfSufficiency != null ? 'Self-sufficiency ' + m.selfSufficiency.toFixed(2) : m.dti != null ? 'DTI ' + UI.pct(m.dti) : '—';
          return h('tr', null, h('td', { class: 'l' }, FPE.actionPlan.PRODUCT[l.product] || l.product),
            h('td', { class: 'l', style: { color: l.ok ? 'var(--good)' : 'var(--crit)' } }, l.ok ? 'Yes' : l.fails.map(function (f) { return WHY[f.code] || f.code; }).join('; ')),
            h('td', null, UI.pct(l.rate, 2)), h('td', null, UI.money(l.cashToClose)), h('td', null, UI.perMonth(l.payment)), h('td', null, test),
            h('td', { class: l.dayOneCF < 0 ? 'neg' : 'pos' }, UI.perMonth(l.dayOneCF)), h('td', { class: l.stabilizedCF < 0 ? 'neg' : 'pos' }, UI.perMonth(l.stabilizedCF)));
        })))));
      box.appendChild(h('p', { class: 'reading' }, '"Stabilized" is the cash flow once every unit rents at what it can achieve, before income tax. Cash to close includes the down payment, closing costs and any refresh the plan does at purchase.'));
    }

    /* max offer */
    var mo = R.maxOffer;
    if (mo) {
      box.appendChild(h('h3', { style: { fontSize: '14px', margin: '18px 0 6px' } }, 'The most it is worth to your plan'));
      box.appendChild(h('p', { class: 'sentence' }, mo.price == null ? mo.reason
        : h('span', null, h('b', { style: { fontSize: '18px' } }, UI.money(mo.price) + (mo.capped ? '+' : '')), ' against an asking price of ' + UI.money(mo.asked) +
          '. Above that, buying it leaves your calm-run headline lower than not buying it. ' + (mo.capped ? mo.reason : ''))));
    }
    if (R.displaced && R.displaced.length) {
      box.appendChild(h('h3', { style: { fontSize: '14px', margin: '18px 0 6px' } }, 'What it pushes back'));
      box.appendChild(h('ul', { class: 'plain' }, R.displaced.map(function (x) { return h('li', null, x.was + ' → ' + (x.now === 'not bought' ? 'not bought' : 'bought ' + x.now)); })));
    }
    box.appendChild(h('h3', { style: { fontSize: '14px', margin: '18px 0 8px' } }, 'Verify before you offer'));
    box.appendChild(h('ul', { class: 'checklist' }, R.checklist.map(function (c) { return h('li', null, h('div', null, h('b', null, c.what), h('span', null, c.why))); })));
  }

  function update() { if (el.form && document.body.contains(el.form)) { renderForm(); renderResult(); } }
  UI.on('cfg', function () { if (D.result) { D.result = null; if (S.view === 'deal') renderResult(); } });

  UI.views = UI.views || {};
  UI.views.deal = { title: 'Should I buy this one?', mount: mount, update: update };
})(UI);
