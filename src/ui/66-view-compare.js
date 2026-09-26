/* ============================================================================
   COMPARE — up to four plans side by side on the same simulated futures,
   and exactly which settings differ between them.
   ========================================================================== */
(function (UI) {
  'use strict';
  var h = UI.h, S = UI.state, U = FPE.util, R = FPE.registry;
  var root = null, picked = { current: true }, result = null, progress = null, err = null;

  function candidates() {
    var list = [{ id: 'current', name: 'The plan in the rail' + (S.dirty ? ' (unsaved)' : ''), cfg: S.cfg }];
    S.plans.forEach(function (p) { list.push({ id: p.id, name: p.name, cfg: p.cfg }); });
    return list;
  }
  function mount(r) { root = r; update(); }

  function update() {
    if (!root) return;
    UI.clear(root);
    var list = candidates();
    var chosen = list.filter(function (p) { return picked[p.id]; });
    var pick = h('div', { class: 'btnrow', style: { marginBottom: '12px' } });
    list.forEach(function (p) {
      var cb = h('input', { type: 'checkbox', id: 'cmp-' + p.id, checked: !!picked[p.id], disabled: !picked[p.id] && chosen.length >= 4 });
      cb.addEventListener('change', function () { picked[p.id] = cb.checked; result = null; update(); });
      pick.appendChild(h('label', { class: 'switch', for: 'cmp-' + p.id, style: { padding: '6px 10px', border: '1px solid var(--line)', borderRadius: '7px', background: 'var(--surface)' } }, cb, h('span', null, p.name)));
    });
    var run = h('button', { type: 'button', class: 'btn primary', disabled: chosen.length < 2 || !!progress, onclick: function () { go(chosen); } },
      progress ? 'Comparing… ' + progress.done + ' of ' + progress.total : 'Compare on the same ' + Math.min(200, S.cfg.mc.paths) + ' futures');
    root.appendChild(h('div', { class: 'panel' },
      h('div', { class: 'panel-head' }, h('h2', { class: 'panel-title' }, 'Pick two to four plans'),
        h('p', { class: 'panel-sub' }, S.plans.length ? 'Saved plans and the one in the rail.' : 'Save a plan (top of the page) to compare it with changes you make afterwards.')),
      h('div', { class: 'panel-body' }, pick, run, err ? h('div', { class: 'callout crit', style: { marginTop: '10px' } }, err) : null)));
    if (chosen.length >= 2) root.appendChild(diffPanel(chosen));
    if (result) root.appendChild(resultPanel(result));
  }

  function go(chosen) {
    err = null; progress = { done: 0, total: chosen.length }; update();
    var paths = Math.min(200, S.cfg.mc.paths);
    UI.jobs.run('compare', { type: 'compare', plans: chosen.map(function (p) { return { id: p.id, name: p.name, cfg: U.clone(p.cfg) }; }), paths: paths, seed: S.cfg.mc.seed },
      function (st, d, t) { progress = { done: d, total: t }; if (S.view === 'compare') update(); })
      .then(function (res) { progress = null; result = res; update(); },
            function (e) { if (e && e.cancelled) return; progress = null; err = 'The comparison failed: ' + ((e && e.message) || 'unknown error'); update(); });
  }

  function resultPanel(res) {
    var salary = res[0].headline.kind === 'replaceSalary';
    function money(v) { return UI.money(v); }
    var rowsDef = [
      [Math.round(res[0].headline.confidence * 100) + '% case (headline)', function (x) { return salary ? UI.monthLabel(x.headline.value) : UI.perMonth(x.headline.value); }, function (x) { return x.headline.score; }],
      ['Median future', function (x) { return salary ? UI.monthLabel(x.headline.median) : UI.perMonth(x.headline.median); }],
      ['One future in ten', function (x) { return salary ? UI.monthLabel(x.headline.bad) : UI.perMonth(x.headline.bad); }],
      ['Runs out of cash', function (x) { return UI.pct(x.headline.pRuin, 1); }],
      ['Has to sell a building', function (x) { return UI.pct(x.forcedShare, 1); }],
      ['Units at the end (median)', function (x) { return UI.num(x.headline.units.p50); }],
      ['Worth if sold at the end (median)', function (x) { return UI.money(x.headline.sold.p50, { compact: true }); }],
      ['Part-time (calm run)', function (x) { return UI.monthLabel(x.summary.partTime); }],
      ['Quit (calm run)', function (x) { return UI.monthLabel(x.summary.quit); }],
      ['First purchase (calm run)', function (x) { return x.summary.firstAcquisition ? x.summary.firstAcquisition.label : '—'; }],
      ['Real-estate hours a week', function (x) { return UI.num(x.hours, 1); }]
    ];
    var best = null;
    res.forEach(function (x) { if (!best || x.headline.score > best.headline.score) best = x; });
    return h('div', { class: 'panel' },
      h('div', { class: 'panel-head' }, h('h2', { class: 'panel-title' }, 'Side by side'), h('p', { class: 'panel-sub' }, 'Money in today\'s dollars. Every plan faced the same simulated futures.')),
      h('div', { class: 'panel-body flush' }, h('div', { class: 'tablewrap' }, h('table', { class: 'data' },
        h('thead', null, h('tr', null, h('th', null, ''), res.map(function (x) { return h('th', null, x.name + (x === best ? ' ★' : '')); }))),
        h('tbody', null, rowsDef.map(function (d) { return h('tr', null, h('td', { class: 'l' }, d[0]), res.map(function (x) { return h('td', null, d[1](x)); })); }))))));
  }

  function diffPanel(chosen) {
    var diffs = R.ENTRIES.filter(function (e) {
      var vals = chosen.map(function (p) { return JSON.stringify(U.getPath(p.cfg, e.p)); });
      return vals.some(function (v) { return v !== vals[0]; });
    });
    function show(e, v) {
      if (v == null) return '—';
      if (e.t === 'bool') return v ? 'on' : 'off';
      if (e.t === 'select') { var o = (e.o || []).filter(function (x) { return String(x[0]) === String(v); })[0]; return o ? o[1] : String(v); }
      if (e.t === 'month') return UI.monthLabel(U.parseMonth(v));
      if (e.t === 'list') return v.map(function (r) { return Object.keys(r).map(function (k) { return typeof r[k] === 'number' ? UI.money(r[k]) : r[k]; }).join(' '); }).join('; ');
      return UI.charts.fieldValueText(e.p, v);
    }
    return h('div', { class: 'panel' },
      h('div', { class: 'panel-head' }, h('h2', { class: 'panel-title' }, 'What differs'), h('p', { class: 'panel-sub' }, UI.plural(diffs.length, 'setting') + ' differ between these plans.')),
      h('div', { class: 'panel-body flush' }, diffs.length ? h('div', { class: 'tablewrap' }, h('table', { class: 'data' },
        h('thead', null, h('tr', null, h('th', null, 'Setting'), chosen.map(function (p) { return h('th', null, p.name); }))),
        h('tbody', null, diffs.slice(0, 80).map(function (e) {
          return h('tr', null, h('td', { class: 'l' }, e.l, h('span', { style: { color: 'var(--faint)' } }, ' · ' + ((R.GROUPS.filter(function (g) { return g[0] === e.g; })[0] || [0, e.g])[1]))),
            chosen.map(function (p) { return h('td', { class: 'l' }, show(e, U.getPath(p.cfg, e.p))); }));
        })))) : h('div', { class: 'empty', style: { padding: '12px 18px' } }, 'No settings differ.')));
  }

  UI.on('plans', function () { if (S.view === 'compare') update(); });
  UI.on('cfg', function () { if (result && picked.current) result = null; });
  UI.views = UI.views || {};
  UI.views.compare = { title: 'Compare', mount: mount, update: update };
})(UI);
