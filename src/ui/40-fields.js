/* ============================================================================
   FIELDS — one control for any registry entry. The rail, the strategy
   cards and the assumptions view all build their inputs here, so a field
   looks and behaves the same everywhere: its label, unit, range, provenance
   badge (click for the source note), a dot when it differs from the
   default, and hidden with the reason when a switch makes it irrelevant.
   ========================================================================== */
(function (UI) {
  'use strict';
  var h = UI.h, U = FPE.util, R = FPE.registry;
  var mounted = [];
  var ids = 0;

  function provBadge(e) {
    var P = FPE.data.PROVENANCE[e.c];
    if (!P) return null;
    return h('span', { class: 'prov', dataset: { c: e.c }, title: P.text }, P.label);
  }
  function noteFor(e) {
    var txt = e.n && FPE.data.NOTES[e.n];
    var parts = [];
    if (e.h) parts.push(e.h);
    if (txt) parts.push(txt);
    if (!parts.length) return null;
    return h('details', { class: 'note' }, h('summary', null, txt ? 'Source and reasoning' : 'More'), h('div', null, parts.map(function (t) { return h('p', { style: { marginBottom: '6px' } }, t); })));
  }
  var UNITS = { '/mo': 'per month', '/yr': 'per year', '/unit': 'per unit', '/unit/yr': 'per unit a year', '/unit/mo': 'per unit a month',
                'hrs/wk': 'hours a week', 'bps/yr': 'basis points a year', 'hrs/unit/yr': 'hours per unit a year', 'hrs': 'hours',
                'hrs per 100 touches': 'hours per 100 letters or calls', 'months PITIA': 'months of payment' };
  function unitText(u) { return u ? (UNITS[u] || u) : ''; }
  function toDisplay(e, v) {
    if (v == null) return '';
    if (e.t === 'pct') return +(v * 100).toFixed(4);
    return v;
  }
  function fromInput(e, raw) {
    if (raw === '' || raw == null) return undefined;
    var x = parseFloat(raw);
    if (!isFinite(x)) return undefined;
    if (e.t === 'pct') x = x / 100;
    if (e.t === 'int') x = Math.round(x);
    return x;
  }
  function stepFor(e) {
    if (e.step != null) return e.t === 'pct' ? +(e.step * 100).toFixed(6) : e.step;
    if (e.t === 'pct') return 0.1;
    if (e.t === 'int') return 1;
    if (e.t === 'money') return Math.abs(e.d) >= 10000 ? 500 : (Math.abs(e.d) >= 1000 ? 50 : 1);
    return 'any';
  }

  function numberInput(e, id, onValue) {
    var inp = h('input', { class: 'ctl', id: id, type: 'number', step: stepFor(e), inputmode: 'decimal',
      min: e.min != null ? toDisplay(e, e.min) : null, max: e.max != null ? toDisplay(e, e.max) : null });
    inp.addEventListener('input', function () { var v = fromInput(e, inp.value); if (v !== undefined) onValue(v); });
    inp.addEventListener('blur', function () { inp.value = toDisplay(e, UI.get(e.p)); });
    var pre = e.t === 'money' ? '$' : null;
    var post = e.t === 'pct' ? '%' : null;
    var wrap = pre ? h('div', { class: 'affix pre' }, h('span', null, pre), inp) : (post ? h('div', { class: 'affix post' }, inp, h('span', null, post)) : inp);
    return { el: wrap, set: function (v) { if (document.activeElement !== inp) inp.value = toDisplay(e, v); }, focus: inp };
  }

  function listEditor(e, id, onValue) {
    var box = h('div', { class: 'rows', id: id });
    var keys = Object.keys(e.item || {});
    function render(list) {
      UI.clear(box);
      (list || []).forEach(function (row, i) {
        var cells = keys.map(function (k) {
          var it = e.item[k];
          var inp;
          if (it.t === 'month') inp = h('input', { class: 'ctl', type: 'month', value: row[k] || '', 'aria-label': it.l });
          else inp = h('input', { class: 'ctl', type: 'number', step: it.t === 'money' ? 100 : 'any', value: row[k], 'aria-label': it.l });
          inp.addEventListener('change', function () {
            var next = U.clone(UI.get(e.p) || []);
            next[i][k] = it.t === 'month' ? inp.value : (parseFloat(inp.value) || 0);
            if (it.t === 'month' && !inp.value) return;
            onValue(next);
          });
          return it.t === 'money' ? h('div', { class: 'affix pre' }, h('span', null, '$'), inp) : inp;
        });
        var rm = h('button', { type: 'button', class: 'iconbtn', title: 'Remove this row', 'aria-label': 'Remove row', text: '×' });
        rm.addEventListener('click', function () {
          var next = U.clone(UI.get(e.p) || []); next.splice(i, 1);
          if (!next.length) return;                                     // a schedule needs one row
          onValue(next); render(next);
        });
        box.appendChild(h('div', { class: 'row2' }, cells, rm));
      });
      var add = h('button', { type: 'button', class: 'btn sm ghost', text: '+ Add a change' });
      add.addEventListener('click', function () {
        var cur = U.clone(UI.get(e.p) || []);
        var last = cur[cur.length - 1] || {};
        var row = {};
        keys.forEach(function (k) {
          if (e.item[k].t === 'month') row[k] = last[k] ? U.iso(U.parseMonth(last[k]) + 12) : U.iso(U.parseMonth(UI.get('plan.startMonth')));
          else row[k] = last[k] || 0;
        });
        cur.push(row); onValue(cur); render(cur);
      });
      box.appendChild(h('div', null, add));
    }
    return { el: box, set: function (v) { if (!box.contains(document.activeElement)) render(v); } };
  }

  /* field(entry, {compact, label, hideNote}) → {el, refresh} */
  function field(e, opts) {
    opts = opts || {};
    var id = 'f' + (++ids) + '-' + e.p.replace(/[^a-zA-Z0-9]/g, '_');
    var onValue = function (v) { UI.setField(e.p, v); };
    var ctl;
    if (e.t === 'bool') {
      var cb = h('input', { type: 'checkbox', id: id });
      cb.addEventListener('change', function () { onValue(cb.checked); });
      ctl = { el: h('label', { class: 'switch', for: id }, cb, h('span', { class: 'field-label' }, opts.label || e.l), provBadge(e)), set: function (v) { cb.checked = !!v; } };
    } else if (e.t === 'select') {
      var sel = h('select', { class: 'ctl', id: id }, (e.o || []).map(function (o, i) { return h('option', { value: String(i) }, o[1]); }));
      sel.addEventListener('change', function () { onValue(e.o[+sel.value][0]); });
      ctl = { el: sel, set: function (v) { var i = (e.o || []).map(function (o) { return String(o[0]); }).indexOf(String(v)); if (i >= 0) sel.value = String(i); } };
    } else if (e.t === 'month') {
      var mi = h('input', { class: 'ctl', id: id, type: 'month' });
      mi.addEventListener('change', function () { if (mi.value) onValue(mi.value); });
      ctl = { el: mi, set: function (v) { if (document.activeElement !== mi) mi.value = v || ''; } };
    } else if (e.t === 'list') {
      ctl = listEditor(e, id, onValue);
    } else {
      ctl = numberInput(e, id, onValue);
    }
    var ut = unitText(e.u);
    var head = e.t === 'bool' ? null : h('div', { class: 'field-head' },
      h('label', { class: 'field-label', for: id }, opts.label || e.l, ut ? h('span', { style: { color: 'var(--faint)', fontWeight: '500' } }, ' · ' + ut) : null),
      provBadge(e));
    var why = h('div', { class: 'field-hint', hidden: true });
    var wrap = h('div', { class: 'field', dataset: { path: e.p } }, head, ctl.el, opts.hideNote ? null : noteFor(e), why);
    var rec = {
      el: wrap, e: e,
      refresh: function () {
        ctl.set(UI.get(e.p));
        var d = R.BY_PATH[e.p] ? R.BY_PATH[e.p].d : undefined;
        wrap.classList.toggle('changed', e.t !== 'list' && JSON.stringify(UI.get(e.p)) !== JSON.stringify(d));
        var rel = R.isRelevant(UI.state.cfg, e.p);
        if (opts.hideIrrelevant !== false) wrap.hidden = !rel;
        else {
          wrap.classList.toggle('off', !rel);
          var b = rel ? null : R.blockingSwitch(UI.state.cfg, e.p);
          why.hidden = rel;
          why.textContent = b ? 'Not used while "' + (R.BY_PATH[b] ? R.BY_PATH[b].l : b) + '" is ' + (U.getPath(UI.state.cfg, b) ? 'on' : 'off') + '.' : 'Not used in this plan.';
        }
      }
    };
    rec.refresh();
    mounted.push(rec);
    return rec;
  }

  function refreshAll() {
    mounted = mounted.filter(function (m) { return document.body.contains(m.el); });
    mounted.forEach(function (m) { m.refresh(); });
  }
  UI.on('cfg', refreshAll);

  UI.field = field;
  UI.fieldByPath = function (p, opts) { var e = R.BY_PATH[p]; return e ? field(e, opts) : null; };
  UI.provBadge = provBadge;
  UI.unitText = unitText;
  UI.refreshFields = refreshAll;
})(UI);
