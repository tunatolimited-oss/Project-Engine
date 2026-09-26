/* ============================================================================
   LIFE — the person around the portfolio: career stages, what they can
   contribute, where they live, how many hours they have, and when the
   circuit breakers stop the buying.

   Career: full-time → part-time (when the portfolio covers the pay given up)
   → quit (when it covers living costs), each with a sustain period. Going
   part-time or quitting changes contributions, wages for tax and lending,
   the hours available for real estate, and loan eligibility.
   ========================================================================== */
(function (FPE) {
  'use strict';
  var U = FPE.util;

  function init(cfg, start) {
    return {
      stage: cfg.income.w2.enabled ? 'full' : 'none',
      partFrom: null, quitFrom: null, coverRunPart: 0, coverRunQuit: 0,
      jobLossUntil: null, jobLossCount: 0,
      housing: { mode: 'rent', propSeq: null, since: start, hhCount: 0, home: null },
      hours: { month: 0, yearRE: 0, yearRental: 0, yearServices: 0, trail: [] },
      breakers: { cash: false, negCF: false, job: false, negRun: 0 },
      managed: cfg.ops.management.enabled && cfg.ops.management.trigger === 'always'
    };
  }

  /* --------------------------------------------------------- scheduled money */
  function scheduleValue(list, t, key) {
    var sorted = (list || []).slice().sort(function (a, b) { return U.parseMonth(a.from) - U.parseMonth(b.from); });
    var v = 0, last = null;
    sorted.forEach(function (row) { if (U.parseMonth(row.from) <= t) { v = row[key]; last = row; } });
    return { value: v, since: last ? U.parseMonth(last.from) : null, isLast: last === sorted[sorted.length - 1] };
  }
  function baseContribution(cfg, t) {
    var s = scheduleValue(cfg.plan.contributions, t, 'monthly');
    var v = s.value;
    if (s.isLast && s.since != null && cfg.plan.contributionGrowth) v *= Math.pow(1 + cfg.plan.contributionGrowth, (t - s.since) / 12);
    return v;
  }
  function w2Annual(cfg, t) { return scheduleValue(cfg.income.w2.schedule, t, 'annual').value; }

  function livingCost(cfg, M, t) { return cfg.plan.livingExpenses * M.cpiIndex(t); }
  function rentCost(cfg, M, t) { return cfg.plan.housingRent * M.rentIndex(t) / M.rentIndex(M.start); }

  /* net pay after federal, ND and payroll tax, for a given gross */
  function netPay(cfg, year, gross) {
    if (gross <= 0) return 0;
    var tb = FPE.tax.tables(cfg, year);
    var tax = cfg.tax.enabled ? FPE.tax.yearTax(cfg, tb, { ordinary: gross, unrec1250: 0, ltcg: 0 }, 0).total : 0;
    return gross - tax - gross * FPE.data.TAX.fica;
  }

  /* housing cost this month, and what it does to contributions */
  function housingCost(cfg, M, t, L) {
    var h = L.housing;
    if (h.mode === 'househack') return 0;                              // your unit's lost rent is the cost
    if (h.mode === 'home' && h.home) return h.home.pitia;
    return rentCost(cfg, M, t);
  }

  /* Housing as a cost to cover. While you house-hack, the cash cost sits
     inside the building's accounts and your rent is gone; for every test
     that asks "does the portfolio carry me" the building is credited with
     the rent you no longer pay, so the need side counts that rent too. */
  function housingNeed(cfg, M, t, L) {
    return L.housing.mode === 'househack' ? rentCost(cfg, M, t) : housingCost(cfg, M, t, L);
  }
  function housingCredit(cfg, M, t, L) {
    return L.housing.mode === 'househack' ? rentCost(cfg, M, t) : 0;
  }

  function inJobLoss(cfg, L, t) {
    if (L.jobLossUntil != null && t < L.jobLossUntil) return true;
    var S = cfg.stress.jobLoss;
    if (S.enabled && cfg.income.w2.enabled) {
      var s = U.parseMonth(S.month);
      if (t >= s && t < s + S.months) return true;
    }
    return false;
  }

  /* ------------------------------------------------------------ this month
     Returns contribution (can be negative: drawn from cash), wages for tax,
     and whether the job-loss breaker is holding. */
  function month(env, L, t, trailingIncome) {
    var cfg = env.cfg, M = env.M;
    var C = cfg.life.career, year = U.yearOf(t);
    var living = livingCost(cfg, M, t);

    /* random job loss on a simulated path */
    if (env.rng && cfg.mc.sample.jobLoss && cfg.life.breakers.jobLoss.enabled &&
        cfg.income.w2.enabled && (L.stage === 'full' || L.stage === 'part') && !inJobLoss(cfg, L, t)) {
      if (U.keyed(env.seed, 'job', t) < cfg.life.breakers.jobLoss.annualProb / 12) {
        L.jobLossUntil = t + cfg.life.breakers.jobLoss.months; L.jobLossCount++;
        env.events.push({ type: 'jobloss', text: 'Job lost — holding the portfolio for ' + cfg.life.breakers.jobLoss.months + ' months' });
      }
    }
    var jobless = cfg.income.w2.enabled && inJobLoss(cfg, L, t) && (L.stage === 'full' || L.stage === 'part');

    /* ---- career transitions ---- */
    var fullGross = w2Annual(cfg, t);
    var partGross = C.partTime.annualIncome * M.cpiIndex(t);
    var health = C.healthInsurance * M.cpiIndex(t);
    if (cfg.income.w2.enabled && C.enabled && !jobless) {
      var housing = housingNeed(cfg, M, t, L);
      if (L.stage === 'full' && C.partTime.enabled) {
        var gap = (netPay(cfg, year, fullGross) - netPay(cfg, year, partGross)) / 12;
        var ptReady = C.partTime.trigger === 'date' ? t >= U.parseMonth(C.partTime.date)
                                                   : trailingIncome >= gap * C.partTime.coverage;
        L.coverRunPart = ptReady ? L.coverRunPart + 1 : 0;
        if (C.partTime.trigger === 'date' ? ptReady : L.coverRunPart >= C.sustainMonths) {
          L.stage = 'part'; L.partFrom = t;
          env.events.push({ type: 'career', text: 'You go part-time — the portfolio covers the ' + U.fmtDollars(gap) + '/mo you give up' });
          env.milestones.push({ t: t, kind: 'partTime', text: 'Went part-time' });
        }
      }
      if ((L.stage === 'full' || L.stage === 'part') && C.quit.enabled) {
        var costs = living + housing + health;
        var cashOk = env.liquid() >= C.minCashMonths * costs;
        var qReady = C.quit.trigger === 'date' ? t >= U.parseMonth(C.quit.date)
                                              : trailingIncome >= costs * C.quit.coverage && cashOk;
        L.coverRunQuit = qReady ? L.coverRunQuit + 1 : 0;
        if (C.quit.trigger === 'date' ? qReady : L.coverRunQuit >= C.sustainMonths) {
          L.stage = 'quit'; L.quitFrom = t;
          env.events.push({ type: 'career', text: 'You quit the W-2 — portfolio income covers ' +
            U.fmtDollars(costs) + '/mo of living costs, health insurance included' });
          env.milestones.push({ t: t, kind: 'quit', text: 'Quit the W-2' });
        }
      }
    }

    /* ---- money in, money out ---- */
    var housingNow = housingCost(cfg, M, t, L);
    var contribution, wages;
    var noise = 1;
    if (env.rng && cfg.mc.sample.contributions) noise = 1 + (U.keyed(env.seed, 'contrib', t) * 2 - 1) * cfg.mc.contributionNoise;
    if (jobless) {
      wages = 0; contribution = -(living + housingNow);
    } else if (L.stage === 'quit') {
      wages = 0; contribution = -(living + housingNow + health);
    } else if (L.stage === 'part') {
      wages = partGross / 12;
      contribution = netPay(cfg, year, partGross) / 12 - living - housingNow;
    } else {
      wages = L.stage === 'none' ? 0 : fullGross / 12;
      /* contributions are entered assuming you pay rent; living in your own
         building or home changes what is left over */
      contribution = baseContribution(cfg, t) * noise + rentCost(cfg, M, t) - housingNow;
    }
    return { contribution: contribution, wages: wages, jobless: jobless, living: living,
             housing: housingNow, health: L.stage === 'quit' ? health : 0, stage: L.stage };
  }

  /* ---------------------------------------------------------------- hours */
  function hourBudgetMonthly(cfg, L) {
    var H = cfg.life.hours;
    var perWeek = L.stage === 'quit' ? H.budgetQuit : (L.stage === 'part' ? H.budgetPartTime : H.budgetFullTime);
    return perWeek * 52 / 12;
  }
  function w2HoursYear(cfg, L) {
    if (!cfg.income.w2.enabled || L.stage === 'quit' || L.stage === 'none') return 0;
    return L.stage === 'part' ? cfg.life.career.partTime.hoursPerYear : cfg.income.w2.hoursPerYear;
  }

  FPE.life = {
    init: init, month: month, baseContribution: baseContribution, w2Annual: w2Annual,
    livingCost: livingCost, rentCost: rentCost, netPay: netPay, housingCost: housingCost,
    housingNeed: housingNeed, housingCredit: housingCredit,
    hourBudgetMonthly: hourBudgetMonthly, w2HoursYear: w2HoursYear, inJobLoss: inJobLoss
  };
})(FPE);
