/* ============================================================================
   STATE — the working plan and everything computed from it.

   One working plan (a config from the engine's registry, plus your
   would-do set). Every change re-runs the deterministic engine at once on
   this thread (a few milliseconds), and after a pause re-runs the
   uncertainty layer and the sensitivity ranking in background workers.
   Views listen for: 'cfg', 'base', 'mc', 'sens', 'rec', 'plans', 'view'.
   ========================================================================== */
(function (UI) {
  'use strict';
  var U = FPE.util;

  var S = UI.state = {
    cfg: null, wouldDo: {}, planId: null, planName: 'My plan', dirty: false,
    base: null, action: null, baseError: null,
    mc: null, mcStale: true, mcProgress: null, mcError: null,
    sens: null, sensStale: true, sensProgress: null,
    rec: null, recStale: false, recProgress: null, recError: null,
    view: 'plan', plans: [], dbState: 'pending',
    caps: { db: null, sample: null, downloads: null },
    undo: null
  };

  /* ---------------------------------------------------------------- events */
  var listeners = {};
  UI.on = function (ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); };
  UI.emit = function (ev, data) { (listeners[ev] || []).forEach(function (fn) { try { fn(data); } catch (e) { console.error(e); } }); };

  function defaultsWouldDo() {
    var w = {};
    FPE.catalogue.ENTRIES.forEach(function (e) { w[e.id] = !!e.wouldDo; });
    return w;
  }
  UI.defaultsWouldDo = defaultsWouldDo;

  /* ------------------------------------------------------------ mutations */
  UI.get = function (path) { return U.getPath(S.cfg, path); };
  UI.setField = function (path, value) {
    if (JSON.stringify(U.getPath(S.cfg, path)) === JSON.stringify(value)) return;
    U.setPath(S.cfg, path, value);
    changed({ path: path });
  };
  UI.setMany = function (patch) {
    Object.keys(patch).forEach(function (k) { U.setPath(S.cfg, k, patch[k]); });
    changed({ paths: Object.keys(patch) });
  };
  UI.setWouldDo = function (id, on) {
    S.wouldDo[id] = !!on; S.dirty = true; S.recStale = !!S.rec;
    UI.emit('cfg', { wouldDo: id }); saveWorking();
  };
  /* Replace the whole working plan (load, import, undo). */
  UI.loadPlan = function (plan, opts) {
    opts = opts || {};
    S.cfg = FPE.registry.migrate(U.clone(plan.cfg));
    S.wouldDo = Object.assign(defaultsWouldDo(), plan.wouldDo || {});
    S.planId = plan.id || null;
    S.planName = plan.name || 'My plan';
    S.dirty = !!opts.dirty;
    S.rec = null; S.recStale = false;
    changed({ all: true }, true);
  };
  function changed(info, keepClean) {
    if (!keepClean) S.dirty = true;
    S.mcStale = true; S.sensStale = true;
    if (S.rec) S.recStale = true;
    UI.emit('cfg', info);
    runBaseSoon();
    UI.runUncertaintySoon();
    saveWorking();
  }

  /* ------------------------------------------------------ deterministic run */
  function runBase() {
    try {
      S.base = FPE.runSimulation(S.cfg);
      S.action = FPE.actionPlan.next(S.cfg, S.base);
      S.baseError = null;
    } catch (e) {
      console.error(e);
      S.baseError = e;
    }
    UI.emit('base');
  }
  var runBaseSoon = UI.debounce(runBase, 90);
  UI.runBaseNow = function () { runBaseSoon.cancel(); runBase(); };

  /* ------------------------------------------ working plan kept in the browser
     A convenience so a reload picks up where you left off; saved plans live
     in the page's storage (see persistence). */
  var saveWorking = UI.debounce(function () {
    UI.store.set('working', { cfg: S.cfg, wouldDo: S.wouldDo, planId: S.planId, planName: S.planName, dirty: S.dirty });
  }, 400);
  UI.saveWorking = saveWorking;

  UI.snapshot = function () {
    return { id: S.planId, name: S.planName, cfg: U.clone(S.cfg), wouldDo: Object.assign({}, S.wouldDo) };
  };

  /* Which values differ from the engine's defaults — for "changed" dots and compare. */
  UI.changedPaths = function (cfg) {
    var d = FPE.defaultConfig();
    return FPE.registry.ENTRIES.filter(function (e) {
      return JSON.stringify(U.getPath(cfg, e.p)) !== JSON.stringify(U.getPath(d, e.p));
    }).map(function (e) { return e.p; });
  };
})(UI);
