/* ============================================================================
   OPERATIONS — what a building earns and costs, unit by unit.

   Rents reach market through leases, not by assumption. At each lease end a
   tenant renews (at your renewal policy, capped at market) or leaves; leaving
   costs downtime (longer in winter), a turn, optionally a refresh, and the
   unit re-lets at market for its condition — or to a voucher holder, at the
   lower of the payment standard (less the utility allowance) and what rent
   reasonableness allows.

   Two modes, one code path:
     base run   (no rng) — EXPECTED values: a unit's rent, refreshed share and
                voucher share are probability-weighted; downtime is spread
                over the lease term. Smooth and exactly reproducible.
     simulated  (rng)    — actual stay/leave events per unit, drawn from keyed
                random numbers, so two plans see the same tenant luck.
   ========================================================================== */
(function (FPE) {
  'use strict';
  var U = FPE.util, D = FPE.data;

  var COMPONENTS = [
    { name: 'Roof', life: 25, cost: function (u) { return 9000 + 2600 * u; } },
    { name: 'Furnace / HVAC', life: 20, cost: function (u) { return 5200 * Math.max(1, Math.ceil(u / 2)); }, heat: true },
    { name: 'Water heaters', life: 12, cost: function (u) { return 1500 * u; } },
    { name: 'Driveway / lot', life: 30, cost: function (u) { return 6000 + 900 * u; } },
    { name: 'Windows', life: 30, cost: function (u) { return 1400 * u; } },
    { name: 'Exterior paint / siding', life: 20, cost: function (u) { return 4000 + 1500 * u; } }
  ];
  function defaultComponents(units) {
    return COMPONENTS.map(function (c) {
      return { name: c.name, lifeYears: c.life, ageYears: Math.floor(c.life / 2), cost: Math.round(c.cost(units)), enabled: true, heat: !!c.heat };
    });
  }

  function maintenancePct(cfg, yearBuilt) {
    var O = cfg.ops.maintenance;
    if (!O.enabled) return 0;
    if (O.method === 'flat') return O.flatPct;
    var y = yearBuilt || 1970;
    if (y < 1940) return O.pre1940;
    if (y < 1970) return O.y1940;
    if (y < 1990) return O.y1970;
    return O.y1990;
  }

  /* cost entered in today's dollars (plan start) → dollars in month t */
  function costNow(env, t) { return env.M.expenseIndex(t) / env.M.expenseIndex(env.start); }
  /* Turnover is drawn tenant by tenant only on a simulated path with turnover
     uncertainty switched on; otherwise it is blended at its expected value. */
  function drawT(env) { return !!(env.rng && env.cfg.mc.sample.turnover); }

  /* ------------------------------------------------------ market for a unit */
  function marketRef(env, u, t) { return u.base * env.M.rentIndex(t); }             // refreshed / survey level
  function marketAsIs(env, u, t) { return marketRef(env, u, t) * env.cfg.ops.asIsFactor; }
  /* what the unit would rent for today, given its (expected) condition and the
     building's utility arrangement */
  function achievable(env, p, u, t) {
    var m = u.refreshed * marketRef(env, u, t) + (1 - u.refreshed) * marketAsIs(env, u, t);
    return Math.max(0, m - rentDrag(env, p, t));
  }
  /* rent tenants refuse to pay because they now carry utilities (RUBS, own heat) */
  function rentDrag(env, p, t) {
    var drag = 0, ST = env.cfg.strategies;
    if (p.rubs.active) drag += p.rubs.recoveryMonthly / p.units * (ST.rubs.enabled ? ST.rubs.resistanceShare : 0.3);
    if (p.heatConverted) drag += p.heatTenantCostPerUnit * ST.heatConversion.rentGiveBack;
    return drag;
  }

  function voucherRent(env, p, u, t) {
    var ST = env.cfg.strategies;
    var psIndex = env.M.rentIndex(t) / env.M.rentIndex(U.mk(2026, 0));
    var ps = D.paymentStandard(u.br) * psIndex;
    var tenantHeat = !p.ownerPaysHeat || p.heatConverted;
    var ua = D.utilityAllowance(u.br, tenantHeat) * costNow(env, t);
    var reasonable = achievable(env, p, u, t) * (1 + ST.hcv.rrPremium);
    return Math.max(0, Math.min(ps - ua, reasonable));
  }

  function leaseEndAfter(env, t) {
    var term = env.cfg.ops.turnover.leaseMonths;
    var end = t + term;
    if (env.cfg.ops.turnover.winterProof) {
      var guard = 0;
      while ([10, 11, 0, 1].indexOf(U.monthOf(end)) >= 0 && guard < 6) { end++; guard++; }
    }
    return end;
  }
  function seasonFactor(env, t) {
    return [10, 11, 0, 1].indexOf(U.monthOf(t)) >= 0 ? env.cfg.ops.turnover.winterFactor : 1;
  }

  /* ============================================================ new building
     cand: a candidate from sourcing (library listing or archetype), priced and
     rented at month t. uw: the underwriting it was bought with.             */
  function newProperty(env, cand, uw, t, seq, ownerOcc) {
    var cfg = env.cfg;
    var units = cand.units;
    var p = {
      id: 'P' + seq, seq: seq, nickname: cand.nickname, origin: cand.origin, sourceId: cand.sourceId,
      units: units, purchaseMonth: t, purchasePrice: cand.price, priceIndexAtPurchase: env.M.priceIndex(t),
      marketValueAtPurchase: cand.marketValue || cand.price,
      improvementsValue: [],
      taxBill: cand.annualTax, taxStated: !!cand.taxStated, specials: cand.specials,
      insurance: cand.annualInsurance, hoa: cand.hoaMonthly || 0,
      utilities: cand.ownerUtilitiesMonthly || 0, ownerPaysHeat: !!cand.ownerPaysHeat,
      heatShare: cand.heatShare || (cand.ownerPaysHeat ? 0.6 : 0), heatConverted: false, heatTenantCostPerUnit: 0,
      rubs: { active: !!cand.rubsInPlace, recoveryMonthly: 0, pending: !!cand.rubsInPlace,
              recoveryPct: cand.rubsRecoveryPct || 0.75 },
      otherIncome: cand.otherMonthlyIncome || 0, otherIncomeIsLaundry: !!cand.otherIncomeIsLaundry,
      ancillaryAdded: 0, ancillaryAt: null, appealDone: false, appealAt: null,
      yearBuilt: cand.yearBuilt || null, maintPct: maintenancePct(cfg, cand.yearBuilt),
      hcvAllowed: cand.hcvAllowed !== false,
      product: uw.product, loan: FPE.lending.loanFromUW(uw, t, cand.marketValue || cand.price, cand),
      ownerOccupied: !!ownerOcc, ownerUnit: 0, ownerFrom: ownerOcc ? t : null, ownerUntil: null,
      basis: null, components: [], unitsArr: [],
      cumCashFlow: 0, cashInvested: uw.cashToClose, lastCF: 0, negativeRun: 0,
      provenance: cand.prov || null, issues: cand.issues || []
    };
    /* ---- units ---- */
    var leaseEnds = cand.leaseEnds || [];
    for (var i = 0; i < units; i++) {
      var br = (cand.unitBedrooms && cand.unitBedrooms[i] != null) ? cand.unitBedrooms[i] : (cand.bedrooms || 2);
      var base = (cand.unitMarketRents && cand.unitMarketRents[i]) ? cand.unitMarketRents[i] / env.M.rentIndex(t)
                                                                   : D.rentByBedroom(br);
      var le = leaseEnds[i] ? U.parseMonth(leaseEnds[i]) : null;
      if (le == null || le <= t) le = t + 1 + Math.floor(((i + 1) * 12) / (units + 1));      // stagger unknown leases
      var vacant = (cand.vacantUnits || []).indexOf(i) >= 0;
      var u = {
        i: i, br: br, base: base, refreshed: cand.condition === 'refreshed' ? 1 : 0,
        rent: vacant ? 0 : (cand.unitRents[i] || 0), leaseEnd: le, occupied: !vacant, vacantUntil: null,
        vacFrac: 0, hcv: 0, mode: 'ltr', owner: false, rampLeft: 0, rampStep: 0,
        needsLease: vacant, convertTo: null
      };
      p.unitsArr.push(u);
    }
    if (ownerOcc) {
      /* live in the unit with the most bedrooms — a lender appraises it as rentable either way */
      var best = 0; p.unitsArr.forEach(function (u2, j) { if (u2.br > p.unitsArr[best].br) best = j; });
      p.ownerUnit = best; p.unitsArr[best].owner = true; p.unitsArr[best].occupied = false; p.unitsArr[best].rent = 0;
    }
    /* ---- old-engine ramp, if chosen ---- */
    if (cfg.ops.rentMethod === 'ramp') {
      p.unitsArr.forEach(function (u3) {
        var target = Math.max(u3.rent, marketRef(env, u3, t));
        u3.rampLeft = cfg.ops.rampMonths; u3.rampStep = (target - u3.rent) / Math.max(1, cfg.ops.rampMonths);
      });
    }
    /* ---- basis ---- */
    var bs = cfg.market.buildingShare;
    var capitalized = cand.price + uw.closing - (uw.points || 0);
    p.basis = { building: capitalized * bs, land: capitalized * (1 - bs), shortLife: 0, carryover: 0, carryoverOriginal: 0, carryoverLeft: 0,
                improvements: [], accBuilding: 0, accShort: 0, accCarry: 0, accImpr: 0,
                pointsLeft: uw.points || 0, pointsTotal: uw.points || 0, pointsMonths: uw.amortYears * 12, deferredGain: 0 };
    /* ---- components ---- */
    var comps = (cand.components && cand.components.length) ? cand.components : defaultComponents(units);
    p.components = comps.map(function (c) {
      var jitter = 0;
      if (env.rng && cfg.mc.sample.capex) {
        var j = cfg.ops.capex.lifeJitterYears || 0;
        jitter = Math.round((U.keyed(env.seed, 'comp', seq, c.name) * 2 - 1) * j * 12);
      }
      var remain = Math.max(1, Math.round((c.lifeYears - c.ageYears) * 12) + jitter);
      return { name: c.name, life: Math.round(c.lifeYears * 12), cost: c.cost, enabled: cfg.ops.capex.components && c.enabled !== false,
               dueAt: t + remain, heat: !!c.heat || /furnace|hvac|boiler/i.test(c.name) };
    });
    /* ---- strategy clocks ---- */
    var ST = cfg.strategies;
    if (ST.ancillary.enabled) p.ancillaryAt = t + ST.ancillary.monthsAfter;
    if (ST.taxAppeal.enabled) p.appealAt = t + 14;
    if (ST.rubs.enabled && p.utilities > 0 && !p.rubs.active) p.rubs.pending = true;
    return p;
  }

  function value(env, p, t) {
    var v = p.marketValueAtPurchase * env.M.priceIndex(t) / p.priceIndexAtPurchase;
    p.improvementsValue.forEach(function (iv) { v += iv.amount * env.M.priceIndex(t) / iv.pi; });
    return v;
  }

  /* =========================================================== annual reset */
  function january(env, p, t) {
    var cfg = env.cfg, M = env.M;
    var growth = M.expenseIndex(t) / M.expenseIndex(t - 12);
    var insG = M.insuranceIndex(t) / M.insuranceIndex(t - 12);
    p.insurance *= insG;
    p.hoa *= growth;
    p.utilities *= growth;
    if (p.heatConverted) p.heatTenantCostPerUnit *= growth;
    if (p.rubs.active) p.rubs.recoveryMonthly *= growth;
    p.specials *= growth;
    /* property tax: annual reappraisal toward value × rate × assessment ratio;
       a stated bill is a floor that grows with value — never cut automatically */
    var rate = p.units >= cfg.market.tax.commercialThreshold ? cfg.market.tax.commercialRate : cfg.market.tax.residentialRate;
    var formula = value(env, p, t) * rate * cfg.market.tax.assessmentRatio;
    var grown = p.taxBill * (M.priceIndex(t) / M.priceIndex(t - 12));
    if (cfg.market.tax.statedIsFloor && p.taxStated) p.taxBill = Math.max(grown, formula);
    else p.taxBill = formula;
    if (p.taxAppealCut) p.taxBill *= (1 - p.taxAppealCut);
  }

  /* ============================================================ one month
     Returns the month's operating result for the building. Debt service,
     depreciation and tax are handled by the simulation. */
  function month(env, p, t) {
    var cfg = env.cfg, M = env.M, O = cfg.ops, ST = cfg.strategies;
    var r = { gpr: 0, collected: 0, vacancyLoss: 0, other: 0, turnCost: 0, leasing: 0, capital: 0,
              capitalItems: [], turnovers: 0, refreshes: 0, events: [], strIncome: 0, modeOpex: 0,
              hcvUnits: 0, rentedUnits: 0, unitsAtMarket: 0 };
    var managed = env.managed;
    var rentMethod = O.rentMethod;
    var useTurnover = rentMethod === 'turnover' || (O.vacancy.enabled && O.vacancy.method === 'turnover');
    var vacOn = O.vacancy.enabled;
    var creditLoss = vacOn ? O.vacancy.creditLoss : 0;
    var mktVac = vacOn ? M.vacancyAdd(t) : 0;
    var cn = costNow(env, t);

    /* ---- owner moves out ---- */
    if (p.ownerOccupied && p.ownerUntil != null && t >= p.ownerUntil) {
      p.ownerOccupied = false;
      var ou = p.unitsArr[p.ownerUnit];
      ou.owner = false;
      r.events.push({ type: 'moveout', text: p.nickname + ': you move out; your unit is re-let' });
      relet(env, p, ou, t, r, true);
    }

    for (var i = 0; i < p.unitsArr.length; i++) {
      var u = p.unitsArr[i];
      if (u.owner) continue;
      /* ---- a unit bought empty gets its first lease ---- */
      if (u.needsLease) { u.needsLease = false; relet(env, p, u, t, r, false); }
      /* ---- switch to furnished / nightly / by-room at the lease end ---- */
      if (u.convertTo && t >= u.leaseEnd) {
        var furnish = cfg.strategies.unitModes.furnishPerUnit * cn;
        r.capital += furnish;
        r.capitalItems.push({ name: 'Furnishing', amount: furnish, depreciable: true, fiveYear: true });
        u.mode = u.convertTo; u.convertTo = null; u.rent = 0; u.occupied = true;
        r.events.push({ type: 'mode', text: p.nickname + ': unit ' + (u.i + 1) + ' converted to ' +
          ({ mtr: 'mid-term furnished', str: 'nightly', room: 'by-the-room' }[u.mode]) + ' — furnished for ' + U.fmtMoney(furnish) });
      }
      /* ---- furnished / nightly / by-room units ---- */
      if (u.mode !== 'ltr') { modeUnit(env, p, u, t, r); continue; }

      /* ---- old-engine ramp ---- */
      if (rentMethod === 'ramp' && u.rampLeft > 0) { u.rent += u.rampStep; u.rampLeft--; }

      /* ---- lease events ---- */
      if (drawT(env) && !u.occupied && u.vacantUntil != null && t >= u.vacantUntil) moveIn(env, p, u, t, r);
      if (u.leaseEnd <= t && (u.occupied || !drawT(env))) {
        if (useTurnover) leaseEnd(env, p, u, t, r);
        else { renewSimple(env, p, u, t); u.leaseEnd = t + O.turnover.leaseMonths; }
      }

      /* ---- rent collected ---- */
      var sched = (drawT(env) && !u.occupied) ? achievable(env, p, u, t) : u.rent;   // an empty unit still has a rent it is losing
      r.gpr += sched;
      var got;
      var flatVac = vacOn && O.vacancy.method === 'flat';
      if (drawT(env)) {
        got = u.occupied ? sched * (1 - creditLoss * (u.hcv ? 0.5 : 1)) : 0;
        if (flatVac) got = sched * (1 - O.vacancy.flatPct) * (1 - creditLoss);   // flat mode re-lets at once
      } else {
        var vf = !vacOn ? 0 : (flatVac || !useTurnover ? O.vacancy.flatPct : u.vacFrac);
        var cl = creditLoss * (1 - u.hcv) + (ST.hcv.enabled ? ST.hcv.creditLoss : creditLoss) * u.hcv;
        got = sched * (1 - vf) * (1 - cl);
      }
      got *= (1 - mktVac);
      r.collected += got;
      r.vacancyLoss += sched - got;
      r.rentedUnits += 1;
      r.hcvUnits += u.hcv;
      if (u.rent >= 0.97 * achievable(env, p, u, t)) r.unitsAtMarket += 1;

      /* ---- evictions: drawn on a simulated path, expected in the base run ---- */
      var evRate = vacOn ? O.vacancy.evictionRate : 0;
      if (evRate > 0) {
        if (drawT(env) && cfg.mc.sample.evictions) {
          if (u.occupied && U.keyed(env.seed, 'evict', p.seq, i, t) < evRate / 12) {
            u.occupied = false; u.vacantUntil = t + 3; u.rent = 0;
            r.turnCost += O.vacancy.evictionCost * cn;
            r.events.push({ type: 'eviction', text: p.nickname + ': eviction — unit empty ~3 months' });
          }
        } else {
          var evLoss = got * evRate / 4;                     // three empty months per eviction
          got -= evLoss; r.collected -= evLoss; r.vacancyLoss += evLoss;
          r.turnCost += O.vacancy.evictionCost * cn * evRate / 12;
        }
      }
    }

    /* ---- other income: listing's own, plus ancillary once it starts ---- */
    if (ST.ancillary.enabled && p.ancillaryAt != null && t >= p.ancillaryAt && !p.ancillaryDone) {
      var per = (p.otherIncomeIsLaundry ? 0 : ST.ancillary.laundry) + ST.ancillary.storage + ST.ancillary.parking + ST.ancillary.pets;
      p.ancillaryAdded = per * (p.units - (p.ownerOccupied ? 1 : 0)) * cn;
      p.ancillaryDone = true;
      r.events.push({ type: 'ancillary', text: p.nickname + ': ancillary income starts — ' + U.fmtDollars(p.ancillaryAdded) + '/mo' });
    }
    var other = (p.otherIncome + (p.ancillaryAdded || 0)) * (M.rentIndex(t) / M.rentIndex(p.purchaseMonth));
    r.other = other * (1 - mktVac);

    /* ---- RUBS starts at the first renewal after closing (or conveys) ---- */
    if (p.rubs.pending && (p.rubs.active || (ST.rubs.enabled && (t - p.purchaseMonth) >= 6))) {
      var rec = ST.rubs.enabled ? ST.rubs.recoveryPct : p.rubs.recoveryPct;   // a conveyed system keeps its own rate
      var billable = p.utilities * (p.heatConverted ? (1 - p.heatShare) : 1);
      p.rubs.recoveryMonthly = billable * rec;
      p.rubs.active = true; p.rubs.pending = false;
      if (ST.rubs.enabled && !p.rubsSetupPaid) { r.capital += ST.rubs.setupPerUnit * p.units * cn; p.rubsSetupPaid = true; }
      r.events.push({ type: 'rubs', text: p.nickname + ': utility billing live — ' + U.fmtDollars(p.rubs.recoveryMonthly) + '/mo recovered' });
    }

    /* ---- operating costs ---- */
    var gross = r.gpr;
    var utilities = p.utilities * (p.heatConverted ? (1 - p.heatShare) : 1) - (p.rubs.active ? p.rubs.recoveryMonthly : 0);
    var taxM = p.taxBill / 12, specialsM = p.specials / 12;
    var prc = 0;
    if (p.ownerOccupied && cfg.tax.prc.enabled && (p.units <= 3 || cfg.tax.prc.fourplex)) prc = Math.min(cfg.tax.prc.amount / 12, taxM);
    var maint = gross * p.maintPct;
    var mgmt = managed ? (r.collected + r.other) * cfg.ops.management.feePct : 0;
    var reserveTarget = cfg.ops.capex.reserveTarget * p.units * cn;
    r.opex = {
      tax: taxM - prc, specials: specialsM, insurance: p.insurance / 12, hoa: p.hoa, utilities: Math.max(0, utilities),
      maintenance: maint, management: mgmt, leasing: r.leasing, turn: r.turnCost, modeOpex: r.modeOpex
    };
    r.opexTotal = U.sum([r.opex.tax, r.opex.specials, r.opex.insurance, r.opex.hoa, r.opex.utilities, r.opex.maintenance,
                         r.opex.management, r.opex.leasing, r.opex.turn, r.opex.modeOpex]);
    r.prc = prc;
    r.noi = r.collected + r.other - r.opexTotal;
    r.reserveTarget = reserveTarget;

    /* ---- big-ticket components ---- */
    for (var k = 0; k < p.components.length; k++) {
      var c = p.components[k];
      if (!c.enabled || t < c.dueAt) continue;
      if (c.heat && p.heatConverted && c.convertedAway) { c.dueAt = t + c.life; continue; }
      if (c.heat && ST.heatConversion.enabled && ST.heatConversion.timing === 'boilerEOL' && p.ownerPaysHeat && !p.heatConverted) {
        convertHeat(env, p, t, r);                       // the conversion replaces the central plant
        c.convertedAway = true; c.dueAt = t + c.life;
        continue;
      }
      var cost = c.cost * (M.expenseIndex(t) / M.expenseIndex(FPE.data.dataMonth));
      if (env.cashRoom != null && cost > env.cashRoom && (c.deferred || 0) < O.capex.deferMonths) {
        c.deferred = (c.deferred || 0) + 1; c.dueAt = t + 1;           // wait a month for the cash
        if (c.deferred === 1) r.events.push({ type: 'defer', text: p.nickname + ': ' + c.name + ' is due but cash is tight — put off' });
        continue;
      }
      if (env.cashRoom != null) env.cashRoom -= cost;
      c.deferred = 0;
      r.capital += cost;
      r.capitalItems.push({ name: c.name, amount: cost, depreciable: true });
      c.dueAt = t + c.life;
      r.events.push({ type: 'capex', text: p.nickname + ': ' + c.name + ' replaced — ' + U.fmtMoney(cost) });
    }
    if (ST.heatConversion.enabled && ST.heatConversion.timing === 'afterPurchase' && p.ownerPaysHeat && !p.heatConverted &&
        t >= p.purchaseMonth + ST.heatConversion.monthsAfter) {
      convertHeat(env, p, t, r);
    }
    return r;
  }

  /* ------------------------------------------------------- lease mechanics */
  function renewSimple(env, p, u, t) {
    var g = env.cfg.market.rentGrowth;
    if (env.cfg.ops.rentMethod === 'none') u.rent *= (1 + g);
    else if (env.cfg.ops.rentMethod === 'ramp') { if (u.rampLeft <= 0) u.rent = Math.max(u.rent * (1 + g), 0); }
    else u.rent = Math.min(Math.max(u.rent, achievable(env, p, u, t)), u.rent * (1 + g));
  }

  function newLeaseRent(env, p, u, t, refreshedNow) {
    var cfg = env.cfg;
    if (cfg.ops.rentMethod === 'none') return u.rent > 0 ? u.rent * (1 + cfg.market.rentGrowth) : marketAsIs(env, u, t);
    var save = u.refreshed; if (refreshedNow != null) u.refreshed = refreshedNow;
    var m = achievable(env, p, u, t);
    u.refreshed = save;
    return m;
  }

  function leaseEnd(env, p, u, t, r) {
    var cfg = env.cfg, O = cfg.ops, ST = cfg.strategies;
    var g = cfg.market.rentGrowth;
    var target = achievable(env, p, u, t);
    var renewal;
    if (O.rentMethod === 'none') renewal = u.rent * (1 + g);
    else if (O.rentMethod === 'ramp') renewal = u.rampLeft > 0 ? u.rent : u.rent * (1 + g);
    else if (u.rent < target) {
      var inc = O.renewal.policy === 'push' ? O.renewal.pushPct : g;
      renewal = Math.min(target, u.rent * (1 + Math.max(inc, g)));
    } else renewal = Math.min(u.rent * (1 + g), Math.max(u.rent, target));
    var incPct = u.rent > 0 ? renewal / u.rent - 1 : 0;
    var below = u.rent < 0.97 * target;
    var pStd = Math.min(0.95, Math.max(0, (below ? O.turnover.belowMarket : O.turnover.atMarket) +
                O.turnover.sensitivity * Math.max(0, incPct - Math.max(0, g))));
    var pHcv = ST.hcv.enabled ? ST.hcv.moveOut : pStd;
    var pLeave = u.hcv * pHcv + (1 - u.hcv) * pStd;

    if (drawT(env)) {
      if (U.keyed(env.seed, 'turn', p.seq, u.i, t) < pLeave) {
        u.occupied = false;
        vacate(env, p, u, t, r, 1);
        if (O.vacancy.enabled && O.vacancy.method === 'flat') moveIn(env, p, u, t, r);   // downtime lives in the flat rate
      } else {
        u.rent = renewal;
        u.leaseEnd = leaseEndAfter(env, t);
      }
      return;
    }
    /* ---- expected values ---- */
    var costs = vacate(env, p, u, t, r, pLeave);             // charges expected costs, returns new-lease terms
    u.rent = (1 - pLeave) * renewal + pLeave * costs.newRent;
    u.refreshed = costs.refreshedAfter;
    u.hcv = (1 - pLeave) * u.hcv + pLeave * costs.hcvShare;
    var term = leaseEndAfter(env, t) - t;
    u.vacFrac = Math.min(0.95, pLeave * costs.downtime / term);
    u.leaseEnd = t + term;
  }

  /* A tenant leaves (weight w = 1 on a simulated path, = probability in the
     base run). Charges turn costs, decides refresh and voucher, and — on a
     simulated path — schedules the move-in. */
  function vacate(env, p, u, t, r, w) {
    var cfg = env.cfg, O = cfg.ops, ST = cfg.strategies, cn = costNow(env, t);
    var refreshNow = O.refresh.policy === 'onTurnover' && O.rentMethod !== 'none' ? (1 - u.refreshed) : 0;
    r.turnovers += w;
    r.turnCost += w * O.turnover.turnCost * cn;
    if (refreshNow > 0 && O.refresh.deferWhenTight && env.cashRoom != null &&
        env.cashRoom < w * refreshNow * O.refresh.costPerUnit * cn) {
      refreshNow = 0;                                     // re-let as-is; the next turnover can refresh
      r.deferred = (r.deferred || 0) + w;
    }
    if (refreshNow > 0) {
      var rc = w * refreshNow * O.refresh.costPerUnit * cn;
      if (env.cashRoom != null) env.cashRoom -= rc;
      r.capital += rc;
      r.capitalItems.push({ name: 'Unit refresh', amount: rc, depreciable: true, refresh: true });
      r.refreshes += w * refreshNow;
    }
    /* the share that turns over and was not yet refreshed gets refreshed now */
    var refreshedAfter = w === 1 ? (refreshNow > 0 ? 1 : u.refreshed) : u.refreshed + w * refreshNow;
    var saveRef = u.refreshed; u.refreshed = refreshNow > 0 ? 1 : u.refreshed;
    var stdRent = newLeaseRent(env, p, u, t);
    var hcvShare = 0, hcvRent = 0;
    if (ST.hcv.enabled && p.hcvAllowed) {
      hcvRent = voucherRent(env, p, u, t);
      if (hcvRent >= 0.97 * stdRent) hcvShare = ST.hcv.share;
    }
    u.refreshed = saveRef;
    var newRent = hcvShare * hcvRent + (1 - hcvShare) * stdRent;
    var down = O.turnover.downtimeMonths * seasonFactor(env, t) + (refreshNow > 0 ? O.refresh.extraDowntime : 0) +
               hcvShare * (ST.hcv.enabled ? ST.hcv.inspectionDelay : 0);
    if (env.managed) r.leasing += w * cfg.ops.management.leasingPct * newRent;
    if (drawT(env)) {
      /* empty time varies ±50% around the expected downtime (mean unchanged),
         rounded up or down at random so short downtimes are not inflated */
      var x = down * (0.5 + U.keyed(env.seed, 'down', p.seq, u.i, t));
      var k = Math.floor(x) + (U.keyed(env.seed, 'downr', p.seq, u.i, t) < x - Math.floor(x) ? 1 : 0);
      u.vacantUntil = t + Math.max(1, k);
      u.pendingRent = null;                               // decided at move-in, at that month's market
      u.pendingRefreshed = refreshNow > 0 ? 1 : u.refreshed;
      u.pendingHcv = hcvShare > 0 && U.keyed(env.seed, 'hcv', p.seq, u.i, t) < hcvShare ? 1 : 0;
      u.rent = 0;
      return null;
    }
    return { newRent: newRent, refreshedAfter: Math.min(1, refreshedAfter), hcvShare: hcvShare, downtime: down };
  }

  function moveIn(env, p, u, t, r) {
    u.refreshed = u.pendingRefreshed != null ? u.pendingRefreshed : u.refreshed;
    u.hcv = u.pendingHcv || 0;
    u.rent = u.hcv ? voucherRent(env, p, u, t) : newLeaseRent(env, p, u, t);
    u.occupied = true; u.vacantUntil = null;
    u.leaseEnd = leaseEndAfter(env, t);
  }

  /* Owner moves out, or a unit comes back from another mode. */
  function relet(env, p, u, t, r, fromOwner) {
    if (drawT(env)) { vacate(env, p, u, t, r, 1); return; }
    var c = vacate(env, p, u, t, r, 1);
    u.rent = c.newRent; u.refreshed = c.refreshedAfter; u.hcv = c.hcvShare;
    var term = leaseEndAfter(env, t) - t;
    u.vacFrac = Math.min(0.95, c.downtime / term);
    u.leaseEnd = t + term; u.occupied = true;
  }

  /* ------------------------------------------ furnished, nightly, by room */
  function modeUnit(env, p, u, t, r) {
    var cfg = env.cfg, X = cfg.strategies.unitModes, cn = costNow(env, t);
    var mRef = marketRef(env, u, t), gross;
    if (u.mode === 'str') gross = X.adr * cn * 30.4 * X.occupancy;
    else gross = mRef * (1 + X.premiumPct) * (1 - X.vacancy);
    var platform = u.mode === 'str' ? gross * X.platformPct : 0;
    var extra = (X.opexPerUnit + X.cleanPerMonth) * cn + platform;
    var mgmtAdd = env.managed ? gross * X.mgmtAddPct : 0;
    r.gpr += gross; r.collected += gross; r.rentedUnits += 1;
    r.modeOpex += extra + mgmtAdd;
    if (u.mode === 'str') r.strIncome += gross - extra - mgmtAdd;
  }

  /* ------------------------------------------------- tenants on own heat */
  function convertHeat(env, p, t, r) {
    var cfg = env.cfg, cn = costNow(env, t);
    var cost = cfg.strategies.heatConversion.costPerUnit * p.units * cn;
    r.capital += cost;
    r.capitalItems.push({ name: 'Heat conversion', amount: cost, depreciable: true });
    p.heatTenantCostPerUnit = p.utilities * p.heatShare / p.units;
    p.heatConverted = true;
    r.projectHours = (r.projectHours || 0) + cfg.life.hours.heatProjectPerUnit * p.units;
    if (p.rubs.active) p.rubs.recoveryMonthly *= (1 - p.heatShare);
    r.events.push({ type: 'heat', text: p.nickname + ': tenants moved onto their own heat — owner utilities fall by ' +
      U.fmtDollars(p.utilities * p.heatShare) + '/mo for ' + U.fmtMoney(cost) });
  }

  /* ------------------------------------------- what a lender sees today */
  function lenderView(env, p, t) {
    var cfg = env.cfg;
    return {
      units: p.units, value: value(env, p, t),
      rents: p.unitsArr.map(function (u) {
        return { lease: u.owner ? 0 : u.rent, marketAsIs: marketAsIs(env, u, t), occupied: !u.owner && (u.occupied || !drawT(env)), owner: u.owner };
      }),
      taxMonthly: p.taxBill / 12 + p.specials / 12, insMonthly: p.insurance / 12, hoaMonthly: p.hoa,
      utilitiesMonthly: p.utilities * (p.heatConverted ? 1 - p.heatShare : 1), maintenancePct: p.maintPct,
      otherIncome: p.otherIncome + (p.ancillaryAdded || 0)
    };
  }

  FPE.ops = {
    defaultComponents: defaultComponents, maintenancePct: maintenancePct,
    newProperty: newProperty, month: month, january: january, value: value,
    lenderView: lenderView, marketAsIs: marketAsIs, marketRef: marketRef, achievable: achievable,
    voucherRent: voucherRent, convertHeat: convertHeat, costNow: costNow
  };
})(FPE);
