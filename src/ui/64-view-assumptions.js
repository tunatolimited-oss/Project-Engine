/* ============================================================================
   ASSUMPTIONS — every input the engine reads, grouped, searchable, each
   with how far to trust it and where it came from. Inputs a switch has made
   irrelevant are hidden by default; show them to see why they don't apply.
   ========================================================================== */
(function (UI) {
  'use strict';
  var h = UI.h, S = UI.state, R = FPE.registry, U = FPE.util;
  var root = null, rows = [], opts = { q: '', applies: true, changed: false, group: 'all' };

  function mount(r) {
    root = r; UI.clear(root); rows = [];
    var search = h('input', { class: 'ctl', type: 'search', id: 'as-q', placeholder: 'Search inputs, e.g. vacancy, DSCR, heat', value: opts.q });
    search.addEventListener('input', function () { opts.q = search.value.trim().toLowerCase(); filter(); });
    var ap = h('input', { type: 'checkbox', id: 'as-applies', checked: opts.applies });
    ap.addEventListener('change', function () { opts.applies = ap.checked; filter(); });
    var ch = h('input', { type: 'checkbox', id: 'as-changed', checked: opts.changed });
    ch.addEventListener('change', function () { opts.changed = ch.checked; filter(); });
    var grp = h('select', { class: 'ctl', id: 'as-group', style: { minWidth: '180px' } }, h('option', { value: 'all' }, 'Every group'),
      R.GROUPS.map(function (g) { return h('option', { value: g[0], selected: opts.group === g[0] }, g[1]); }));
    grp.addEventListener('change', function () { opts.group = grp.value; filter(); });
    root.appendChild(h('div', { class: 'toolbar' }, search, grp,
      h('label', { class: 'switch', for: 'as-applies' }, ap, h('span', null, 'Only what applies to this plan')),
      h('label', { class: 'switch', for: 'as-changed' }, ch, h('span', null, 'Only what I changed'))));
    var legend = h('div', { class: 'toolbar', style: { fontSize: '12px', color: 'var(--muted)' } });
    Object.keys(FPE.data.PROVENANCE).forEach(function (k) {
      var P = FPE.data.PROVENANCE[k];
      legend.appendChild(h('span', { style: { display: 'inline-flex', gap: '6px', alignItems: 'center' }, title: P.text }, h('span', { class: 'prov', dataset: { c: k } }, P.label), h('span', null, P.text.split('.')[0])));
    });
    root.appendChild(h('details', { class: 'note', style: { marginBottom: '14px' } }, h('summary', null, 'What the badges mean'), h('div', null, legend)));
    root.appendChild(h('p', { class: 'field-hint', id: 'as-count', style: { marginBottom: '10px' } }));

    R.GROUPS.forEach(function (g) {
      var list = R.ENTRIES.filter(function (e) { return e.g === g[0]; });
      if (!list.length) return;
      var sec = h('div', { class: 'agroup', dataset: { group: g[0] } }, h('h3', null, g[1]));
      var lastSub = null;
      list.forEach(function (e) {
        if (e.s && e.s !== lastSub) { lastSub = e.s; sec.appendChild(h('div', { class: 'asub', dataset: { sub: e.s } }, e.s)); }
        var f = UI.field(e, { hideIrrelevant: false });
        var reset = h('button', { type: 'button', class: 'btn sm ghost', title: 'Back to the default', onclick: function () { UI.setField(e.p, U.clone(e.d)); } }, 'Reset');
        var row = h('div', { class: 'arow', id: 'as-' + e.p.replace(/[^a-zA-Z0-9]/g, '_') }, f.el, h('div', { class: 'field-hint' }, defaultText(e)), reset);
        sec.appendChild(row);
        rows.push({ e: e, row: row, reset: reset, field: f, text: (e.l + ' ' + e.p + ' ' + (e.h || '') + ' ' + (e.s || '') + ' ' + ((e.n && FPE.data.NOTES[e.n]) || '')).toLowerCase() });
      });
      root.appendChild(sec);
    });
    filter();
  }

  function defaultText(e) {
    var d = e.d;
    if (e.t === 'list' || d == null) return '';
    if (e.t === 'bool') return 'Default: ' + (d ? 'on' : 'off');
    if (e.t === 'select') { var o = (e.o || []).filter(function (x) { return String(x[0]) === String(d); })[0]; return 'Default: ' + (o ? o[1] : d); }
    if (e.t === 'month') return 'Default: ' + UI.monthLabel(U.parseMonth(d));
    return 'Default: ' + UI.charts.fieldValueText(e.p, d);
  }

  function filter() {
    if (!root) return;
    var shown = 0;
    rows.forEach(function (x) {
      var rel = R.isRelevant(S.cfg, x.e.p);
      var changed = JSON.stringify(U.getPath(S.cfg, x.e.p)) !== JSON.stringify(x.e.d);
      var ok = (!opts.applies || rel) && (!opts.changed || changed) && (opts.group === 'all' || x.e.g === opts.group) &&
               (!opts.q || x.text.indexOf(opts.q) >= 0);
      x.row.hidden = !ok;
      x.row.classList.toggle('off', !rel);
      x.reset.hidden = !changed;
      if (ok) shown++;
    });
    root.querySelectorAll('.agroup').forEach(function (g) {
      var any = Array.prototype.some.call(g.querySelectorAll('.arow'), function (r) { return !r.hidden; });
      g.hidden = !any;
      g.querySelectorAll('.asub').forEach(function (sub) {
        var n = sub.nextElementSibling, vis = false;
        while (n && !n.classList.contains('asub')) { if (!n.hidden) vis = true; n = n.nextElementSibling; }
        sub.hidden = !vis;
      });
    });
    var c = UI.$('as-count');
    if (c) c.textContent = shown + ' of ' + rows.length + ' inputs shown · ' + UI.changedPaths(S.cfg).length + ' changed from the defaults';
  }

  function focus(path) {
    if (!root) return;
    opts.q = ''; opts.applies = false; opts.changed = false; opts.group = 'all';
    mount(root);
    var row = UI.$('as-' + path.replace(/[^a-zA-Z0-9]/g, '_'));
    if (!row) return;
    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    row.style.boxShadow = '0 0 0 3px var(--accent-line)';
    setTimeout(function () { row.style.boxShadow = ''; }, 1600);
    var ctl = row.querySelector('input, select');
    if (ctl) setTimeout(function () { ctl.focus({ preventScroll: true }); }, 350);
  }

  UI.on('cfg', function () { if (S.view === 'assumptions') filter(); });
  UI.views = UI.views || {};
  UI.views.assumptions = { title: 'Assumptions', mount: mount, update: filter, focus: focus };
})(UI);
