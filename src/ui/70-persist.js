/* ============================================================================
   SAVED PLANS — kept in the page's own storage (a fresh "plans" collection;
   anything the earlier version of this page stored is left untouched), with
   a JSON backup you can download and load again. The plan in the rail is
   also remembered in this browser, so a reload picks up where you were.
   ========================================================================== */
(function (UI) {
  'use strict';
  var h = UI.h, S = UI.state, U = FPE.util;
  var COL = 'fpe2-plans';
  var unsub = null;

  function connect(db) {
    S.caps.db = db;
    if (!db) { S.dbState = 'off'; render(); return; }
    S.dbState = 'on';
    try {
      unsub = db.collection(COL).onSnapshot(function (snap) {
        S.plans = snap.docs.map(function (d) {
          var v = d.data() || {};
          return { id: d.id, name: v.name || 'Untitled plan', cfg: FPE.registry.migrate(v.cfg || {}), wouldDo: v.wouldDo || null, savedAt: v.savedAt || null, headline: v.headline || null };
        }).sort(function (a, b) { return String(b.savedAt).localeCompare(String(a.savedAt)); });
        UI.emit('plans'); render();
      }, function () { S.dbState = 'off'; render(); });
    } catch (e) { S.dbState = 'off'; render(); }
  }

  function headlineSummary() {
    var m = S.mc && !S.mcStale ? S.mc.headline : null;
    return m ? { kind: m.kind, value: m.value, confidence: m.confidence } : null;
  }

  function save(asNew) {
    var db = S.caps.db;
    if (!db) { UI.toast('Saving is not available here — use Export to keep a copy'); return; }
    var id = asNew || !S.planId ? UI.uid() : S.planId;
    var name = asNew ? uniqueName(S.planName) : S.planName;
    var body = { name: name, cfg: U.clone(S.cfg), wouldDo: Object.assign({}, S.wouldDo), savedAt: new Date().toISOString(), headline: headlineSummary() };
    db.collection(COL).doc(id).set(body).then(function () {
      S.planId = id; S.planName = name; S.dirty = false; UI.saveWorking(); render();
      UI.toast('Saved "' + name + '"');
    }, function (e) {
      UI.toast(e && e.code === 'quota_exceeded' ? 'Storage is full — delete a saved plan first' : 'Could not save: ' + ((e && e.message) || 'storage refused the write'));
    });
  }
  function uniqueName(base) {
    var names = S.plans.map(function (p) { return p.name; }), n = base, i = 2;
    while (names.indexOf(n) >= 0) n = base + ' (' + (i++) + ')';
    return n;
  }
  function remove() {
    var db = S.caps.db;
    if (!db || !S.planId) return;
    var id = S.planId, name = S.planName;
    db.collection(COL).doc(id).delete().then(function () {
      S.planId = null; S.dirty = true; UI.saveWorking(); render();
      UI.toast('Deleted "' + name + '" — the plan stays in the rail until you change it');
    }, function () { UI.toast('Could not delete that plan'); });
  }
  function open(id) {
    var p = S.plans.filter(function (x) { return x.id === id; })[0];
    if (!p) return;
    var prev = UI.snapshot(), prevDirty = S.dirty;
    UI.loadPlan(p);
    render();
    UI.toast('Opened "' + p.name + '"', prevDirty ? { label: 'Back to the unsaved plan', run: function () { UI.loadPlan(prev, { dirty: true }); render(); } } : null);
  }

  /* ------------------------------------------------------ backup and import */
  function exportAll() {
    var dl = S.caps.downloads;
    if (!dl) { UI.toast('Downloads are not available in this view'); return; }
    var data = { app: 'fargo-portfolio-engine', schema: 2, exportedAt: new Date().toISOString(),
                 current: UI.snapshot(), plans: S.plans.map(function (p) { return { id: p.id, name: p.name, cfg: p.cfg, wouldDo: p.wouldDo, savedAt: p.savedAt }; }) };
    var stamp = new Date().toISOString().slice(0, 10);
    dl.save({ filename: 'fargo-plans-' + stamp + '.json', data: JSON.stringify(data, null, 2) }).then(function () { UI.toast('Backup saved'); }, function (e) {
      if (e && e.code === 'declined') return;
      UI.toast('The backup was not saved' + (e && e.message ? ': ' + e.message : ''));
    });
  }
  function importFile(file) {
    var fr = new FileReader();
    fr.onload = function () {
      var j;
      try { j = JSON.parse(fr.result); } catch (e) { UI.toast('That file is not a plan backup (it is not JSON)'); return; }
      var plans = [];
      if (j && j.plans) plans = j.plans.slice();
      if (j && j.current) plans.unshift(Object.assign({}, j.current, { name: (j.current.name || 'Imported plan') + ' (from backup)' }));
      if (j && j.cfg && !j.plans) plans.push({ name: j.name || 'Imported plan', cfg: j.cfg, wouldDo: j.wouldDo });
      if (!plans.length) { UI.toast('No plans found in that file'); return; }
      if (!S.caps.db) {
        var prev = UI.snapshot();
        UI.loadPlan({ name: plans[0].name, cfg: plans[0].cfg, wouldDo: plans[0].wouldDo }, { dirty: true });
        UI.toast('Loaded "' + plans[0].name + '" into the rail (saving is not available here)', { label: 'Undo', run: function () { UI.loadPlan(prev, { dirty: true }); } });
        return;
      }
      var db = S.caps.db, done = 0;
      (function next(i) {
        if (i >= plans.length) { UI.toast('Imported ' + UI.plural(done, 'plan')); return; }
        var p = plans[i];
        db.collection(COL).doc(UI.uid()).set({ name: uniqueName(p.name || 'Imported plan'), cfg: FPE.registry.migrate(p.cfg || {}), wouldDo: p.wouldDo || null,
                                               savedAt: new Date().toISOString(), headline: null })
          .then(function () { done++; next(i + 1); }, function () { next(i + 1); });
      })(0);
    };
    fr.readAsText(file);
  }

  /* ---------------------------------------------------------------- plan bar */
  function render() {
    var bar = UI.$('planbar'); if (!bar) return;
    UI.clear(bar);
    var sel = h('select', { class: 'ctl', id: 'plan-pick', 'aria-label': 'Saved plans', disabled: S.dbState !== 'on' || !S.plans.length },
      h('option', { value: '' }, S.planId ? 'Saved plans' : (S.plans.length ? 'Open a saved plan…' : 'No saved plans yet')),
      S.plans.map(function (p) { return h('option', { value: p.id, selected: p.id === S.planId }, p.name); }));
    sel.addEventListener('change', function () { if (sel.value && sel.value !== S.planId) open(sel.value); });
    var name = h('input', { class: 'ctl', id: 'plan-name', type: 'text', value: S.planName, 'aria-label': 'Plan name', style: { width: '170px' } });
    name.addEventListener('change', function () { S.planName = name.value.trim() || 'My plan'; S.dirty = true; UI.saveWorking(); render(); });
    var state = h('span', { class: 'savestate' + (S.dbState !== 'on' ? ' off' : S.dirty ? ' dirty' : '') }, h('i'),
      S.dbState === 'pending' ? 'Connecting…' : S.dbState !== 'on' ? 'Not saved to the page' : S.dirty ? (S.planId ? 'Unsaved changes' : 'Not saved yet') : 'Saved');
    var fileIn = h('input', { type: 'file', accept: '.json,application/json', hidden: true, id: 'plan-import' });
    fileIn.addEventListener('change', function () { if (fileIn.files[0]) importFile(fileIn.files[0]); fileIn.value = ''; });
    bar.appendChild(name);
    bar.appendChild(state);
    if (S.dbState === 'on') {
      bar.appendChild(h('button', { type: 'button', class: 'btn sm primary', disabled: !S.dirty && !!S.planId, onclick: function () { save(false); } }, S.planId ? 'Save' : 'Save plan'));
      if (S.planId) bar.appendChild(h('button', { type: 'button', class: 'btn sm', onclick: function () { save(true); } }, 'Save as new'));
    }
    bar.appendChild(sel);
    if (S.dbState === 'on' && S.planId) bar.appendChild(UI.armedButton('Delete', 'Delete for good?', remove, ''));
    if (S.caps.downloads) bar.appendChild(h('button', { type: 'button', class: 'btn sm ghost', onclick: exportAll, title: 'Download every plan as a JSON backup' }, 'Export'));
    bar.appendChild(fileIn);
    bar.appendChild(h('button', { type: 'button', class: 'btn sm ghost', onclick: function () { fileIn.click(); }, title: 'Load plans from a JSON backup' }, 'Import'));
  }

  UI.on('cfg', function () { render(); });
  UI.persist = { connect: connect, render: render, save: save };
})(UI);
