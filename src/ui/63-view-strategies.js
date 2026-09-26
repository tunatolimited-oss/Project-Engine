/* ============================================================================
   STRATEGIES — the catalogue as cards: switch one on, set it up, and say
   whether you would do it at all (the recommender only proposes what you
   would do). Interaction warnings update live with your plan.
   ========================================================================== */
(function (UI) {
  'use strict';
  var h = UI.h, S = UI.state, CAT = FPE.catalogue;
  var root = null, filter = { family: 'all', onOnly: false }, cards = {};
  var REALISM = { yes: ['Realistic for you', 'good'], maybe: ['Maybe', 'warn'], rare: ['Rare', ''], planning: ['Planning to', 'accent'],
                  lifestyle: ['Life choice', 'wheat'], rule: ['Automatic', ''] };

  function families() {
    var f = [];
    CAT.ENTRIES.forEach(function (e) { if (f.indexOf(e.family) < 0) f.push(e.family); });
    return f;
  }

  function mount(r) {
    root = r; UI.clear(root); cards = {};
    root.appendChild(h('p', { class: 'panel-sub', style: { marginBottom: '12px', maxWidth: '84ch' } },
      CAT.ENTRIES.length + ' real choices, grouped by what they change. Switch one on to use it in your plan. Untick "I would do this" and the recommender will never propose it. Settings appear once a strategy is on.'));
    var nav = h('div', { class: 'famnav' });
    ['all'].concat(families()).forEach(function (f) {
      nav.appendChild(h('button', { type: 'button', class: 'chip' + (filter.family === f ? ' accent' : ''), onclick: function () { filter.family = f; mount(root); } }, f === 'all' ? 'All' : f));
    });
    var onOnly = h('input', { type: 'checkbox', id: 'strat-ononly', checked: filter.onOnly });
    onOnly.addEventListener('change', function () { filter.onOnly = onOnly.checked; mount(root); });
    nav.appendChild(h('label', { class: 'switch', for: 'strat-ononly', style: { marginLeft: '8px' } }, onOnly, h('span', null, 'Only what is on')));
    root.appendChild(nav);
    families().forEach(function (fam) {
      if (filter.family !== 'all' && filter.family !== fam) return;
      var list = CAT.ENTRIES.filter(function (e) { return e.family === fam && (!filter.onOnly || CAT.isOn(S.cfg, e)); });
      if (!list.length) return;
      root.appendChild(h('h2', { class: 'famtitle' }, fam));
      var grid = h('div', { class: 'stratgrid' });
      list.forEach(function (e) { var c = card(e); cards[e.id] = c; grid.appendChild(c.el); });
      root.appendChild(grid);
    });
    root.appendChild(h('div', { class: 'panel', style: { marginTop: '8px' } },
      h('div', { class: 'panel-head' }, h('h2', { class: 'panel-title' }, 'Retired and parked'),
        h('p', { class: 'panel-sub' }, 'Choices cut from the old catalogue in September 2026, with the reason.')),
      h('div', { class: 'panel-body' }, h('div', { class: 'retired' }, CAT.RETIRED.map(function (x) {
        return h('div', null, h('b', null, x.name + (x.parked ? ' (parked)' : '')), h('span', { style: { color: 'var(--muted)' } }, x.reason));
      })))));
    refresh();
  }

  function card(e) {
    var body = h('div', { class: 'strat-body' });
    var params = h('div', { class: 'strat-params' });
    var warn = h('div');
    var worth = h('div', { class: 'field-hint' });
    var sw = null;
    if (e.on && !e.info) {
      sw = h('input', { type: 'checkbox', id: 'sw-' + e.id, 'aria-label': 'Use ' + e.name });
      sw.addEventListener('change', function () { UI.setMany(sw.checked ? e.on : e.off); });
    }
    var rz = REALISM[e.realism] || [e.realism, ''];
    var would = null;
    if (!e.lifestyle && !e.info) {
      would = h('input', { type: 'checkbox', id: 'wd-' + e.id });
      would.addEventListener('change', function () { UI.setWouldDo(e.id, would.checked); });
    }
    var fields = (e.params || []).map(function (p) { return UI.fieldByPath(p, { hideNote: true }); }).filter(Boolean);
    fields.forEach(function (f) { params.appendChild(f.el); });
    body.appendChild(h('p', { class: 'strat-one' }, e.one));
    body.appendChild(h('details', { class: 'note' }, h('summary', null, 'How the plan uses it'), h('div', null, e.how)));
    body.appendChild(params);
    body.appendChild(warn);
    body.appendChild(h('div', { class: 'strat-meta' },
      h('span', { class: 'chip ' + rz[1] }, rz[0]),
      would ? h('label', { class: 'switch', for: 'wd-' + e.id, style: { fontSize: '12px' } }, would, h('span', null, 'I would do this')) : null,
      worth));
    var el = h('div', { class: 'strat', id: 'strat-' + e.id },
      h('div', { class: 'strat-head' }, sw, h('div', null, h('label', { class: 'strat-name', for: sw ? 'sw-' + e.id : null }, e.name))),
      body);
    return { el: el, e: e, sw: sw, would: would, params: params, warn: warn, worth: worth, fields: fields };
  }

  function refresh() {
    var state = {};
    CAT.state(S.cfg).forEach(function (x) { state[x.id] = x; });
    var singles = {};
    if (S.rec && !S.recStale) S.rec.singles.forEach(function (x) { if (!singles[x.entry] || x.gain > singles[x.entry].gain) singles[x.entry] = x; });
    Object.keys(cards).forEach(function (id) {
      var c = cards[id], st = state[id], on = st.on;
      c.el.classList.toggle('on', !!on);
      if (c.sw) c.sw.checked = !!on;
      if (c.would) c.would.checked = !!S.wouldDo[id];
      c.params.hidden = !(on || c.e.info || !c.e.on);
      UI.clear(c.warn);
      if (st.blocked) c.warn.appendChild(h('div', { class: 'callout' }, st.blocked));
      st.warnings.forEach(function (w) { c.warn.appendChild(h('div', { class: 'callout warn' }, w)); });
      var sg = singles[id];
      c.worth.textContent = sg ? 'Alone, best variant: ' + UI.money(sg.gain, { plus: true }) + '/mo on the calm run' : '';
    });
  }

  function focus(id) {
    var c = cards[id];
    if (!c) { filter.family = 'all'; filter.onOnly = false; mount(root); c = cards[id]; }
    if (!c) return;
    c.el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    c.el.style.boxShadow = '0 0 0 3px var(--accent-line)';
    setTimeout(function () { c.el.style.boxShadow = ''; }, 1600);
  }

  UI.on('cfg', function () { if (S.view === 'strategies' && root) refresh(); });
  UI.on('rec', function () { if (S.view === 'strategies' && root) refresh(); });
  UI.views = UI.views || {};
  UI.views.strategies = { title: 'Strategies', mount: mount, update: function () { if (root) refresh(); }, focus: focus };
})(UI);
