/* ============================================================================
   PORTFOLIO ENGINE — deterministic month-by-month real estate simulation
   Pure functions, no DOM. Testable in node.
   ========================================================================== */

/* ---------------------------------------------------------------- date utils */
function mkDate(y, m) { return { y: y, m: m }; }                 // m: 0-11
function parseMonth(s) {                                          // "2026-10"
  var p = String(s).split('-');
  return mkDate(parseInt(p[0], 10), parseInt(p[1], 10) - 1);
}
function addMonths(d, n) {
  var t = d.y * 12 + d.m + n;
  return mkDate(Math.floor(t / 12), ((t % 12) + 12) % 12);
}
function monthsBetween(a, b) { return (b.y * 12 + b.m) - (a.y * 12 + a.m); }
var MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function fmtMonth(d) { return MONTH_ABBR[d.m] + ' ' + d.y; }
function fmtMonthShort(d) { return (d.m + 1) + '/' + d.y; }
function isoMonth(d) { return d.y + '-' + String(d.m + 1).padStart(2, '0'); }

/* ------------------------------------------------------------- money helpers */
function pmt(principal, annualRate, termYears) {
  var r = annualRate / 12, n = Math.round(termYears * 12);
  if (n <= 0) return principal;
  if (Math.abs(r) < 1e-12) return principal / n;
  return principal * r / (1 - Math.pow(1 + r, -n));
}
function round2(x) { return Math.round(x * 100) / 100; }
function clamp(x, lo, hi) { return x < lo ? lo : (x > hi ? hi : x); }

/* ---------------------------------------------------------------- rate lookup
   ratePath: [{fromYear, investment, fha, dscr, commercial}] sorted ascending.
   Returns the rate in effect for `product` during calendar year `year`.        */
function rateAt(cfg, product, date) {
  var path = cfg.financing.ratePath || [];
  var chosen = path[0];
  for (var i = 0; i < path.length; i++) {
    if (path[i].fromYear <= date.y) chosen = path[i]; else break;
  }
  if (!chosen) chosen = { investment: 0.0775, fha: 0.0687, dscr: 0.0675, commercial: 0.0725 };
  var base = chosen[product];
  if (base == null) base = chosen.investment;
  var shock = cfg.stress && cfg.stress.rateShock;
  if (shock && shock.enabled && date.y >= shock.fromYear) base += shock.addPct;
  return base;
}

/* -------------------------------------------------------------- loan lifecycle */
function makeLoan(opts) {
  var io = Math.round((opts.interestOnlyYears || 0) * 12);
  var l = {
    product: opts.product,
    originalBalance: opts.balance,
    balance: opts.balance,
    rate: opts.rate,
    amortYears: opts.amortYears,
    payment: io > 0 ? opts.balance * opts.rate / 12
                    : pmt(opts.balance, opts.rate, opts.amortYears),
    mipMonthly: opts.mipMonthly || 0,
    balloonMonths: opts.balloonMonths || null,
    /* Interest-only period. While it runs the payment is interest alone and no
       principal is retired; when it ends the balance re-amortizes over the
       SHORTER remaining term, so the new payment is well above what a fully
       amortizing loan would have been from day one. */
    ioMonthsLeft: io,
    ioOriginalMonths: io,
    ioStepUp: 0,
    monthsElapsed: 0,
    totalInterest: 0,
    extraPrincipalPaid: 0,
    recasts: 0,
    refis: 0,
    sellerFinanced: !!opts.sellerFinanced,
    assumed: !!opts.assumed
  };
  return l;
}
function loanStep(loan) {
  if (loan.balance <= 0.005) {
    return { interest: 0, principal: 0, payment: 0, mip: 0, total: 0, ioEnded: false };
  }
  var interest = loan.balance * loan.rate / 12;
  var principal, ioEnded = false;
  if (loan.ioMonthsLeft > 0) {
    principal = 0;
    loan.payment = interest;                        // floats with the balance
    loan.ioMonthsLeft--;
    if (loan.ioMonthsLeft === 0) {
      /* re-amortize over what is left of the original term */
      var remainYears = Math.max(1 / 12,
        loan.amortYears - (loan.monthsElapsed + 1) / 12);
      var before = interest;
      loan.payment = pmt(loan.balance, loan.rate, remainYears);
      loan.ioStepUp = loan.payment - before;
      ioEnded = true;
    }
  } else {
    principal = loan.payment - interest;
    if (principal < 0) principal = 0;               // negative amortization guard
    if (principal > loan.balance) principal = loan.balance;
    loan.balance -= principal;
  }
  loan.monthsElapsed++;
  loan.totalInterest += interest;
  var mip = loan.mipMonthly;
  return { interest: interest, principal: principal, payment: interest + principal,
           mip: mip, total: interest + principal + mip, ioEnded: ioEnded };
}
function loanPITI(loan, monthlyTax, monthlyIns) {
  return (loan.balance > 0.005 ? loan.payment + loan.mipMonthly : 0) + monthlyTax + monthlyIns;
}
/* Remaining amortization term in years, which is what a recast re-amortizes over. */
function loanRemainingYears(loan) {
  return Math.max(1 / 12, loan.amortYears - loan.monthsElapsed / 12);
}
/* A RECAST re-computes the payment on the remaining balance over the remaining
   term at the SAME rate. It is not a refinance: no appraisal, no new rate, no
   credit pull, typically a $150-500 fee. This is the ONLY mechanism by which a
   lump-sum principal payment turns into monthly cash flow before the loan is
   fully retired — without it, extra principal only shortens the term. */
function recastLoan(loan) {
  if (loan.balance <= 0.005) { loan.payment = 0; return 0; }
  var before = loan.payment;
  loan.payment = pmt(loan.balance, loan.rate, loanRemainingYears(loan));
  loan.recasts++;
  return before - loan.payment;                      // monthly payment relief
}
/* Deterministic 0-99 bucket from an id, used for "what share of sellers would
   carry paper" without introducing randomness into the simulation. */
function idBucket(id) {
  /* FNV-1a plus a final avalanche. A plain polynomial hash puts sequential ids
     like A1, A2, A3 into sequential buckets, which makes a "30% of sellers"
     filter select either all of them or none. */
  var s = String(id == null ? '' : id), h = 2166136261;
  for (var i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  h ^= h >>> 16; h = Math.imul(h, 2246822507) >>> 0;
  h ^= h >>> 13; h = Math.imul(h, 3266489909) >>> 0;
  h ^= h >>> 16;
  return (h >>> 0) % 100;
}

/* ============================================================================
   RENTAL MODE ECONOMICS
   Long-term, mid-term, by-the-room and short-term are four different
   businesses wearing the same building. This converts a long-term rent roll
   into whichever one you chose, and reports the tax character that follows.

   The tax character is the part almost every model gets wrong:
     - LTR, MTR and by-the-room are RENTAL ACTIVITIES (Reg. 1.469-1T(e)(3)).
       Losses are passive. REPS is the only way to use them against a W-2.
     - A short-term rental averaging SEVEN DAYS OR LESS of customer use is
       expressly NOT a rental activity (Reg. 1.469-1T(e)(3)(ii)(A)). With
       material participation the loss is non-passive WITHOUT REPS.
     - Hiring a manager is what usually destroys material participation, so
       the tax advantage and the hands-off operation are mutually exclusive.
   ========================================================================== */
function rentalModeEconomics(mode, ops, opts) {
  var rentedUnits = opts.rentedUnits, ltrGross = opts.ltrGross;
  var baseMgmtPct = opts.baseMgmtPct || 0, managed = !!opts.managed;
  var out = {
    mode: mode, gross: ltrGross, extraOpex: 0, vacancy: null,
    isNonPassive: false, avgStayDays: null, lodgingTax: 0,
    mgmtExtraPct: 0, furnishPerUnit: 0, participationLost: false
  };
  if (mode === 'ltr' || !mode || rentedUnits <= 0) return out;
  var o = (ops || {})[mode];
  if (!o) return out;

  out.avgStayDays = o.avgStayDays || null;
  out.furnishPerUnit = o.furnishPerUnit || 0;
  out.vacancy = o.vacancyPct != null ? o.vacancyPct : null;

  if (mode === 'str') {
    /* Either an ADR x occupancy model or a straight premium over long-term. */
    if (o.useAdrModel) out.gross = (o.adr || 0) * 30.4 * (o.occupancy || 0) * rentedUnits;
    else out.gross = ltrGross * (1 + (o.premiumPct || 0));
    out.vacancy = 0;                       // occupancy is already inside the ADR model
    var stays = (o.staysPerMonth || 0) * rentedUnits;
    out.extraOpex += stays * (o.cleanPerStay || 0);
    out.extraOpex += out.gross * (o.suppliesPct || 0);
    out.extraOpex += out.gross * (o.platformFeePct || 0);
    out.lodgingTax = out.gross * (o.lodgingTaxPct || 0);
    out.extraOpex += out.lodgingTax;
    out.extraOpex += rentedUnits * ((o.utilitiesPerUnit || 0) + (o.internetPerUnit || 0));
    out.mgmtExtraPct = Math.max(0, (o.mgmtFeePct || 0) - baseMgmtPct);
    /* The seven-day test, and the material-participation test behind it. */
    var subSeven = (o.avgStayDays || 0) > 0 && (o.avgStayDays || 0) <= 7;
    var participates = o.materialParticipation !== false && !managed;
    out.participationLost = subSeven && o.materialParticipation !== false && managed;
    out.isNonPassive = subSeven && participates;
  } else if (mode === 'mtr') {
    out.gross = ltrGross * (1 + (o.premiumPct || 0));
    out.extraOpex += ((o.staysPerYear || 0) / 12) * (o.cleanPerStay || 0) * rentedUnits;
    out.extraOpex += rentedUnits * ((o.utilitiesPerUnit || 0) + (o.internetPerUnit || 0));
    out.mgmtExtraPct = Math.max(0, (o.mgmtFeePct || 0) - baseMgmtPct);
  } else if (mode === 'byroom') {
    var seasonal = (o.leaseMonthsPerYear || 12) / 12;
    out.gross = ltrGross * (1 + (o.premiumPct || 0)) * seasonal;
    out.extraOpex += rentedUnits * ((o.utilitiesPerUnit || 0) + (o.internetPerUnit || 0));
    out.mgmtExtraPct = o.mgmtAddPct || 0;
  }
  return out;
}

/* ------------------------------------------------------------ component costs
   Default big-ticket items scaled by unit count. Each carries remaining life.   */
function defaultComponents(units) {
  var u = Math.max(1, units);
  return [
    { name: 'Roof',           lifeYears: 25, ageYears: 12, cost: Math.round(9000 + 2600 * u), enabled: true },
    { name: 'Furnace / HVAC', lifeYears: 20, ageYears: 10, cost: Math.round(5200 * Math.max(1, Math.ceil(u / 2))), enabled: true },
    { name: 'Water heaters',  lifeYears: 12, ageYears: 6,  cost: Math.round(1500 * u), enabled: true },
    { name: 'Driveway / lot', lifeYears: 30, ageYears: 15, cost: Math.round(6000 + 900 * u), enabled: false },
    { name: 'Windows',        lifeYears: 30, ageYears: 18, cost: Math.round(1400 * u), enabled: false },
    { name: 'Exterior paint / siding', lifeYears: 20, ageYears: 9, cost: Math.round(4000 + 1500 * u), enabled: false }
  ];
}

/* ============================================================================
   MAIN SIMULATION
   ========================================================================== */
function runSimulation(cfg) {
  var warnings = [];
  var S = cfg.setup, M = cfg.market, F = cfg.financing, R = cfg.rules;
  var start = parseMonth(S.startMonth);
  var horizonMonths = Math.round(S.horizonYears * 12);

  /* ---- state ---- */
  var state = {
    cash: S.startingCapital,
    capexPool: 0,
    properties: [],
    monthIndex: 0,
    financedCount: 0,
    totalContributed: 0,
    passiveLossCarry: 0,
    cumulativeTax: 0,
    cumulativeDraw: 0,
    managementActive: (R.management.trigger === 'always'),
    libraryUsed: {},
    stopBuying: false,
    /* strategy state */
    pendingBonus: 0, costSegSpend: 0, costSegSpendNonPassive: 0,
    helocBalance: 0, helocLimit: 0, helocDrawn: 0, helocInterestPaid: 0,
    refiProceeds: 0, exchangeCount: 0, ownerOccDone: 0,
    lastOwnerOccMonth: -999, soldCount: 0, deferredGainTotal: 0,
    nolCarry: 0, recaptureDue: 0, capGainsPaid: 0,
    /* debt paydown */
    extraPrincipalTotal: 0, freeAndClearCount: 0, recastCount: 0,
    recastReliefTotal: 0, recastFeesPaid: 0, paydownPaused: false,
    interestSaved: 0, rateRefiCount: 0, rateRefiSavings: 0,
    /* opportunism */
    opportunityFund: 0, opportunityDeployed: 0, opportunityArmed: false,
    /* income levers */
    rubsRecovered: 0, rubsSpend: 0, ancillaryIncome: 0,
    taxAppealSavings: 0, taxAppealSpend: 0,
    furnishingSpend: 0, lodgingTaxPaid: 0,
    sellerFinancedCount: 0, assumedCount: 0,
    nonPassiveLossUsed: 0, strParticipationWarned: false
  };

  var rows = [];
  var acquisitions = [];
  var milestones = [];
  var yearAccum = newYearAccum();
  var lastShortfallNote = null;

  function newYearAccum() {
    return { egi: 0, grossRent: 0, vacancyLoss: 0, opex: 0, interest: 0, principal: 0,
             depreciation: 0, noi: 0, cashFlow: 0, capexSpent: 0, tax: 0, contributions: 0, mip: 0,
             taxablePassive: 0, taxableNonPassive: 0 };
  }

  /* ---- contribution schedule ---- */
  function contributionFor(date) {
    var list = (S.contributions || []).slice().sort(function (a, b) {
      return monthsBetween(parseMonth(a.fromMonth), parseMonth(b.fromMonth));
    });
    var v = 0;
    for (var i = 0; i < list.length; i++) {
      if (monthsBetween(parseMonth(list[i].fromMonth), date) >= 0) v = list[i].monthly;
    }
    return v;
  }

  /* ---- recession overlay ---- */
  function recessionActive(date) {
    var rc = cfg.stress && cfg.stress.recession;
    if (!rc || !rc.enabled) return null;
    var startY = rc.startYear, endY = rc.startYear + rc.durationYears;
    if (date.y >= startY && date.y < endY) return rc;
    return null;
  }

  /* ---- emergency fund requirement ---- */
  function emergencyFundRequired() {
    var ef = R.emergencyFund || {};
    if (ef.mode === 'months') return (ef.months || 0) * (S.personalMonthlyExpenses || 0);
    return ef.dollars || 0;
  }

  /* ---- lender reserve requirement across owned properties ---- */
  function lenderReserveRequired(extraPITI) {
    var months = R.lenderReserveMonths || 0;
    var sum = extraPITI || 0;
    for (var i = 0; i < state.properties.length; i++) {
      var p = state.properties[i];
      sum += loanPITI(p.loan, p.annualTax / 12, p.annualInsurance / 12);
    }
    return months * sum;
  }

  /* ---- ladder: which unit counts are allowed for purchase #n ---- */
  function allowedTypes(purchaseNumber, unitsOwned, monthlyProfit) {
    var ladder = R.ladder || [];
    var allowed = null;
    for (var i = 0; i < ladder.length; i++) {
      var step = ladder[i];
      var ok = false;
      if (step.triggerType === 'purchases') ok = purchaseNumber >= step.triggerValue;
      else if (step.triggerType === 'units') ok = unitsOwned >= step.triggerValue;
      else if (step.triggerType === 'profit') ok = monthlyProfit >= step.triggerValue;
      if (ok) allowed = step.types;
    }
    if (!allowed || !allowed.length) allowed = [2, 3, 4];
    return allowed;
  }

  /* ---- tax rate on property (ND: 4+ units is commercial) ---- */
  function taxRateForUnits(units) {
    return units >= (M.commercialUnitThreshold || 4)
      ? M.propTaxRateCommercial : M.propTaxRateResidential;
  }

  /* ---- build a candidate deal from a library item or archetype ---- */
  function priceDrift(basePrice, monthsSinceStart) {
    if (!M.driftListingPrices) return basePrice;
    return basePrice * Math.pow(1 + M.appreciation, monthsSinceStart / 12);
  }
  function rentDrift(baseRent, monthsSinceStart) {
    if (!M.driftListingPrices) return baseRent;
    return baseRent * Math.pow(1 + M.rentGrowth, monthsSinceStart / 12);
  }

  function candidatesFor(types, date, monthIndex) {
    var out = [];
    var lib = cfg.properties || [];
    for (var i = 0; i < lib.length; i++) {
      var it = lib[i];
      if (state.libraryUsed[it.id]) continue;
      if (it.enabled === false) continue;
      if (types.indexOf(it.units) === -1) continue;
      out.push(materialize(it, date, monthIndex, 'library'));
    }
    if (out.length === 0) {
      for (var t = 0; t < types.length; t++) {
        var a = (cfg.archetypes || {})[String(types[t])];
        if (a) out.push(materialize(a, date, monthIndex, 'archetype'));
      }
    }
    return out;
  }

  function materialize(src, date, monthIndex, origin) {
    var units = src.units;
    var price = priceDrift(src.price, monthIndex);
    var rents = (src.unitRents && src.unitRents.length === units)
      ? src.unitRents.map(function (r) { return rentDrift(r, monthIndex); })
      : (function () { var arr = []; for (var i = 0; i < units; i++) arr.push(rentDrift(src.rentPerUnit || 1075, monthIndex)); return arr; })();
    var annualTax = (src.annualTax != null && src.useTaxOverride !== false && origin === 'library')
      ? src.annualTax * Math.pow(1 + Math.min(M.appreciation, M.propTaxCapPct || 0.03), monthIndex / 12)
      : price * taxRateForUnits(units);
    var annualIns = (src.annualInsurance != null && origin === 'library')
      ? src.annualInsurance * Math.pow(1 + M.insuranceInflation, monthIndex / 12)
      : (M.insurancePerUnit || 700) * units * Math.pow(1 + M.insuranceInflation, monthIndex / 12);
    var comps = (src.components && src.components.length) ? src.components : defaultComponents(units);
    /* Market rent the units SHOULD command, if it is known and higher than
       what they collect now. In Fargo this gap is the single biggest lever:
       in-place rents on small multifamily run well under the survey figures. */
    var mkt = src.marketRentPerUnit != null ? rentDrift(src.marketRentPerUnit, monthIndex) : null;

    return {
      origin: origin,
      taxIsOverride: !!(src.annualTax != null && origin === 'library'),
      insIsOverride: !!(src.annualInsurance != null && origin === 'library'),
      ownerUtilitiesMonthly: (src.ownerUtilitiesMonthly || 0) *
        Math.pow(1 + M.expenseInflation, monthIndex / 12),
      marketRentPerUnit: mkt,
      monthsToMarket: src.monthsToMarket != null ? src.monthsToMarket : (R.defaultMonthsToMarket || 18),
      rentIsCollected: !!src.rentIsCollected,
      sourceId: src.id || ('arch' + units),
      nickname: src.nickname || (units + '-unit ' + (origin === 'archetype' ? 'archetype' : 'listing')),
      units: units,
      price: price,
      unitRents: rents,
      annualTax: annualTax,
      annualInsurance: annualIns,
      hoaMonthly: src.hoaMonthly || 0,
      otherMonthlyIncome: src.otherMonthlyIncome || 0,
      rehabCost: src.rehabCost || 0,
      rehabRentBump: src.rehabRentBump || 0,
      yearBuilt: src.yearBuilt || null,
      yearRenovated: src.yearRenovated || null,
      vacancyOverride: src.vacancyOverride != null ? src.vacancyOverride : null,
      /* how this building will be operated once owned */
      rentalStrategy: src.rentalStrategy || 'ltr',
      /* Seller financing: only some sellers will carry paper. Eligibility is a
         deterministic function of the property id so a run is reproducible. */
      sellerFinanceEligible: src.sellerFinanceEligible != null
        ? !!src.sellerFinanceEligible
        : (idBucket(src.id || ('arch' + units)) <
           Math.round(((ST.sellerFinance && ST.sellerFinance.availabilityPct) || 0) * 100)),
      /* Assumable loan riding along with the property, if one was entered. */
      assumableBalance: src.assumableBalance || 0,
      assumableRate: src.assumableRate || 0,
      assumableMonthsElapsed: src.assumableMonthsElapsed || 0,
      assumableTermYears: src.assumableTermYears || 30,
      components: comps.map(function (c) { return Object.assign({}, c); })
    };
  }

  /* ---- underwrite a candidate at a point in time ----
     `financing` selects how it is bought: 'bank' (the default ladder of
     FHA / conventional / investment / commercial), 'seller' (the seller
     carries paper — no bank, so no DSCR gate and no conventional slot
     consumed) or 'assume' (take over the seller's existing low-rate loan and
     pay the equity gap in cash). */
  function underwrite(cand, date, monthIndex, isFirstPurchase, financing) {
    financing = financing || 'bank';
    var SF = ST.sellerFinance || {}, AS = ST.assumable || {}, AM = ST.amortChoice || {};
    /* Owner-occupancy can repeat. FHA is generally one at a time, so a second
       or later live-in purchase uses a conventional owner-occupied loan at a
       higher down payment. */
    var ooCount = R.ownerOccupyCount != null ? R.ownerOccupyCount : (R.ownerOccupyFirst ? 1 : 0);
    var ownerOcc = R.ownerOccupyFirst && cand.units >= 2 && cand.units <= 4 &&
                   state.ownerOccDone < ooCount &&
                   (state.monthIndex - state.lastOwnerOccMonth) >= (R.ownerOccupyGapMonths || 12);
    /* Seller-financed and assumed purchases are investment purchases here; the
       Dodd-Frank seller-financing exclusions reach owner-occupied residential,
       so the engine will not combine either with a live-in purchase. */
    if (financing !== 'bank') ownerOcc = false;
    var ooRepeat = ownerOcc && state.ownerOccDone > 0;
    var product;
    if (financing === 'seller') product = 'seller';
    else if (financing === 'assume') product = 'assumed';
    else if (cand.units >= 5) product = 'commercial';
    else if (ownerOcc) product = ooRepeat ? 'conventionalOO' : 'fha';
    else if (state.financedCount >= F.conventionalLoanCap) product = F.postCapProduct || 'commercial';
    else product = 'investment';

    var price = cand.price;
    var downPct, rate, amortYears, balloonMonths, loanAmount, ioYears = 0;
    var assumptionFee = 0;

    if (product === 'seller') {
      downPct = SF.downPct != null ? SF.downPct : 0.12;
      rate = SF.rate != null ? SF.rate : 0.065;
      amortYears = SF.amortYears || 30;
      balloonMonths = SF.balloonYears ? Math.round(SF.balloonYears * 12) : null;
      loanAmount = price * (1 - downPct);
    } else if (product === 'assumed') {
      /* You assume the balance; the seller's equity is yours to fund in cash. */
      loanAmount = cand.assumableBalance || 0;
      rate = cand.assumableRate || 0;
      amortYears = Math.max(1, (cand.assumableTermYears || 30) -
                               (cand.assumableMonthsElapsed || 0) / 12);
      balloonMonths = null;
      downPct = price > 0 ? Math.max(0, (price - loanAmount) / price) : 1;
      assumptionFee = AS.assumptionFee || 0;
    } else {
      downPct = ownerOcc
        ? (ooRepeat ? (R.ownerOccupySubsequentDownPct || 0.05) : F.ownerOccDownPct)
        : (product === 'commercial' ? (1 - (F.commercialMaxLTV || 0.75)) : F.defaultDownPct);
      rate = rateAt(cfg, product === 'conventionalOO' ? 'fha' : product, date)
             + (product === 'conventionalOO' ? 0.0025 : 0)
             - ((ST.buydownPoints || 0) * 0.0025);
      amortYears = (product === 'commercial')
        ? (AM.commercialYears || F.commercialAmortYears)
        : (AM.investmentYears || F.loanTermYears);
      balloonMonths = (product === 'commercial') ? Math.round((F.commercialBalloonYears || 5) * 12) : null;
      loanAmount = price * (1 - downPct);
      /* Interest-only is an investor-loan feature; never on an FHA live-in. */
      if ((AM.interestOnlyYears || 0) > 0 && !ownerOcc) ioYears = AM.interestOnlyYears;
    }

    var upfrontMIP = 0, mipMonthly = 0;
    if (product === 'conventionalOO') {
      /* PMI until 20% equity, roughly 0.5%/yr on a 95% LTV loan */
      mipMonthly = loanAmount * 0.005 / 12;
    }
    if (product === 'fha') {
      upfrontMIP = loanAmount * (F.fhaUpfrontMIP || 0.0175);
      loanAmount += upfrontMIP;                        // financed into the loan
      mipMonthly = loanAmount * (F.fhaAnnualMIP || 0.0055) / 12;
    }
    var payment = ioYears > 0 ? loanAmount * rate / 12 : pmt(loanAmount, rate, amortYears);
    var closing = price * (product === 'seller' ? (SF.closingCostPct != null ? SF.closingCostPct : F.closingCostPct)
                                                : F.closingCostPct)
                  + price * (1 - downPct) * (product === 'seller' || product === 'assumed'
                      ? 0 : (ST.buydownPoints || 0)) * 0.01;

    /* Operating mode: what business this building will run as once owned. */
    var mode = cand.rentalStrategy || 'ltr';
    var ltrGross = cand.unitRents.reduce(function (a, b) { return a + b; }, 0);
    var modeEcon = rentalModeEconomics(mode, cfg.rentalOps, {
      rentedUnits: cand.units, ltrGross: ltrGross,
      baseMgmtPct: R.management.feePct, managed: state.managementActive
    });
    var furnishing = (modeEcon.furnishPerUnit || 0) * cand.units;

    var cashNeeded = price * downPct + closing + (cand.rehabCost || 0) + furnishing + assumptionFee;

    /* year-one operating math, all units rented (steady state) */
    var grossRent = modeEcon.gross + (cand.otherMonthlyIncome || 0);
    var vac = cand.rentIsCollected ? 0 : (cand.vacancyOverride != null ? cand.vacancyOverride : M.vacancy);
    if (modeEcon.vacancy != null) vac = modeEcon.vacancy;
    var egi = grossRent * (1 - vac);
    var mgmtPct = R.management.feePct + (modeEcon.mgmtExtraPct || 0);
    var mgmt = state.managementActive ? egi * mgmtPct : 0;
    var leasing = state.managementActive
      ? (cand.units * (R.management.turnoverPerYear || 0.5) * (grossRent / cand.units) * (R.management.leasingFeePct || 0.75)) / 12
      : 0;
    var maint = grossRent * R.maintenancePctOfRent;
    var capex = grossRent * R.capexPctOfRent;
    var opexMonthly = cand.annualTax / 12 + cand.annualInsurance / 12 + cand.hoaMonthly +
                      (cand.ownerUtilitiesMonthly || 0) + mgmt + leasing + maint + capex +
                      (modeEcon.extraOpex || 0);
    var noiMonthly = egi - opexMonthly;
    var debtMonthly = payment + mipMonthly;

    /* DSCR is what the LENDER computes, and it differs from your cash flow in
       two ways that matter enormously in this market:
       1. A lender uses a standard replacement reserve (~$300/unit/yr), not your
          fuller CapEx accrual.
       2. On a 1-4 unit investment purchase the underwriter uses the APPRAISER'S
          market-rent schedule (Form 1007), not the in-place rent. With Fargo
          small multifamily renting far under market, underwriting on in-place
          rent would reject deals a bank would happily fund. */
    var lenderReserve = (M.lenderReplacementReservePerUnit || 300) * cand.units / 12;
    var lenderGross = grossRent;
    if (R.dscrUsesMarketRent !== false && cand.marketRentPerUnit != null) {
      var mktGross = cand.marketRentPerUnit * cand.units + (cand.otherMonthlyIncome || 0);
      if (mktGross > lenderGross) lenderGross = mktGross;
    }
    /* A lender underwrites a short-term or mid-term building on its LONG-TERM
       market rent, not on nightly projections. This is the quiet reason an STR
       conversion does not finance itself: the income that justifies the deal is
       income the underwriter will not count. */
    if (mode !== 'ltr') {
      var ltrBasis = (cand.marketRentPerUnit != null
        ? Math.max(ltrGross, cand.marketRentPerUnit * cand.units) : ltrGross)
        + (cand.otherMonthlyIncome || 0);
      lenderGross = Math.min(lenderGross, ltrBasis);
    }
    var lenderEGI = lenderGross * (1 - (mode !== 'ltr'
      ? (cand.vacancyOverride != null ? cand.vacancyOverride : M.vacancy) : vac));
    var lenderOpex = cand.annualTax / 12 + cand.annualInsurance / 12 + cand.hoaMonthly +
                     (cand.ownerUtilitiesMonthly || 0) + mgmt + leasing +
                     lenderGross * R.maintenancePctOfRent;
    var lenderNOI = lenderEGI - lenderOpex - lenderReserve;
    /* Seller financing has no underwriter, so there is no DSCR gate at all. */
    var dscr = product === 'seller' ? 99
             : (debtMonthly > 0 ? lenderNOI / debtMonthly : 99);
    /* The same test run on what the property actually collects today. */
    var dscrConservative = debtMonthly > 0 ? noiMonthly / debtMonthly : 99;
    var dscrInPlace = debtMonthly > 0
      ? (egi - (opexMonthly - capex) - lenderReserve) / debtMonthly : 99;
    var cashFlowMonthly = noiMonthly - debtMonthly;
    var totalCashIn = cashNeeded;
    var coc = totalCashIn > 0 ? (cashFlowMonthly * 12) / totalCashIn : 0;
    var capRate = price > 0 ? (noiMonthly * 12) / price : 0;

    return {
      cand: cand, ownerOcc: ownerOcc, product: product, rate: rate, downPct: downPct,
      loanAmount: loanAmount, upfrontMIP: upfrontMIP, mipMonthly: mipMonthly,
      payment: payment, amortYears: amortYears, balloonMonths: balloonMonths, ooRepeat: ooRepeat,
      closing: closing, cashNeeded: cashNeeded, grossRent: grossRent, egi: egi,
      opexMonthly: opexMonthly, noiMonthly: noiMonthly, debtMonthly: debtMonthly,
      lenderNOI: lenderNOI, dscrConservative: dscrConservative, dscrInPlace: dscrInPlace,
      lenderGross: lenderGross, usedMarketRent: lenderGross > grossRent,
      dscr: dscr, cashFlowMonthly: cashFlowMonthly, coc: coc, capRate: capRate,
      financing: financing, mode: mode, modeEcon: modeEcon, furnishing: furnishing,
      ioYears: ioYears, assumptionFee: assumptionFee,
      pitiMonthly: payment + mipMonthly + cand.annualTax / 12 + cand.annualInsurance / 12
    };
  }

  /* Every way this candidate could be bought, cheapest cash first. */
  function financingOptionsFor(cand) {
    var opts = ['bank'];
    var SF = ST.sellerFinance || {}, AS = ST.assumable || {};
    if (SF.enabled && cand.sellerFinanceEligible) opts.push('seller');
    if (AS.enabled && cand.assumableBalance > 0 &&
        (cand.price - cand.assumableBalance) <= (AS.maxEquityGap || Infinity)) opts.push('assume');
    return opts;
  }

  function scoreDeal(uw) {
    switch (R.dealScore) {
      case 'capRate':   return uw.capRate;
      case 'dscr':      return uw.dscr;
      case 'cashFlow':  return uw.cashFlowMonthly;
      case 'cashPerUnit': return uw.cashFlowMonthly / Math.max(1, uw.cand.units);
      default:          return uw.coc;
    }
  }

  /* ---- execute a purchase ---- */
  function purchase(uw, date, monthIndex) {
    var c = uw.cand;
    var loan = makeLoan({
      product: uw.product, balance: uw.loanAmount, rate: uw.rate,
      amortYears: uw.amortYears, mipMonthly: uw.mipMonthly, balloonMonths: uw.balloonMonths,
      interestOnlyYears: uw.ioYears || 0,
      sellerFinanced: uw.product === 'seller', assumed: uw.product === 'assumed'
    });
    if (uw.product === 'assumed') loan.monthsElapsed = c.assumableMonthsElapsed || 0;
    var buildingPct = M.buildingPctOfValue || 0.8;
    var p = {
      id: 'P' + (state.properties.length + 1),
      seq: state.properties.length + 1,
      nickname: c.nickname,
      origin: c.origin,
      units: c.units,
      purchasePrice: c.price,
      purchaseMonthIndex: monthIndex,
      purchaseDate: { y: date.y, m: date.m },
      currentValue: c.price + (c.rehabCost ? c.rehabCost * (M.rehabValueCapture || 1.0) : 0),
      unitRents: c.unitRents.map(function (r, i) { return r + (c.rehabRentBump || 0); }),
      annualTax: c.annualTax,
      /* A sale is what triggers a reassessment. If the entered bill came from
         the seller's lagging assessment, hand the property over to the formula
         at the first January and let that one jump skip the annual cap. */
      taxIsOverride: !!c.taxIsOverride && !M.reassessOnSale,
      pendingReassess: !!(c.taxIsOverride && M.reassessOnSale),
      annualInsurance: c.annualInsurance,
      hoaMonthly: c.hoaMonthly,
      ownerUtilitiesMonthly: c.ownerUtilitiesMonthly || 0,
      otherMonthlyIncome: c.otherMonthlyIncome,
      vacancyOverride: c.vacancyOverride,
      rentIsCollected: !!c.rentIsCollected,
      /* Rent ramp toward market, if a market rent above in-place was given. */
      targetRents: c.marketRentPerUnit != null
        ? c.unitRents.map(function (r) { return Math.max(r, c.marketRentPerUnit); }) : null,
      rentRampLeft: c.marketRentPerUnit != null ? Math.max(0, Math.round(c.monthsToMarket)) : 0,
      rentStep: c.marketRentPerUnit != null
        ? c.unitRents.map(function (r) {
            var t = Math.max(r, c.marketRentPerUnit);
            return c.monthsToMarket > 0 ? (t - r) / c.monthsToMarket : 0;
          }) : null,
      loan: loan,
      product: uw.product,
      ownerOccupied: uw.ownerOcc,
      ownerOccUntil: uw.ownerOcc ? monthIndex + (R.ownerOccupyMonths || 12) : null,
      depreciableBasis: (c.price + (c.rehabCost || 0)) * buildingPct,
      accumDepreciation: 0,
      capitalImprovements: [],
      /* --- cost segregation: split the depreciable basis into the 27.5-year
         shell and the short-life property a study would identify. Short-life
         property is Section 1245, recaptured at ORDINARY rates on a sale, so
         it is tracked separately for the rest of the property's life. --- */
      shortLifeBasis: 0, accumShortLifeDep: 0, costSegDone: false,
      /* --- 1031: a replacement property carries basis forward. The carryover
         slice keeps running the ORIGINAL schedule over its remaining life;
         only the excess basis starts a fresh 27.5-year clock and is the only
         part bonus depreciation can touch. --- */
      carryoverBasis: 0, carryoverMonthsLeft: 0, deferredGain: 0,
      isReplacement: false, refiCount: 0, lastRefiMonth: -999,
      /* --- operating mode and the levers scheduled against it --- */
      rentalStrategy: uw.mode || 'ltr',
      furnishingCost: uw.furnishing || 0,
      rubsDone: false,
      rubsAt: (ST.rubs && ST.rubs.enabled)
        ? monthIndex + (ST.rubs.monthsAfterPurchase || 6) : null,
      ancillaryDone: false,
      ancillaryAt: (ST.ancillary && ST.ancillary.enabled)
        ? monthIndex + (ST.ancillary.monthsAfterPurchase || 3) : null,
      taxAppealDone: false,
      taxAppealAt: (ST.taxAppeal && ST.taxAppeal.enabled)
        ? monthIndex + (ST.taxAppeal.monthsAfterPurchase || 14) : null,
      /* --- paydown bookkeeping --- */
      extraPrincipal: 0, freeAndClear: false, freeAndClearMonth: null,
      rateRefiCount: 0, lastRateRefiMonth: -999, recastRelief: 0,
      components: c.components.map(function (comp) {
        var remainMonths = Math.round(Math.max(0, (comp.lifeYears - comp.ageYears)) * 12);
        return { name: comp.name, enabled: comp.enabled !== false, cost: comp.cost,
                 lifeMonths: Math.round(comp.lifeYears * 12), dueAt: monthIndex + remainMonths };
      }),
      totalCashInvested: uw.cashNeeded,
      cumCashFlow: 0,
      lastRentBumpMonth: monthIndex
    };
    /* Cost segregation election, taken at acquisition. */
    var CS = (cfg.strategies && cfg.strategies.costSeg) || { enabled: false };
    if (CS.enabled && c.price >= (CS.minPrice || 0)) {
      var short = p.depreciableBasis * (CS.shortLifePct || 0.25);
      p.shortLifeBasis = short;
      p.depreciableBasis -= short;          // the shell keeps the remainder
      p.costSegDone = true;
      state.cash -= (CS.studyCost || 0);
      /* 100% bonus depreciation, permanent for property acquired after
         19 Jan 2025 (OBBBA). Taken entirely in the acquisition year. */
      p.bonusDeduction = short * (CS.bonusPct != null ? CS.bonusPct : 1);
      p.accumShortLifeDep += p.bonusDeduction;
      state.pendingBonus += p.bonusDeduction;
      /* The study fee is deductible against whichever bucket the property's
         income falls into, and that is what decides if it is worth paying. */
      if (uw.modeEcon && uw.modeEcon.isNonPassive) state.costSegSpendNonPassive += (CS.studyCost || 0);
      else state.costSegSpend += (CS.studyCost || 0);
    }

    if (uw.ownerOcc) { state.ownerOccDone++; state.lastOwnerOccMonth = monthIndex; }
    state.properties.push(p);
    state.financedCount++;
    state.libraryUsed[c.sourceId] = true;
    state.cash -= uw.cashNeeded;

    var rec = {
      monthIndex: monthIndex, date: { y: date.y, m: date.m }, label: fmtMonth(date),
      seq: p.seq, property: p, uw: uw,
      cashAfter: state.cash
    };
    acquisitions.push(rec);
    return rec;
  }

  /* ---- annual escalations ---- */
  function januaryEscalation(p, date) {
    var cap = M.applyTaxCap ? (M.propTaxCapPct || 0.03) : null;
    if (p.pendingReassess) {
      /* The post-sale reassessment: one uncapped step to the property's own
         value, then normal capped growth from there. */
      p.annualTax = p.currentValue * taxRateForUnits(p.units) * (M.assessedToSaleRatio || 1);
      p.pendingReassess = false;
      p.annualInsurance *= (1 + M.insuranceInflation);
      p.hoaMonthly *= (1 + M.expenseInflation);
      p.ownerUtilitiesMonthly *= (1 + M.expenseInflation);
      return;
    }
    if (p.taxIsOverride) {
      /* A real tax bill entered from a listing is the truth. Grow it the way an
         assessment actually grows — with value, capped — never overwrite it with
         the market-rate estimate. */
      var g = (cap != null) ? Math.min(M.appreciation, cap) : M.appreciation;
      p.annualTax *= (1 + g);
    } else {
      var newTax = p.currentValue * taxRateForUnits(p.units);
      if (cap != null) newTax = Math.min(newTax, p.annualTax * (1 + cap));
      p.annualTax = newTax;
    }
    p.annualInsurance *= (1 + M.insuranceInflation);
    p.hoaMonthly *= (1 + M.expenseInflation);
    p.ownerUtilitiesMonthly *= (1 + M.expenseInflation);
  }
  function anniversaryRentBump(p, monthIndex, rec) {
    var growth = M.rentGrowth;
    if (rec) growth = rec.rentGrowthOverride != null ? rec.rentGrowthOverride : growth;
    for (var i = 0; i < p.unitRents.length; i++) p.unitRents[i] *= (1 + growth);
    p.lastRentBumpMonth = monthIndex;
  }

  /* ======================================================================
     STRATEGIES — every one deterministic, every one off unless switched on
     ==================================================================== */
  var ST = cfg.strategies || {};

  /* ---- cash-out refinance -------------------------------------------- */
  function tryRefinance(p, date, mi, events) {
    var C = ST.cashOutRefi;
    if (!C || !C.enabled) return 0;
    if (mi - p.purchaseMonthIndex < (C.seasoningMonths || 12)) return 0;
    if (mi - p.lastRefiMonth < (C.seasoningMonths || 12)) return 0;
    if (p.ownerOccupied) return 0;

    var maxLoan = p.currentValue * (C.maxLTV || 0.75);
    var gross = maxLoan - p.loan.balance;
    var costs = maxLoan * (C.costPct || 0.02);
    var net = gross - costs;
    if (net < (C.minProceeds || 20000)) return 0;

    /* the new, larger payment still has to be coverable */
    var product = p.units >= 5 ? 'commercial' : 'dscr';
    var rate = rateAt(cfg, product, date);
    var amort = product === 'commercial' ? F.commercialAmortYears : F.loanTermYears;
    var newPay = pmt(maxLoan, rate, amort);
    var gross2 = p.unitRents.reduce(function (a, b) { return a + b; }, 0) + p.otherMonthlyIncome;
    var egi2 = gross2 * (1 - (p.vacancyOverride != null ? p.vacancyOverride : M.vacancy));
    var opex2 = p.annualTax / 12 + p.annualInsurance / 12 + p.hoaMonthly +
                (p.ownerUtilitiesMonthly || 0) + gross2 * R.maintenancePctOfRent +
                (M.lenderReplacementReservePerUnit || 300) * p.units / 12;
    if (newPay <= 0 || (egi2 - opex2) / newPay < (C.minDSCRAfter || 1.20)) return 0;

    p.loan.balance = maxLoan;
    p.loan.rate = rate;
    p.loan.amortYears = amort;
    p.loan.payment = newPay;
    p.loan.monthsElapsed = 0;
    p.loan.product = product;
    p.loan.balloonMonths = product === 'commercial'
      ? Math.round((F.commercialBalloonYears || 5) * 12) : null;
    p.lastRefiMonth = mi;
    p.refiCount++;
    state.refiProceeds += net;
    events.push({ type: 'refi', text: p.nickname + ': cash-out refinance released ' +
      fmtMoney(net) + ' at ' + (rate * 100).toFixed(2) + '% — loan now ' + fmtMoney(maxLoan) });
    return net;
  }

  /* ---- HELOC ---------------------------------------------------------- */
  function helocLimitNow() {
    var H = ST.heloc;
    if (!H || !H.enabled) return 0;
    /* A free-and-clear building carries a better line than a mortgaged one —
       the bank is in first position, so it will go to a higher combined LTV.
       That is the mechanical link between paying a property off and being able
       to pounce on the next one. */
    var capacity = 0;
    for (var i = 0; i < state.properties.length; i++) {
      var p = state.properties[i];
      if (state.monthIndex - p.purchaseMonthIndex < (H.seasoningMonths || 12)) continue;
      var cltv = p.loan.balance <= 0.005
        ? (H.freeAndClearCLTV != null ? H.freeAndClearCLTV : (H.maxCLTV || 0.80))
        : (H.maxCLTV || 0.80);
      capacity += p.currentValue * cltv - p.loan.balance;
    }
    return Math.max(0, capacity);
  }
  function helocAvailable() { return Math.max(0, state.helocLimit - state.helocBalance); }

  /* ---- DEBT PAYDOWN ---------------------------------------------------
     Pick a target, throw surplus at it, and — if recast is on — convert the
     lower balance into a lower payment. Without a recast the payment does not
     move at all until the loan is fully retired, which is the single most
     misunderstood fact about this strategy. */
  function paydownTarget() {
    var P = ST.paydown || {};
    var pool = state.properties.filter(function (p) {
      if (p.loan.balance <= 0.005) return false;
      if (P.skipOwnerOccupied !== false && p.ownerOccupied) return false;
      return true;
    });
    if (!pool.length) return null;
    if (P.mode === 'target') {
      for (var i = 0; i < pool.length; i++) if (pool[i].seq === P.targetSeq) return pool[i];
      return pool[0];
    }
    var best = pool[0], bestKey = null;
    function key(p) {
      switch (P.mode) {
        /* smallest balance first — fastest to a free-and-clear building */
        case 'snowball':       return -p.loan.balance;
        /* biggest payment first — fastest cash-flow relief once retired */
        case 'highestPayment': return p.loan.payment + p.loan.mipMonthly;
        /* the thinnest-covered building — this is the resilience play */
        case 'lowestDSCR':     return -propertyDSCR(p);
        case 'worstCashFlow':  return -(p.lastCashFlow != null ? p.lastCashFlow : 0);
        case 'newest':         return p.purchaseMonthIndex;
        /* avalanche: highest rate first — the most interest saved per dollar */
        default:               return p.loan.rate;
      }
    }
    for (var j = 0; j < pool.length; j++) {
      var k = key(pool[j]);
      if (bestKey === null || k > bestKey) { bestKey = k; best = pool[j]; }
    }
    return best;
  }
  function propertyDSCR(p) {
    var gross = p.unitRents.reduce(function (a, b) { return a + b; }, 0) + p.otherMonthlyIncome;
    var egi = gross * (1 - (p.vacancyOverride != null ? p.vacancyOverride : M.vacancy));
    var opex = p.annualTax / 12 + p.annualInsurance / 12 + p.hoaMonthly +
               (p.ownerUtilitiesMonthly || 0) + gross * R.maintenancePctOfRent +
               (M.lenderReplacementReservePerUnit || 300) * p.units / 12;
    var debt = p.loan.payment + p.loan.mipMonthly;
    return debt > 0.005 ? (egi - opex) / debt : 99;
  }
  function paydownActive(date, mi) {
    var P = ST.paydown || {};
    if (!P.enabled) return false;
    if (state.freeAndClearCount >= (P.stopAfterFreeAndClear || 99)) return false;
    if ((P.startAfterProperties || 0) > state.properties.length) return false;
    if (P.startMonth && monthsBetween(start, parseMonth(P.startMonth)) > mi) return false;
    /* Nothing to pay down yet. Without this, "pause acquisitions to pay down
       debt" would pause acquisitions before there is any debt, and the plan
       would never start. */
    if (!paydownTarget()) return false;
    return true;
  }
  function runPaydown(date, mi, events, phase) {
    var P = ST.paydown || {};
    if (!paydownActive(date, mi)) return 0;
    var wantPhase = P.allocation === 'pauseAcquisitions' ? 'before' : 'after';
    if (phase !== wantPhase) return 0;

    var p = paydownTarget();
    if (!p) return 0;

    var floor = emergencyFundRequired() + lenderReserveRequired(0) +
                (P.keepMonthsBuffer || 0) * (S.personalMonthlyExpenses || 0);
    var spare = state.cash - floor;
    var amount = (P.monthlyExtra || 0);
    if (spare > 0) {
      var share = P.allocation === 'splitPct' ? (P.splitPct || 0.5) : (P.surplusPct != null ? P.surplusPct : 1);
      amount += spare * share;
    }
    amount = Math.min(amount, Math.max(0, state.cash - floor) + (spare > 0 ? 0 : 0));
    if (amount <= 0.01) return 0;
    amount = Math.min(amount, p.loan.balance);
    if (amount <= 0.01) return 0;

    p.loan.balance -= amount;
    p.loan.extraPrincipalPaid += amount;
    p.extraPrincipal += amount;
    state.cash -= amount;
    state.extraPrincipalTotal += amount;

    if (p.loan.balance <= 0.01) {
      p.loan.balance = 0; p.loan.payment = 0; p.loan.mipMonthly = 0;
      p.freeAndClear = true; p.freeAndClearMonth = mi;
      state.freeAndClearCount++;
      events.push({ type: 'paidoff', text: p.nickname + ' is FREE AND CLEAR — ' +
        'the whole payment becomes cash flow, and the building now supports a ' +
        ((((ST.heloc || {}).freeAndClearCLTV) || 0.85) * 100).toFixed(0) + '% line instead of ' +
        ((((ST.heloc || {}).maxCLTV) || 0.80) * 100).toFixed(0) + '%.' });
      milestones.push({ monthIndex: mi, date: { y: date.y, m: date.m }, kind: 'paidoff',
                        text: 'Paid off ' + p.nickname.split(' (')[0] });
    } else if (P.recast && amount >= (P.recastMinPrincipal || 5000)) {
      var fee = P.recastFee || 0;
      var relief = recastLoan(p.loan);
      state.cash -= fee;
      state.recastCount++; state.recastFeesPaid += fee;
      state.recastReliefTotal += relief;
      p.recastRelief += relief;
      events.push({ type: 'recast', text: p.nickname + ': paid down ' + fmtMoney(amount) +
        ' and recast — payment drops ' + fmtDollars(relief) + '/mo for a ' +
        fmtMoney(fee) + ' fee. Same rate, same payoff date, lower payment.' });
    }
    return amount;
  }

  /* ---- RATE-AND-TERM REFINANCE ----------------------------------------
     No cash out. When the rate path drops far enough, swap the rate and keep
     the balance. resetTerm:false preserves the remaining term, which is what
     stops a refinance from quietly restarting amortization. */
  function tryRateRefi(p, date, mi, events) {
    var RR = ST.rateRefi;
    if (!RR || !RR.enabled) return 0;
    if (p.loan.balance <= 0.005) return 0;
    if (p.loan.sellerFinanced || p.loan.assumed) return 0;
    if (mi - p.purchaseMonthIndex < (RR.minMonthsOwned || 12)) return 0;
    if (mi - p.lastRateRefiMonth < (RR.minMonthsBetween || 18)) return 0;
    if (p.rateRefiCount >= (RR.maxPerProperty || 2)) return 0;

    var product = p.units >= 5 ? 'commercial' : (p.ownerOccupied ? 'fha' : 'investment');
    var newRate = rateAt(cfg, product, date);
    if (newRate > p.loan.rate - (RR.dropBps || 75) / 10000) return 0;

    var cost = p.loan.balance * (RR.costPct || 0.02);
    var termYears = RR.resetTerm
      ? (p.units >= 5 ? F.commercialAmortYears : F.loanTermYears)
      : loanRemainingYears(p.loan);
    var newPay = pmt(p.loan.balance, newRate, termYears);
    var relief = p.loan.payment - newPay;
    /* only worth it if the costs come back inside five years */
    if (relief <= 0 || cost / relief > 60) return 0;

    p.loan.rate = newRate;
    p.loan.payment = newPay;
    if (RR.resetTerm) { p.loan.amortYears = termYears; p.loan.monthsElapsed = 0; }
    p.loan.refis++;
    p.rateRefiCount++;
    p.lastRateRefiMonth = mi;
    state.cash -= cost;
    state.rateRefiCount++;
    state.rateRefiSavings += relief;
    events.push({ type: 'raterefi', text: p.nickname + ': rate-and-term refinance to ' +
      (newRate * 100).toFixed(2) + '% — payment down ' + fmtDollars(relief) + '/mo, ' +
      fmtMoney(cost) + ' in costs, break-even in ' + Math.round(cost / relief) + ' months' +
      (RR.resetTerm ? '. Term reset to ' + termYears + ' years.' : '. Remaining term preserved.') });
    return relief;
  }

  /* ---- 1031 exchange --------------------------------------------------- */
  function tryExchange(date, mi, events, aggCashFlow) {
    var X = ST.exchange;
    if (!X || !X.enabled) return null;
    if (!state.properties.length) return null;
    var fire = false;
    if (X.triggerType === 'properties') fire = state.properties.length >= X.triggerValue;
    else if (X.triggerType === 'units') fire = state.properties.reduce(
      function (a, p) { return a + p.units; }, 0) >= X.triggerValue;
    else if (X.triggerType === 'equity') fire = state.properties.reduce(
      function (a, p) { return a + (p.currentValue - p.loan.balance); }, 0) >= X.triggerValue;
    if (!fire) return null;
    if (state.exchangeCount >= (X.maxExchanges || 3)) return null;
    if (mi - (state.lastExchangeMonth || -999) < 24) return null;

    /* relinquish the property with the most equity that is not owner-occupied */
    var best = null;
    for (var i = 0; i < state.properties.length; i++) {
      var p = state.properties[i];
      if (p.ownerOccupied) continue;
      if (mi - p.purchaseMonthIndex < 24) continue;
      var eq = p.currentValue - p.loan.balance;
      if (!best || eq > (best.currentValue - best.loan.balance)) best = p;
    }
    if (!best) return null;

    var adjBasis = best.purchasePrice + best.capitalImprovements.reduce(
      function (a, c) { return a + c.amount; }, 0) - best.accumDepreciation - best.accumShortLifeDep;
    var salePrice = best.currentValue;
    var sellCosts = salePrice * (X.sellCostPct || 0.07) + (X.qiFee || 1200);
    var realizedGain = salePrice - sellCosts - adjBasis;
    if (realizedGain < (X.minGain || 60000)) return null;
    var netProceeds = salePrice - sellCosts - best.loan.balance;
    if (netProceeds <= 0) return null;

    /* replacement must be equal or greater value; size it to the proceeds */
    var downPct = 1 - (F.commercialMaxLTV || 0.75);
    var affordable = netProceeds / downPct;
    var targetPrice = Math.max(salePrice * 1.01, Math.min(affordable,
      (X.targetUnits || 12) * (X.targetPricePerUnit || 80000) *
      Math.pow(1 + M.appreciation, mi / 12)));
    var perUnit = (X.targetPricePerUnit || 80000) * Math.pow(1 + M.appreciation, mi / 12);
    var units = Math.max(best.units + 1, Math.round(targetPrice / perUnit));
    targetPrice = units * perUnit;
    if (netProceeds < targetPrice * downPct) {
      units = Math.max(best.units + 1, Math.floor(netProceeds / downPct / perUnit));
      if (units <= best.units) return null;
      targetPrice = units * perUnit;
    }

    /* remove the old property, place the new one */
    var idx = state.properties.indexOf(best);
    state.properties.splice(idx, 1);
    state.soldCount++;
    state.exchangeCount++;
    state.lastExchangeMonth = mi;
    state.deferredGainTotal += realizedGain;

    var loanAmt = targetPrice - netProceeds;
    var rate = rateAt(cfg, 'commercial', date);
    var loan = makeLoan({ product: 'commercial', balance: loanAmt, rate: rate,
      amortYears: F.commercialAmortYears, mipMonthly: 0,
      balloonMonths: Math.round((F.commercialBalloonYears || 5) * 12) });

    /* basis: total = cost - deferred gain. The carryover slice keeps running the
       ORIGINAL schedule over its remaining life; only the excess starts fresh. */
    var totalBasis = targetPrice - realizedGain;
    var carryover = Math.max(0, Math.min(adjBasis, totalBasis));
    var excess = Math.max(0, totalBasis - carryover);
    var monthsUsed = mi - best.purchaseMonthIndex;
    var carryMonthsLeft = Math.max(1, Math.round((M.depreciationYears || 27.5) * 12) - monthsUsed);

    var rentPer = (X.replacementRentPerUnit || 1050) * Math.pow(1 + M.rentGrowth, mi / 12);
    var np = {
      id: 'X' + (state.properties.length + 1), seq: acquisitions.length + 1,
      nickname: units + '-unit exchange replacement',
      origin: 'exchange', units: units, purchasePrice: targetPrice,
      purchaseMonthIndex: mi, purchaseDate: { y: date.y, m: date.m },
      currentValue: targetPrice,
      unitRents: new Array(units).fill(rentPer),
      annualTax: targetPrice * taxRateForUnits(units),
      taxIsOverride: false, pendingReassess: false,
      annualInsurance: (M.insurancePerUnit || 800) * units *
        Math.pow(1 + M.insuranceInflation, mi / 12),
      hoaMonthly: 0, ownerUtilitiesMonthly: 0, otherMonthlyIncome: 0,
      vacancyOverride: null, rentIsCollected: false,
      targetRents: null, rentRampLeft: 0, rentStep: null,
      loan: loan, product: 'commercial', ownerOccupied: false, ownerOccUntil: null,
      /* only the EXCESS basis gets a fresh 27.5-year clock */
      depreciableBasis: excess * (M.buildingPctOfValue || 0.8),
      carryoverBasis: carryover, carryoverMonthsLeft: carryMonthsLeft,
      deferredGain: realizedGain, isReplacement: true,
      accumDepreciation: 0, shortLifeBasis: 0, accumShortLifeDep: 0, costSegDone: false,
      capitalImprovements: [], components: defaultComponents(units).map(function (c) {
        return { name: c.name, enabled: c.enabled !== false, cost: c.cost,
                 lifeMonths: Math.round(c.lifeYears * 12),
                 dueAt: mi + Math.round(Math.max(0, c.lifeYears - c.ageYears) * 12) }; }),
      totalCashInvested: best.totalCashInvested, cumCashFlow: best.cumCashFlow,
      lastRentBumpMonth: mi, refiCount: 0, lastRefiMonth: -999
    };
    state.properties.push(np);
    state.financedCount++;

    events.push({ type: 'exchange', text: '1031 exchange: sold ' + best.nickname.split(' (')[0] +
      ' for ' + fmtMoney(salePrice) + ', deferred ' + fmtMoney(realizedGain) +
      ' of gain, rolled ' + fmtMoney(netProceeds) + ' into a ' + units + '-unit at ' +
      fmtMoney(targetPrice) + '. Suspended passive losses do NOT release — no taxable disposition.' });
    milestones.push({ monthIndex: mi, date: { y: date.y, m: date.m }, kind: 'exchange',
      text: 'Traded up: ' + best.units + ' units becomes ' + units });
    return np;
  }

  /* ======================================================================
     MONTH LOOP
     ==================================================================== */
  for (var mi = 0; mi <= horizonMonths; mi++) {
    var date = addMonths(start, mi);
    state.monthIndex = mi;
    var rec = recessionActive(date);
    var events = [];

    var cashStart = state.cash;

    /* ---- 1. contributions ---- */
    var contrib = contributionFor(date);
    /* owner-occupied: credit the rent the user is no longer paying elsewhere */
    var occProp = null;
    for (var q = 0; q < state.properties.length; q++) {
      if (state.properties[q].ownerOccupied && mi < state.properties[q].ownerOccUntil) occProp = state.properties[q];
    }
    var housingCredit = occProp ? (S.currentHousingCost || 0) : 0;
    state.cash += contrib + housingCredit;
    state.totalContributed += contrib;

    /* ---- 2. january escalations ---- */
    if (date.m === 0 && mi > 0) {
      for (var j = 0; j < state.properties.length; j++) januaryEscalation(state.properties[j], date);
    }

    /* ---- 3. per-property operations ---- */
    var agg = {
      grossRent: 0, vacancyLoss: 0, egi: 0, tax: 0, insurance: 0, hoa: 0, utilities: 0,
      mgmt: 0, leasing: 0, maint: 0, capexAccrual: 0, other: 0,
      noi: 0, interest: 0, principal: 0, mip: 0, debtService: 0, cashFlow: 0,
      value: 0, debt: 0, equity: 0, units: 0, capexSpent: 0, depreciation: 0, pitiTotal: 0,
      taxablePassive: 0, taxableNonPassive: 0
    };

    for (var pi = 0; pi < state.properties.length; pi++) {
      var p = state.properties[pi];

      /* rent anniversary bump */
      if (mi > p.purchaseMonthIndex && (mi - p.purchaseMonthIndex) % 12 === 0) {
        anniversaryRentBump(p, mi, rec);
      }
      /* ramp below-market rents toward market, one step a month */
      if (p.rentRampLeft > 0 && mi > p.purchaseMonthIndex) {
        for (var ri = 0; ri < p.unitRents.length; ri++) {
          p.unitRents[ri] = Math.min(p.targetRents[ri], p.unitRents[ri] + p.rentStep[ri]);
        }
        p.rentRampLeft--;
        if (p.rentRampLeft === 0) {
          events.push({ type: 'rentramp', text: p.nickname + ': rents brought to market — now ' +
            fmtMoney(p.unitRents.reduce(function (a, b) { return a + b; }, 0)) + '/mo gross' });
        }
      }
      /* owner-occupancy ends */
      if (p.ownerOccupied && p.ownerOccUntil != null && mi === p.ownerOccUntil) {
        p.ownerOccupied = false;
        events.push({ type: 'occupancy', text: p.nickname + ': owner-occupancy ends, all ' + p.units + ' units now rented' });
      }
      var occupyingThis = (p.ownerOccupied && mi < p.ownerOccUntil);

      /* appreciation */
      var appr = M.appreciation;
      if (rec) appr = rec.appreciationOverride;
      p.currentValue *= Math.pow(1 + appr, 1 / 12);

      /* ---- income levers that mature on a schedule ---- */
      /* RUBS: utilities pushed back onto tenants. It cannot be imposed
         mid-lease, which is why it lands months after closing, not at it. */
      if (p.rubsAt != null && !p.rubsDone && mi >= p.rubsAt &&
          ST.rubs && ST.rubs.enabled &&
          (p.ownerUtilitiesMonthly || 0) >= (ST.rubs.minUtilitiesMonthly || 0)) {
        var recovered = (p.ownerUtilitiesMonthly || 0) * (ST.rubs.recoveryPct || 0.75);
        p.ownerUtilitiesMonthly -= recovered;
        var setup = (ST.rubs.setupCostPerUnit || 0) * p.units;
        state.cash -= setup; state.rubsSpend += setup;
        p.rubsDone = true;
        p.rubsRecovered = recovered;
        /* The effective rent rises, so some of it comes back as rent resistance. */
        if (ST.rubs.rentOffsetPct) {
          for (var ro = 0; ro < p.unitRents.length; ro++) {
            p.unitRents[ro] *= (1 - ST.rubs.rentOffsetPct);
          }
        }
        events.push({ type: 'rubs', text: p.nickname + ': RUBS billing live — ' +
          fmtDollars(recovered) + '/mo of utilities now billed to tenants, ' +
          fmtMoney(setup) + ' to set up' });
      }
      if (p.rubsDone) state.rubsRecovered += (p.rubsRecovered || 0);

      /* Ancillary income: laundry, storage, parking, pet rent, admin fees. */
      if (p.ancillaryAt != null && !p.ancillaryDone && mi >= p.ancillaryAt &&
          ST.ancillary && ST.ancillary.enabled) {
        var A = ST.ancillary;
        var per = (A.laundryPerUnit || 0) + (A.parkingPerUnit || 0) + (A.storagePerUnit || 0) +
                  (A.petRentPerUnit || 0) + (A.adminFeesPerUnit || 0);
        p.otherMonthlyIncome += per * p.units;
        p.ancillaryAdded = per * p.units;
        p.ancillaryDone = true;
        events.push({ type: 'ancillary', text: p.nickname + ': ancillary income added — ' +
          fmtDollars(per * p.units) + '/mo across ' + p.units + ' units' });
      }
      if (p.ancillaryDone) state.ancillaryIncome += (p.ancillaryAdded || 0);

      /* Property tax appeal, aimed at the post-sale reassessment. */
      if (p.taxAppealAt != null && !p.taxAppealDone && mi >= p.taxAppealAt &&
          ST.taxAppeal && ST.taxAppeal.enabled) {
        var cut = p.annualTax * (ST.taxAppeal.reductionPct || 0.08);
        p.annualTax -= cut;
        state.cash -= (ST.taxAppeal.cost || 0);
        state.taxAppealSpend += (ST.taxAppeal.cost || 0);
        state.taxAppealSavings += cut;
        p.taxAppealDone = true;
        events.push({ type: 'taxappeal', text: p.nickname + ': assessment appealed — ' +
          fmtMoney(cut) + '/yr off the tax bill for ' + fmtMoney(ST.taxAppeal.cost || 0) });
      }

      /* rent roll */
      var rentedUnits = occupyingThis ? p.units - 1 : p.units;
      var gross = 0;
      for (var u = 0; u < p.unitRents.length; u++) {
        if (occupyingThis && u === 0) continue;         // owner takes unit 0
        gross += p.unitRents[u];
      }
      var recRentFactor = rec ? (1 - rec.rentDropPct) : 1;
      gross *= recRentFactor;

      /* ---- operating mode: convert the long-term roll into whatever business
         this building actually runs. Carries its own vacancy, its own added
         expenses, and — for a sub-7-day short-term rental — its own tax
         character. ---- */
      var pMode = p.rentalStrategy || 'ltr';
      var econ = rentalModeEconomics(pMode, cfg.rentalOps, {
        rentedUnits: rentedUnits, ltrGross: gross,
        baseMgmtPct: R.management.feePct, managed: state.managementActive
      });
      gross = econ.gross;
      var modeExtraOpex = econ.extraOpex || 0;
      if (econ.lodgingTax) state.lodgingTaxPaid += econ.lodgingTax;
      if (econ.participationLost && !state.strParticipationWarned) {
        state.strParticipationWarned = true;
        warnings.push('A short-term rental is being professionally managed. Material participation under Reg. 1.469-5T(a) is almost certainly lost, so the sub-7-day non-passive treatment does not apply and those losses are passive again. The tax advantage and hands-off operation are mutually exclusive.');
      }
      gross += p.otherMonthlyIncome;

      /* vacancy (+ recession, + scheduled vacancy events) */
      var vac = p.rentIsCollected ? 0 : (p.vacancyOverride != null ? p.vacancyOverride : M.vacancy);
      if (econ.vacancy != null) vac = econ.vacancy;
      if (rec) vac = clamp(vac + rec.vacancyAddPts, 0, 0.95);
      var forcedVacant = false;
      var evList = (cfg.stress && cfg.stress.events) || [];
      for (var e = 0; e < evList.length; e++) {
        var ev = evList[e];
        if (!ev.enabled) continue;
        if (ev.type !== 'vacancy' && ev.type !== 'eviction') continue;
        var evStart = monthsBetween(start, parseMonth(ev.month));
        if (ev.propertySeq && ev.propertySeq !== p.seq) continue;
        if (!ev.propertySeq && pi !== 0) continue;       // default: first property
        if (mi >= evStart && mi < evStart + (ev.months || 1)) {
          forcedVacant = true;
        }
        if (ev.type === 'eviction' && mi === evStart) {
          state.cash -= (ev.amount || 0);
          events.push({ type: 'eviction', text: p.nickname + ': eviction — $' + Math.round(ev.amount || 0).toLocaleString() + ' in legal fees and turnover repairs' });
        }
      }
      if (forcedVacant) {
        var lostUnits = Math.min(rentedUnits, (function(){ for (var e2=0;e2<evList.length;e2++){var x=evList[e2]; if(x.enabled&&(x.type==='vacancy'||x.type==='eviction')) return x.unitsAffected||1;} return 1; })());
        gross -= (gross / Math.max(1, rentedUnits)) * lostUnits;
        if (mi % 3 === 0) events.push({ type: 'vacancy', text: p.nickname + ': unit sitting vacant' });
      }

      var vacLoss = gross * vac;
      var egi = gross - vacLoss;

      /* management activation check happens at portfolio level below; use flag */
      var mgmtPctHere = R.management.feePct + (econ.mgmtExtraPct || 0);
      var mgmt = state.managementActive ? egi * mgmtPctHere : 0;
      var leasing = state.managementActive
        ? (p.units * (R.management.turnoverPerYear || 0.5) * ((gross || 1) / Math.max(1, p.units)) * (R.management.leasingFeePct || 0.75)) / 12
        : 0;
      var maint = gross * R.maintenancePctOfRent;
      var capexAccrual = gross * R.capexPctOfRent;
      var taxM = p.annualTax / 12;
      var insM = p.annualInsurance / 12;

      var utilM = (p.ownerUtilitiesMonthly || 0) + modeExtraOpex;
      var opex = taxM + insM + p.hoaMonthly + utilM + mgmt + leasing + maint + capexAccrual;
      var noi = egi - opex;

      var ls = loanStep(p.loan);
      if (ls.ioEnded) {
        events.push({ type: 'iostep', text: p.nickname + ': interest-only period ends — ' +
          'payment steps up ' + fmtDollars(p.loan.ioStepUp) + '/mo to ' +
          fmtDollars(p.loan.payment) + ', because the same balance now amortizes over ' +
          'a shorter remaining term.' });
      }

      /* balloon refinance */
      if (p.loan.balloonMonths && p.loan.monthsElapsed >= p.loan.balloonMonths && p.loan.balance > 0.005) {
        var newRate = rateAt(cfg, 'commercial', date);
        var refiCost = p.loan.balance * (F.refiCostPct || 0.01);
        p.loan.rate = newRate;
        p.loan.payment = pmt(p.loan.balance, newRate, F.commercialAmortYears);
        p.loan.monthsElapsed = 0;
        p.loan.refis++;
        state.cash -= refiCost;
        events.push({ type: 'balloon', text: p.nickname + ': balloon due — refinanced ' + fmtMoney(p.loan.balance) + ' at ' + (newRate * 100).toFixed(2) + '%, $' + Math.round(refiCost).toLocaleString() + ' in costs' });
      }

      /* depreciation — shell, carryover slice, and any un-bonused short-life */
      var dep = p.depreciableBasis / (M.depreciationYears || 27.5) / 12;
      if (p.carryoverBasis > 0 && p.carryoverMonthsLeft > 0) {
        dep += p.carryoverBasis / p.carryoverMonthsLeft;
        p.carryoverBasis -= p.carryoverBasis / p.carryoverMonthsLeft;
        p.carryoverMonthsLeft--;
      }
      var slRemain = p.shortLifeBasis - p.accumShortLifeDep;
      if (slRemain > 0.01 && mi - p.purchaseMonthIndex < 60) {
        var slStep = p.shortLifeBasis * (1 - ((ST.costSeg && ST.costSeg.bonusPct != null)
                     ? ST.costSeg.bonusPct : 1)) / 60;
        slStep = Math.min(slStep, slRemain);
        dep += slStep; p.accumShortLifeDep += slStep;
      }
      for (var ci = 0; ci < p.capitalImprovements.length; ci++) {
        dep += p.capitalImprovements[ci].amount / (M.depreciationYears || 27.5) / 12;
      }
      p.accumDepreciation += dep;

      /* component replacements */
      for (var k = 0; k < p.components.length; k++) {
        var comp = p.components[k];
        if (!comp.enabled) continue;
        if (mi === comp.dueAt && mi > p.purchaseMonthIndex) {
          var infl = Math.pow(1 + M.expenseInflation, mi / 12);
          var cost = comp.cost * infl;
          agg.capexSpent += cost;
          var fromPool = Math.min(state.capexPool, cost);
          state.capexPool -= fromPool;
          state.cash -= (cost - fromPool);
          p.capitalImprovements.push({ month: mi, amount: cost });
          p.currentValue += cost * (M.capexValueCapture || 0.5);
          comp.dueAt = mi + comp.lifeMonths;
          events.push({ type: 'capex', text: p.nickname + ': ' + comp.name + ' replaced — ' + fmtMoney(cost) + (fromPool < cost ? ' (reserve short by ' + fmtMoney(cost - fromPool) + ')' : ' from reserve') });
        }
      }

      /* one-off scheduled capex events */
      for (var e3 = 0; e3 < evList.length; e3++) {
        var ce = evList[e3];
        if (!ce.enabled || ce.type !== 'capex') continue;
        if (ce.propertySeq && ce.propertySeq !== p.seq) continue;
        if (!ce.propertySeq && pi !== 0) continue;
        if (monthsBetween(start, parseMonth(ce.month)) === mi) {
          var c2 = ce.amount || 0;
          agg.capexSpent += c2;
          var fp2 = Math.min(state.capexPool, c2);
          state.capexPool -= fp2;
          state.cash -= (c2 - fp2);
          p.capitalImprovements.push({ month: mi, amount: c2 });
          events.push({ type: 'capex', text: p.nickname + ': ' + (ce.label || 'major repair') + ' — ' + fmtMoney(c2) });
        }
      }

      var cf = noi - ls.total;
      p.cumCashFlow += cf;
      p.lastCashFlow = cf;

      /* Taxable income for THIS property this month, split by character. The
         CapEx accrual is a reserve, not a deduction, so it is excluded; the
         actual replacement is capitalized and depreciated instead. */
      var pTaxable = egi - (taxM + insM + p.hoaMonthly + utilM + mgmt + leasing + maint)
                     - ls.interest - dep - ls.mip;
      if (econ.isNonPassive) { agg.taxableNonPassive += pTaxable; p.nonPassive = true; }
      else { agg.taxablePassive += pTaxable; p.nonPassive = false; }

      agg.grossRent += gross; agg.vacancyLoss += vacLoss; agg.egi += egi;
      agg.tax += taxM; agg.insurance += insM; agg.hoa += p.hoaMonthly; agg.utilities += utilM;
      agg.mgmt += mgmt; agg.leasing += leasing; agg.maint += maint;
      agg.capexAccrual += capexAccrual; agg.noi += noi;
      agg.interest += ls.interest; agg.principal += ls.principal; agg.mip += ls.mip;
      agg.debtService += ls.total; agg.cashFlow += cf;
      agg.value += p.currentValue; agg.debt += p.loan.balance;
      agg.units += p.units; agg.depreciation += dep;
      agg.pitiTotal += loanPITI(p.loan, taxM, insM);
    }

    agg.equity = agg.value - agg.debt;
    state.capexPool += agg.capexAccrual;
    state.cash += agg.cashFlow;

    /* ---- 3b. strategies ---- */
    state.helocLimit = helocLimitNow();
    /* HELOC interest, charged monthly and interest-only while drawn */
    if (state.helocBalance > 0.01) {
      var hi = state.helocBalance * ((ST.heloc && ST.heloc.rate) || 0.095) / 12;
      state.cash -= hi;
      state.helocInterestPaid += hi;
      agg.cashFlow -= hi;
    }
    /* cash-out refinances */
    for (var rfi = 0; rfi < state.properties.length; rfi++) {
      var proceeds = tryRefinance(state.properties[rfi], date, mi, events);
      if (proceeds > 0) state.cash += proceeds;
    }
    /* rate-and-term refinances — no cash out, just a cheaper rate */
    for (var rri = 0; rri < state.properties.length; rri++) {
      tryRateRefi(state.properties[rri], date, mi, events);
    }
    /* 1031 exchange */
    tryExchange(date, mi, events, agg.cashFlow);

    /* ---- 4. management trigger ---- */
    if (!state.managementActive && R.management.trigger !== 'never' && R.management.trigger !== 'always') {
      var fire = false;
      if (R.management.trigger === 'units') fire = agg.units >= R.management.threshold;
      else if (R.management.trigger === 'properties') fire = state.properties.length >= R.management.threshold;
      else if (R.management.trigger === 'profit') fire = agg.cashFlow >= R.management.threshold;
      if (fire) {
        state.managementActive = true;
        events.push({ type: 'management', text: 'Property management hired — ' + (R.management.feePct * 100).toFixed(0) + '% of collected rent across the whole portfolio' });
        milestones.push({ monthIndex: mi, date: { y: date.y, m: date.m }, kind: 'management', text: 'Hired property management' });
      }
    }

    /* ---- 5. taxes (assessed each December) ---- */
    yearAccum.egi += agg.egi; yearAccum.grossRent += agg.grossRent;
    yearAccum.vacancyLoss += agg.vacancyLoss;
    yearAccum.opex += (agg.tax + agg.insurance + agg.hoa + agg.utilities + agg.mgmt + agg.leasing + agg.maint);
    yearAccum.interest += agg.interest; yearAccum.principal += agg.principal;
    yearAccum.depreciation += agg.depreciation; yearAccum.noi += agg.noi;
    yearAccum.cashFlow += agg.cashFlow; yearAccum.capexSpent += agg.capexSpent;
    yearAccum.contributions += contrib; yearAccum.mip += agg.mip;
    yearAccum.taxablePassive += agg.taxablePassive;
    yearAccum.taxableNonPassive += agg.taxableNonPassive;

    var taxThisMonth = 0;

    /* ---- 6. owner draw ---- */
    var draw = 0;
    if (state.properties.length > 0) {
      if (R.profitMode === 'fixedDraw') draw = R.drawAmount || 0;
      else if (R.profitMode === 'drawAfterThreshold' && agg.cashFlow >= (R.drawThreshold || 0)) draw = R.drawAmount || 0;
    }
    if (draw > 0) { state.cash -= draw; state.cumulativeDraw += draw; }

    /* pay the HELOC down from surplus before it compounds against you */
    if (state.helocBalance > 0.01 && ST.heloc && ST.heloc.enabled && ST.heloc.repayFromSurplus) {
      var spare = state.cash - emergencyFundRequired() - lenderReserveRequired(0);
      if (spare > 0) {
        var pay = Math.min(state.helocBalance, spare * (ST.heloc.repayPct || 0.5));
        state.helocBalance -= pay; state.cash -= pay;
        if (state.helocBalance < 0.01) {
          state.helocBalance = 0;
          events.push({ type: 'heloc', text: 'HELOC paid back to zero' });
        }
      }
    }

    /* ---- 6b. debt paydown, when it is set to outrank buying ---- */
    var paidDown = runPaydown(date, mi, events, 'before');

    /* ---- 6c. opportunity fund: hold dry powder back from the buy test ----
       Money set aside here is invisible to the acquisition test until the
       trigger fires. The point is not the return on the cash — it is being
       liquid in the month everyone else is not. */
    var OF = ST.opportunityFund || {};
    var fundReserved = 0;
    if (OF.enabled) {
      var armedNow = false;
      if (OF.deployOn === 'always') armedNow = true;
      else if (OF.deployOn === 'recession') armedNow = !!rec;
      else if (OF.deployOn === 'discount') armedNow = !!rec;   // price discount only appears in a downturn
      if (!armedNow && (OF.releaseAfterMonths || 0) > 0 && mi >= OF.releaseAfterMonths) armedNow = true;
      state.opportunityArmed = armedNow;

      if (!armedNow && state.opportunityFund < (OF.targetDollars || 0)) {
        var freeCash = state.cash - emergencyFundRequired() - lenderReserveRequired(0) - state.opportunityFund;
        if (freeCash > 0) {
          var add = Math.min(freeCash * (OF.fillPct || 0.3),
                             (OF.targetDollars || 0) - state.opportunityFund);
          state.opportunityFund += add;
        }
      }
      if (armedNow && state.opportunityFund > 0) {
        state.opportunityDeployed += state.opportunityFund;
        events.push({ type: 'opportunity', text: 'Opportunity fund released — ' +
          fmtMoney(state.opportunityFund) + ' of dry powder is now available to deploy' +
          (rec ? ' into a down market.' : '.') });
        state.opportunityFund = 0;
      }
      fundReserved = state.opportunityFund;
    }

    /* ---- 7. acquisition attempt ---- */
    var efReq = emergencyFundRequired();
    var acquisitionThisMonth = null;
    var blocked = null;

    var goalHit = false;
    if (R.stopWhenGoalMet) {
      if (R.goalMonthlyProfit > 0 && agg.cashFlow >= R.goalMonthlyProfit) goalHit = true;
      if (R.goalEquity > 0 && agg.equity >= R.goalEquity) goalHit = true;
    }
    if (goalHit) state.stopBuying = true;

    var CC = ST.counterCyclical || {};
    var pausedByCycle = CC.enabled && CC.pauseInRecession && !!rec;

    /* Deal flow. There are only so many of these buildings, and you are not
       going to win most of them. Without this gate a fully stacked strategy
       run buys a dozen properties in a single year, which is not a plan — it
       is the model running out of the market. */
    var DF = R.dealFlow || {};
    var dealFlowBlocked = false;
    if (DF.enabled) {
      var boughtThisYear = 0;
      for (var ay = 0; ay < acquisitions.length; ay++) {
        if (acquisitions[ay].date.y === date.y) boughtThisYear++;
      }
      var lastBuy = acquisitions.length ? acquisitions[acquisitions.length - 1].monthIndex : -999;
      if (boughtThisYear >= (DF.maxPerYear || 99)) dealFlowBlocked = true;
      if (mi - lastBuy < (DF.minMonthsBetween || 0)) dealFlowBlocked = true;
    }

    if (!state.stopBuying && !pausedByCycle && !dealFlowBlocked && mi < horizonMonths &&
        !(paydownActive(date, mi) && (ST.paydown || {}).allocation === 'pauseAcquisitions')) {
      var types = allowedTypes(state.properties.length + 1, agg.units, agg.cashFlow);
      var cands = candidatesFor(types, date, mi);
      var best = null, bestScore = -Infinity, bestFail = null;
      /* Cash the acquisition test is allowed to see. Anything sitting in the
         opportunity fund is deliberately hidden until its trigger fires. */
      var usableCash = state.cash - fundReserved;
      /* Sellers cut prices in a downturn; that is the whole counter-cyclical case. */
      var cycleDiscount = (CC.enabled && rec) ? (CC.recessionPriceDiscount || 0) : 0;
      var dscrFloor = R.minDSCR - ((CC.enabled && rec) ? (CC.relaxDSCRInRecession || 0) : 0);
      var G = R.guardrails || {}, HU = R.hurdle || {};

      for (var ci2 = 0; ci2 < cands.length; ci2++) {
        if (cycleDiscount > 0) cands[ci2].price *= (1 - cycleDiscount);
        var fops = financingOptionsFor(cands[ci2]);
        for (var fo = 0; fo < fops.length; fo++) {
        var uw = underwrite(cands[ci2], date, mi, state.properties.length === 0, fops[fo]);
        var reserveAfter = lenderReserveRequired(uw.pitiMonthly);
        var need = uw.cashNeeded + efReq + reserveAfter;
        var fails = [];
        if (usableCash < need) fails.push({ reason: 'cash', shortfall: need - usableCash });
        if (!uw.ownerOcc && uw.product !== 'seller' && uw.dscr < dscrFloor)
          fails.push({ reason: 'dscr', value: uw.dscr });
        if (R.requirePositiveCashFlow && uw.cashFlowMonthly < 0) fails.push({ reason: 'negativeCashFlow', value: uw.cashFlowMonthly });

        /* ---- PORTFOLIO GUARDRAILS ----------------------------------------
           Applied to the whole portfolio AFTER this purchase, not to the deal
           on its own. Every property in a failing portfolio passed its own
           underwriting on the day it was bought. */
        if (G.enabled) {
          var cfAfter = agg.cashFlow + uw.cashFlowMonthly;
          if (cfAfter < (G.minMonthlyCashFlow != null ? G.minMonthlyCashFlow : -Infinity))
            fails.push({ reason: 'guardCashFlow', value: cfAfter });
          var noiAfter = agg.noi + uw.noiMonthly + agg.capexAccrual;   // add reserve back
          var dsAfter = agg.debtService + uw.debtMonthly;
          var portDSCR = dsAfter > 0 ? noiAfter / dsAfter : 99;
          if (portDSCR < (G.minPortfolioDSCR != null ? G.minPortfolioDSCR : 0))
            fails.push({ reason: 'guardDSCR', value: portDSCR });
          var valAfter = agg.value + uw.cand.price, debtAfter = agg.debt + uw.loanAmount;
          var ltvAfter = valAfter > 0 ? debtAfter / valAfter : 0;
          if (ltvAfter > (G.maxPortfolioLTV != null ? G.maxPortfolioLTV : 1))
            fails.push({ reason: 'guardLTV', value: ltvAfter });
          var cashAfter = usableCash - uw.cashNeeded;
          var monthsAfter = (S.personalMonthlyExpenses || 0) > 0
            ? cashAfter / S.personalMonthlyExpenses : 99;
          if (monthsAfter < (G.minMonthsExpensesInCash || 0))
            fails.push({ reason: 'guardCash', value: monthsAfter });
        }

        /* ---- DEAL HURDLE — a quality bar of your own, above what a bank
           will allow. A lender's minimum is not an investment thesis. ---- */
        if (HU.enabled && !(HU.ignoreWhileOwnerOccupying && uw.ownerOcc)) {
          if (uw.coc < (HU.minCoC != null ? HU.minCoC : -Infinity))
            fails.push({ reason: 'hurdleCoC', value: uw.coc });
          if (uw.capRate < (HU.minCapRate != null ? HU.minCapRate : -Infinity))
            fails.push({ reason: 'hurdleCap', value: uw.capRate });
          if (uw.cashFlowMonthly / Math.max(1, uw.cand.units) <
              (HU.minCashFlowPerUnit != null ? HU.minCashFlowPerUnit : -Infinity))
            fails.push({ reason: 'hurdleCFU', value: uw.cashFlowMonthly / Math.max(1, uw.cand.units) });
        }

        /* a HELOC draw can bridge a cash shortfall */
        if (fails.length === 1 && fails[0].reason === 'cash' &&
            ST.heloc && ST.heloc.enabled && helocAvailable() >= fails[0].shortfall &&
            fails[0].shortfall >= (ST.heloc.minDraw || 0)) {
          uw.helocDraw = fails[0].shortfall;
          fails = [];
        }
        if (fails.length === 0) {
          var sc = scoreDeal(uw);
          /* Seller financing usually needs less cash; prefer it on a tie. */
          if (uw.product === 'seller' && (ST.sellerFinance || {}).preferOverBank) sc *= 1.0001;
          if (sc > bestScore) { bestScore = sc; best = uw; }
        } else {
          var candFail = { uw: uw, fails: fails, need: need, reserveAfter: reserveAfter };
          if (!bestFail || (fails[0].reason === 'cash' && bestFail.fails[0].reason === 'cash' && fails[0].shortfall < bestFail.fails[0].shortfall)) {
            bestFail = candFail;
          } else if (!bestFail) bestFail = candFail;
        }
        }
      }

      if (best) {
        if (best.helocDraw > 0) {
          state.cash += best.helocDraw;
          state.helocBalance += best.helocDraw;
          state.helocDrawn += best.helocDraw;
          events.push({ type: 'heloc', text: 'Drew ' + fmtMoney(best.helocDraw) +
            ' on the HELOC to close — line balance now ' + fmtMoney(state.helocBalance) });
        }
        acquisitionThisMonth = purchase(best, date, mi);
        if (best.product === 'seller') state.sellerFinancedCount++;
        if (best.product === 'assumed') state.assumedCount++;
        if (best.furnishing > 0) {
          state.furnishingSpend += best.furnishing;
          events.push({ type: 'furnish', text: best.cand.nickname + ': furnished for ' +
            (cfg.rentalOps[best.mode] || {}).label + ' at ' + fmtMoney(best.furnishing) +
            ' — cash out the door before the first booking.' });
        }
        if (state.pendingBonus > 0) {
          /* the year-one bonus deduction belongs to the acquisition month and
             to the acquisition tax year, not the month after. Its CHARACTER
             follows the property: a sub-7-day short-term rental with material
             participation puts it in the non-passive bucket, which is what
             makes cost segregation worth anything without REPS. */
          agg.depreciation += state.pendingBonus;
          yearAccum.depreciation += state.pendingBonus;
          var bonusNonPassive = (best.modeEcon && best.modeEcon.isNonPassive);
          if (bonusNonPassive) yearAccum.taxableNonPassive -= state.pendingBonus;
          else yearAccum.taxablePassive -= state.pendingBonus;
          state.pendingBonus = 0;
        }
        /* You own it from this month even though it produces no rent until next
           month — so the row's position must include it, or the timeline reports
           owning a property with zero units. */
        var np = acquisitionThisMonth.property;
        agg.units += np.units;
        agg.value += np.currentValue;
        agg.debt  += np.loan.balance;
        agg.equity = agg.value - agg.debt;
        agg.pitiTotal += loanPITI(np.loan, np.annualTax / 12, np.annualInsurance / 12);
        events.push({ type: 'acquisition', text: 'Acquired ' + best.cand.nickname + ' — ' + fmtMoney(best.cand.price) + ', ' + best.cand.units + ' units' });
        milestones.push({ monthIndex: mi, date: { y: date.y, m: date.m }, kind: 'acquisition',
                          text: 'Property #' + acquisitionThisMonth.seq + ': ' + best.cand.nickname });
      } else if (bestFail) {
        blocked = {
          nickname: bestFail.uw.cand.nickname,
          price: bestFail.uw.cand.price,
          units: bestFail.uw.cand.units,
          reason: bestFail.fails[0].reason,
          shortfall: bestFail.fails[0].shortfall || 0,
          value: bestFail.fails[0].value,
          allReasons: bestFail.fails.map(function (f) { return f.reason; }),
          financing: bestFail.uw.financing,
          dscr: bestFail.uw.dscr,
          cashNeeded: bestFail.uw.cashNeeded,
          reserveRequired: bestFail.reserveAfter,
          emergencyFund: efReq,
          totalNeeded: bestFail.need
        };
      }
    }

    /* ---- 7b. taxes, after the acquisition so a December buy counts ---- */
    if (date.m === 11 && state.properties.length > 0 && S.modelTaxes !== false) {
      var combinedRate = (S.federalMarginalRate || 0.22) + (S.stateMarginalRate || 0.0195);
      var isREPS = (S.repsFromYear != null && date.y >= S.repsFromYear);

      /* Two buckets, because they are two different regimes:
           passiveBucket    — long-term, mid-term and by-the-room rentals, all
                              rental activities under Reg. 1.469-1T(e)(3).
           nonPassiveBucket — short-term rentals averaging seven days or less
                              of customer use with material participation. Not
                              rental activities at all, so REPS is irrelevant
                              to them. Reg. 1.469-1T(e)(3)(ii)(A). */
      var passiveBucket = yearAccum.taxablePassive - state.costSegSpend;
      var nonPassiveBucket = yearAccum.taxableNonPassive - state.costSegSpendNonPassive;
      state.costSegSpend = 0; state.costSegSpendNonPassive = 0;

      var ordinaryOffset = 0;      // loss allowed against W-2 and other income
      var taxableOrdinary = 0;     // income taxed at the margin

      /* --- the sub-7-day bucket needs no REPS and no allowance --- */
      if (nonPassiveBucket < 0) {
        ordinaryOffset += -nonPassiveBucket;
        state.nonPassiveLossUsed += -nonPassiveBucket;
      } else {
        /* Note the asymmetry: because this income is NON-passive, it cannot
           absorb suspended passive losses. A profitable materially-participated
           STR therefore produces ordinary income you cannot shelter with the
           losses the rest of the portfolio has been stacking up. */
        taxableOrdinary += nonPassiveBucket;
      }

      /* --- the rental bucket --- */
      if (passiveBucket >= 0) {
        /* Old suspended losses offset income FROM THIS ACTIVITY. Under section
           469(f)(1) that is true whether or not you later qualify for REPS. */
        var offset = Math.min(state.passiveLossCarry, passiveBucket);
        state.passiveLossCarry -= offset;
        taxableOrdinary += (passiveBucket - offset);
      } else {
        var loss = -passiveBucket, usable;
        if (isREPS) {
          usable = loss;                  // non-passive; the 461(l) cap is applied below
        } else {
          /* Passive: the $25K allowance, phased out 50c per dollar of MAGI over
             $100K and gone at $150K. Never indexed since 1986, so never inflated. */
          var magi = (S.annualW2Income || 0);
          var allowance = 25000;
          if (magi > 100000) allowance = Math.max(0, 25000 - (magi - 100000) * 0.5);
          usable = Math.min(loss, allowance);
          state.passiveLossCarry += (loss - usable);
        }
        ordinaryOffset += usable;
      }

      /* Section 461(l) caps the TOTAL business loss that can offset non-business
         income. It binds AFTER the passive rules, so it applies to the combined
         figure, not to either bucket alone. Excess becomes an NOL. */
      var netAgainstOrdinary = ordinaryOffset - taxableOrdinary;
      if (netAgainstOrdinary > 0) {
        var cap = S.excessBusinessLossCap || 256000;
        if (netAgainstOrdinary > cap) {
          state.nolCarry += (netAgainstOrdinary - cap);
          netAgainstOrdinary = cap;
        }
        taxThisMonth = -netAgainstOrdinary * combinedRate;
      } else {
        var net = -netAgainstOrdinary;
        /* an NOL from a prior year offsets up to 80% of what is left */
        if (state.nolCarry > 0) {
          var nolUse = Math.min(state.nolCarry, net * 0.8);
          state.nolCarry -= nolUse; net -= nolUse;
        }
        taxThisMonth = net * combinedRate;
      }
      if (occProp && M.primaryResidenceCredit) taxThisMonth -= M.primaryResidenceCredit;
      state.cash -= taxThisMonth;
      state.cumulativeTax += taxThisMonth;
      yearAccum.tax = taxThisMonth;
      if (isREPS && !state.repsAnnounced) {
        state.repsAnnounced = true;
        events.push({ type: 'reps', text: 'Real Estate Professional Status takes effect — ' +
          'rental losses now offset ordinary income, capped at ' +
          fmtMoney(S.excessBusinessLossCap || 256000) + '. Losses suspended before this year ' +
          'stay suspended; they do not release against your W-2.' });
      }
    }


    /* ---- 7c. debt paydown, when buying gets first claim on the cash ---- */
    if (!acquisitionThisMonth) paidDown += runPaydown(date, mi, events, 'after');

    /* ---- 8. milestones ---- */
    if (S.personalMonthlyExpenses > 0 && agg.cashFlow >= S.personalMonthlyExpenses &&
        !milestones.some(function (x) { return x.kind === 'freedom'; })) {
      milestones.push({ monthIndex: mi, date: { y: date.y, m: date.m }, kind: 'freedom',
                        text: 'Portfolio cash flow covers your living expenses' });
    }
    if (R.goalMonthlyProfit > 0 && agg.cashFlow >= R.goalMonthlyProfit &&
        !milestones.some(function (x) { return x.kind === 'profitGoal'; })) {
      milestones.push({ monthIndex: mi, date: { y: date.y, m: date.m }, kind: 'profitGoal',
                        text: 'Hit your monthly profit goal of ' + fmtMoney(R.goalMonthlyProfit) });
    }
    if (R.goalEquity > 0 && agg.equity >= R.goalEquity &&
        !milestones.some(function (x) { return x.kind === 'equityGoal'; })) {
      milestones.push({ monthIndex: mi, date: { y: date.y, m: date.m }, kind: 'equityGoal',
                        text: 'Hit your equity goal of ' + fmtMoney(R.goalEquity) });
    }
    if (state.cash < 0 && !milestones.some(function (x) { return x.kind === 'shortfall'; })) {
      milestones.push({ monthIndex: mi, date: { y: date.y, m: date.m }, kind: 'shortfall',
                        text: 'Cash went negative — the plan breaks here' });
    }

    /* ---- 9. record the row ---- */
    var efR = efReq;
    var lenderR = lenderReserveRequired(0);
    rows.push({
      i: mi, date: { y: date.y, m: date.m }, label: fmtMonth(date), iso: isoMonth(date),
      contribution: contrib, housingCredit: housingCredit,
      cashStart: cashStart, cash: state.cash,
      capexPool: state.capexPool,
      emergencyFund: efR, lenderReserve: lenderR,
      deployable: Math.max(0, state.cash - efR - lenderR - state.opportunityFund),
      properties: state.properties.length, units: agg.units,
      grossRent: agg.grossRent, vacancyLoss: agg.vacancyLoss, egi: agg.egi,
      opTax: agg.tax, opInsurance: agg.insurance, opHoa: agg.hoa, opUtilities: agg.utilities,
      opMgmt: agg.mgmt + agg.leasing,
      opMaint: agg.maint, opCapex: agg.capexAccrual,
      noi: agg.noi, interest: agg.interest, principal: agg.principal, mip: agg.mip,
      debtService: agg.debtService, cashFlow: agg.cashFlow,
      capexSpent: agg.capexSpent, depreciation: agg.depreciation,
      taxPaid: taxThisMonth, draw: draw,
      value: agg.value, debt: agg.debt, equity: agg.equity,
      netWorth: agg.equity + state.cash + state.capexPool - state.helocBalance,
      recession: !!rec,
      managementActive: state.managementActive,
      helocBalance: state.helocBalance, helocLimit: state.helocLimit,
      helocAvailable: Math.max(0, state.helocLimit - state.helocBalance),
      passiveLossCarry: state.passiveLossCarry, nolCarry: state.nolCarry,
      exchanges: state.exchangeCount, refiProceeds: state.refiProceeds,
      ownerOccDone: state.ownerOccDone,
      /* debt paydown + opportunism + income levers */
      extraPrincipal: paidDown,
      extraPrincipalTotal: state.extraPrincipalTotal,
      freeAndClearCount: state.freeAndClearCount,
      recastRelief: state.recastReliefTotal,
      opportunityFund: state.opportunityFund,
      opportunityArmed: state.opportunityArmed,
      rateRefiSavings: state.rateRefiSavings,
      taxablePassive: agg.taxablePassive, taxableNonPassive: agg.taxableNonPassive,
      sellerFinancedCount: state.sellerFinancedCount, assumedCount: state.assumedCount,
      lodgingTaxPaid: state.lodgingTaxPaid,
      paydownActive: paydownActive(date, mi),
      pausedByCycle: pausedByCycle, dealFlowBlocked: dealFlowBlocked,
      events: events,
      acquisition: acquisitionThisMonth,
      blocked: blocked
    });

    if (date.m === 11) yearAccum = newYearAccum();
  }

  /* ---------------------------------------------------------- yearly rollup */
  var years = [];
  var byYear = {};
  rows.forEach(function (r) {
    var y = r.date.y;
    if (!byYear[y]) byYear[y] = { year: y, rows: [] };
    byYear[y].rows.push(r);
  });
  Object.keys(byYear).sort().forEach(function (y) {
    var rs = byYear[y].rows, last = rs[rs.length - 1];
    var sum = function (k) { return rs.reduce(function (a, r) { return a + (r[k] || 0); }, 0); };
    years.push({
      year: parseInt(y, 10),
      grossRent: sum('grossRent'), egi: sum('egi'), noi: sum('noi'),
      debtService: sum('debtService'), cashFlow: sum('cashFlow'),
      interest: sum('interest'), principal: sum('principal'),
      capexSpent: sum('capexSpent'), taxPaid: sum('taxPaid'),
      contributions: sum('contribution'), draw: sum('draw'),
      depreciation: sum('depreciation'),
      acquisitions: rs.filter(function (r) { return r.acquisition; }).length,
      endProperties: last.properties, endUnits: last.units,
      endCash: last.cash, endEquity: last.equity, endValue: last.value,
      endDebt: last.debt, endNetWorth: last.netWorth,
      endMonthlyCashFlow: last.cashFlow
    });
  });

  /* ------------------------------------------------------- forward projection
     With acquisition paused at the horizon: how do the existing loans amortize? */
  var last = rows[rows.length - 1];
  var projection = projectForward(state, cfg, last);

  return {
    rows: rows, years: years, acquisitions: acquisitions, milestones: milestones,
    properties: state.properties, projection: projection, warnings: warnings,
    summary: {
      finalProperties: last.properties, finalUnits: last.units,
      finalMonthlyCashFlow: last.cashFlow, finalAnnualCashFlow: last.cashFlow * 12,
      finalEquity: last.equity, finalValue: last.value, finalDebt: last.debt,
      finalCash: last.cash, finalNetWorth: last.netWorth,
      totalContributed: state.totalContributed + cfg.setup.startingCapital,
      totalTax: state.cumulativeTax, totalDrawn: state.cumulativeDraw,
      totalRefiProceeds: state.refiProceeds, exchanges: state.exchangeCount,
      helocBalance: state.helocBalance, helocInterestPaid: state.helocInterestPaid,
      suspendedLosses: state.passiveLossCarry, nolCarry: state.nolCarry,
      ownerOccupancies: state.ownerOccDone, deferredGain: state.deferredGainTotal,
      freedomDate: (milestones.filter(function (m) { return m.kind === 'freedom'; })[0] || null),
      firstAcquisition: acquisitions[0] || null,
      brokeAt: (milestones.filter(function (m) { return m.kind === 'shortfall'; })[0] || null)
    }
  };
}

/* ------------------------------------------------- post-horizon projection */
function projectForward(state, cfg, lastRow) {
  var props = state.properties.map(function (p) {
    return { balance: p.loan.balance, payment: p.loan.payment, rate: p.loan.rate,
             value: p.currentValue, cashFlow: 0 };
  });
  if (!props.length) return { payoffYears: null, valueIn10: 0, valueIn20: 0, cashFlowAfterPayoff: 0 };
  var months = 0, maxMonths = 12 * 40;
  var anyDebt = true;
  while (anyDebt && months < maxMonths) {
    anyDebt = false;
    for (var i = 0; i < props.length; i++) {
      var pr = props[i];
      if (pr.balance > 0.005) {
        var int = pr.balance * pr.rate / 12;
        var prin = Math.min(pr.payment - int, pr.balance);
        pr.balance -= prin;
        if (pr.balance > 0.005) anyDebt = true;
      }
    }
    months++;
  }
  var appr = cfg.market.appreciation;
  var v = lastRow.value;
  var debtServiceFreed = state.properties.reduce(function (a, p) { return a + (p.loan.balance > 0 ? p.loan.payment : 0); }, 0);
  return {
    payoffYears: months / 12,
    payoffDate: null,
    valueIn10: v * Math.pow(1 + appr, 10),
    valueIn20: v * Math.pow(1 + appr, 20),
    cashFlowAfterPayoff: lastRow.cashFlow + debtServiceFreed,
    rentIn10: lastRow.grossRent * Math.pow(1 + cfg.market.rentGrowth, 10)
  };
}

/* ------------------------------------------------------------- sweep helper */
function runSweep(cfg, spec) {
  // spec: { path: 'setup.contributions[0].monthly', from, to, step, label }
  var out = [];
  for (var v = spec.from; v <= spec.to + 1e-9; v += spec.step) {
    var clone = JSON.parse(JSON.stringify(cfg));
    setByPath(clone, spec.path, v);
    var res = runSimulation(clone);
    var acqDates = res.acquisitions.slice(0, 6).map(function (a) { return a.label; });
    out.push({
      value: v,
      properties: res.summary.finalProperties,
      units: res.summary.finalUnits,
      monthlyCashFlow: res.summary.finalMonthlyCashFlow,
      equity: res.summary.finalEquity,
      netWorth: res.summary.finalNetWorth,
      firstAcq: res.acquisitions[0] ? res.acquisitions[0].label : null,
      acqDates: acqDates,
      freedom: res.summary.freedomDate ? res.summary.freedomDate.date : null
    });
  }
  return out;
}
function setByPath(obj, path, value) {
  var parts = path.replace(/\[(\d+)\]/g, '.$1').split('.');
  var cur = obj;
  for (var i = 0; i < parts.length - 1; i++) cur = cur[parts[i]];
  cur[parts[parts.length - 1]] = value;
}

/* ------------------------------------------------------------------ format */
function fmtMoney(n) {
  if (n == null || isNaN(n)) return '—';
  var neg = n < 0; n = Math.abs(n);
  var s;
  if (n >= 1000000) s = '$' + (n / 1000000).toFixed(n >= 10000000 ? 1 : 2) + 'M';
  else if (n >= 10000) s = '$' + Math.round(n / 1000) + 'K';
  else s = '$' + Math.round(n).toLocaleString();
  return (neg ? '-' : '') + s;
}
function fmtDollars(n) {
  if (n == null || isNaN(n)) return '—';
  return (n < 0 ? '-' : '') + '$' + Math.round(Math.abs(n)).toLocaleString();
}
function fmtPct(n, d) { return (n * 100).toFixed(d == null ? 1 : d) + '%'; }

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { runSimulation: runSimulation, runSweep: runSweep, pmt: pmt,
                     parseMonth: parseMonth, addMonths: addMonths, fmtMonth: fmtMonth,
                     defaultComponents: defaultComponents, monthsBetween: monthsBetween,
                     fmtMoney: fmtMoney, fmtDollars: fmtDollars, fmtPct: fmtPct,
                     makeLoan: makeLoan, loanStep: loanStep, recastLoan: recastLoan,
                     loanRemainingYears: loanRemainingYears, idBucket: idBucket,
                     rentalModeEconomics: rentalModeEconomics };
}

