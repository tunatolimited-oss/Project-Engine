/* ============================================================================
   COMPARE TAB — stress, scenarios, sweeps, resilience
   ========================================================================== */
var SWEEP = { path: 'setup.contributions[0].monthly', from: 1500, to: 6000, step: 750 };
var SWEEP_VARS = [
  { p: 'setup.contributions[0].monthly', t: 'Monthly contribution', from: 1500, to: 6000, step: 750, kind: 'money' },
  { p: 'setup.startingCapital', t: 'Starting capital', from: 0, to: 80000, step: 10000, kind: 'money' },
  { p: 'market.vacancy', t: 'Vacancy rate', from: 0.03, to: 0.15, step: 0.02, kind: 'pct' },
  { p: 'market.appreciation', t: 'Appreciation rate', from: 0.0, to: 0.06, step: 0.01, kind: 'pct' },
  { p: 'market.rentGrowth', t: 'Rent growth', from: 0.0, to: 0.06, step: 0.01, kind: 'pct' },
  { p: 'market.insuranceInflation', t: 'Insurance inflation', from: 0.03, to: 0.13, step: 0.02, kind: 'pct' },
  { p: 'financing.ratePath[0].investment', t: 'Investment loan rate', from: 0.055, to: 0.095, step: 0.005, kind: 'pct' },
  { p: 'financing.defaultDownPct', t: 'Down payment', from: 0.15, to: 0.35, step: 0.05, kind: 'pct' },
  { p: 'rules.minDSCR', t: 'Minimum DSCR', from: 1.0, to: 1.5, step: 0.1, kind: 'num' },
  { p: 'rules.lenderReserveMonths', t: 'Lender reserve months', from: 0, to: 12, step: 2, kind: 'num' }
];
var SWEEP_RESULT = null;
var COMPARE_SEL = {};

function renderCompare() {
  var root = clear($('tab-compare'));
  if (!RES) return;

  /* ---------------------------------------------------------- stress ---- */
  var st = CFG.stress;
  root.appendChild(panel('Stress tests', 'Deterministic switches, not random noise — so when a number moves you know your change caused it, not the dice.', [
    h('div', { class: 'subhead' }, 'Recession'),
    field('stress.recession.enabled', { kind: 'check', label: 'Run a recession', rerender: true }),
    st.recession.enabled ? h('div', { class: 'grid' }, [
      field('stress.recession.startYear', { kind: 'num', label: 'Starting year', step: 1 }),
      field('stress.recession.durationYears', { kind: 'num', label: 'Lasting (years)', step: 1 }),
      field('stress.recession.rentDropPct', { kind: 'pct', label: 'Rents fall by', step: 1 }),
      field('stress.recession.vacancyAddPts', { kind: 'pct', label: 'Vacancy rises by', step: 1 }),
      field('stress.recession.appreciationOverride', { kind: 'pct', label: 'Appreciation becomes', step: 0.5 })
    ]) : null,

    h('div', { class: 'subhead' }, 'Rate shock'),
    field('stress.rateShock.enabled', { kind: 'check', label: 'Push rates up across the board', rerender: true }),
    st.rateShock.enabled ? h('div', { class: 'grid' }, [
      field('stress.rateShock.fromYear', { kind: 'num', label: 'From year', step: 1 }),
      field('stress.rateShock.addPct', { kind: 'pct', label: 'Add to every rate', step: 0.25 })
    ]) : null,

    h('div', { class: 'subhead' }, 'Specific events'),
    eventEditor(),
    h('div', { class: 'callout' }, 'Place an event on a month and watch how many months it pushes your next acquisition back. That number — the delay, not the dollar cost — is what a bad tenant actually costs you.')
  ]));

  /* ------------------------------------------------------ resilience ---- */
  root.appendChild(panel('Resilience check', 'Runs your plan against four standard shocks at once and reports what survives.', [
    h('div', { class: 'btn-row' }, [
      h('button', { class: 'btn primary', type: 'button', onclick: runResilience }, 'Run resilience check'),
      h('span', { class: 'panel-note' }, 'Takes about a second.')
    ]),
    h('div', { id: 'resilience-out', style: 'margin-top:12px' })
  ]));

  /* -------------------------------------------------------- scenarios --- */
  var ids = Object.keys(SCENARIOS);
  root.appendChild(panel('Scenarios', 'Save the current setup under a name, then compare them side by side.',
    [
      h('div', { class: 'btn-row', style: 'margin-bottom:11px' }, [
        h('button', { class: 'btn primary', type: 'button', onclick: saveAsNew }, '+ Save current as a new scenario'),
        h('button', { class: 'btn', type: 'button', onclick: exportJSON }, 'Export JSON'),
        h('button', { class: 'btn', type: 'button', onclick: importJSON }, 'Import JSON'),
        h('button', { class: 'btn danger', type: 'button', onclick: resetAll }, 'Reset to Fargo defaults')
      ]),
      ids.length ? h('div', { class: 'rowset' }, ids.map(scenarioRow))
                 : h('div', { class: 'empty' }, 'No saved scenarios yet. Save this one to start comparing.'),
      ids.length > 1 ? h('div', { style: 'margin-top:13px' }, [
        h('div', { class: 'subhead' }, 'Comparison'),
        h('div', { id: 'compare-out' }, buildComparison())
      ]) : null
    ]));

  /* ------------------------------------------------------------ sweep --- */
  var cur = SWEEP_VARS.filter(function (v) { return v.p === SWEEP.path; })[0] || SWEEP_VARS[0];
  root.appendChild(panel('Sensitivity sweep', 'Pick one variable, run the whole plan across a range of it, and see exactly how much the answer moves.', [
    h('div', { class: 'grid' }, [
      h('div', { class: 'field' }, [
        h('label', {}, 'Variable'),
        (function () {
          var sel = h('select', { class: 'ctl' });
          SWEEP_VARS.forEach(function (v) {
            var o = h('option', { value: v.p }, v.t);
            if (v.p === SWEEP.path) o.selected = true;
            sel.appendChild(o);
          });
          sel.addEventListener('change', function () {
            var v = SWEEP_VARS.filter(function (x) { return x.p === sel.value; })[0];
            SWEEP = { path: v.p, from: v.from, to: v.to, step: v.step };
            SWEEP_RESULT = null; renderCompare();
          });
          return sel;
        })()
      ]),
      numField('From', SWEEP.from, cur.kind, function (v) { SWEEP.from = v; }),
      numField('To', SWEEP.to, cur.kind, function (v) { SWEEP.to = v; }),
      numField('Step', SWEEP.step, cur.kind === 'pct' ? 'pct' : cur.kind, function (v) { SWEEP.step = v; })
    ]),
    h('div', { class: 'btn-row', style: 'margin-top:10px' }, [
      h('button', { class: 'btn primary', type: 'button', onclick: runSweepNow }, 'Run sweep')
    ]),
    h('div', { id: 'sweep-out', style: 'margin-top:12px' }, SWEEP_RESULT ? sweepOutput(cur) : null)
  ]));
}

function numField(label, value, kind, onset) {
  var inp = h('input', { class: 'ctl', type: 'number',
    step: kind === 'pct' ? 0.25 : (kind === 'money' ? 250 : 0.05),
    value: kind === 'pct' ? round4(value * 100) : value });
  inp.addEventListener('input', function () {
    var n = parseFloat(inp.value); if (isNaN(n)) return;
    onset(kind === 'pct' ? n / 100 : n);
  });
  return h('div', { class: 'field' }, [h('label', {}, label),
    kind === 'pct' ? h('div', { class: 'affix pct' }, [h('span', { class: 'affix-sym' }, '%'), inp])
                   : (kind === 'money' ? h('div', { class: 'affix' }, [h('span', { class: 'affix-sym' }, '$'), inp]) : inp)]);
}

function eventEditor() {
  var wrap = h('div', { class: 'rowset' });
  CFG.stress.events.forEach(function (e, i) {
    var b = 'stress.events[' + i + ']';
    wrap.appendChild(h('div', { class: 'rowitem', style: 'grid-template-columns:repeat(auto-fit,minmax(118px,1fr))' }, [
      field(b + '.enabled', { kind: 'check', label: 'On' }),
      field(b + '.type', { kind: 'select', label: 'What', rerender: true,
        options: [{ v: 'vacancy', t: 'Extended vacancy' }, { v: 'eviction', t: 'Eviction' }, { v: 'capex', t: 'Major repair' }] }),
      field(b + '.month', { kind: 'month', label: 'When' }),
      field(b + '.propertySeq', { kind: 'num', label: 'Property #', step: 1, hint: 'Blank = first' }),
      e.type === 'vacancy' || e.type === 'eviction'
        ? field(b + '.months', { kind: 'num', label: 'Months vacant', step: 1 }) : null,
      e.type !== 'vacancy' ? field(b + '.amount', { kind: 'money', label: 'Cost', step: 500 }) : null,
      h('div', { class: 'rm' }, h('button', { class: 'btn sm danger', type: 'button', onclick: function () {
        CFG.stress.events.splice(i, 1); render(); scheduleRun(); scheduleSave();
      } }, 'Remove'))
    ]));
  });
  wrap.appendChild(h('button', { class: 'btn sm', type: 'button', style: 'justify-self:start', onclick: function () {
    var d = addMonths(parseMonth(CFG.setup.startMonth), 30);
    CFG.stress.events.push({ enabled: true, type: 'vacancy', month: d.y + '-' + String(d.m + 1).padStart(2, '0'),
      months: 4, unitsAffected: 1, amount: 6000, propertySeq: 1, label: 'Bad tenant' });
    render(); scheduleRun(); scheduleSave();
  } }, '+ Add an event'));
  return wrap;
}

/* --------------------------------------------------------- resilience --- */
function runResilience() {
  var out = clear($('resilience-out'));
  out.appendChild(h('div', { class: 'empty' }, 'Running…'));
  setTimeout(function () {
    var base = JSON.parse(JSON.stringify(CFG));
    base.stress = { recession: { enabled: false }, rateShock: { enabled: false }, events: [] };
    var b = runSimulation(base);

    var tests = [
      { n: 'Mild recession', d: '2 yrs, rents -5%, vacancy +4pts, no appreciation',
        f: function (c) { c.stress.recession = { enabled: true, startYear: parseMonth(c.setup.startMonth).y + 3,
          durationYears: 2, rentDropPct: 0.05, vacancyAddPts: 0.04, appreciationOverride: 0 }; } },
      { n: 'Deep recession', d: '3 yrs, rents -12%, vacancy +8pts, values -3%/yr',
        f: function (c) { c.stress.recession = { enabled: true, startYear: parseMonth(c.setup.startMonth).y + 3,
          durationYears: 3, rentDropPct: 0.12, vacancyAddPts: 0.08, appreciationOverride: -0.03 }; } },
      { n: 'Rate shock', d: '+2% on every rate from year 3',
        f: function (c) { c.stress.rateShock = { enabled: true, fromYear: parseMonth(c.setup.startMonth).y + 3, addPct: 0.02 }; } },
      { n: 'Fargo vacancy spike', d: 'vacancy to 12% permanently — the 2013-18 pattern',
        f: function (c) { c.market.vacancy = 0.12; } },
      { n: 'Insurance runs hot', d: '13%/yr instead of 8%',
        f: function (c) { c.market.insuranceInflation = 0.13; } },
      { n: 'Bad tenant every 5 yrs', d: '4 months vacant plus $6K, on each property',
        f: function (c) {
          c.stress.events = [];
          for (var y = 2; y < c.setup.horizonYears; y += 5) {
            var d = addMonths(parseMonth(c.setup.startMonth), y * 12);
            c.stress.events.push({ enabled: true, type: 'eviction', month: d.y + '-' + String(d.m + 1).padStart(2, '0'),
              months: 4, unitsAffected: 1, amount: 6000, propertySeq: 1 });
          }
        } }
    ];

    var results = tests.map(function (t) {
      var c = JSON.parse(JSON.stringify(base));
      t.f(c);
      var r = runSimulation(c);
      return { t: t, r: r };
    });

    clear(out);
    out.appendChild(h('div', { class: 'tablewrap' }, h('table', {}, [
      h('thead', {}, h('tr', {}, ['Shock', 'Properties', 'Monthly cash flow', 'Net worth', 'vs baseline', 'Survives?']
        .map(function (c) { return h('th', {}, c); }))),
      h('tbody', {}, [h('tr', {}, [
        h('td', {}, h('b', {}, 'Baseline — no shock')),
        h('td', { class: 'n' }, String(b.summary.finalProperties)),
        h('td', { class: 'n' }, fmtDollars(b.summary.finalMonthlyCashFlow)),
        h('td', { class: 'n' }, fmtMoney(b.summary.finalNetWorth)),
        h('td', { class: 'n' }, '—'),
        h('td', {}, h('span', { class: 'chip good' }, [h('i', { class: 'dot' }), 'reference']))
      ])].concat(results.map(function (x) {
        var d = x.r.summary.finalNetWorth - b.summary.finalNetWorth;
        var pct = d / Math.max(1, b.summary.finalNetWorth);
        var broke = !!x.r.summary.brokeAt;
        var stalled = x.r.summary.finalProperties === 0;
        var ok = !broke && !stalled && x.r.summary.finalMonthlyCashFlow > 0;
        return h('tr', {}, [
          h('td', {}, [h('div', {}, x.t.n), h('div', { style: 'font-size:11px;color:var(--faint)' }, x.t.d)]),
          h('td', { class: 'n' }, String(x.r.summary.finalProperties)),
          h('td', { class: 'n', style: x.r.summary.finalMonthlyCashFlow < 0 ? 'color:var(--crit-ink)' : '' },
            fmtDollars(x.r.summary.finalMonthlyCashFlow)),
          h('td', { class: 'n' }, fmtMoney(x.r.summary.finalNetWorth)),
          h('td', { class: 'n', style: 'color:' + (d < 0 ? 'var(--crit-ink)' : 'var(--good-ink)') }, fmtPct(pct, 0)),
          h('td', {}, broke ? h('span', { class: 'chip crit' }, [h('i', { class: 'dot' }), 'cash runs out ' + fmtMonth(x.r.summary.brokeAt.date)])
            : (stalled ? h('span', { class: 'chip crit' }, [h('i', { class: 'dot' }), 'never buys'])
            : (ok ? h('span', { class: 'chip good' }, [h('i', { class: 'dot' }), 'survives'])
                  : h('span', { class: 'chip warn' }, [h('i', { class: 'dot' }), 'strained']))))
        ]);
      })))
    ])));

    var worst = results.reduce(function (a, x) {
      return x.r.summary.finalNetWorth < a.r.summary.finalNetWorth ? x : a; }, results[0]);
    var anyBreak = results.some(function (x) { return x.r.summary.brokeAt || x.r.summary.finalProperties === 0; });
    out.appendChild(h('div', { class: 'callout ' + (anyBreak ? 'crit' : 'good'), style: 'margin-top:11px' },
      anyBreak
        ? 'At least one standard shock breaks this plan. The weakest point is "' + worst.t.n +
          '". Before treating the baseline as your plan, either raise your reserves, lower your leverage, or accept a slower pace.'
        : 'This plan survives every standard shock. The worst of them, "' + worst.t.n + '", costs you ' +
          fmtPct(Math.abs((worst.r.summary.finalNetWorth - b.summary.finalNetWorth) / Math.max(1, b.summary.finalNetWorth)), 0) +
          ' of net worth but does not break it.'));
  }, 30);
}

/* ---------------------------------------------------------- scenarios --- */
function scenarioRow(id) {
  var sc = SCENARIOS[id];
  var isActive = id === ACTIVE_ID;
  var cb = h('input', { type: 'checkbox' });
  cb.checked = COMPARE_SEL[id] !== false;
  cb.addEventListener('change', function () {
    COMPARE_SEL[id] = cb.checked;
    var o = $('compare-out'); if (o) { clear(o).appendChild(buildComparison()); }
  });
  return h('div', { class: 'scn' + (isActive ? ' active' : '') }, [
    h('label', { class: 'check', style: 'margin:0' }, [cb, h('span', {}, 'Compare')]),
    h('span', { class: 'nm' }, sc.name + (isActive ? ' (editing)' : '')),
    h('span', { class: 'mt' }, sc.updatedAt ? new Date(sc.updatedAt).toLocaleDateString() : ''),
    isActive ? null : h('button', { class: 'btn sm', type: 'button', onclick: function () { loadScenario(id); } }, 'Open'),
    h('button', { class: 'btn sm ghost', type: 'button', onclick: function () {
      var n = prompt('Rename scenario', sc.name); if (!n) return;
      sc.name = n; if (isActive) CFG.meta.name = n;
      persistScenario(id, sc); render();
    } }, 'Rename'),
    h('button', { class: 'btn sm danger', type: 'button', onclick: function () { deleteScenario(id); } }, 'Delete')
  ]);
}

function buildComparison() {
  var ids = Object.keys(SCENARIOS).filter(function (id) { return COMPARE_SEL[id] !== false; }).slice(0, 5);
  if (ids.length < 2) return h('div', { class: 'empty' }, 'Tick at least two scenarios to compare.');
  var cols = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)', 'var(--s5)'];
  var runs = ids.map(function (id, i) {
    var cfg = (id === ACTIVE_ID) ? CFG : SCENARIOS[id].config;
    var r;
    try { r = runSimulation(JSON.parse(JSON.stringify(cfg))); } catch (e) { return null; }
    return { id: id, name: SCENARIOS[id].name, res: r, color: cols[i % cols.length] };
  }).filter(Boolean);
  if (runs.length < 2) return h('div', { class: 'empty' }, 'Could not run these scenarios.');

  var maxLen = Math.max.apply(null, runs.map(function (r) { return r.res.rows.length; }));
  var labels = runs[0].res.rows.map(function (r) { return fmtMonthShort(r.date); });
  while (labels.length < maxLen) labels.push('');
  var series = runs.map(function (r) {
    var v = r.res.rows.map(function (x) { return x.netWorth; });
    while (v.length < maxLen) v.push(v[v.length - 1] || 0);
    return { name: r.name, color: r.color, values: v };
  });

  var rowsDef = [
    ['First purchase', function (r) { return r.res.summary.firstAcquisition ? r.res.summary.firstAcquisition.label : 'never'; }],
    ['2nd purchase', function (r) { return r.res.acquisitions[1] ? r.res.acquisitions[1].label : '—'; }],
    ['3rd purchase', function (r) { return r.res.acquisitions[2] ? r.res.acquisitions[2].label : '—'; }],
    ['Properties', function (r) { return String(r.res.summary.finalProperties); }],
    ['Units', function (r) { return String(r.res.summary.finalUnits); }],
    ['Monthly cash flow', function (r) { return fmtDollars(r.res.summary.finalMonthlyCashFlow); }],
    ['Equity', function (r) { return fmtMoney(r.res.summary.finalEquity); }],
    ['Net worth', function (r) { return fmtMoney(r.res.summary.finalNetWorth); }],
    ['You contributed', function (r) { return fmtMoney(r.res.summary.totalContributed); }],
    ['Multiple on contributions', function (r) { return (r.res.summary.finalNetWorth / Math.max(1, r.res.summary.totalContributed)).toFixed(2) + 'x'; }],
    ['Freedom date', function (r) { return r.res.summary.freedomDate ? fmtMonth(r.res.summary.freedomDate.date) : '—'; }]
  ];

  return h('div', {}, [
    chart({ series: series, xLabels: labels, height: 250, label: 'Net worth by scenario' }),
    legend(series),
    h('div', { class: 'tablewrap', style: 'margin-top:11px' }, h('table', {}, [
      h('thead', {}, h('tr', {}, [h('th', {}, '')].concat(runs.map(function (r) {
        return h('th', { style: 'text-align:right' }, [
          h('i', { style: 'display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:6px;background:' + r.color }),
          r.name]);
      })))),
      h('tbody', {}, rowsDef.map(function (rd) {
        return h('tr', {}, [h('td', {}, rd[0])].concat(runs.map(function (r) {
          return h('td', { class: 'n' }, rd[1](r));
        })));
      }))
    ]))
  ]);
}

async function saveAsNew() {
  var name = prompt('Name this scenario', CFG.meta.name === 'Baseline' ? 'Baseline' : CFG.meta.name + ' copy');
  if (!name) return;
  var id = 'sc' + Date.now().toString(36);
  CFG.meta.name = name;
  var payload = { name: name, config: JSON.parse(JSON.stringify(CFG)), updatedAt: new Date().toISOString() };
  SCENARIOS[id] = payload;
  ACTIVE_ID = id;
  await persistScenario(id, payload);
  await persistActiveId();
  toast('Saved "' + name + '"');
  render();
}
async function persistScenario(id, payload) {
  SCENARIOS[id] = payload;
  try { localStorage.setItem('fpe.scenarios', JSON.stringify(SCENARIOS)); } catch (e) {}
  if (!DB) return;
  try { await DB.doc('scenarios/' + id).set(payload); } catch (e) { console.warn('save failed', e); }
}
async function persistActiveId() {
  try { localStorage.setItem('fpe.activeId', ACTIVE_ID || ''); } catch (e) {}
  if (!DB) return;
  try { await DB.doc('app/state').set({ activeId: ACTIVE_ID }); } catch (e) {}
}
function loadScenario(id) {
  var sc = SCENARIOS[id]; if (!sc) return;
  CFG = migrate(JSON.parse(JSON.stringify(sc.config)));
  ACTIVE_ID = id;
  persistActiveId();
  toast('Opened "' + sc.name + '"');
  render(); runNow();
}
async function deleteScenario(id) {
  if (!confirm('Delete "' + SCENARIOS[id].name + '"? This cannot be undone.')) return;
  delete SCENARIOS[id];
  delete COMPARE_SEL[id];
  try { localStorage.setItem('fpe.scenarios', JSON.stringify(SCENARIOS)); } catch (e) {}
  if (DB) { try { await DB.doc('scenarios/' + id).delete(); } catch (e) {} }
  if (ACTIVE_ID === id) { ACTIVE_ID = Object.keys(SCENARIOS)[0] || null; if (ACTIVE_ID) loadScenario(ACTIVE_ID); }
  render();
}

/* -------------------------------------------------------------- sweeps --- */
function runSweepNow() {
  var out = clear($('sweep-out'));
  out.appendChild(h('div', { class: 'empty' }, 'Running…'));
  setTimeout(function () {
    var steps = Math.floor((SWEEP.to - SWEEP.from) / SWEEP.step) + 1;
    if (steps < 2 || steps > 40) { clear(out).appendChild(h('div', { class: 'callout warn' },
      'That range gives ' + steps + ' runs. Pick a range that produces between 2 and 40.')); return; }
    try {
      SWEEP_RESULT = runSweep(CFG, SWEEP);
      var cur = SWEEP_VARS.filter(function (v) { return v.p === SWEEP.path; })[0] || SWEEP_VARS[0];
      clear(out).appendChild(sweepOutput(cur));
    } catch (e) {
      clear(out).appendChild(h('div', { class: 'callout crit' }, 'Sweep failed: ' + e.message));
    }
  }, 30);
}

function sweepOutput(cur) {
  var r = SWEEP_RESULT;
  var fmtV = function (v) { return cur.kind === 'pct' ? fmtPct(v, 2) : (cur.kind === 'money' ? fmtMoney(v) : String(round4(v))); };
  var labels = r.map(function (x) { return fmtV(x.value); });

  return h('div', {}, [
    barChart({
      values: r.map(function (x) { return x.netWorth; }),
      labels: labels,
      subLabels: r.map(function (x) { return x.firstAcq || 'never buys'; }),
      valueLabels: r.map(function (x) { return fmtMoney(x.netWorth); }),
      height: 230, colors: r.map(function () { return 'var(--s1)'; })
    }),
    h('div', { class: 'chart-note' }, 'Bars are net worth at the end of the horizon. The small label under each bar is when the first purchase happens.'),
    h('div', { class: 'tablewrap', style: 'margin-top:11px' }, h('table', {}, [
      h('thead', {}, h('tr', {}, [cur.t, '1st buy', '2nd', '3rd', 'Props', 'Units', 'Cash flow/mo', 'Equity', 'Net worth', 'Freedom']
        .map(function (c) { return h('th', {}, c); }))),
      h('tbody', {}, r.map(function (x) {
        return h('tr', {}, [
          h('td', { class: 'n' }, fmtV(x.value)),
          h('td', { class: 'n' }, x.acqDates[0] || '—'),
          h('td', { class: 'n' }, x.acqDates[1] || '—'),
          h('td', { class: 'n' }, x.acqDates[2] || '—'),
          h('td', { class: 'n' }, String(x.properties)),
          h('td', { class: 'n' }, String(x.units)),
          h('td', { class: 'n' }, fmtDollars(x.monthlyCashFlow)),
          h('td', { class: 'n' }, fmtMoney(x.equity)),
          h('td', { class: 'n' }, fmtMoney(x.netWorth)),
          h('td', { class: 'n' }, x.freedom ? fmtMonth(x.freedom) : '—')
        ]);
      }))
    ]))
  ]);
}

/* -------------------------------------------------------- export/import -- */
function exportJSON() {
  var blob = { version: 1, exported: new Date().toISOString(), active: CFG,
               scenarios: SCENARIOS };
  var txt = JSON.stringify(blob, null, 2);
  navigator.clipboard && navigator.clipboard.writeText(txt).then(function () {
    toast('Copied to clipboard — paste into a file to keep it');
  }, function () { showBlob(txt); });
  if (!navigator.clipboard) showBlob(txt);
}
function showBlob(txt) {
  var ta = h('textarea', { class: 'ctl', rows: 12, style: 'width:100%;font-family:var(--mono);font-size:11px' });
  ta.value = txt;
  var out = $('compare-out') || $('tab-compare');
  out.appendChild(h('div', { style: 'margin-top:10px' }, [h('div', { class: 'subhead' }, 'Copy this'), ta]));
  ta.select();
}
function importJSON() {
  var txt = prompt('Paste an exported JSON blob');
  if (!txt) return;
  try {
    var blob = JSON.parse(txt);
    if (blob.scenarios) {
      Object.keys(blob.scenarios).forEach(function (id) {
        SCENARIOS[id] = blob.scenarios[id];
        persistScenario(id, blob.scenarios[id]);
      });
    }
    if (blob.active) { CFG = migrate(blob.active); }
    else if (blob.setup) { CFG = migrate(blob); }
    toast('Imported');
    render(); runNow(); scheduleSave();
  } catch (e) { alert('That did not parse as JSON.'); }
}
function resetAll() {
  if (!confirm('Reset every input back to the Fargo defaults? Your saved scenarios are kept.')) return;
  var name = CFG.meta.name;
  CFG = defaultConfig();
  CFG.meta.name = name;
  render(); runNow(); scheduleSave();
  toast('Reset to defaults');
}

/* ============================================================================
   SHELL
   ========================================================================== */
var TABS = [
  { id: 'setup', t: 'Setup', f: renderSetup },
  { id: 'properties', t: 'Properties', f: renderProperties },
  { id: 'rules', t: 'Rules', f: renderRules },
  { id: 'strategies', t: 'Strategies', f: renderStrategies },
  { id: 'timeline', t: 'Timeline', f: renderTimeline },
  { id: 'portfolio', t: 'Portfolio', f: renderPortfolio },
  { id: 'compare', t: 'Compare & stress', f: renderCompare }
];

function render() {
  var tabsEl = clear($('tabs'));
  TABS.forEach(function (t) {
    tabsEl.appendChild(h('button', { class: 'tab', role: 'tab', type: 'button',
      'aria-selected': TAB === t.id ? 'true' : 'false',
      onclick: function () { setTab(t.id); } }, t.t));
  });
  TABS.forEach(function (t) {
    var el = $('tab-' + t.id);
    el.hidden = (t.id !== TAB);
  });
  var active = TABS.filter(function (t) { return t.id === TAB; })[0];
  if (active) active.f();
  var sn = $('scenario-name');
  if (sn) sn.textContent = CFG.meta.name || 'Untitled';
}
function setTab(id) {
  TAB = id;
  try { localStorage.setItem('fpe.tab', id); } catch (e) {}
  render();
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
}

/* ------------------------------------------------------------- migration -- */
function migrate(cfg) {
  var d = defaultConfig();
  function fill(target, def) {
    for (var k in def) {
      if (target[k] === undefined) target[k] = JSON.parse(JSON.stringify(def[k]));
      else if (def[k] && typeof def[k] === 'object' && !Array.isArray(def[k]) && typeof target[k] === 'object')
        fill(target[k], def[k]);
    }
  }
  cfg = cfg || {};
  fill(cfg, d);
  if (!Array.isArray(cfg.properties)) cfg.properties = d.properties;
  if (!Array.isArray(cfg.setup.contributions) || !cfg.setup.contributions.length)
    cfg.setup.contributions = d.setup.contributions;
  if (!Array.isArray(cfg.financing.ratePath) || !cfg.financing.ratePath.length)
    cfg.financing.ratePath = d.financing.ratePath;
  if (!Array.isArray(cfg.rules.ladder) || !cfg.rules.ladder.length) cfg.rules.ladder = d.rules.ladder;
  if (!Array.isArray(cfg.stress.events)) cfg.stress.events = [];
  return cfg;
}

/* ------------------------------------------------------------------ boot -- */
async function boot() {
  /* local first, so the page is usable instantly */
  try {
    var ls = localStorage.getItem('fpe.scenarios');
    if (ls) SCENARIOS = JSON.parse(ls) || {};
    var la = localStorage.getItem('fpe.active');
    if (la) { var o = JSON.parse(la); if (o && o.config) { CFG = migrate(o.config); ACTIVE_ID = o.id || null; } }
    var lt = localStorage.getItem('fpe.tab');
    if (lt && TABS.some(function (t) { return t.id === lt; })) TAB = lt;
  } catch (e) {}

  render();
  runNow();

  /* then the durable store, if this viewer has it */
  try {
    DB = await claude.use('db');
  } catch (e) { DB = null; }

  if (!DB) { setSaveState('off', 'Saved in this browser only'); return; }
  setSaveState('', 'Saved');

  try {
    var snap = await DB.collection('scenarios').limit(50).get();
    var found = {};
    snap.docs.forEach(function (d2) { var v = d2.data(); if (v && v.config) found[d2.id] = v; });
    if (Object.keys(found).length) {
      SCENARIOS = found;
      try { localStorage.setItem('fpe.scenarios', JSON.stringify(SCENARIOS)); } catch (e) {}
      var st = await DB.doc('app/state').get();
      var wantId = st.exists && st.data().activeId;
      if (wantId && SCENARIOS[wantId]) { ACTIVE_ID = wantId; CFG = migrate(JSON.parse(JSON.stringify(SCENARIOS[wantId].config))); }
      else { ACTIVE_ID = Object.keys(SCENARIOS)[0]; CFG = migrate(JSON.parse(JSON.stringify(SCENARIOS[ACTIVE_ID].config))); }
      render(); runNow();
    } else {
      /* first visit on this account — seed the baseline so there is something to come back to */
      ACTIVE_ID = 'sc-baseline';
      await persistScenario(ACTIVE_ID, { name: CFG.meta.name || 'Baseline',
        config: JSON.parse(JSON.stringify(CFG)), updatedAt: new Date().toISOString() });
      await persistActiveId();
      render();
    }
  } catch (e) {
    console.warn('store unavailable', e);
    setSaveState('off', 'Saved in this browser only');
  }
}

var BOOTED = false;
document.addEventListener('DOMContentLoaded', function () { if (!BOOTED) { BOOTED = true; boot(); } });
if (document.readyState !== 'loading' && !BOOTED) { BOOTED = true; boot(); }

