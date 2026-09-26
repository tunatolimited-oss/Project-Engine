/* ============================================================================
   UNCERTAINTY, ON A DELAY — after the plan stops changing for a moment,
   re-run the simulated futures and the "what this rests on" ranking in the
   background. The last answer stays on screen, marked as updating.
   ========================================================================== */
(function (UI) {
  'use strict';
  var S = UI.state, U = FPE.util;

  function run() {
    var cfg = U.clone(S.cfg);
    if (cfg.mc.enabled === false) {
      UI.jobs.cancel('mc');
      S.mc = null; S.mcStale = false; S.mcProgress = null; S.mcError = null;
      UI.emit('mc');
    } else {
      var paths = cfg.mc.paths;
      S.mcProgress = { done: 0, total: paths }; S.mcError = null;
      UI.emit('mcprogress');
      UI.jobs.run('mc', { type: 'mc', cfg: cfg, paths: paths, seed: cfg.mc.seed }, function (stage, d, t) {
        S.mcProgress = { done: d, total: t }; UI.emit('mcprogress');
      }).then(function (res) {
        S.mc = res; S.mcStale = false; S.mcProgress = null; UI.emit('mc');
      }, function (err) {
        if (err && err.cancelled) return;
        S.mcProgress = null; S.mcError = (err && err.message) || 'The simulation failed.'; UI.emit('mc');
      });
    }
    S.sensProgress = { done: 0, total: 1 };
    UI.emit('sensprogress');
    UI.jobs.run('sens', { type: 'sens', cfg: cfg }, function (stage, d, t) {
      S.sensProgress = { done: d, total: t }; UI.emit('sensprogress');
    }).then(function (res) {
      S.sens = res; S.sensStale = false; S.sensProgress = null; UI.emit('sens');
    }, function (err) {
      if (err && err.cancelled) return;
      S.sensProgress = null; UI.emit('sens');
    });
  }

  UI.runUncertaintySoon = UI.debounce(run, 650);
  UI.runUncertaintyNow = function () { UI.runUncertaintySoon.cancel(); run(); };
})(UI);
