/* ============================================================================
   BACKGROUND WORK — the uncertainty layer, the sensitivity ranking, the
   recommender, deal checks and comparisons run in Web Workers built from
   the same engine source the page runs (the <script id="fpe-engine">), so
   the page never freezes while it thinks.

   One worker per lane. Starting a job in a lane cancels the job already
   running there (the worker is stopped and a fresh one made): the newest
   question wins. If workers cannot start, jobs run on the page itself.
   ========================================================================== */
(function (UI) {
  'use strict';

  /* ---- code that runs inside each worker, after the engine ---- */
  function glue() {
    function count(arr, f) { var n = 0; for (var i = 0; i < arr.length; i++) if (f(arr[i])) n++; return n; }
    function jobMc(m, progress) {
      var cfg = m.cfg, conf = +cfg.plan.objective.confidence;
      var mc = FPE.mc.run(cfg, { paths: m.paths, seed: m.seed, onProgress: function (d, t) { progress('mc', d, t); } });
      var hq = Math.round((1 - conf) * 100) / 100;
      var probs = [0.1, 0.2, 0.5, 0.8, 0.9];
      if (probs.indexOf(hq) < 0) probs.push(hq);
      return {
        headline: FPE.objective.headline(cfg, mc), paths: mc.paths, seed: mc.seed, hq: hq,
        fan: FPE.mc.fan(mc.series.income, probs, 1),
        nwFan: FPE.mc.fan(mc.series.nw, [0.1, 0.5, 0.9], 3),
        cashFan: FPE.mc.fan(mc.series.cash, [0.05, 0.1, 0.5], 1),
        forcedShare: count(mc.forcedSales, function (x) { return x > 0; }) / mc.paths,
        jobLossShare: count(mc.jobLosses, function (x) { return x > 0; }) / mc.paths
      };
    }
    function jobRec(m, progress) {
      var r = FPE.recommender.recommend(m.cfg, { wouldDo: m.wouldDo, paths: m.paths, seed: m.seed,
        onProgress: function (stage, d, t) { progress(stage, d, t); } });
      return {
        kind: r.kind, base: r.base, evaluated: r.evaluated, paths: r.paths,
        plans: r.plans.map(function (p) {
          return { id: p.id, name: p.name, headline: p.headline, det: p.det.score, forcedShare: p.forcedShare, hours: p.hours,
                   why: p.why, changes: p.changes, units: p.det.sum.units, heldNW: p.det.sum.heldNWReal };
        }),
        singles: r.singles.map(function (x) { return { key: x.key, entry: x.entry, label: x.label, gain: x.gain, miniGain: x.miniGain, miniClear: !!x.miniClear }; })
      };
    }
    function jobDeal(m, progress) {
      progress('deal', 0, 3);
      var a = FPE.deal.analyze(m.cfg, m.listing, { month: m.month, window: m.window, paths: m.paths, seed: m.seed });
      progress('deal', 2, 3);
      var mo = FPE.deal.maxOffer(m.cfg, a.listing, { month: m.month, window: m.window });
      progress('deal', 3, 3);
      a.maxOffer = mo;
      return a;
    }
    function jobCompare(m, progress) {
      return m.plans.map(function (p, i) {
        progress('compare', i, m.plans.length);
        var mc = FPE.mc.run(p.cfg, { paths: m.paths, seed: m.seed, series: p.cfg.plan.objective.kind === 'replaceSalary' });
        var base = FPE.runSimulation(p.cfg, { lean: true });
        return { id: p.id, name: p.name, headline: FPE.objective.headline(p.cfg, mc), summary: base.summary,
                 forcedShare: count(mc.forcedSales, function (x) { return x > 0; }) / mc.paths,
                 hours: FPE.recommender.hoursPerWeek(p.cfg) };
      });
    }
    function handle(m, post) {
      function progress(stage, done, total) { post({ id: m.id, kind: 'progress', stage: stage, done: done, total: total }); }
      try {
        var out;
        if (m.type === 'mc') out = jobMc(m, progress);
        else if (m.type === 'sens') out = FPE.sensitivity.restsOn(m.cfg, { onProgress: function (d, t) { progress('sens', d, t); } });
        else if (m.type === 'rec') out = jobRec(m, progress);
        else if (m.type === 'deal') out = jobDeal(m, progress);
        else if (m.type === 'compare') out = jobCompare(m, progress);
        else throw new Error('unknown job ' + m.type);
        post({ id: m.id, kind: 'done', result: out });
      } catch (err) {
        post({ id: m.id, kind: 'error', message: String((err && err.message) || err) });
      }
    }
    return handle;
  }

  var handleHere = null;                     // main-thread fallback
  var workerUrl = null, workersOk = true;
  function makeWorker() {
    if (!workersOk) return null;
    try {
      if (!workerUrl) {
        var src = document.getElementById('fpe-engine').textContent +
          '\n;var __handle = (' + glue.toString() + ')();\nself.onmessage = function (e) { __handle(e.data, function (m) { self.postMessage(m); }); };';
        workerUrl = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
      }
      return new Worker(workerUrl);
    } catch (e) {
      workersOk = false;
      return null;
    }
  }

  var lanes = {}, seq = 0;
  /* run('mc', {type:'mc', cfg, ...}, onProgress) → Promise(result); rejects {cancelled:true} when superseded. */
  function run(lane, msg, onProgress) {
    cancel(lane);
    var id = ++seq;
    msg = Object.assign({}, msg, { id: id });
    return new Promise(function (resolve, reject) {
      var L = lanes[lane] = { id: id, resolve: resolve, reject: reject, worker: null };
      function onMessage(m) {
        if (!lanes[lane] || lanes[lane].id !== m.id) return;
        if (m.kind === 'progress') { if (onProgress) onProgress(m.stage, m.done, m.total); return; }
        delete lanes[lane];
        if (L.worker) L.worker.terminate();
        if (m.kind === 'done') resolve(m.result); else reject({ message: m.message });
      }
      var w = makeWorker();
      if (w) {
        L.worker = w;
        w.onmessage = function (e) { onMessage(e.data); };
        w.onerror = function (e) {
          e.preventDefault();
          if (!lanes[lane] || lanes[lane].id !== id) return;
          delete lanes[lane];
          w.terminate();
          reject({ message: e.message || 'The background worker failed.' });
        };
        w.postMessage(msg);
      } else {
        /* no workers here: run on the page after the current frame paints */
        if (!handleHere) handleHere = glue();
        setTimeout(function () {
          if (!lanes[lane] || lanes[lane].id !== id) return;
          handleHere(msg, onMessage);
        }, 30);
      }
    });
  }
  function cancel(lane) {
    var L = lanes[lane];
    if (!L) return;
    delete lanes[lane];
    if (L.worker) L.worker.terminate();
    L.reject({ cancelled: true });
  }
  function busy(lane) { return !!lanes[lane]; }

  UI.jobs = { run: run, cancel: cancel, busy: busy, workers: function () { return workersOk; } };
})(UI);
