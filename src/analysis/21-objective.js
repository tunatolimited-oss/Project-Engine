/* ============================================================================
   OBJECTIVE — what a plan is scored on, and the headline you see.

   incomeByDate   after-tax real-estate income (trailing 12 months, today's
                  dollars) at your target date, in the c% case: the figure
                  c% of simulated futures meet or beat. Default c = 80%.
   replaceSalary  the earliest month the portfolio's after-tax income meets
                  your take-home pay plus a cushion, in the c% case — the
                  date by which c% of futures have got there.

   A future that runs out of cash scores zero income (and never replaces
   the salary). Idle-cash returns are not income here; they are shown apart.
   ========================================================================== */
(function (FPE) {
  'use strict';
  var U = FPE.util;

  /* Monthly amount the portfolio must replace, in today's dollars. */
  function salaryTarget(cfg) {
    var O = cfg.plan.objective, start = U.parseMonth(cfg.plan.startMonth);
    var need;
    if (cfg.income.w2.enabled) {
      var gross = FPE.life.w2Annual(cfg, start);
      need = FPE.life.netPay(cfg, U.yearOf(start), gross) / 12;
    } else {
      need = cfg.plan.livingExpenses + cfg.plan.housingRent;
    }
    return need * (1 + (O.salaryBuffer || 0));
  }

  function spec(cfg) {
    var O = cfg.plan.objective;
    return { kind: O.kind, target: U.parseMonth(O.targetMonth), confidence: +O.confidence,
             salary: O.kind === 'replaceSalary' ? salaryTarget(cfg) : null };
  }

  /* First month a single run's trailing real income reaches `need`. */
  function firstReach(series, start, need) {
    if (!series) return null;
    for (var i = 0; i < series.length; i++) if (series[i] >= need) return start + i;
    return null;
  }

  /* --------------------------------------------- deterministic score (screening)
     Higher is better for both kinds. For replaceSalary the score is minus
     the months it takes (never reached → horizon + 60). */
  function scoreRun(cfg, res) {
    var sp = spec(cfg), sm = res.summary;
    if (sp.kind === 'replaceSalary') {
      var start = sm.start, series = res.series ? res.series.income : null;
      if (!series) series = res.rows.map(function (r) { return r.trailingIncomeReal; });
      var hit = sm.ruined ? null : firstReach(series, start, sp.salary);
      var months = hit == null ? (sm.end - start) + 60 : hit - start;
      return { score: -months, value: hit, unit: 'month' };
    }
    return { score: sm.ruined ? 0 : sm.incomeAtTargetReal, value: sm.ruined ? 0 : sm.incomeAtTargetReal, unit: 'money' };
  }

  /* ------------------------------------------------ headline from the MC layer */
  function headline(cfg, mc) {
    var sp = spec(cfg), conf = sp.confidence;
    var out = { kind: sp.kind, confidence: conf, target: sp.target, pRuin: U.sum(Array.prototype.slice.call(mc.ruined)) / mc.paths };
    if (sp.kind === 'replaceSalary') {
      var hits = mc.series.income.map(function (s, i) { return mc.ruined[i] ? null : firstReach(s, mc.start, sp.salary); });
      out.salary = sp.salary;
      out.value = FPE.mc.dateAtConfidence(hits, conf);           // the c% case date
      out.median = FPE.mc.dateAtConfidence(hits, 0.5);
      out.bad = FPE.mc.dateAtConfidence(hits, 0.9);
      out.shareEver = hits.filter(function (h) { return h != null; }).length / hits.length;
      out.score = out.value == null ? -(mc.months + 60) : -(out.value - mc.start);
      out.unit = 'month';
    } else {
      var b = FPE.mc.band(mc.incomeAtTarget);
      out.value = FPE.mc.atConfidence(mc.incomeAtTarget, conf);
      out.median = b.p50; out.bad = FPE.mc.atConfidence(mc.incomeAtTarget, 0.9); out.good = b.p80;
      out.score = out.value;
      out.unit = 'money';
    }
    out.held = FPE.mc.band(mc.heldNW); out.sold = FPE.mc.band(mc.soldNW);
    out.units = FPE.mc.band(mc.units);
    out.quitShareByTarget = FPE.mc.shareBy(mc.quit, sp.target);
    out.quitAt = FPE.mc.dateAtConfidence(mc.quit, conf);
    out.partTimeAt = FPE.mc.dateAtConfidence(mc.partTime, conf);
    return out;
  }

  /* Money for display: the engine works in today's dollars; show nominal
     dollars at month t when you prefer. */
  function display(cfg, realValue, t) {
    if (cfg.plan.objective.realDollars !== false || t == null) return realValue;
    var M = FPE.market.create(cfg);
    return realValue * M.cpiIndex(t);
  }

  function describe(cfg, h) {
    var pct = Math.round(h.confidence * 100) + '%';
    if (h.kind === 'replaceSalary') {
      return h.value == null
        ? 'In fewer than ' + pct + ' of futures does the portfolio replace your take-home pay of ' + U.fmtMoney(h.salary) + '/mo within the horizon.'
        : 'In ' + pct + ' of futures the portfolio replaces your take-home pay (' + U.fmtMoney(h.salary) + '/mo, today\'s dollars) by ' + U.label(h.value) + '.';
    }
    return 'In ' + pct + ' of futures the portfolio pays you at least ' + U.fmtMoney(h.value) + '/mo after tax by ' + U.label(h.target) +
      ' (today\'s dollars). Median ' + U.fmtMoney(h.median) + '; one future in ten does worse than ' + U.fmtMoney(h.bad) + '.';
  }

  FPE.objective = { spec: spec, salaryTarget: salaryTarget, scoreRun: scoreRun, headline: headline, display: display, describe: describe, firstReach: firstReach };
})(FPE);
