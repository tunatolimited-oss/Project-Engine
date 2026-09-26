/* ============================================================================
   FIELD REGISTRY — every input, declared once.

   Each entry says what the field is, its unit, default, plausible range, where
   the default came from and how much to trust it, when it is RELEVANT (so the
   interface can hide or strike it and the engine can ignore it), whether it is
   an on/off switch, whether it is unavoidable, and how the uncertainty layer
   may vary it. defaultConfig() is built from these entries, so the interface,
   the engine and the prose cannot drift apart.

   Principle (owner's instruction, Sept 2026): anything that can realistically
   be skipped, varied or done differently is a switch with editable values.
   Only unavoidable costs (property tax, insurance, debt service) are always
   modelled — their values stay editable.

   Short keys: l label · g group · s section · t type · d default · u unit
   c confidence · n provenance note · h help · w relevance · dist uncertainty
   cat uncertainty category · lvl core|more|adv · sw is a switch · unav.
   ========================================================================== */
(function (FPE) {
  'use strict';
  var U = FPE.util, D = FPE.data;

  var ENTRIES = [];
  var BY_PATH = {};
  function def(p, spec) {
    spec.p = p;
    spec.lvl = spec.lvl || 'more';
    ENTRIES.push(spec);
    BY_PATH[p] = spec;
  }
  function yes(p) { return [p, 'eq', true]; }
  function is(p, v) { return [p, 'eq', v]; }
  function any() { return { any: Array.prototype.slice.call(arguments) }; }
  function all() { return { all: Array.prototype.slice.call(arguments) }; }

  var GROUPS = [
    ['plan', 'Your plan'], ['income', 'Income and debts'], ['life', 'Life and career'],
    ['market', 'Fargo market'], ['rates', 'Interest rates'], ['lending', 'Lenders'],
    ['ops', 'Running the buildings'], ['tax', 'Tax'], ['cash', 'Idle cash'],
    ['sourcing', 'Finding deals'], ['strategies', 'Strategies'], ['mc', 'Uncertainty'],
    ['stress', 'Scheduled stress tests']
  ];

  var obs = FPE.RAW_DATA.marketObservations;

  /* =================================================================== PLAN */
  def('plan.startMonth', { l: 'Start month', g: 'plan', t: 'month', d: '2026-10', lvl: 'core', c: 'choice' });
  def('plan.horizonYears', { l: 'Horizon', g: 'plan', t: 'int', d: 15, min: 1, max: 30, u: 'years', lvl: 'core', c: 'choice' });
  def('plan.startingCash', { l: 'Cash available now', g: 'plan', t: 'money', d: 18000, min: 0, lvl: 'core', c: 'yours' });
  def('plan.contributions', { l: 'Monthly contributions', g: 'plan', t: 'list', lvl: 'core', c: 'yours',
    item: { from: { l: 'From', t: 'month' }, monthly: { l: 'Monthly', t: 'money' } },
    d: [{ from: '2026-10', monthly: 3000 }, { from: '2028-01', monthly: 4500 }],
    h: 'What you can invest each month from your pay, after your own living costs. Add a row each time it changes.' });
  def('plan.contributionGrowth', { l: 'Contributions grow after the last row', g: 'plan', t: 'pct', d: 0, min: 0, max: 0.2, u: '/yr', c: 'yours' });
  def('plan.livingExpenses', { l: 'Living costs, excluding housing', g: 'plan', t: 'money', d: 2100, u: '/mo', lvl: 'core', c: 'yours',
    h: 'In today\'s dollars; the engine inflates it. Used for the emergency fund, the quit test and circuit breakers.' });
  def('plan.housingRent', { l: 'Rent you pay when not house-hacking', g: 'plan', t: 'money', d: 1100, u: '/mo', lvl: 'core', c: 'yours' });
  def('plan.filingStatus', { l: 'Tax filing status', g: 'plan', t: 'select', d: 'single', o: [['single', 'Single'], ['mfj', 'Married filing jointly']], c: 'yours' });
  def('plan.objective.kind', { l: 'What the plan is scored on', g: 'plan', s: 'Objective', t: 'select', d: 'incomeByDate', lvl: 'core', c: 'choice',
    o: [['incomeByDate', 'Most after-tax income by a date'], ['replaceSalary', 'Earliest date the portfolio replaces my salary']] });
  def('plan.objective.targetMonth', { l: 'Target date', g: 'plan', s: 'Objective', t: 'month', d: '2036-12', lvl: 'core', c: 'choice' });
  def('plan.objective.confidence', { l: 'Headline confidence', g: 'plan', s: 'Objective', t: 'select', d: 0.8, lvl: 'core', c: 'choice', n: 'headline',
    o: [[0.5, 'Median (50%)'], [0.6, '60%'], [0.7, '70%'], [0.8, '80% of futures'], [0.9, '90%'], [0.95, '95%']],
    h: 'The headline is the income this share of simulated futures meets or beats.' });
  def('plan.objective.realDollars', { l: 'Show money in today\'s dollars', g: 'plan', s: 'Objective', t: 'bool', d: true, sw: true, c: 'choice' });
  def('plan.objective.salaryBuffer', { l: 'Cushion on top of the pay replaced', g: 'plan', s: 'Objective', t: 'pct', d: 0.10, min: 0, max: 1, c: 'choice',
    w: is('plan.objective.kind', 'replaceSalary'),
    h: 'The target is your current take-home pay (after income tax and payroll tax) plus this cushion, in today\'s dollars. With no W-2 it is your living costs plus rent.' });

  /* ================================================================= INCOME */
  def('income.w2.enabled', { l: 'Model a W-2 job', g: 'income', t: 'bool', d: true, sw: true, lvl: 'core', c: 'choice',
    h: 'Off: the engine runs on contributions alone and skips debt-to-income checks, the passive-loss allowance and wage tax.' });
  def('income.w2.schedule', { l: 'Gross W-2 income', g: 'income', t: 'list', lvl: 'core', c: 'yours', w: yes('income.w2.enabled'),
    item: { from: { l: 'From', t: 'month' }, annual: { l: 'Annual', t: 'money' } },
    d: [{ from: '2026-10', annual: 72000 }] });
  def('income.w2.hoursPerYear', { l: 'Hours worked per year', g: 'income', t: 'int', d: 2080, w: yes('income.w2.enabled'), c: 'yours',
    h: 'REPS requires more real-estate hours than this.' });
  def('income.w2.preTaxDeferrals', { l: 'Pre-tax 401(k)/HSA contributions', g: 'income', t: 'money', d: 0, u: '/yr', w: yes('income.w2.enabled'), c: 'yours', n: 'allowance' });
  def('income.otherDebtsMonthly', { l: 'Other monthly debt payments', g: 'income', t: 'money', d: 0, u: '/mo', c: 'yours',
    h: 'Car, student loan, card minimums — lenders count them in debt-to-income.' });
  def('income.creditTier', { l: 'Credit score band', g: 'income', t: 'select', d: 'good', c: 'yours',
    o: [['excellent', '760+'], ['good', '720–759'], ['fair', '680–719']] });

  /* =================================================================== LIFE */
  def('life.career.enabled', { l: 'Model going part-time and quitting', g: 'life', s: 'Career', t: 'bool', d: true, sw: true, lvl: 'core', c: 'choice', n: 'career',
    w: yes('income.w2.enabled') });
  var careerOn = all(yes('income.w2.enabled'), yes('life.career.enabled'));
  def('life.career.partTime.enabled', { l: 'Go part-time first', g: 'life', s: 'Career', t: 'bool', d: true, sw: true, lvl: 'core', c: 'choice', w: careerOn });
  var ptOn = all(careerOn, yes('life.career.partTime.enabled'));
  def('life.career.partTime.trigger', { l: 'Part-time when', g: 'life', s: 'Career', t: 'select', d: 'coverage', w: ptOn, c: 'choice',
    o: [['coverage', 'Portfolio covers the pay I give up'], ['date', 'On a date']] });
  def('life.career.partTime.date', { l: 'Part-time from', g: 'life', s: 'Career', t: 'month', d: '2032-01', w: all(ptOn, is('life.career.partTime.trigger', 'date')), c: 'choice' });
  def('life.career.partTime.coverage', { l: 'Required coverage of the gap', g: 'life', s: 'Career', t: 'num', d: 1.25, min: 1, max: 3, step: 0.05, u: '×',
    w: all(ptOn, is('life.career.partTime.trigger', 'coverage')), c: 'choice' });
  def('life.career.partTime.annualIncome', { l: 'Part-time gross income', g: 'life', s: 'Career', t: 'money', d: 36000, u: '/yr', w: ptOn, c: 'yours' });
  def('life.career.partTime.hoursPerYear', { l: 'Part-time hours per year', g: 'life', s: 'Career', t: 'int', d: 1040, w: ptOn, c: 'yours' });
  def('life.career.quit.enabled', { l: 'Quit when the portfolio can carry you', g: 'life', s: 'Career', t: 'bool', d: true, sw: true, lvl: 'core', c: 'choice', w: careerOn });
  var quitOn = all(careerOn, yes('life.career.quit.enabled'));
  def('life.career.quit.trigger', { l: 'Quit when', g: 'life', s: 'Career', t: 'select', d: 'coverage', w: quitOn, c: 'choice',
    o: [['coverage', 'Portfolio covers my living costs'], ['date', 'On a date']] });
  def('life.career.quit.date', { l: 'Quit on', g: 'life', s: 'Career', t: 'month', d: '2035-01', w: all(quitOn, is('life.career.quit.trigger', 'date')), c: 'choice' });
  def('life.career.quit.coverage', { l: 'Required coverage of living costs', g: 'life', s: 'Career', t: 'num', d: 1.25, min: 1, max: 3, step: 0.05, u: '×',
    w: all(quitOn, is('life.career.quit.trigger', 'coverage')), c: 'choice' });
  def('life.career.sustainMonths', { l: 'Coverage must hold for', g: 'life', s: 'Career', t: 'int', d: 6, min: 1, max: 24, u: 'months', w: careerOn, c: 'choice' });
  def('life.career.minCashMonths', { l: 'Cash on hand before quitting', g: 'life', s: 'Career', t: 'int', d: 6, min: 0, max: 36, u: 'months of costs', w: quitOn, c: 'choice' });
  def('life.career.healthInsurance', { l: 'Health insurance after quitting', g: 'life', s: 'Career', t: 'money', d: 550, u: '/mo', w: careerOn, c: 'estimate',
    dist: { k: 'triRel', lo: -0.2, hi: 0.4 }, cat: 'costs' });

  def('life.houseHack.enabled', { l: 'Live in the first property (house-hack)', g: 'life', s: 'Housing', t: 'bool', d: true, sw: true, lvl: 'core', c: 'choice' });
  var hhOn = yes('life.houseHack.enabled');
  def('life.houseHack.stayMonths', { l: 'Stay in each house-hack for', g: 'life', s: 'Housing', t: 'int', d: 24, min: 12, max: 180, u: 'months', w: hhOn, lvl: 'core', c: 'choice',
    h: 'At least 12 — owner-occupied loans require it. Longer keeps your housing cost near zero but leaves one unit unrented.' });
  def('life.houseHack.count', { l: 'House-hacks in total (chain)', g: 'life', s: 'Housing', t: 'int', d: 1, min: 1, max: 6, w: hhOn, c: 'choice',
    h: 'After each stay you move into the next purchase. FHA is one loan at a time, so later ones use a 5%-down conventional loan.' });
  def('life.houseHack.afterLast', { l: 'After the last house-hack', g: 'life', s: 'Housing', t: 'select', d: 'stay', w: hhOn, c: 'choice',
    o: [['stay', 'Stay in it (until you buy your own home)'], ['rent', 'Move out and rent elsewhere']] });
  def('life.houseHack.product', { l: 'House-hack loan', g: 'life', s: 'Housing', t: 'select', d: 'auto', w: hhOn, c: 'choice',
    o: [['auto', 'Whichever qualifies with least cash'], ['fha', 'FHA only'], ['convOO', 'Conventional 5% only']] });
  def('life.ownHome.enabled', { l: 'Buy your own home later', g: 'life', s: 'Housing', t: 'bool', d: false, sw: true, c: 'choice', n: 'ownHome' });
  var homeOn = yes('life.ownHome.enabled');
  def('life.ownHome.trigger', { l: 'Buy it', g: 'life', s: 'Housing', t: 'select', d: 'afterPurchases', w: homeOn, c: 'choice',
    o: [['afterPurchases', 'After a number of rental purchases'], ['date', 'On a date']] });
  def('life.ownHome.afterPurchases', { l: 'After purchase number', g: 'life', s: 'Housing', t: 'int', d: 4, min: 1, max: 30, w: all(homeOn, is('life.ownHome.trigger', 'afterPurchases')), c: 'choice' });
  def('life.ownHome.date', { l: 'Buy on', g: 'life', s: 'Housing', t: 'month', d: '2032-06', w: all(homeOn, is('life.ownHome.trigger', 'date')), c: 'choice' });
  def('life.ownHome.price', { l: 'Home price, today\'s dollars', g: 'life', s: 'Housing', t: 'money', d: 350000, w: homeOn, c: 'yours' });
  def('life.ownHome.downPct', { l: 'Down payment', g: 'life', s: 'Housing', t: 'pct', d: 0.10, min: 0.03, max: 1, w: homeOn, c: 'yours' });
  def('life.ownHome.insurance', { l: 'Home insurance', g: 'life', s: 'Housing', t: 'money', d: 2200, u: '/yr', w: homeOn, c: 'estimate' });

  def('life.hours.budgetFullTime', { l: 'Hours a week for real estate — full-time job', g: 'life', s: 'Your time', t: 'num', d: 10, min: 0, max: 80, u: 'hrs/wk', lvl: 'core', c: 'yours', n: 'hours' });
  def('life.hours.budgetPartTime', { l: '… while part-time', g: 'life', s: 'Your time', t: 'num', d: 25, min: 0, max: 80, u: 'hrs/wk', c: 'yours', w: careerOn });
  def('life.hours.budgetQuit', { l: '… after quitting', g: 'life', s: 'Your time', t: 'num', d: 40, min: 0, max: 80, u: 'hrs/wk', c: 'yours' });
  var H = [['selfManagePerUnit', 'Self-managing a unit', 18, 'hrs/unit/yr'], ['managedPerUnit', 'Overseeing a managed unit', 3, 'hrs/unit/yr'],
           ['perTurnover', 'Each tenant turnover', 10, 'hrs'], ['perRefresh', 'Each unit refresh', 20, 'hrs'],
           ['perAcquisition', 'Each purchase (search to close)', 80, 'hrs'], ['hcvPerUnit', 'Voucher unit extra (inspections)', 3, 'hrs/unit/yr'],
           ['mtrPerUnit', 'Mid-term furnished unit', 40, 'hrs/unit/yr'], ['strPerUnit', 'Nightly rental unit', 150, 'hrs/unit/yr'],
           ['roomPerUnit', 'By-the-room unit', 45, 'hrs/unit/yr'], ['offMarketPer100', 'Off-market outreach', 2, 'hrs per 100 touches'],
           ['licenseCourse', 'License course (once)', 90, 'hrs'], ['licenseAgentYear', 'Agent work on your own deals', 100, 'hrs/yr'],
           ['heatProjectPerUnit', 'Heat conversion project', 8, 'hrs/unit']];
  H.forEach(function (x) {
    def('life.hours.' + x[0], { l: x[1], g: 'life', s: 'Hours each activity takes', t: 'num', d: x[2], min: 0, u: x[3], c: 'estimate', n: 'hours', lvl: 'adv' });
  });

  def('life.emergencyFund.enabled', { l: 'Keep an emergency fund', g: 'life', s: 'Safety', t: 'bool', d: true, sw: true, c: 'choice', n: 'emergencyFund' });
  def('life.emergencyFund.months', { l: 'Emergency fund', g: 'life', s: 'Safety', t: 'num', d: 6, min: 0, max: 36, u: 'months of costs', w: yes('life.emergencyFund.enabled'), c: 'choice' });
  def('life.breakers.cashBuffer.enabled', { l: 'Pause buying when free cash runs low', g: 'life', s: 'Circuit breakers', t: 'bool', d: true, sw: true, c: 'choice', n: 'breakers' });
  def('life.breakers.cashBuffer.months', { l: 'Free cash below', g: 'life', s: 'Circuit breakers', t: 'num', d: 3, min: 0, max: 24, u: 'months of costs', w: yes('life.breakers.cashBuffer.enabled'), c: 'choice' });
  def('life.breakers.cashBuffer.perUnit', { l: '… plus, for each unit you own', g: 'life', s: 'Circuit breakers', t: 'money', d: 1000, min: 0, max: 10000, u: '/unit',
    w: yes('life.breakers.cashBuffer.enabled'), c: 'choice', h: 'A portfolio\'s bad months grow with its size: four turnovers and an eviction in one month is ordinary at 25 units.' });
  def('life.shortfall.policy', { l: 'If cash would run out', g: 'life', s: 'Circuit breakers', t: 'select', d: 'sell', c: 'choice', n: 'shortfall',
    o: [['sell', 'Draw the HELOC if there is one, otherwise sell the weakest building'], ['fail', 'Nothing — count the plan as failed']],
    h: 'Either way the uncertainty layer reports how often it happens. A forced sale shrinks the portfolio; a failed plan scores zero.' });
  def('life.shortfall.discount', { l: 'Price cut on a forced sale', g: 'life', s: 'Circuit breakers', t: 'pct', d: 0.05, min: 0, max: 0.3, w: is('life.shortfall.policy', 'sell'), c: 'estimate' });
  def('life.breakers.negativeCF.enabled', { l: 'Pause buying while cash flow runs negative', g: 'life', s: 'Circuit breakers', t: 'bool', d: true, sw: true, c: 'choice',
    h: 'The rentals\' cash flow averaged over the window below. The building you live in is left out — it is your housing. An average, so one turnover month does not trip it and one good month does not reset it.' });
  def('life.breakers.negativeCF.months', { l: 'Averaged over', g: 'life', s: 'Circuit breakers', t: 'int', d: 6, min: 1, max: 24, u: 'months', w: yes('life.breakers.negativeCF.enabled'), c: 'choice' });
  def('life.breakers.jobLoss.enabled', { l: 'Hold and survive if the job stops', g: 'life', s: 'Circuit breakers', t: 'bool', d: true, sw: true, c: 'choice',
    w: yes('income.w2.enabled'), h: 'While out of work: no buying, contributions stop, reserves are defended.' });
  def('life.breakers.jobLoss.annualProb', { l: 'Chance of losing the job in a year', g: 'life', s: 'Circuit breakers', t: 'pct', d: 0.04, min: 0, max: 0.5, c: 'estimate',
    w: all(yes('income.w2.enabled'), yes('life.breakers.jobLoss.enabled')), h: 'Used only by the uncertainty layer.' });
  def('life.breakers.jobLoss.months', { l: 'Months out of work', g: 'life', s: 'Circuit breakers', t: 'int', d: 6, min: 1, max: 24, c: 'estimate',
    w: all(yes('income.w2.enabled'), yes('life.breakers.jobLoss.enabled')) });
  def('life.draws.mode', { l: 'Take money out before quitting', g: 'life', s: 'Draws', t: 'select', d: 'none', c: 'choice',
    o: [['none', 'No — reinvest everything'], ['fixed', 'A fixed monthly draw'], ['afterThreshold', 'A draw once cash flow passes a threshold']] });
  def('life.draws.amount', { l: 'Monthly draw', g: 'life', s: 'Draws', t: 'money', d: 1000, w: ['life.draws.mode', 'ne', 'none'], c: 'choice' });
  def('life.draws.threshold', { l: 'Start drawing when cash flow passes', g: 'life', s: 'Draws', t: 'money', d: 3000, w: is('life.draws.mode', 'afterThreshold'), c: 'choice' });

  /* ================================================================= MARKET */
  def('market.rentGrowth', { l: 'Market rent growth', g: 'market', t: 'pct', d: 0.03, min: -0.05, max: 0.10, u: '/yr', lvl: 'core', c: 'estimate', n: 'rentGrowth',
    dist: { k: 'triAdd', lo: -0.015, hi: 0.015 }, cat: 'market' });
  def('market.priceTracksRents', { l: 'Building prices follow rents', g: 'market', t: 'bool', d: true, sw: true, c: 'choice', n: 'priceIndex',
    h: 'On: one price index = rents ÷ cap-rate path. Off: prices grow at a separate appreciation rate (the old behaviour).' });
  def('market.capRateDriftBps', { l: 'Cap-rate drift', g: 'market', t: 'num', d: 0, min: -50, max: 50, step: 1, u: 'bps/yr', c: 'estimate', n: 'priceIndex',
    w: yes('market.priceTracksRents'), dist: { k: 'triAdd', lo: -12, hi: 12 }, cat: 'market',
    h: 'Positive = cap rates rise = prices fall relative to rents.' });
  def('market.appreciation', { l: 'Appreciation', g: 'market', t: 'pct', d: 0.035, min: -0.05, max: 0.10, u: '/yr', c: 'estimate', n: 'priceIndex',
    w: is('market.priceTracksRents', false), dist: { k: 'triAdd', lo: -0.02, hi: 0.015 }, cat: 'market' });
  def('market.expenseInflation', { l: 'Operating cost inflation', g: 'market', t: 'pct', d: 0.03, min: 0, max: 0.10, u: '/yr', c: 'estimate',
    dist: { k: 'triAdd', lo: -0.01, hi: 0.015 }, cat: 'costs' });
  def('market.cpi', { l: 'Consumer price inflation', g: 'market', t: 'pct', d: 0.03, min: 0, max: 0.10, u: '/yr', c: 'estimate',
    h: 'Inflates your living costs and converts results to today\'s dollars.' });
  def('market.insurance.nearTermRate', { l: 'Insurance inflation through the near term', g: 'market', s: 'Insurance', t: 'pct', d: 0.08, u: '/yr', c: 'verified', n: 'insurance', unav: true,
    dist: { k: 'triAdd', lo: -0.03, hi: 0.04 }, cat: 'costs' });
  def('market.insurance.nearTermUntil', { l: 'Near term runs through', g: 'market', s: 'Insurance', t: 'int', d: 2028, min: 2026, max: 2040, u: 'year', c: 'verified', n: 'insurance' });
  def('market.insurance.longTermRate', { l: 'Insurance inflation after that', g: 'market', s: 'Insurance', t: 'pct', d: 0.04, u: '/yr', c: 'estimate', n: 'insurance',
    dist: { k: 'triAdd', lo: -0.01, hi: 0.03 }, cat: 'costs' });
  def('market.insurancePerUnit', { l: 'Insurance where a listing gives none', g: 'market', s: 'Insurance', t: 'money', d: 800, u: '/unit/yr', c: 'estimate', unav: true,
    dist: { k: 'triRel', lo: -0.15, hi: 0.35 }, cat: 'costs' });
  def('market.tax.residentialRate', { l: 'Property tax, 1–3 units', g: 'market', s: 'Property tax', t: 'pct', d: 0.01343, step: 0.0001, c: 'verified', n: 'propTaxResidential', unav: true });
  def('market.tax.commercialRate', { l: 'Property tax, 4+ units', g: 'market', s: 'Property tax', t: 'pct', d: 0.01492, step: 0.0001, c: 'verified', n: 'propTaxCommercial', unav: true });
  def('market.tax.commercialThreshold', { l: 'Commercial class starts at', g: 'market', s: 'Property tax', t: 'int', d: 4, min: 2, max: 20, u: 'units', c: 'verified', n: 'propTaxCommercial' });
  def('market.tax.assessmentRatio', { l: 'Assessed value as a share of market value', g: 'market', s: 'Property tax', t: 'pct', d: 0.93, min: 0.8, max: 1.05, c: 'estimate', n: 'assessment' });
  def('market.tax.statedIsFloor', { l: 'Never cut a stated tax bill automatically', g: 'market', s: 'Property tax', t: 'bool', d: true, sw: true, c: 'choice', n: 'assessment' });
  def('market.tax.specialsPerParcel', { l: 'Special assessments where unknown', g: 'market', s: 'Property tax', t: 'money', d: 400, min: 0, u: '/parcel/yr', c: 'guess', n: 'specialAssessments', unav: true,
    dist: { k: 'tri', lo: 0, hi: 1500 }, cat: 'costs' });
  def('market.buildingShare', { l: 'Building share of value (depreciable)', g: 'market', t: 'pct', d: 0.80, min: 0.5, max: 0.95, c: 'estimate', n: 'buildingShare' });
  def('market.closingCostPct', { l: 'Buyer closing costs', g: 'market', t: 'pct', d: 0.03, min: 0.01, max: 0.06, c: 'estimate', n: 'closingCost' });
  def('market.sellingCostPct', { l: 'Selling costs', g: 'market', t: 'pct', d: 0.06, min: 0.02, max: 0.10, c: 'estimate', n: 'sellingCost' });
  def('market.driftListings', { l: 'Age listing prices and rents with the market', g: 'market', t: 'bool', d: true, sw: true, c: 'choice' });
  def('market.valueCaptureImprovements', { l: 'Value added by capital work', g: 'market', t: 'pct', d: 0.5, min: 0, max: 1.5, c: 'estimate',
    h: 'A $15K roof rarely adds $15K of value.' });

  /* ================================================================== RATES */
  var R = obs.rates;
  def('rates.fha', { l: 'FHA', g: 'rates', s: 'Rates today', t: 'pct', d: R.fha, step: 0.00125, c: 'vendor', n: 'rates', lvl: 'core' });
  def('rates.convOO', { l: 'Conventional, owner-occupied 2–4', g: 'rates', s: 'Rates today', t: 'pct', d: R.convOwnerOcc, step: 0.00125, c: 'estimate', n: 'rates' });
  def('rates.convInv', { l: 'Conventional investment 2–4', g: 'rates', s: 'Rates today', t: 'pct', d: R.convInvestment, step: 0.00125, c: 'vendor', n: 'rates', lvl: 'core' });
  def('rates.dscr', { l: 'DSCR loan', g: 'rates', s: 'Rates today', t: 'pct', d: R.dscr, step: 0.00125, c: 'vendor', n: 'rates', lvl: 'core' });
  def('rates.commercial', { l: 'Local bank / commercial', g: 'rates', s: 'Rates today', t: 'pct', d: R.commercial, step: 0.00125, c: 'estimate', n: 'commercial' });
  def('rates.heloc', { l: 'HELOC on investment property', g: 'rates', s: 'Rates today', t: 'pct', d: R.heloc, step: 0.00125, c: 'estimate', n: 'rates' });
  def('rates.path.enabled', { l: 'Rates change over time', g: 'rates', s: 'Rate path', t: 'bool', d: false, sw: true, c: 'choice', n: 'rates',
    h: 'Off: today\'s rates hold for the whole horizon. No forecast is built in.' });
  def('rates.path.points', { l: 'Rate changes', g: 'rates', s: 'Rate path', t: 'list', w: yes('rates.path.enabled'), c: 'yours',
    item: { fromYear: { l: 'From year', t: 'int' }, add: { l: 'Change vs today', t: 'pct' } },
    d: [{ fromYear: 2028, add: -0.0035 }, { fromYear: 2030, add: -0.0065 }] });
  def('rates.randomSigma', { l: 'Rate volatility', g: 'rates', s: 'Uncertainty', t: 'pct', d: 0.0075, u: '/yr', c: 'estimate', n: 'rateRandom', lvl: 'adv',
    w: yes('mc.sample.rates') });

  /* ================================================================ LENDING */
  def('lending.productChoice', { l: 'When several loans qualify', g: 'lending', t: 'select', d: 'leastCash', c: 'choice',
    o: [['leastCash', 'Least cash to close, then lowest payment'], ['lowestPayment', 'Lowest monthly payment'], ['bestCashFlow', 'Best cash flow']] });
  def('lending.amortYears', { l: 'Residential loan term', g: 'lending', t: 'int', d: 30, min: 10, max: 40, u: 'years', c: 'rule' });
  def('lending.refiCostPct', { l: 'Refinance costs', g: 'lending', t: 'pct', d: 0.02, c: 'estimate' });
  def('lending.recastAllowed', { l: 'Servicers allow recasts (not FHA)', g: 'lending', t: 'bool', d: true, sw: true, c: 'estimate' });
  def('lending.recastFee', { l: 'Recast fee', g: 'lending', t: 'money', d: 350, w: yes('lending.recastAllowed'), c: 'estimate' });

  def('lending.fha.enabled', { l: 'FHA loans', g: 'lending', s: 'FHA (live-in, 1–4 units)', t: 'bool', d: true, sw: true, c: 'rule', n: 'fha' });
  var fhaOn = yes('lending.fha.enabled');
  def('lending.fha.downPct', { l: 'Down payment', g: 'lending', s: 'FHA (live-in, 1–4 units)', t: 'pct', d: 0.035, w: fhaOn, c: 'rule', n: 'fha' });
  def('lending.fha.ufmip', { l: 'Upfront MIP (financed)', g: 'lending', s: 'FHA (live-in, 1–4 units)', t: 'pct', d: 0.0175, w: fhaOn, c: 'rule', n: 'fha' });
  def('lending.fha.annualMip', { l: 'Annual MIP', g: 'lending', s: 'FHA (live-in, 1–4 units)', t: 'pct', d: 0.0055, w: fhaOn, c: 'rule', n: 'fha' });
  def('lending.fha.maxDti', { l: 'Maximum debt-to-income', g: 'lending', s: 'FHA (live-in, 1–4 units)', t: 'pct', d: 0.50, w: fhaOn, c: 'rule', n: 'dti' });
  def('lending.fha.selfSufficiency', { l: 'Apply the 3–4 unit self-sufficiency test', g: 'lending', s: 'FHA (live-in, 1–4 units)', t: 'bool', d: true, sw: true, w: fhaOn, c: 'rule', n: 'fha' });
  def('lending.fha.reservesMonths34', { l: 'Reserves on 3–4 units', g: 'lending', s: 'FHA (live-in, 1–4 units)', t: 'num', d: 3, u: 'months PITI', w: fhaOn, c: 'rule' });

  def('lending.convOO.enabled', { l: 'Conventional owner-occupied loans', g: 'lending', s: 'Conventional live-in (2–4)', t: 'bool', d: true, sw: true, c: 'rule', n: 'convOO' });
  var cooOn = yes('lending.convOO.enabled');
  def('lending.convOO.downPct', { l: 'Down payment', g: 'lending', s: 'Conventional live-in (2–4)', t: 'pct', d: 0.05, w: cooOn, c: 'rule', n: 'convOO' });
  def('lending.convOO.pmiRate', { l: 'Mortgage insurance', g: 'lending', s: 'Conventional live-in (2–4)', t: 'pct', d: 0.005, u: '/yr', w: cooOn, c: 'estimate' });
  def('lending.convOO.pmiCancelLtv', { l: 'Mortgage insurance ends at', g: 'lending', s: 'Conventional live-in (2–4)', t: 'pct', d: 0.78, u: 'of original value', w: cooOn, c: 'rule' });
  def('lending.convOO.maxDti', { l: 'Maximum debt-to-income', g: 'lending', s: 'Conventional live-in (2–4)', t: 'pct', d: 0.45, w: cooOn, c: 'rule', n: 'dti' });
  def('lending.convOO.reservesMonths', { l: 'Reserves', g: 'lending', s: 'Conventional live-in (2–4)', t: 'num', d: 6, u: 'months PITIA', w: cooOn, c: 'rule' });

  def('lending.convInv.enabled', { l: 'Conventional investment loans', g: 'lending', s: 'Conventional investment (2–4)', t: 'bool', d: true, sw: true, c: 'rule', n: 'convInv' });
  var ciOn = yes('lending.convInv.enabled');
  def('lending.convInv.downPct', { l: 'Down payment', g: 'lending', s: 'Conventional investment (2–4)', t: 'pct', d: 0.25, w: ciOn, c: 'rule', n: 'convInv' });
  def('lending.convInv.maxDti', { l: 'Maximum debt-to-income', g: 'lending', s: 'Conventional investment (2–4)', t: 'pct', d: 0.45, w: ciOn, c: 'rule', n: 'dti' });
  def('lending.convInv.reservesMonths', { l: 'Reserves on the purchase', g: 'lending', s: 'Conventional investment (2–4)', t: 'num', d: 6, u: 'months PITIA', w: ciOn, c: 'rule', n: 'convInv' });
  def('lending.convInv.otherReserves', { l: 'Plus 2/4/6% of other mortgage balances', g: 'lending', s: 'Conventional investment (2–4)', t: 'bool', d: true, sw: true, w: ciOn, c: 'rule', n: 'convInv' });
  def('lending.convInv.maxFinanced', { l: 'Most financed properties', g: 'lending', s: 'Conventional investment (2–4)', t: 'int', d: 10, w: ciOn, c: 'rule', n: 'convInv' });
  def('lending.convInv.countSellerNotes', { l: 'Seller notes count toward the 10', g: 'lending', s: 'Conventional investment (2–4)', t: 'bool', d: true, sw: true, w: ciOn, c: 'estimate', n: 'sellerFinance' });

  def('lending.dscr.enabled', { l: 'DSCR loans', g: 'lending', s: 'DSCR (investment)', t: 'bool', d: true, sw: true, c: 'rule', n: 'dscr' });
  var dsOn = yes('lending.dscr.enabled');
  def('lending.dscr.downPct', { l: 'Down payment', g: 'lending', s: 'DSCR (investment)', t: 'pct', d: 0.25, w: dsOn, c: 'vendor', n: 'dscr' });
  def('lending.dscr.minDscr', { l: 'Minimum DSCR (gross rent ÷ PITIA)', g: 'lending', s: 'DSCR (investment)', t: 'num', d: 1.0, step: 0.05, w: dsOn, c: 'vendor', n: 'dscr' });
  def('lending.dscr.rentBasis', { l: 'Rent the lender counts on leased units', g: 'lending', s: 'DSCR (investment)', t: 'select', d: 'lesser', w: dsOn, c: 'vendor', n: 'dscr',
    o: [['lesser', 'Lesser of lease and market (typical)'], ['lease', 'The lease'], ['market', 'Appraised market rent'], ['greater', 'Greater of the two (old engine)']] });
  def('lending.dscr.reservesMonths', { l: 'Reserves', g: 'lending', s: 'DSCR (investment)', t: 'num', d: 6, u: 'months PITIA', w: dsOn, c: 'vendor' });
  def('lending.dscr.prepayYears', { l: 'Prepayment penalty', g: 'lending', s: 'DSCR (investment)', t: 'select', d: 5, w: dsOn, c: 'vendor', n: 'dscr',
    o: [[5, '5 years (5-4-3-2-1%)'], [3, '3 years (+0.25% rate)'], [0, 'None (+0.75% rate)']] });

  def('lending.commercial.enabled', { l: 'Local bank / commercial loans', g: 'lending', s: 'Commercial (5+ units)', t: 'bool', d: true, sw: true, c: 'estimate', n: 'commercial' });
  var coOn = yes('lending.commercial.enabled');
  def('lending.commercial.downPct', { l: 'Down payment', g: 'lending', s: 'Commercial (5+ units)', t: 'pct', d: 0.25, w: coOn, c: 'estimate', n: 'commercial' });
  def('lending.commercial.amortYears', { l: 'Amortization', g: 'lending', s: 'Commercial (5+ units)', t: 'int', d: 25, u: 'years', w: coOn, c: 'estimate' });
  def('lending.commercial.balloonYears', { l: 'Balloon', g: 'lending', s: 'Commercial (5+ units)', t: 'int', d: 5, u: 'years', w: coOn, c: 'estimate' });
  def('lending.commercial.minDscr', { l: 'Minimum DSCR (NOI ÷ debt service)', g: 'lending', s: 'Commercial (5+ units)', t: 'num', d: 1.20, step: 0.05, w: coOn, c: 'estimate' });
  def('lending.commercial.reservesMonths', { l: 'Reserves', g: 'lending', s: 'Commercial (5+ units)', t: 'num', d: 6, u: 'months', w: coOn, c: 'estimate' });

  def('lending.gates.dti', { l: 'Check debt-to-income', g: 'lending', s: 'Gates', t: 'bool', d: true, sw: true, c: 'rule', n: 'dti', w: yes('income.w2.enabled') });
  def('lending.gates.reserves', { l: 'Require lender reserves', g: 'lending', s: 'Gates', t: 'bool', d: true, sw: true, c: 'rule', n: 'reserves' });
  def('lending.gates.historyAfterQuit', { l: 'Months of rental history lenders want after you quit', g: 'lending', s: 'Gates', t: 'int', d: 24, min: 0, max: 36, c: 'rule', n: 'dti',
    w: all(yes('income.w2.enabled'), yes('life.career.enabled')) });
  def('lending.balloon.test', { l: 'Test every balloon refinance', g: 'lending', s: 'Balloons', t: 'bool', d: true, sw: true, c: 'rule', n: 'balloon' });
  def('lending.balloon.onFailure', { l: 'If a balloon cannot refinance', g: 'lending', s: 'Balloons', t: 'select', d: 'forcedSale', w: yes('lending.balloon.test'), c: 'choice', n: 'balloon',
    o: [['forcedSale', 'Sell the property'], ['extend', 'Extend at a penalty rate']] });
  def('lending.balloon.extendRateAdd', { l: 'Penalty rate on an extension', g: 'lending', s: 'Balloons', t: 'pct', d: 0.02, w: all(yes('lending.balloon.test'), is('lending.balloon.onFailure', 'extend')), c: 'estimate' });

  /* ============================================================ OPERATIONS */
  def('ops.rentMethod', { l: 'How rents reach market', g: 'ops', s: 'Rents', t: 'select', d: 'turnover', lvl: 'core', c: 'choice', n: 'turnover',
    o: [['turnover', 'At turnover and renewal (realistic)'], ['ramp', 'Even ramp over a fixed window (old engine)'], ['none', 'Never — only normal increases']] });
  def('ops.rampMonths', { l: 'Ramp window', g: 'ops', s: 'Rents', t: 'int', d: 18, u: 'months', w: is('ops.rentMethod', 'ramp'), c: 'choice' });
  def('ops.renewal.policy', { l: 'Renewal increases for below-market tenants', g: 'ops', s: 'Rents', t: 'select', d: 'push', c: 'choice',
    w: ['ops.rentMethod', 'ne', 'ramp'],
    o: [['push', 'Push toward market'], ['market', 'Normal market increases only']] });
  def('ops.renewal.pushPct', { l: 'Push increase', g: 'ops', s: 'Rents', t: 'pct', d: 0.08, min: 0, max: 0.3, u: '/yr', c: 'choice',
    w: all(is('ops.rentMethod', 'turnover'), is('ops.renewal.policy', 'push')) });
  def('ops.asIsFactor', { l: 'Unrenovated units achieve', g: 'ops', s: 'Rents', t: 'pct', d: 0.90, min: 0.6, max: 1, u: 'of survey rent', c: 'estimate', n: 'asIsFactor',
    dist: { k: 'triAdd', lo: -0.08, hi: 0.06 }, cat: 'market' });
  var toOn = is('ops.rentMethod', 'turnover');
  def('ops.turnover.atMarket', { l: 'Move-out rate, tenants at market', g: 'ops', s: 'Turnover', t: 'pct', d: 0.40, u: '/yr', w: toOn, c: 'estimate', n: 'turnover',
    dist: { k: 'triAdd', lo: -0.10, hi: 0.10 }, cat: 'turnover' });
  def('ops.turnover.belowMarket', { l: 'Move-out rate, long-tenured below-market tenants', g: 'ops', s: 'Turnover', t: 'pct', d: 0.25, u: '/yr', w: toOn, c: 'estimate', n: 'turnover',
    dist: { k: 'triAdd', lo: -0.10, hi: 0.10 }, cat: 'turnover' });
  def('ops.turnover.sensitivity', { l: 'Extra move-outs per point of increase above normal', g: 'ops', s: 'Turnover', t: 'num', d: 1.5, min: 0, max: 5, step: 0.1, w: toOn, c: 'estimate', n: 'turnover',
    dist: { k: 'triRel', lo: -0.5, hi: 0.6 }, cat: 'turnover' });
  def('ops.turnover.downtimeMonths', { l: 'Empty months per turnover', g: 'ops', s: 'Turnover', t: 'num', d: 1.0, min: 0, max: 6, step: 0.25, c: 'estimate', n: 'turnover',
    dist: { k: 'triRel', lo: -0.4, hi: 0.8 }, cat: 'turnover' });
  def('ops.turnover.winterFactor', { l: 'Winter move-outs take longer to fill', g: 'ops', s: 'Turnover', t: 'num', d: 1.5, min: 1, max: 3, step: 0.1, u: '×', c: 'estimate' });
  def('ops.turnover.turnCost', { l: 'Basic turn cost', g: 'ops', s: 'Turnover', t: 'money', d: 1500, u: '/unit', c: 'estimate', dist: { k: 'triRel', lo: -0.3, hi: 0.6 }, cat: 'costs' });
  def('ops.turnover.leaseMonths', { l: 'Lease length', g: 'ops', s: 'Turnover', t: 'int', d: 12, min: 1, max: 24, u: 'months', c: 'choice' });
  def('ops.turnover.winterProof', { l: 'Time new leases to end in spring or summer', g: 'ops', s: 'Turnover', t: 'bool', d: false, sw: true, c: 'choice',
    h: 'Sets new leases at 12–18 months so none end November–February.' });
  def('ops.refresh.policy', { l: 'Refresh units to reach full market rent', g: 'ops', s: 'Refresh', t: 'select', d: 'onTurnover', c: 'choice', n: 'asIsFactor',
    o: [['onTurnover', 'When a tenant leaves'], ['atPurchase', 'All units right after buying'], ['never', 'Never']] });
  def('ops.refresh.costPerUnit', { l: 'Refresh cost', g: 'ops', s: 'Refresh', t: 'money', d: 5000, u: '/unit', w: ['ops.refresh.policy', 'ne', 'never'], c: 'estimate',
    dist: { k: 'triRel', lo: -0.3, hi: 0.6 }, cat: 'costs' });
  def('ops.refresh.deferWhenTight', { l: 'Skip the refresh when cash is tight', g: 'ops', s: 'Refresh', t: 'bool', d: true, sw: true, w: ['ops.refresh.policy', 'ne', 'never'], c: 'choice',
    h: 'Re-let as-is instead of refreshing when the refresh would take cash below your emergency fund.' });
  def('ops.refresh.extraDowntime', { l: 'Extra empty time for a refresh', g: 'ops', s: 'Refresh', t: 'num', d: 0.5, step: 0.25, u: 'months', w: ['ops.refresh.policy', 'ne', 'never'], c: 'estimate' });
  def('ops.vacancy.enabled', { l: 'Count vacancy and bad debt', g: 'ops', s: 'Vacancy', t: 'bool', d: true, sw: true, c: 'choice', n: 'vacancy' });
  var vacOn = yes('ops.vacancy.enabled');
  def('ops.vacancy.method', { l: 'Vacancy comes from', g: 'ops', s: 'Vacancy', t: 'select', d: 'turnover', w: vacOn, c: 'choice', n: 'vacancy',
    o: [['turnover', 'Turnover × empty months (realistic)'], ['flat', 'A flat percentage (old engine)']] });
  def('ops.vacancy.flatPct', { l: 'Flat vacancy', g: 'ops', s: 'Vacancy', t: 'pct', d: 0.07, w: all(vacOn, is('ops.vacancy.method', 'flat')), c: 'estimate', n: 'vacancy',
    dist: { k: 'triAdd', lo: -0.03, hi: 0.04 }, cat: 'turnover' });
  def('ops.vacancy.creditLoss', { l: 'Bad debt and concessions', g: 'ops', s: 'Vacancy', t: 'pct', d: 0.01, w: vacOn, c: 'estimate', dist: { k: 'triAdd', lo: -0.005, hi: 0.015 }, cat: 'turnover' });
  def('ops.vacancy.evictionRate', { l: 'Evictions per unit per year', g: 'ops', s: 'Vacancy', t: 'pct', d: 0.015, step: 0.005, w: vacOn, c: 'estimate', n: 'evictions',
    dist: { k: 'triRel', lo: -0.5, hi: 1.0 }, cat: 'turnover' });
  def('ops.vacancy.evictionCost', { l: 'Cost of an eviction', g: 'ops', s: 'Vacancy', t: 'money', d: 4000, w: vacOn, c: 'estimate', n: 'evictions',
    h: 'Filing, attorney, lost rent beyond the deposit, and cleanup. The unit then sits empty about three months.' });
  def('ops.vacancy.marketPremium', { l: 'Extra market vacancy (oversupply)', g: 'ops', s: 'Vacancy', t: 'pct', d: 0, w: vacOn, c: 'choice' });
  def('ops.maintenance.enabled', { l: 'Count routine maintenance', g: 'ops', s: 'Maintenance', t: 'bool', d: true, sw: true, c: 'choice', n: 'maintenance' });
  var mOn = yes('ops.maintenance.enabled');
  def('ops.maintenance.method', { l: 'Maintenance', g: 'ops', s: 'Maintenance', t: 'select', d: 'byAge', w: mOn, c: 'choice',
    o: [['byAge', 'By building age'], ['flat', 'Flat share of rent']] });
  def('ops.maintenance.flatPct', { l: 'Maintenance', g: 'ops', s: 'Maintenance', t: 'pct', d: 0.08, w: all(mOn, is('ops.maintenance.method', 'flat')), u: 'of rent', c: 'estimate',
    dist: { k: 'triRel', lo: -0.25, hi: 0.4 }, cat: 'costs' });
  [['pre1940', 'Built before 1940', 0.09], ['y1940', 'Built 1940–1969', 0.08], ['y1970', 'Built 1970–1989', 0.07], ['y1990', 'Built 1990 or later', 0.06]].forEach(function (x) {
    def('ops.maintenance.' + x[0], { l: x[1], g: 'ops', s: 'Maintenance', t: 'pct', d: x[2], u: 'of rent', w: all(mOn, is('ops.maintenance.method', 'byAge')), c: 'estimate', n: 'maintenance', lvl: 'adv',
      dist: { k: 'triRel', lo: -0.25, hi: 0.4 }, cat: 'costs' });
  });
  def('ops.capex.components', { l: 'Schedule big-ticket replacements', g: 'ops', s: 'Capital items', t: 'bool', d: true, sw: true, c: 'choice',
    h: 'Roof, furnace, water heaters, windows, siding, lot — each on its own life.' });
  def('ops.capex.lifeJitterYears', { l: 'Uncertainty in remaining life', g: 'ops', s: 'Capital items', t: 'num', d: 3, u: 'years', w: all(yes('ops.capex.components'), yes('mc.sample.capex')), c: 'estimate', lvl: 'adv' });
  def('ops.capex.deferMonths', { l: 'Put off a failing item when cash is tight, up to', g: 'ops', s: 'Capital items', t: 'int', d: 6, min: 0, max: 24, u: 'months',
    w: yes('ops.capex.components'), c: 'choice', h: 'A replacement that would take cash below your emergency fund waits, month by month, up to this long. 0 = never wait.' });
  def('ops.capex.reserve', { l: 'Fund a capital reserve account', g: 'ops', s: 'Capital items', t: 'bool', d: true, sw: true, c: 'choice', n: 'capexReserve' });
  def('ops.capex.reservePct', { l: 'Reserve contribution', g: 'ops', s: 'Capital items', t: 'pct', d: 0.05, u: 'of rent', w: yes('ops.capex.reserve'), c: 'choice' });
  def('ops.capex.reserveTarget', { l: 'Stop funding at', g: 'ops', s: 'Capital items', t: 'money', d: 2000, u: '/unit', w: yes('ops.capex.reserve'), c: 'choice' });
  def('ops.management.enabled', { l: 'Hire property management', g: 'ops', s: 'Management', t: 'bool', d: true, sw: true, lvl: 'core', c: 'choice', n: 'management',
    h: 'Off: you self-manage everything, forever.' });
  var mgOn = yes('ops.management.enabled');
  def('ops.management.trigger', { l: 'Hire when', g: 'ops', s: 'Management', t: 'select', d: 'timeBudget', w: mgOn, lvl: 'core', c: 'choice',
    o: [['timeBudget', 'My hours exceed my weekly budget'], ['units', 'Unit count reaches'], ['properties', 'Property count reaches'],
        ['cashFlow', 'Monthly cash flow reaches'], ['date', 'On a date'], ['always', 'From the first purchase']] });
  def('ops.management.units', { l: 'Units', g: 'ops', s: 'Management', t: 'int', d: 12, w: all(mgOn, is('ops.management.trigger', 'units')), c: 'choice' });
  def('ops.management.properties', { l: 'Properties', g: 'ops', s: 'Management', t: 'int', d: 4, w: all(mgOn, is('ops.management.trigger', 'properties')), c: 'choice' });
  def('ops.management.cashFlow', { l: 'Cash flow', g: 'ops', s: 'Management', t: 'money', d: 3000, u: '/mo', w: all(mgOn, is('ops.management.trigger', 'cashFlow')), c: 'choice' });
  def('ops.management.date', { l: 'From', g: 'ops', s: 'Management', t: 'month', d: '2030-01', w: all(mgOn, is('ops.management.trigger', 'date')), c: 'choice' });
  def('ops.management.feePct', { l: 'Management fee', g: 'ops', s: 'Management', t: 'pct', d: 0.10, u: 'of collected rent', w: mgOn, c: 'verified', n: 'management' });
  def('ops.management.leasingPct', { l: 'Leasing fee', g: 'ops', s: 'Management', t: 'pct', d: 0.75, u: 'of one month\'s rent', w: mgOn, c: 'verified', n: 'management' });

  /* =================================================================== TAX */
  def('tax.enabled', { l: 'Model income tax', g: 'tax', t: 'bool', d: true, sw: true, lvl: 'core', c: 'choice', n: 'taxTables',
    h: 'Off: every figure is before income tax.' });
  var taxOn = yes('tax.enabled');
  def('tax.state', { l: 'Include North Dakota income tax', g: 'tax', t: 'bool', d: true, sw: true, w: taxOn, c: 'rule' });
  def('tax.indexBrackets', { l: 'Index brackets with inflation', g: 'tax', t: 'bool', d: true, sw: true, w: taxOn, c: 'rule', n: 'taxTables' });
  def('tax.allowance', { l: 'Apply the $25,000 passive-loss allowance', g: 'tax', t: 'bool', d: true, sw: true, w: taxOn, c: 'rule', n: 'allowance' });
  def('tax.reps.mode', { l: 'Real Estate Professional Status', g: 'tax', s: 'REPS', t: 'select', d: 'auto', w: taxOn, c: 'choice', n: 'reps',
    o: [['auto', 'When my hours qualify'], ['never', 'Never'], ['fromYear', 'From a year I choose']] });
  def('tax.reps.fromYear', { l: 'REPS from', g: 'tax', s: 'REPS', t: 'int', d: 2034, w: all(taxOn, is('tax.reps.mode', 'fromYear')), c: 'choice' });
  def('tax.reps.materialHours', { l: 'Own rental hours needed for material participation', g: 'tax', s: 'REPS', t: 'int', d: 500, w: all(taxOn, ['tax.reps.mode', 'ne', 'never']), c: 'rule', n: 'reps' });
  def('tax.qbi.enabled', { l: 'Take the 20% QBI deduction', g: 'tax', s: 'QBI', t: 'bool', d: true, sw: true, w: taxOn, c: 'rule', n: 'qbi' });
  def('tax.qbi.qualify', { l: 'Rentals qualify', g: 'tax', s: 'QBI', t: 'select', d: 'hours', w: all(taxOn, yes('tax.qbi.enabled')), c: 'choice', n: 'qbi',
    o: [['hours', 'When rental-service hours reach 250'], ['assume', 'Always'], ['never', 'Never']] });
  def('tax.niit', { l: 'Apply the 3.8% investment income tax', g: 'tax', t: 'bool', d: true, sw: true, w: taxOn, c: 'rule', n: 'niit' });
  def('tax.ebl', { l: 'Apply the excess business loss cap', g: 'tax', t: 'bool', d: true, sw: true, w: taxOn, c: 'rule', n: 'ebl' });
  def('tax.personalUse', { l: 'Exclude your own unit\'s share of costs', g: 'tax', t: 'bool', d: true, sw: true, w: taxOn, c: 'rule', n: 'personalUse' });
  def('tax.deMinimisTurnCosts', { l: 'Expense turn costs immediately (de minimis)', g: 'tax', t: 'bool', d: true, sw: true, w: taxOn, c: 'rule' });
  def('tax.depreciationYears', { l: 'Residential depreciation life', g: 'tax', t: 'num', d: 27.5, w: taxOn, c: 'rule' });
  def('tax.prc.enabled', { l: 'Primary Residence Credit', g: 'tax', s: 'Property-tax credit', t: 'bool', d: true, sw: true, c: 'verified', n: 'prc' });
  def('tax.prc.amount', { l: 'Credit', g: 'tax', s: 'Property-tax credit', t: 'money', d: 1600, u: '/yr', w: yes('tax.prc.enabled'), c: 'verified', n: 'prc' });
  def('tax.prc.fourplex', { l: 'Assume an owner-occupied fourplex qualifies', g: 'tax', s: 'Property-tax credit', t: 'bool', d: false, sw: true, w: yes('tax.prc.enabled'), c: 'guess', n: 'prc' });

  /* ============================================================ IDLE CASH */
  def('cash.policy', { l: 'Where idle cash waits', g: 'cash', t: 'select', d: 'moneyMarket', lvl: 'core', c: 'choice', n: 'idleCash',
    o: [['hold', 'Checking account (0%)'], ['moneyMarket', 'Money market'], ['tbills', 'Treasury bills'], ['indexFund', 'Index fund'],
        ['metals', 'Precious metals'], ['yours1', 'My investments — 1% a month'], ['yours2', 'My investments — 2% a month'],
        ['bestUse', 'Best after-tax use']] });
  def('cash.bestUseVehicle', { l: 'Park it in', g: 'cash', t: 'select', d: 'moneyMarket', w: is('cash.policy', 'bestUse'), c: 'choice',
    o: [['moneyMarket', 'Money market'], ['tbills', 'Treasury bills'], ['indexFund', 'Index fund'], ['yours1', 'My investments — 1%/mo'], ['yours2', 'My investments — 2%/mo']],
    h: 'Best after-tax use: buy when a deal clears; if buying is blocked by anything but cash, retire the costliest debt if it beats this vehicle after tax; otherwise park here.' });
  def('cash.mmYield', { l: 'Money market yield', g: 'cash', s: 'Returns', t: 'pct', d: 0.040, c: 'estimate', n: 'idleCash' });
  def('cash.tbillYield', { l: 'Treasury bill yield', g: 'cash', s: 'Returns', t: 'pct', d: 0.038, c: 'estimate', n: 'idleCash' });
  def('cash.indexReturn', { l: 'Index fund expected return', g: 'cash', s: 'Returns', t: 'pct', d: 0.08, c: 'estimate', n: 'idleCash' });
  def('cash.indexVol', { l: 'Index fund volatility', g: 'cash', s: 'Returns', t: 'pct', d: 0.16, c: 'estimate', lvl: 'adv' });
  def('cash.metalsReturn', { l: 'Precious metals expected return', g: 'cash', s: 'Returns', t: 'pct', d: 0.04, c: 'estimate' });
  def('cash.metalsVol', { l: 'Precious metals volatility', g: 'cash', s: 'Returns', t: 'pct', d: 0.15, c: 'estimate', lvl: 'adv' });
  def('cash.yours1Monthly', { l: 'My investments, option 1', g: 'cash', s: 'Returns', t: 'pct', d: 0.01, u: '/mo', c: 'yours', n: 'idleCash' });
  def('cash.yours2Monthly', { l: 'My investments, option 2', g: 'cash', s: 'Returns', t: 'pct', d: 0.02, u: '/mo', c: 'yours', n: 'idleCash' });
  def('cash.taxReturns', { l: 'Tax the returns on idle cash', g: 'cash', t: 'bool', d: true, sw: true, c: 'choice' });
  def('cash.operatingFloor', { l: 'Kept in checking, earning nothing', g: 'cash', t: 'money', d: 5000, c: 'choice' });
  def('cash.biggerDown.enabled', { l: 'Put more down on each purchase', g: 'cash', t: 'bool', d: false, sw: true, c: 'choice' });
  def('cash.biggerDown.pct', { l: 'Target down payment', g: 'cash', t: 'pct', d: 0.40, w: yes('cash.biggerDown.enabled'), c: 'choice' });

  /* ============================================================= SOURCING */
  def('sourcing.model', { l: 'Deal supply', g: 'sourcing', t: 'select', d: 'channels', lvl: 'core', c: 'choice', n: 'mlsSupply',
    o: [['channels', 'Sourcing channels (realistic)'], ['flatCap', 'A flat cap per year (old engine)'], ['unlimited', 'Unlimited (not a plan)']] });
  def('sourcing.flatCap.maxPerYear', { l: 'Most purchases a year', g: 'sourcing', t: 'int', d: 3, w: is('sourcing.model', 'flatCap'), c: 'choice' });
  def('sourcing.minMonthsBetween', { l: 'Minimum months between closings', g: 'sourcing', t: 'int', d: 2, min: 0, max: 24, c: 'choice' });
  var chOn = is('sourcing.model', 'channels');
  def('sourcing.mls.enabled', { l: 'Buy listed properties (MLS)', g: 'sourcing', s: 'MLS', t: 'bool', d: true, sw: true, w: chOn, c: 'choice', n: 'mlsSupply' });
  var mlsOn = all(chOn, yes('sourcing.mls.enabled'));
  [['supply2', 'Duplexes listed per year', 12], ['supply3', 'Triplexes listed per year', 6], ['supply4', 'Fourplexes listed per year', 10], ['supply8', '5–8 unit buildings listed per year', 2]].forEach(function (x) {
    def('sourcing.mls.' + x[0], { l: x[1], g: 'sourcing', s: 'MLS', t: 'num', d: x[2], w: mlsOn, c: 'estimate', n: 'mlsSupply', dist: { k: 'triRel', lo: -0.4, hi: 0.4 }, cat: 'deals' });
  });
  def('sourcing.mls.winRate', { l: 'Share of suitable listings you win', g: 'sourcing', s: 'MLS', t: 'pct', d: 0.25, w: mlsOn, c: 'guess', n: 'mlsSupply', dist: { k: 'triRel', lo: -0.5, hi: 0.5 }, cat: 'deals' });
  def('sourcing.mls.sellerCarryShare', { l: 'Listed sellers who would carry a note', g: 'sourcing', s: 'MLS', t: 'pct', d: 0.05, w: mlsOn, c: 'guess', n: 'sellerFinance' });
  def('sourcing.offMarket.enabled', { l: 'Direct-to-seller outreach', g: 'sourcing', s: 'Off-market', t: 'bool', d: false, sw: true, w: chOn, c: 'choice', n: 'offMarket' });
  var omOn = all(chOn, yes('sourcing.offMarket.enabled'));
  def('sourcing.offMarket.touches', { l: 'Letters/calls per month', g: 'sourcing', s: 'Off-market', t: 'int', d: 400, w: omOn, c: 'yours' });
  def('sourcing.offMarket.costPerTouch', { l: 'Cost per touch', g: 'sourcing', s: 'Off-market', t: 'money', d: 0.85, step: 0.05, w: omOn, c: 'estimate', n: 'offMarket' });
  def('sourcing.offMarket.responseRate', { l: 'Response rate', g: 'sourcing', s: 'Off-market', t: 'pct', d: 0.01, step: 0.001, w: omOn, c: 'estimate', n: 'offMarket', dist: { k: 'triRel', lo: -0.5, hi: 0.8 }, cat: 'deals' });
  def('sourcing.offMarket.conversionRate', { l: 'Responses that become a purchase', g: 'sourcing', s: 'Off-market', t: 'pct', d: 0.03, step: 0.005, w: omOn, c: 'guess', n: 'offMarket', dist: { k: 'triRel', lo: -0.6, hi: 0.8 }, cat: 'deals' });
  def('sourcing.offMarket.discount', { l: 'Price below market', g: 'sourcing', s: 'Off-market', t: 'pct', d: 0.07, w: omOn, c: 'estimate', n: 'offMarket', dist: { k: 'triAdd', lo: -0.05, hi: 0.05 }, cat: 'deals' });
  def('sourcing.offMarket.sellerCarryShare', { l: 'Off-market sellers who would carry a note', g: 'sourcing', s: 'Off-market', t: 'pct', d: 0.30, w: omOn, c: 'guess', n: 'sellerFinance' });
  [['mix2', 'Duplexes', 0.35], ['mix3', 'Triplexes', 0.20], ['mix4', 'Fourplexes', 0.35], ['mix8', '5–8 units', 0.10]].forEach(function (x) {
    def('sourcing.offMarket.' + x[0], { l: x[1] + ' share of off-market deals', g: 'sourcing', s: 'Off-market', t: 'pct', d: x[2], w: omOn, c: 'guess', lvl: 'adv' });
  });
  def('sourcing.library.enabled', { l: 'Buy from your listings library', g: 'sourcing', s: 'Library', t: 'bool', d: true, sw: true, c: 'choice' });
  def('sourcing.library.availableMonths', { l: 'Listings stay available for', g: 'sourcing', s: 'Library', t: 'int', d: 6, min: 0, max: 60, u: 'months after collection', w: yes('sourcing.library.enabled'), c: 'estimate' });
  def('sourcing.allow2', { l: 'Duplexes', g: 'sourcing', s: 'What you buy', t: 'bool', d: true, sw: true, lvl: 'core', c: 'choice' });
  def('sourcing.allow3', { l: 'Triplexes', g: 'sourcing', s: 'What you buy', t: 'bool', d: true, sw: true, lvl: 'core', c: 'choice' });
  def('sourcing.allow4', { l: 'Fourplexes', g: 'sourcing', s: 'What you buy', t: 'bool', d: true, sw: true, lvl: 'core', c: 'choice' });
  def('sourcing.allow58', { l: '5–8 units (commercial loan)', g: 'sourcing', s: 'What you buy', t: 'bool', d: true, sw: true, lvl: 'core', c: 'choice' });
  def('sourcing.archetype58', { l: 'Use the 5–8 unit archetype (no sold comps)', g: 'sourcing', s: 'What you buy', t: 'bool', d: false, sw: true, w: yes('sourcing.allow58'), c: 'guess' });
  def('sourcing.archetypeQuality', { l: 'Typical deal you win (comp range)', g: 'sourcing', s: 'What you buy', t: 'num', d: 0.5, min: 0, max: 1, step: 0.05, c: 'estimate',
    h: '0 = the cheapest, lowest-rent comp; 1 = the best-kept, highest-rent comp.', dist: { k: 'tri', lo: 0.1, hi: 0.9 }, cat: 'deals' });
  def('sourcing.score', { l: 'Rank deals by', g: 'sourcing', s: 'What you buy', t: 'select', d: 'stabilizedYield', c: 'choice',
    o: [['stabilizedYield', 'Stabilized yield on total cost'], ['dayOneCoC', 'Day-one cash-on-cash (old engine)'], ['cashFlowPerUnit', 'Stabilized cash flow per unit'], ['leastCash', 'Least cash needed']] });

  /* ============================================================ STRATEGIES */
  var S = 'strategies';
  function strat(id, label, fields, note) {
    def(S + '.' + id + '.enabled', { l: label, g: S, s: label, t: 'bool', d: false, sw: true, c: 'choice', n: note });
    (fields || []).forEach(function (f) {
      var spec = f[2]; spec.l = f[1]; spec.g = S; spec.s = label;
      spec.w = spec.w ? all(yes(S + '.' + id + '.enabled'), spec.w) : yes(S + '.' + id + '.enabled');
      spec.c = spec.c || 'estimate';
      def(S + '.' + id + '.' + f[0], spec);
    });
  }
  strat('sellerFinance', 'Seller financing', [
    ['downPct', 'Down payment', { t: 'pct', d: 0.12 }], ['rate', 'Rate', { t: 'pct', d: 0.065 }],
    ['amortYears', 'Amortization', { t: 'int', d: 30, u: 'years' }], ['balloonYears', 'Balloon', { t: 'int', d: 7, u: 'years' }],
    ['closingCostPct', 'Closing costs', { t: 'pct', d: 0.015 }]], 'sellerFinance');
  strat('assumption', 'Loan assumption', [['fee', 'Assumption fee', { t: 'money', d: 1200 }], ['maxEquityGap', 'Most equity you would cover', { t: 'money', d: 120000 }]], 'assumable');
  strat('points', 'Buy down the rate', [['points', 'Discount points', { t: 'num', d: 1, step: 0.5, min: 0, max: 4 }], ['ratePerPoint', 'Rate cut per point', { t: 'pct', d: 0.0025 }]]);
  strat('interestOnly', 'Interest-only period', [['years', 'Interest-only years', { t: 'int', d: 5, min: 1, max: 10 }]]);
  strat('cashOutRefi', 'Cash-out refinance', [
    ['maxLtv', 'Maximum loan-to-value', { t: 'pct', d: 0.75 }], ['seasoningMonths', 'Seasoning', { t: 'int', d: 12, u: 'months' }],
    ['minProceeds', 'Minimum worth doing', { t: 'money', d: 20000 }], ['beforeQuitOnly', 'Only while I still have a W-2', { t: 'bool', d: false, sw: true }]]);
  strat('heloc', 'Portfolio HELOC', [
    ['maxCltv', 'Maximum combined LTV', { t: 'pct', d: 0.80 }], ['freeClearCltv', 'On a paid-off building', { t: 'pct', d: 0.85 }],
    ['lineCap', 'Largest line a lender will open', { t: 'money', d: 150000, h: 'Few lenders open a HELOC on investment property at all; those that do cap the line. The combined-LTV room is the other limit.' }],
    ['seasoningMonths', 'Seasoning', { t: 'int', d: 12, u: 'months' }], ['minDraw', 'Smallest draw', { t: 'money', d: 10000 }],
    ['repayShare', 'Share of spare cash that repays the line', { t: 'pct', d: 0.5, h: 'Each month, this share of what you add (contributions plus portfolio cash flow) goes to the line; the rest saves toward the next purchase.' }],
    ['freezeInRecession', 'Bank freezes the line in a recession', { t: 'bool', d: true, sw: true }]], 'heloc');
  strat('exchange1031', '1031 exchange', [
    ['trigger', 'Trade up once equity passes', { t: 'money', d: 400000 }], ['minGain', 'Minimum gain worth deferring', { t: 'money', d: 60000 }],
    ['targetUnits', 'Replacement size', { t: 'int', d: 8, u: 'units' }], ['maxExchanges', 'At most', { t: 'int', d: 2 }], ['qiFee', 'Intermediary fee', { t: 'money', d: 1200 }]], 'exitTax');
  strat('fhaRefi', 'Refinance out of FHA mortgage insurance', [['maxBreakevenMonths', 'Only if it pays back within', { t: 'int', d: 36, u: 'months' }]], 'fha');
  strat('paydown', 'Debt paydown', [
    ['order', 'Which loan first', { t: 'select', d: 'avalanche', o: [['avalanche', 'Highest rate'], ['snowball', 'Smallest balance'], ['highestPayment', 'Biggest payment'], ['thinnest', 'Thinnest coverage'], ['target', 'One property']] }],
    ['targetSeq', 'Property number', { t: 'int', d: 1, w: [S + '.paydown.order', 'eq', 'target'] }],
    ['allocation', 'Who gets the cash first', { t: 'select', d: 'afterBuying', o: [['afterBuying', 'Buy first, pay down the rest'], ['pauseBuying', 'Stop buying and pay down'], ['split', 'Split']] }],
    ['splitPct', 'Share to principal', { t: 'pct', d: 0.5, w: [S + '.paydown.allocation', 'eq', 'split'] }],
    ['startAfterProperties', 'Start after owning', { t: 'int', d: 3, u: 'properties' }],
    ['recast', 'Recast after each lump sum', { t: 'bool', d: true, sw: true }], ['recastMin', 'Smallest lump sum to recast', { t: 'money', d: 5000 }],
    ['stopAfterFreeClear', 'Stop after', { t: 'int', d: 99, u: 'paid off' }]]);
  strat('rateRefi', 'Rate-and-term refinance', [
    ['dropBps', 'Rate must fall by', { t: 'int', d: 75, u: 'bps' }], ['maxBreakevenMonths', 'Costs must pay back within', { t: 'int', d: 60, u: 'months' }],
    ['resetTerm', 'Restart a 30-year term', { t: 'bool', d: false, sw: true }]]);
  strat('rubs', 'RUBS — bill utilities back', [
    ['recoveryPct', 'Share of the bill recovered', { t: 'pct', d: 0.75 }], ['setupPerUnit', 'Setup cost', { t: 'money', d: 165, u: '/unit' }],
    ['resistanceShare', 'Recovery given back in lower rent', { t: 'pct', d: 0.30 }]], 'rubs');
  strat('ancillary', 'Ancillary income', [
    ['laundry', 'Laundry', { t: 'money', d: 12, u: '/unit/mo' }], ['storage', 'Storage', { t: 'money', d: 8, u: '/unit/mo' }],
    ['parking', 'Parking / plug-ins', { t: 'money', d: 10, u: '/unit/mo' }], ['pets', 'Pet rent', { t: 'money', d: 12, u: '/unit/mo' }],
    ['monthsAfter', 'Starts after', { t: 'int', d: 3, u: 'months' }]]);
  strat('taxAppeal', 'Property tax appeal', [
    ['reductionPct', 'Reduction won', { t: 'pct', d: 0.08 }], ['cost', 'Cost', { t: 'money', d: 500 }],
    ['onlyOverAssessed', 'Only where the bill is above the formula', { t: 'bool', d: true, sw: true }]], 'assessment');
  strat('costSeg', 'Cost segregation', [
    ['shortLifePct', 'Share reclassified', { t: 'pct', d: 0.25, dist: { k: 'triAdd', lo: -0.08, hi: 0.08 }, cat: 'costs' }], ['bonusPct', 'Bonus depreciation', { t: 'pct', d: 1.0, c: 'verified' }],
    ['studyCost', 'Study cost', { t: 'money', d: 3500 }], ['minPrice', 'Minimum price to bother', { t: 'money', d: 250000 }]], 'costSeg');
  strat('hcv', 'Housing Choice Vouchers', [
    ['share', 'Share of vacant units offered to voucher holders', { t: 'pct', d: 1.0 }],
    ['rrPremium', 'Rent reasonableness allows up to', { t: 'pct', d: 0.05, u: 'over market' }],
    ['moveOut', 'Voucher tenant move-out rate', { t: 'pct', d: 0.18, u: '/yr' }],
    ['inspectionDelay', 'Extra empty time for the inspection', { t: 'num', d: 0.5, step: 0.25, u: 'months' }],
    ['creditLoss', 'Bad debt on voucher units', { t: 'pct', d: 0.005 }]], 'hcv');
  strat('heatConversion', 'Tenants on their own heat', [
    ['timing', 'When', { t: 'select', d: 'boilerEOL', o: [['boilerEOL', 'When the central plant is due'], ['afterPurchase', 'Soon after buying']] }],
    ['monthsAfter', 'Months after buying', { t: 'int', d: 9, w: [S + '.heatConversion.timing', 'eq', 'afterPurchase'] }],
    ['costPerUnit', 'Cost', { t: 'money', d: 6000, u: '/unit', dist: { k: 'triRel', lo: -0.4, hi: 0.6 }, cat: 'costs' }],
    ['rentGiveBack', 'Share of tenants\' new heat bill lost in rent', { t: 'pct', d: 0.5 }]], 'heatConversion');
  strat('license', 'Real estate license', [
    ['startMonth', 'Licensed from', { t: 'month', d: '2027-03' }], ['courseCost', 'Course and fees (once)', { t: 'money', d: 700 }],
    ['annualCost', 'Brokerage, MLS, E&O, education', { t: 'money', d: 1500, u: '/yr' }],
    ['commissionPct', 'Buyer commission on your own purchases', { t: 'pct', d: 0.025 }], ['brokerSplit', 'Brokerage keeps', { t: 'pct', d: 0.20 }],
    ['winRateUplift', 'Extra share of listings you win', { t: 'pct', d: 0.05, c: 'guess' }]], 'license');
  strat('unitModes', 'Furnished or nightly units', [
    ['mode', 'Mode', { t: 'select', d: 'mtr', o: [['mtr', 'Mid-term furnished (30–120 days)'], ['str', 'Nightly (7 days or less)'], ['room', 'By the room']] }],
    ['unitsPerProperty', 'Units per property', { t: 'int', d: 1, min: 1, max: 8 }],
    ['premiumPct', 'Rent premium over long-term', { t: 'pct', d: 0.45, w: [S + '.unitModes.mode', 'ne', 'str'] }],
    ['vacancy', 'Vacancy', { t: 'pct', d: 0.18, w: [S + '.unitModes.mode', 'ne', 'str'] }],
    ['adr', 'Nightly rate', { t: 'money', d: 150, w: [S + '.unitModes.mode', 'eq', 'str'] }],
    ['occupancy', 'Occupancy', { t: 'pct', d: 0.45, w: [S + '.unitModes.mode', 'eq', 'str'] }],
    ['avgStayDays', 'Average stay', { t: 'num', d: 3, u: 'days', w: [S + '.unitModes.mode', 'eq', 'str'] }],
    ['furnishPerUnit', 'Furnishing', { t: 'money', d: 7000 }], ['opexPerUnit', 'Utilities, internet, supplies', { t: 'money', d: 300, u: '/mo' }],
    ['cleanPerMonth', 'Cleaning', { t: 'money', d: 60, u: '/mo' }], ['platformPct', 'Platform fees', { t: 'pct', d: 0.03, w: [S + '.unitModes.mode', 'eq', 'str'] }],
    ['mgmtAddPct', 'Extra management fee if managed', { t: 'pct', d: 0.10 }]], 'mtr');
  strat('downturn', 'Downturn stance', [
    ['stance', 'In a recession', { t: 'select', d: 'leanIn', o: [['leanIn', 'Keep buying at the discount'], ['stepBack', 'Stop buying'], ['dryPowder', 'Hold a fund for it']] }],
    ['discount', 'Prices fall by', { t: 'pct', d: 0.09 }],
    ['fundTarget', 'Fund size', { t: 'money', d: 45000, w: [S + '.downturn.stance', 'eq', 'dryPowder'] }],
    ['fundFillPct', 'Share of spare cash diverted', { t: 'pct', d: 0.3, w: [S + '.downturn.stance', 'eq', 'dryPowder'] }],
    ['releaseAfterMonths', 'Release anyway after', { t: 'int', d: 48, u: 'months', w: [S + '.downturn.stance', 'eq', 'dryPowder'] }]]);
  strat('hurdle', 'Your own deal hurdle', [
    ['minStabilizedYield', 'Minimum stabilized yield', { t: 'pct', d: 0.065 }], ['minCashFlowPerUnit', 'Minimum stabilized cash flow per unit', { t: 'money', d: 0, u: '/mo' }],
    ['exemptHouseHack', 'Exempt the one you live in', { t: 'bool', d: true, sw: true }]]);
  strat('stopBuying', 'Stop buying on a date', [
    ['month', 'Last purchase no later than', { t: 'month', d: '2034-12', c: 'choice',
      h: 'A purchase costs cash flow for its first year or two while leases turn over. If what matters is income on a date, stopping a year or two before it can raise that income.' }]]);
  strat('goalStop', 'Stop buying at a goal', [['monthlyIncome', 'Once after-tax income reaches', { t: 'money', d: 8000, u: '/mo' }]]);
  def(S + '.guardrails.enabled', { l: 'Portfolio guardrails', g: S, s: 'Portfolio guardrails', t: 'bool', d: true, sw: true, c: 'choice', n: 'breakers',
    h: 'Ship at ruin-avoidance levels. Tighten them to find where your plan actually stops.' });
  def(S + '.guardrails.minCashFlow', { l: 'Portfolio cash flow not below', g: S, s: 'Portfolio guardrails', t: 'money', d: -2500, u: '/mo', w: yes(S + '.guardrails.enabled'), c: 'choice' });
  def(S + '.guardrails.minCoverage', { l: 'Portfolio coverage not below', g: S, s: 'Portfolio guardrails', t: 'num', d: 0.30, step: 0.05, w: yes(S + '.guardrails.enabled'), c: 'choice' });
  def(S + '.guardrails.maxLtv', { l: 'Portfolio leverage not above', g: S, s: 'Portfolio guardrails', t: 'pct', d: 0.99, w: yes(S + '.guardrails.enabled'), c: 'choice' });

  /* =========================================================== UNCERTAINTY */
  def('mc.enabled', { l: 'Run the uncertainty layer', g: 'mc', t: 'bool', d: true, sw: true, lvl: 'core', c: 'choice', n: 'headline' });
  var mcOn = yes('mc.enabled');
  def('mc.paths', { l: 'Simulated futures', g: 'mc', t: 'int', d: 300, min: 50, max: 2000, step: 50, w: mcOn, c: 'choice' });
  def('mc.seed', { l: 'Seed', g: 'mc', t: 'int', d: 20260926, w: mcOn, c: 'choice', lvl: 'adv',
    h: 'Same seed and same inputs give the same distribution every time.' });
  [['market', 'Rents, prices and cap rates'], ['rates', 'Interest rates'], ['recessions', 'Recessions'], ['turnover', 'Tenant turnover and vacancy'],
   ['costs', 'Operating and project costs'], ['capex', 'When big items fail'], ['deals', 'Deal supply'], ['jobLoss', 'Job loss'],
   ['contributions', 'Your contributions'], ['evictions', 'Evictions']].forEach(function (x) {
    def('mc.sample.' + x[0], { l: x[1], g: 'mc', s: 'What varies', t: 'bool', d: true, sw: true, w: mcOn, c: 'choice' });
  });
  def('mc.recessionAnnualProb', { l: 'Chance a recession starts in a year', g: 'mc', s: 'Recessions', t: 'pct', d: 0.10, w: all(mcOn, yes('mc.sample.recessions')), c: 'estimate' });
  def('mc.contributionNoise', { l: 'Month-to-month swing in contributions', g: 'mc', s: 'Contributions', t: 'pct', d: 0.15, w: all(mcOn, yes('mc.sample.contributions')), c: 'yours' });

  /* ================================================= SCHEDULED STRESS TESTS */
  def('stress.recession.enabled', { l: 'Schedule a recession', g: 'stress', s: 'Recession', t: 'bool', d: false, sw: true, c: 'choice' });
  var recOn = yes('stress.recession.enabled');
  def('stress.recession.startYear', { l: 'Starting', g: 'stress', s: 'Recession', t: 'int', d: 2030, w: recOn, c: 'choice' });
  def('stress.recession.months', { l: 'Lasting', g: 'stress', s: 'Recession', t: 'int', d: 24, u: 'months', w: recOn, c: 'choice' });
  def('stress.recession.rentDrop', { l: 'Market rents fall by', g: 'stress', s: 'Recession', t: 'pct', d: 0.06, w: recOn, c: 'choice' });
  def('stress.recession.vacancyAdd', { l: 'Extra vacancy', g: 'stress', s: 'Recession', t: 'pct', d: 0.04, w: recOn, c: 'choice' });
  def('stress.recession.capAddBps', { l: 'Cap rates rise by', g: 'stress', s: 'Recession', t: 'int', d: 60, u: 'bps', w: recOn, c: 'choice' });
  def('stress.recession.creditTightens', { l: 'Lenders tighten (+0.10 DSCR, −5% LTV)', g: 'stress', s: 'Recession', t: 'bool', d: true, sw: true, w: recOn, c: 'choice' });
  def('stress.rateShock.enabled', { l: 'Rate shock', g: 'stress', s: 'Rate shock', t: 'bool', d: false, sw: true, c: 'choice' });
  def('stress.rateShock.fromYear', { l: 'From', g: 'stress', s: 'Rate shock', t: 'int', d: 2029, w: yes('stress.rateShock.enabled'), c: 'choice' });
  def('stress.rateShock.add', { l: 'Add to every rate', g: 'stress', s: 'Rate shock', t: 'pct', d: 0.02, w: yes('stress.rateShock.enabled'), c: 'choice' });
  def('stress.jobLoss.enabled', { l: 'Lose the job on a date', g: 'stress', s: 'Job loss', t: 'bool', d: false, sw: true, w: yes('income.w2.enabled'), c: 'choice' });
  def('stress.jobLoss.month', { l: 'From', g: 'stress', s: 'Job loss', t: 'month', d: '2029-06', w: all(yes('income.w2.enabled'), yes('stress.jobLoss.enabled')), c: 'choice' });
  def('stress.jobLoss.months', { l: 'For', g: 'stress', s: 'Job loss', t: 'int', d: 6, u: 'months', w: all(yes('income.w2.enabled'), yes('stress.jobLoss.enabled')), c: 'choice' });
  def('stress.events', { l: 'Specific events', g: 'stress', s: 'Events', t: 'list', d: [], c: 'choice',
    item: { enabled: { l: 'On', t: 'bool' }, type: { l: 'What', t: 'select', o: [['vacancy', 'Extended vacancy'], ['eviction', 'Eviction'], ['capex', 'Major repair']] },
            month: { l: 'When', t: 'month' }, propertySeq: { l: 'Property #', t: 'int' }, units: { l: 'Units', t: 'int' }, months: { l: 'Months', t: 'int' }, amount: { l: 'Cost', t: 'money' } } });

  /* ======================================================== relevance logic */
  function evalCond(cfg, w) {
    if (!w) return true;
    if (Array.isArray(w)) {
      var v = U.getPath(cfg, w[0]);
      switch (w[1]) {
        case 'eq': return v === w[2] || (w[2] === false && v == null);
        case 'ne': return v !== w[2];
        case 'in': return w[2].indexOf(v) >= 0;
        case 'truthy': return !!v;
      }
      return true;
    }
    if (w.all) return w.all.every(function (x) { return evalCond(cfg, x); });
    if (w.any) return w.any.some(function (x) { return evalCond(cfg, x); });
    return true;
  }
  function isRelevant(cfg, path) {
    var e = BY_PATH[path];
    return e ? evalCond(cfg, e.w) : true;
  }
  /* The switch (if any) that is currently hiding this field — for "off because …" */
  function blockingSwitch(cfg, path) {
    var e = BY_PATH[path];
    if (!e || !e.w) return null;
    var conds = [];
    (function collect(w) {
      if (Array.isArray(w)) conds.push(w);
      else if (w && w.all) w.all.forEach(collect);
    })(e.w);
    for (var i = 0; i < conds.length; i++) {
      if (!evalCond(cfg, conds[i])) return conds[i][0];
    }
    return null;
  }

  /* ========================================================= defaultConfig */
  function libraryDefaults() {
    return FPE.RAW_DATA.properties.map(function (p) {
      var q = U.clone(p);
      q.enabled = p.status === 'active';
      q.unitModes = null;
      q.hcvAllowed = true;
      return q;
    });
  }
  function defaultConfig() {
    var cfg = { version: 2, meta: { name: 'Baseline', created: null } };
    ENTRIES.forEach(function (e) { U.setPath(cfg, e.p, U.clone(e.d)); });
    cfg.properties = libraryDefaults();
    cfg.archetypes = U.clone(FPE.RAW_DATA.archetypes);
    return cfg;
  }

  /* A config saved by an older build: fill anything missing from the defaults,
     never overwrite what the owner set. Version 1 configs are not migrated —
     the owner chose a clean start for the rebuilt engine. */
  function migrate(cfg) {
    var d = defaultConfig();
    if (!cfg || cfg.version !== 2) return d;
    (function fill(t, s) {
      for (var k in s) {
        if (t[k] === undefined) t[k] = U.clone(s[k]);
        else if (s[k] && typeof s[k] === 'object' && !Array.isArray(s[k]) && t[k] && typeof t[k] === 'object') fill(t[k], s[k]);
      }
    })(cfg, d);
    return cfg;
  }

  FPE.registry = {
    ENTRIES: ENTRIES, BY_PATH: BY_PATH, GROUPS: GROUPS,
    get: function (p) { return BY_PATH[p]; },
    evalCond: evalCond, isRelevant: isRelevant, blockingSwitch: blockingSwitch,
    defaultConfig: defaultConfig, migrate: migrate
  };
  FPE.defaultConfig = defaultConfig;
})(FPE);
