/* ============================================================================
   WHICH PLAN IS BEST? — the headline at your chosen confidence, the spread
   of futures over time, better plans on request, what the answer rests on,
   cash between purchases, and the plan in brief.
   ========================================================================== */
(function (UI) {
  'use strict';
  var h = UI.h, S = UI.state, U = FPE.util;
  var el = {};

  function confPct() { return Math.round(+S.cfg.plan.objective.confidence * 100) + '%'; }
  function isSalary() { return S.cfg.plan.objective.kind === 'replaceSalary'; }
  function realOn() { return S.cfg.plan.objective.realDollars !== false; }
  function cpiAt(i) { return Math.pow(1 + S.cfg.market.cpi, i / 12); }
  function targetIdx() { return U.parseMonth(S.cfg.plan.objective.targetMonth) - U.parseMonth(S.cfg.plan.startMonth); }
  /* the engine works in today's dollars; show nominal when asked */
  function showMoney(v, i) { return realOn() || v == null ? v : v * cpiAt(i == null ? targetIdx() : i); }
  function dollarsWord() { return realOn() ? 'in today\'s dollars' : 'in the dollars of the day'; }

  function mount(root) {
    UI.clear(root);
    el.head = h('div', { class: 'headline', id: 'headline' });
    el.fanBox = h('div', { class: 'chartbox' });
    el.fanLegend = h('div', { class: 'legend' });
    el.fanReading = h('p', { class: 'reading' });
    el.rec = h('div');
    el.rests = h('div');
    el.cashBox = h('div', { class: 'chartbox' });
    el.cashLegend = h('div', { class: 'legend' });
    el.brief = h('div');
    root.appendChild(el.head);
    root.appendChild(h('div', { class: 'panel' },
      h('div', { class: 'panel-head' }, h('h2', { class: 'panel-title' }, 'Income over time'),
        h('p', { class: 'panel-sub' }, 'After-tax income from the portfolio, averaged over the previous 12 months.')),
      h('div', { class: 'panel-body' }, el.fanBox, el.fanLegend, el.fanReading)));
    root.appendChild(h('div', { class: 'panel', id: 'find-plans' },
      h('div', { class: 'panel-head' }, h('h2', { class: 'panel-title' }, 'Find better plans'),
        h('p', { class: 'panel-sub' }, 'Proposals only. Nothing changes in your plan until you choose one.')),
      h('div', { class: 'panel-body' }, el.rec)));
    root.appendChild(h('div', { class: 'cols2' },
      h('div', { class: 'panel' },
        h('div', { class: 'panel-head' }, h('h2', { class: 'panel-title' }, 'What this rests on'),
          h('p', { class: 'panel-sub' }, 'Each uncertain input moved to its plausible low and high, one at a time.')),
        h('div', { class: 'panel-body' }, el.rests)),
      h('div', { class: 'panel' },
        h('div', { class: 'panel-head' }, h('h2', { class: 'panel-title' }, 'Cash between purchases'),
          h('p', { class: 'panel-sub' }, 'The balance your plan keeps, and how low it gets in a bad future.')),
        h('div', { class: 'panel-body' }, el.cashBox, el.cashLegend))));
    root.appendChild(h('div', { class: 'panel', style: { marginTop: '16px' } },
      h('div', { class: 'panel-head' }, h('h2', { class: 'panel-title' }, 'The plan in brief'),
        h('p', { class: 'panel-sub' }, 'The calm-economy run: every input at its most likely value, no recession, no job loss.')),
      h('div', { class: 'panel-body' }, el.brief)));
    UI.charts.watch(el.fanBox, drawFan);
    UI.charts.watch(el.cashBox, drawCash);
    update();
  }

  /* ------------------------------------------------------------- headline */
  function headlineValue() {
    var mc = S.mc, base = S.base;
    if (mc) return { src: 'mc', h: mc.headline };
    if (!base) return null;
    var sm = base.summary;
    if (isSalary()) {
      var need = FPE.objective.salaryTarget(S.cfg);
      var hit = FPE.objective.firstReach(base.rows.map(function (r) { return r.trailingIncomeReal; }), sm.start, need);
      return { src: 'base', h: { kind: 'replaceSalary', value: hit, salary: need, confidence: 1 } };
    }
    return { src: 'base', h: { kind: 'incomeByDate', value: sm.ruined ? 0 : sm.incomeAtTargetReal, target: sm.target } };
  }

  function renderHeadline() {
    var box = el.head; UI.clear(box);
    var hv = headlineValue();
    if (!hv) { box.appendChild(h('div', { class: 'empty' }, S.baseError ? 'The plan could not run: ' + S.baseError.message : 'Running…')); return; }
    var H = hv.h, fromMc = hv.src === 'mc', target = U.parseMonth(S.cfg.plan.objective.targetMonth);
    box.classList.toggle('stale', fromMc && S.mcStale);
    var left = h('div');
    left.appendChild(h('div', { class: 'eyebrow' }, fromMc ? 'Your headline · ' + confPct() + ' of ' + UI.num(S.mc.paths) + ' simulated futures'
                                                            : 'Calm-economy run · simulated futures ' + (S.cfg.mc.enabled === false ? 'switched off' : 'on the way')));
    if (H.kind === 'replaceSalary') {
      left.appendChild(h('div', { class: 'bignum' }, H.value == null ? 'Not yet' : UI.monthLabel(H.value)));
      left.appendChild(h('p', { class: 'sentence' }, H.value == null
        ? 'The portfolio does not replace your take-home pay (' + UI.perMonth(H.salary) + ', ' + dollarsWord() + ') within ' + S.cfg.plan.horizonYears + ' years' + (fromMc ? ' in ' + confPct() + ' of futures.' : '.')
        : (fromMc ? 'In ' + confPct() + ' of futures, the' : 'The') + ' portfolio replaces your take-home pay of ' + UI.perMonth(H.salary) + ' (' + dollarsWord() + ') by ' + UI.monthLabel(H.value) + '.'));
      if (fromMc) left.appendChild(h('div', { class: 'trio' },
        kv('Median future', UI.monthLabel(H.median)), kv('One future in ten', H.bad == null ? 'later than the horizon' : 'after ' + UI.monthLabel(H.bad)),
        kv('Ever gets there', UI.pct(H.shareEver))));
    } else {
      var v = showMoney(H.value);
      left.appendChild(h('div', { class: 'bignum' }, UI.money(v), h('small', null, '/mo')));
      left.appendChild(h('p', { class: 'sentence' },
        (fromMc ? 'In ' + confPct() + ' of futures the portfolio pays you at least this much' : 'The portfolio pays you this much') +
        ' after tax by ' + UI.monthLabel(target) + ', ' + dollarsWord() + '.'));
      var calm = S.base ? showMoney(S.base.summary.ruined ? 0 : S.base.summary.incomeAtTargetReal) : null;
      if (fromMc) left.appendChild(h('div', { class: 'trio' },
        kv('Median future', UI.perMonth(showMoney(H.median))),
        kv('One future in ten below', UI.perMonth(showMoney(H.bad))),
        kv('Calm economy', UI.perMonth(calm), 'no recession, no job loss')));
    }
    if (S.mcProgress) {
      left.appendChild(h('div', { class: 'progress' }, h('i', { id: 'mc-bar', style: { width: (100 * S.mcProgress.done / Math.max(1, S.mcProgress.total)) + '%' } })));
      left.appendChild(h('div', { class: 'progress-label', id: 'mc-label' }, 'Simulating futures… ' + S.mcProgress.done + ' of ' + S.mcProgress.total));
    } else if (S.mcError) left.appendChild(h('div', { class: 'callout crit', style: { marginTop: '10px' } }, 'Simulated futures failed: ' + S.mcError));
    box.appendChild(left);

    var right = h('div', { class: 'riskgrid' });
    if (fromMc) {
      var pr = H.pRuin, fs = S.mc.forcedShare;
      right.appendChild(risk('Runs out of cash', UI.pct(pr, pr > 0 && pr < 0.01 ? 1 : 0), pr === 0 ? 'good' : pr < 0.05 ? 'warn' : 'crit', 'A future where cash goes below zero even after drawing credit and selling.'));
      right.appendChild(risk('Has to sell a building to stay afloat', UI.pct(fs, fs > 0 && fs < 0.01 ? 1 : 0), fs === 0 ? 'good' : fs < 0.05 ? 'warn' : 'crit'));
      right.appendChild(risk('Part-time, in ' + confPct() + ' of futures, by', H.partTimeAt == null ? 'not within ' + S.cfg.plan.horizonYears + ' years' : UI.monthLabel(H.partTimeAt)));
      right.appendChild(risk('Quit, in ' + confPct() + ' of futures, by', H.quitAt == null ? 'not within ' + S.cfg.plan.horizonYears + ' years' : UI.monthLabel(H.quitAt)));
      right.appendChild(risk('Units at the end (median)', UI.num(H.units.p50)));
      right.appendChild(risk('Worth, if sold at the end (median)', UI.money(realOn() ? H.sold.p50 : H.sold.p50 * cpiAt(S.base ? S.base.summary.end - S.base.summary.start : 0), { compact: true })));
    } else if (S.base) {
      var sm = S.base.summary;
      right.appendChild(risk('Units at the end', UI.num(sm.units)));
      right.appendChild(risk('Part-time from', UI.monthLabel(sm.partTime)));
      right.appendChild(risk('Quit from', UI.monthLabel(sm.quit)));
      right.appendChild(risk('Worth, if sold at the end', UI.money(realOn() ? sm.soldNWReal : sm.soldNW, { compact: true })));
    }
    box.appendChild(right);
  }
  function kv(k, v, sub) { return h('div', null, h('div', { class: 'kv-k' }, k), h('div', { class: 'kv-v' }, v), sub ? h('div', { class: 'kv-s' }, sub) : null); }
  function risk(k, v, cls, title) { return h('div', { class: 'riskrow', title: title || null }, h('span', { class: 'k' }, k), h('span', { class: 'v ' + (cls || '') }, v)); }

  /* ---------------------------------------------------------- income chart */
  function drawFan() {
    if (!el.fanBox || !S.base) return;
    var rows = S.base.rows, start = S.base.summary.start;
    var base = rows.map(function (r) { return r.trailingIncomeReal; });
    var need = isSalary() ? rows.map(function () { return FPE.objective.salaryTarget(S.cfg); })
                          : rows.map(function (r) { return r.costs / r.cpi; });
    var target = U.parseMonth(S.cfg.plan.objective.targetMonth);
    UI.clear(el.fanLegend);
    if (S.mc && S.mc.fan) {
      UI.charts.fan(el.fanBox, { fan: S.mc.fan, hq: S.mc.hq, start: start, target: isSalary() ? null : target, base: base, need: need,
                                 convert: function (v, i) { return showMoney(v, i); }, height: 320 });
      el.fanLegend.appendChild(h('span', null, h('i', { style: { background: 'var(--band-outer)', border: '1px solid var(--band-inner)' } }), 'Middle 80% of futures'));
      el.fanLegend.appendChild(h('span', null, h('i', { style: { background: 'var(--band-inner)' } }), 'Middle 60%'));
      el.fanLegend.appendChild(h('span', null, h('i', { class: 'line', style: { background: 'var(--accent)', height: '3px' } }), confPct() + ' case (your headline)'));
      el.fanLegend.appendChild(h('span', null, h('i', { class: 'line', style: { background: 'var(--accent)', opacity: '0.55', height: '2px' } }), 'Median'));
    } else {
      UI.charts.lines(el.fanBox, { start: start, months: rows.length, target: isSalary() ? null : target, height: 320,
        series: [{ values: base.map(function (v, i) { return showMoney(v, i); }), color: 'var(--accent)', width: 2.4 },
                 { values: need.map(function (v, i) { return showMoney(v, i); }), color: 'var(--chart-need)', width: 1.5, dash: '1 3' }] });
    }
    el.fanLegend.appendChild(h('span', null, h('i', { class: 'dash' }), 'Calm economy'));
    el.fanLegend.appendChild(h('span', null, h('i', { class: 'line', style: { background: 'var(--chart-need)', height: '2px' } }), isSalary() ? 'Take-home pay to replace' : 'What you live on'));
    el.fanReading.textContent = 'Income here is what the buildings pay you after operating costs, debt service, a normal allowance for replacements, and the income tax the rentals add — plus the rent a house-hack saves you. ' +
      (S.mc ? 'The bold line is the level ' + confPct() + ' of simulated futures meet or beat each month; the shading shows how far futures spread. ' : '') +
      'Money is ' + dollarsWord() + '.';
  }

  /* ------------------------------------------------------------- cash chart */
  function drawCash() {
    if (!el.cashBox || !S.base) return;
    var rows = S.base.rows, start = S.base.summary.start;
    var series = [{ values: rows.map(function (r) { return r.cash; }), color: 'var(--ink-2)', width: 1.8 }];
    var bands = [];
    UI.clear(el.cashLegend);
    el.cashLegend.appendChild(h('span', null, h('i', { class: 'line', style: { background: 'var(--ink-2)', height: '2px' } }), 'Calm economy'));
    if (S.mc && S.mc.cashFan) {
      var cf = S.mc.cashFan;
      series.push({ values: cf.p50, t: cf.t, color: 'var(--accent)', width: 1.4 });
      series.push({ values: cf.p10, t: cf.t, color: 'var(--warn)', width: 1.4, dash: '4 3' });
      el.cashLegend.appendChild(h('span', null, h('i', { class: 'line', style: { background: 'var(--accent)', height: '2px' } }), 'Median future'));
      el.cashLegend.appendChild(h('span', null, h('i', { class: 'line', style: { background: 'var(--warn)', height: '2px' } }), 'One future in ten is lower than this'));
    }
    UI.charts.lines(el.cashBox, { start: start, months: rows.length, series: series, bands: bands, height: 240 });
  }

  /* ------------------------------------------------------------ recommender */
  function renderRec() {
    var box = el.rec; UI.clear(box);
    var nWould = FPE.catalogue.ENTRIES.filter(function (e) { return !e.lifestyle && !e.info && S.wouldDo[e.id]; }).length;
    var run = h('button', { type: 'button', class: 'btn primary', id: 'find-btn', onclick: startRec }, S.rec ? 'Search again' : 'Find better plans');
    var stop = h('button', { type: 'button', class: 'btn ghost', onclick: function () { UI.jobs.cancel('rec'); S.recProgress = null; renderRec(); } }, 'Stop');
    box.appendChild(h('p', { class: 'panel-sub', style: { marginBottom: '12px' } },
      'Tries every variant of the ' + nWould + ' strategies you would do, climbs to the best combination on the calm run, checks the strategies that only pay off in some futures, then re-ranks the best few on the same simulated futures. It takes about half a minute. ',
      h('button', { type: 'button', class: 'chip', onclick: function () { UI.go('strategies'); } }, 'Change what you would do')));
    if (S.recProgress) {
      var p = S.recProgress;
      var words = { screen: 'Trying single changes', climb: 'Combining the best', futures: 'Checking strategies that only pay off in some futures', simulate: 'Re-ranking on simulated futures' };
      box.appendChild(h('div', { class: 'btnrow' }, h('button', { type: 'button', class: 'btn primary', disabled: true }, 'Searching…'), stop));
      box.appendChild(h('div', { class: 'progress' }, h('i', { style: { width: (100 * p.done / Math.max(1, p.total)) + '%' } })));
      box.appendChild(h('div', { class: 'progress-label' }, (words[p.stage] || 'Working') + ' · ' + p.done + ' of ' + p.total));
      return;
    }
    box.appendChild(h('div', { class: 'btnrow' }, run));
    if (S.recError) box.appendChild(h('div', { class: 'callout crit', style: { marginTop: '10px' } }, S.recError));
    if (!S.rec) return;
    var R = S.rec;
    if (S.recStale) box.appendChild(h('div', { class: 'callout warn', style: { marginTop: '12px' } }, 'Your plan has changed since this search. Search again to see proposals for the plan as it is now.'));
    var yours = R.plans.filter(function (p) { return p.id === 'yours'; })[0];
    var fmtScore = function (hd) { return hd.unit === 'month' ? (hd.value == null ? 'not within the horizon' : UI.monthLabel(hd.value)) : UI.money(showMoney(hd.value)); };
    var grid = h('div', { class: 'plans', style: { marginTop: '14px' } });
    R.plans.forEach(function (p, i) {
      var d = yours && p !== yours ? p.headline.score - yours.headline.score : null;
      var deltaTxt = d == null ? 'your plan as it stands' : (R.kind === 'replaceSalary' ? (d > 0 ? Math.round(d) + ' months sooner' : d < 0 ? Math.round(-d) + ' months later' : 'no sooner')
                                                                                      : UI.money(showMoney(d), { plus: true }) + '/mo vs yours');
      var card = h('div', { class: 'plancard' + (i === 0 ? ' best' : '') },
        h('div', { class: 'plancard-head' },
          h('div', { class: 'plancard-name' }, (i === 0 ? 'Top · ' : '') + p.name),
          h('div', { class: 'plancard-num' }, fmtScore(p.headline), R.kind === 'replaceSalary' ? null : h('small', null, '/mo')),
          h('div', { class: 'delta ' + (d > 0 ? 'up' : d < 0 ? 'down' : '') }, deltaTxt),
          h('div', { class: 'kv-s' }, confPct() + ' case, same ' + UI.num(R.paths) + ' futures for every plan')),
        h('div', { class: 'plancard-stats' },
          kv('Median', R.kind === 'replaceSalary' ? UI.monthLabel(p.headline.median) : UI.money(showMoney(p.headline.median))),
          kv('Forced sale', UI.pct(p.forcedShare, p.forcedShare > 0 && p.forcedShare < 0.01 ? 1 : 0)),
          kv('Hours a week', UI.num(p.hours, 1)),
          kv('Units at end', UI.num(p.headline.units.p50)),
          kv('If sold, end', UI.money(p.headline.sold.p50, { compact: true })),
          kv('Runs out', UI.pct(p.headline.pRuin, p.headline.pRuin > 0 && p.headline.pRuin < 0.01 ? 1 : 0))),
        p.why.length ? h('ul', { class: 'changes' }, p.why.map(function (w) {
          return h('li', null, h('span', null, w.label, w.viaFutures ? h('span', { class: 'chip', style: { marginLeft: '6px' } }, 'in some futures') : null),
            h('span', { style: { color: w.worth >= 0 ? 'var(--good)' : 'var(--crit)' } }, R.kind === 'replaceSalary' ? (Math.round(w.worth) + ' mo') : UI.money(showMoney(w.worth), { plus: true })));
        })) : h('ul', { class: 'changes' }, h('li', null, h('span', { style: { color: 'var(--muted)' } }, 'No changes — this is the plan in the rail.'))),
        p.id === 'yours' ? null : h('div', { class: 'plancard-foot' }, h('button', { type: 'button', class: 'btn ' + (i === 0 ? 'primary' : ''), onclick: function () { adopt(p); } }, 'Use this plan')));
      grid.appendChild(card);
    });
    box.appendChild(grid);
    var singles = R.singles.filter(function (x) { return Math.abs(x.gain) >= 1 || x.miniGain != null; }).slice(0, 24);
    box.appendChild(h('details', { class: 'note', style: { marginTop: '14px' } },
      h('summary', null, 'Each change on its own (' + R.singles.length + ' tried, ' + UI.num(R.evaluated) + ' runs)'),
      h('div', null, h('table', { class: 'data' },
        h('thead', null, h('tr', null, h('th', null, 'Change'), h('th', null, 'Calm run'), h('th', null, 'Simulated futures'))),
        h('tbody', null, singles.map(function (x) {
          return h('tr', null, h('td', { class: 'l' }, x.label),
            h('td', { class: x.gain > 0 ? 'pos' : x.gain < 0 ? 'neg' : '' }, R.kind === 'replaceSalary' ? Math.round(x.gain) + ' mo' : UI.money(showMoney(x.gain), { plus: true })),
            h('td', { class: x.miniGain > 0 ? 'pos' : x.miniGain < 0 ? 'neg' : '' }, x.miniGain == null ? '—' : UI.money(showMoney(x.miniGain), { plus: true }) + (x.miniClear ? '' : ' (within noise)')));
        }))))));
  }

  function startRec() {
    S.recError = null;
    S.recProgress = { stage: 'screen', done: 0, total: 1 };
    renderRec();
    var cfg = U.clone(S.cfg);
    UI.jobs.run('rec', { type: 'rec', cfg: cfg, wouldDo: Object.assign({}, S.wouldDo), paths: Math.min(cfg.mc.paths, 200), seed: cfg.mc.seed },
      function (stage, d, t) { S.recProgress = { stage: stage, done: d, total: t }; renderRec(); })
      .then(function (res) { S.rec = res; S.recStale = false; S.recProgress = null; renderRec(); UI.emit('rec'); },
            function (err) { if (err && err.cancelled) return; S.recProgress = null; S.recError = 'The search failed: ' + ((err && err.message) || 'unknown error'); renderRec(); });
  }

  function adopt(p) {
    var prev = UI.snapshot();
    var patch = {};
    p.changes.forEach(function (c) { c.paths.forEach(function (x) { patch[x.path] = x.to; }); });
    UI.setMany(patch);
    UI.toast('Now using "' + p.name + '" — ' + UI.plural(p.changes.length, 'change'), { label: 'Undo', run: function () { UI.loadPlan(prev, { dirty: true }); } });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ------------------------------------------------------ what it rests on */
  function renderRests() {
    var box = el.rests; UI.clear(box);
    if (!S.sens) { box.appendChild(h('div', { class: 'empty' }, S.sensProgress ? 'Testing each input… ' + S.sensProgress.done + ' of ' + S.sensProgress.total : 'Waiting for the plan to settle…')); return; }
    var R = S.sens, salary = R.kind === 'replaceSalary';
    if (S.sensStale) box.appendChild(h('p', { class: 'field-hint', style: { marginBottom: '8px' } }, 'Updating for your latest change…'));
    var fmt = function (v, plus) {
      if (salary) { var m = Math.round(v); return (m > 0 ? m + ' mo sooner' : m < 0 ? (-m) + ' mo later' : '±0'); }
      return UI.money(showMoney(v), { plus: plus !== false });
    };
    var chart = h('div');
    box.appendChild(chart);
    UI.charts.tornado(chart, R.items.slice(0, 12), R.base, fmt, function (x) { UI.go('assumptions', x.path); });
    box.appendChild(h('p', { class: 'reading' }, salary
      ? 'Bars show how many months sooner or later the calm run replaces your pay when each input sits at its low or high.'
      : 'Bars show how the calm run\'s income at ' + UI.monthLabel(U.parseMonth(S.cfg.plan.objective.targetMonth)) + ' moves (' + fmt(R.base, false) + ' now) when each input sits at its low or high. Badges say how much each input can be trusted.'));
    var first = R.verifyFirst.map(function (id) { return R.items.filter(function (x) { return x.id === id; })[0]; }).filter(Boolean);
    if (first.length) {
      box.appendChild(h('h3', { style: { fontSize: '13.5px', margin: '14px 0 6px' } }, 'Check these first'));
      box.appendChild(h('ol', { class: 'plain' }, first.map(function (x) {
        var note = x.noteText || (x.note && FPE.data.NOTES[x.note]) || '';
        return h('li', null, h('b', null, x.label), ' — moves the answer by up to ' + fmt(Math.max(Math.abs(x.down), Math.abs(x.up)), false) +
          ' and is only ' + ((FPE.data.PROVENANCE[x.prov] || {}).label || x.prov).toLowerCase() + '. ', note ? h('span', { style: { color: 'var(--muted)' } }, note.split('. ').slice(0, 2).join('. ').replace(/\.?$/, '.')) : null);
      })));
    }
  }

  /* --------------------------------------------------------- plan in brief */
  function renderBrief() {
    var box = el.brief; UI.clear(box);
    if (!S.base) return;
    var r = S.base, sm = r.summary;
    var facts = [
      ['First purchase', sm.firstAcquisition ? sm.firstAcquisition.label + ' · ' + sm.firstAcquisition.nickname : 'none within the horizon'],
      ['Buildings bought', UI.num(r.acquisitions.length) + ' (' + UI.num(sm.units) + ' units at the end)'],
      ['Part-time', UI.monthLabel(sm.partTime)], ['Quit', UI.monthLabel(sm.quit)],
      ['Portfolio covers what you live on', UI.monthLabel(sm.freedom)], ['Property manager', UI.monthLabel(sm.management)],
      ['Real estate professional (tax)', UI.monthLabel(sm.reps)],
      ['Income, last 12 months', UI.perMonth(showMoney(sm.finalIncomeReal, sm.end - sm.start))],
      ['Worth at the end, held / if sold', UI.money(realOn() ? sm.heldNWReal : sm.heldNW, { compact: true }) + ' / ' + UI.money(realOn() ? sm.soldNWReal : sm.soldNW, { compact: true })],
      ['Put in, total', UI.money(sm.totalContributed, { compact: true })]
    ];
    box.appendChild(h('div', { style: { display: 'grid', gap: '6px 24px', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', marginBottom: '14px' } },
      facts.map(function (f) { return h('div', { class: 'riskrow' }, h('span', { class: 'k' }, f[0]), h('span', { class: 'v' }, f[1])); })));
    if (!r.acquisitions.length) return;
    var PN = FPE.actionPlan.PRODUCT;
    box.appendChild(h('div', { class: 'tablewrap' }, h('table', { class: 'data' },
      h('thead', null, h('tr', null, ['When', 'Building', 'Units', 'Price', 'Loan', 'Cash to close', 'Cash flow, day one', 'Once rents reach market', 'Yield, stabilized'].map(function (x) { return h('th', null, x); }))),
      h('tbody', null, r.acquisitions.map(function (a) {
        return h('tr', null, h('td', null, a.label), h('td', { class: 'l' }, a.nickname + (a.ownerOcc ? ' (you live here)' : '')),
          h('td', null, a.units), h('td', null, UI.money(a.price)), h('td', { class: 'l' }, PN[a.product] || a.product),
          h('td', null, UI.money(a.uw.cashToClose)), h('td', { class: a.st.dayOneCF < 0 ? 'neg' : 'pos' }, UI.perMonth(a.st.dayOneCF)),
          h('td', { class: a.st.cf < 0 ? 'neg' : 'pos' }, UI.perMonth(a.st.cf)), h('td', null, UI.pct(a.st.yield, 1)));
      })))));
    box.appendChild(h('p', { class: 'reading' }, 'Cash flow is before income tax; "once rents reach market" assumes every unit has turned over or been pushed to its achievable rent.'));
  }

  function update() {
    if (!el.head) return;
    renderHeadline(); drawFan(); drawCash(); renderRec(); renderRests(); renderBrief();
  }
  function live() { return S.view === 'plan' && el.head && document.body.contains(el.head); }
  UI.on('base', function () { if (live()) { renderHeadline(); drawFan(); drawCash(); renderBrief(); } });
  UI.on('mc', function () { if (live()) { renderHeadline(); drawFan(); drawCash(); } });
  UI.on('mcprogress', function () {
    if (!live()) return;
    var bar = UI.$('mc-bar'), lab = UI.$('mc-label');
    if (bar && S.mcProgress) { bar.style.width = (100 * S.mcProgress.done / Math.max(1, S.mcProgress.total)) + '%'; lab.textContent = 'Simulating futures… ' + S.mcProgress.done + ' of ' + S.mcProgress.total; }
    else renderHeadline();
  });
  UI.on('sens', function () { if (live()) renderRests(); });
  UI.on('sensprogress', function () { if (live() && !S.sens) renderRests(); });
  UI.on('cfg', function () { if (live() && S.rec) renderRec(); });

  UI.views = UI.views || {};
  UI.views.plan = { title: 'Which plan is best?', mount: mount, update: update };
})(UI);
