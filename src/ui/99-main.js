/* ============================================================================
   BOOT — restore the plan you were working on (or start from the engine's
   defaults), draw the rail and the views, run the plan, and light up
   saving, Claude and downloads as the viewer grants them.
   ========================================================================== */
(function (UI) {
  'use strict';
  var h = UI.h, S = UI.state;
  var ORDER = ['plan', 'deal', 'next', 'strategies', 'assumptions', 'timeline', 'compare'];
  var mounted = {};

  function nav() {
    var box = UI.$('views'); UI.clear(box);
    ORDER.forEach(function (v) {
      var V = UI.views[v];
      box.appendChild(h('button', { type: 'button', role: 'tab', class: 'vtab' + (/\?$/.test(V.title) ? ' q' : ''), id: 'tab-' + v,
        'aria-selected': S.view === v ? 'true' : 'false', 'aria-controls': 'view-' + v, onclick: function () { UI.go(v); } }, V.title));
    });
  }

  UI.go = function (view, focus) {
    if (UI.views[view] == null) return;
    S.view = view;
    ORDER.forEach(function (v) {
      var sec = UI.$('view-' + v);
      sec.hidden = v !== view;
      var tab = UI.$('tab-' + v);
      if (tab) tab.setAttribute('aria-selected', v === view ? 'true' : 'false');
    });
    var V = UI.views[view];
    if (!mounted[view]) { V.mount(UI.$('view-' + view)); mounted[view] = true; }
    else if (V.update) V.update();
    if (focus && V.focus) setTimeout(function () { V.focus(focus); }, 40);
    else window.scrollTo({ top: 0 });
    UI.store.set('view', view);
    UI.emit('view', view);
  };

  function restore() {
    var w = UI.store.get('working', null);
    if (w && w.cfg && w.cfg.version === 2) {
      UI.loadPlan({ id: w.planId, name: w.planName, cfg: w.cfg, wouldDo: w.wouldDo }, { dirty: !!w.dirty });
    } else {
      UI.loadPlan({ id: null, name: 'My plan', cfg: FPE.defaultConfig(), wouldDo: UI.defaultsWouldDo() }, { dirty: true });
    }
  }

  function capabilities() {
    var C = window.claude;
    if (!C || typeof C.use !== 'function') {
      S.dbState = 'off'; UI.persist.render();
      return;
    }
    C.use('db').then(function (db) { UI.persist.connect(db); }, function () { UI.persist.connect(null); });
    C.use('sample').then(function (smp) { S.caps.sample = smp || null; if (mounted.deal && S.view === 'deal') UI.views.deal.update(); }, function () {});
    C.use('downloads').then(function (dl) { S.caps.downloads = dl || null; UI.persist.render(); }, function () {});
  }

  function boot() {
    restore();
    UI.rail.mount();
    nav();
    UI.persist.render();
    UI.runBaseNow();
    var start = (location.hash || '').replace('#', '');
    UI.go(ORDER.indexOf(start) >= 0 ? start : (UI.store.get('view', 'plan') || 'plan'));
    UI.runUncertaintyNow();
    capabilities();
    window.addEventListener('hashchange', function () {
      var v = (location.hash || '').replace('#', '');
      if (ORDER.indexOf(v) >= 0 && v !== S.view) UI.go(v);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(UI);
