/* ============================================================================
   SOURCING — where the next building comes from.

   Channels (the default): listed properties arrive at a rate set by market
   supply and your win rate; off-market outreach converts touches into deals
   at a cost, in money and hours. A "deal credit" is a building available to
   you; the base run accumulates expected credits (capped at one per type —
   a deal you cannot afford this month is gone), a simulated path draws
   actual arrivals. Seller financing comes from the channel, not from an id.

   Library listings are specific buildings: available until their window
   closes (default six months after collection), no credit needed.
   Archetypes are drawn from the comp range: quality 0 = the cheapest,
   lowest-rent comp; 1 = the best-kept, highest-rent comp.
   ========================================================================== */
(function (FPE) {
  'use strict';
  var U = FPE.util, D = FPE.data;
  var TYPES = ['2', '3', '4', '8'];

  function typeKey(units) { return units >= 5 ? '8' : String(units); }
  function allowed(cfg, units) {
    var S = cfg.sourcing;
    if (units === 2) return S.allow2;
    if (units === 3) return S.allow3;
    if (units === 4) return S.allow4;
    if (units >= 5 && units <= 8) return S.allow58;
    return false;
  }

  /* Two pools per building type, one per channel. A pool holds deal
     credits (a whole credit = a building you could buy this month) and a
     seller-carry flag for the next deal from that channel. */
  function init() {
    function z() { var o = {}; TYPES.forEach(function (k) { o[k] = 0; }); return o; }
    return { pool: { mls: z(), offMarket: z() }, seller: { mls: z(), offMarket: z() }, expires: { mls: {}, offMarket: {} },
             ready: {}, spend: 0, touches: 0, lastClose: -999, boughtIds: {} };
  }

  /* ------------------------------------------------------ monthly accrual */
  function accrue(env, SO, t, licensed) {
    var cfg = env.cfg, S = cfg.sourcing;
    var out = { cost: 0, hours: 0 };
    if (S.model !== 'channels') return out;
    var add = { mls: {}, offMarket: {} }, addSeller = { mls: {}, offMarket: {} };
    TYPES.forEach(function (k) { add.mls[k] = 0; add.offMarket[k] = 0; addSeller.mls[k] = 0; addSeller.offMarket[k] = 0; });
    if (S.mls.enabled) {
      var win = Math.min(1, S.mls.winRate + (licensed ? cfg.strategies.license.winRateUplift : 0));
      [['2', S.mls.supply2], ['3', S.mls.supply3], ['4', S.mls.supply4], ['8', S.mls.supply8]].forEach(function (x) {
        var lam = x[1] * win / 12;
        add.mls[x[0]] = lam; addSeller.mls[x[0]] = lam * S.mls.sellerCarryShare;
      });
    }
    if (S.offMarket.enabled && S.offMarket.touches > 0) {
      var O = S.offMarket;
      var deals = O.touches * O.responseRate * O.conversionRate;
      var mix = { '2': O.mix2, '3': O.mix3, '4': O.mix4, '8': O.mix8 };
      var tot = O.mix2 + O.mix3 + O.mix4 + O.mix8 || 1;
      TYPES.forEach(function (k) {
        var d = deals * mix[k] / tot;
        add.offMarket[k] = d; addSeller.offMarket[k] = d * O.sellerCarryShare;
      });
      out.cost = O.touches * O.costPerTouch * FPE.ops.costNow(env, t);
      out.hours = O.touches / 100 * cfg.life.hours.offMarketPer100;
      SO.touches += O.touches; SO.spend += out.cost;
    }
    ['mls', 'offMarket'].forEach(function (ch) {
      TYPES.forEach(function (k) {
        var a = add[ch][k];
        if (env.rng && cfg.mc.sample.deals) {
          /* actual arrivals; a deal stays available for two months */
          var n = a > 0 ? new U.Rng(U.hash32(env.seed, 'deal', ch, k, t)).poisson(a) : 0;
          if (n > 0) {
            SO.pool[ch][k] = Math.min(2, SO.pool[ch][k] + n); SO.expires[ch][k] = t + 2;
            if (U.keyed(env.seed, 'sellerdeal', ch, k, t) < addSeller[ch][k] / a) SO.seller[ch][k] = 1;
          } else if (SO.expires[ch][k] != null && t > SO.expires[ch][k]) { SO.pool[ch][k] = 0; SO.seller[ch][k] = 0; }
        } else if (SO.ready[k]) {
          /* expected supply, counted only while you could act on it: a deal
             that lists while you cannot afford it goes to someone else. So
             once you are ready, the expected wait for a type is one over its
             arrival rate — as it is on a simulated path. */
          SO.pool[ch][k] = Math.min(1, SO.pool[ch][k] + a);
          SO.seller[ch][k] = Math.min(1, SO.seller[ch][k] + addSeller[ch][k]);
        }
      });
    });
    return out;
  }

  /* ----------------------------------------------------------- candidates */
  function fromListing(env, rec, t) {
    var cfg = env.cfg, M = env.M, dm = rec.asOf ? U.parseMonth(rec.asOf) : FPE.data.dataMonth;   // prices are as of when they were read
    var drift = cfg.market.driftListings;
    var pf = drift ? M.priceIndex(t) / M.priceIndex(dm) : 1;
    var rf = drift ? M.rentIndex(t) / M.rentIndex(dm) : 1;
    var ef = M.expenseIndex(t) / M.expenseIndex(dm);
    var inf = M.insuranceIndex(t) / M.insuranceIndex(dm);
    var taxYearGrowth = drift ? M.priceIndex(t) / M.priceIndex(U.mk(rec.taxYear || 2025, 6)) : 1;
    var specials = rec.specialAssessmentsAnnual != null ? rec.specialAssessmentsAnnual : cfg.market.tax.specialsPerParcel;
    return {
      origin: 'library', sourceId: rec.id, nickname: rec.address || rec.nickname || rec.id, units: rec.units,
      price: rec.price * pf, marketValue: rec.price * pf,
      unitRents: rec.unitRents.map(function (r) { return r * rf; }),
      unitBedrooms: rec.unitBedrooms, unitMarketRents: rec.unitMarketRents ? rec.unitMarketRents.map(function (r) { return r * rf; }) : null,
      leaseEnds: rec.leaseEnds, vacantUnits: rec.vacantUnits || [], condition: rec.condition,
      annualTax: rec.annualTax != null ? rec.annualTax * taxYearGrowth
                                       : rec.price * pf * (rec.units >= cfg.market.tax.commercialThreshold ? cfg.market.tax.commercialRate : cfg.market.tax.residentialRate) * cfg.market.tax.assessmentRatio,
      taxStated: rec.annualTax != null, specials: specials * ef,
      annualInsurance: (rec.annualInsurance != null ? rec.annualInsurance : cfg.market.insurancePerUnit * rec.units) * inf,
      hoaMonthly: rec.hoaMonthly || 0, ownerUtilitiesMonthly: (rec.ownerUtilitiesMonthly || 0) * ef,
      ownerPaysHeat: !!rec.ownerPaysHeat, heatShare: rec.heatShare || 0, rubsInPlace: !!rec.rubsInPlace, rubsRecoveryPct: rec.rubsRecoveryPct,
      otherMonthlyIncome: (rec.otherMonthlyIncome || 0) * rf, otherIncomeIsLaundry: !!rec.otherIncomeIsLaundry,
      yearBuilt: rec.yearBuilt, components: rec.components || null, hcvAllowed: rec.hcvAllowed !== false,
      assumable: rec.assumable || null, sellerEligible: !!rec.sellerFinanceEligible,
      unitModes: rec.unitModes || null, prov: rec.prov || null, issues: rec.issues || [], channel: 'library'
    };
  }

  function interp(a, b, x) { return a + (b - a) * x; }
  function anchorAt(arch, q) {
    var A = arch.anchors, lo = q <= 0.5 ? A.lo : A.mid, hi = q <= 0.5 ? A.mid : A.hi, x = q <= 0.5 ? q / 0.5 : (q - 0.5) / 0.5;
    return {
      pricePerUnit: interp(lo.pricePerUnit, hi.pricePerUnit, x), rentRatio: interp(lo.rentRatio, hi.rentRatio, x),
      utilitiesPerUnit: interp(lo.utilitiesPerUnit, hi.utilitiesPerUnit, x), insurancePerUnit: interp(lo.insurancePerUnit, hi.insurancePerUnit, x),
      yearBuilt: Math.round(interp(lo.yearBuilt, hi.yearBuilt, x)), ownerPaysHeat: x < 0.5 ? lo.ownerPaysHeat : hi.ownerPaysHeat
    };
  }

  function fromArchetype(env, key, t, channel, q) {
    var cfg = env.cfg, M = env.M, dm = FPE.data.dataMonth;
    var arch = cfg.archetypes[key];
    if (!arch) return null;
    var a = anchorAt(arch, U.clamp(q, 0, 1));
    var units = arch.units;
    var pf = M.priceIndex(t) / M.priceIndex(dm);
    var mv = a.pricePerUnit * units * pf;
    var discount = channel === 'offMarket' ? cfg.sourcing.offMarket.discount : 0;
    var DS = cfg.strategies.downturn;
    if (DS.enabled && DS.stance === 'leanIn' && M.recession(t)) discount += DS.discount;
    var br = arch.bedrooms;
    var base = D.rentByBedroom(br);
    var rate = units >= cfg.market.tax.commercialThreshold ? cfg.market.tax.commercialRate : cfg.market.tax.residentialRate;
    var rents = []; for (var i = 0; i < units; i++) rents.push(base * M.rentIndex(t) * a.rentRatio);
    return {
      origin: 'archetype', sourceId: 'arch' + key, nickname: arch.nickname + (channel === 'offMarket' ? ' (off-market)' : ''),
      units: units, price: mv * (1 - discount), marketValue: mv, unitRents: rents, bedrooms: br,
      unitBedrooms: null, unitMarketRents: null, leaseEnds: null, vacantUnits: [], condition: 'asis',
      annualTax: mv * rate * cfg.market.tax.assessmentRatio, taxStated: false,
      specials: cfg.market.tax.specialsPerParcel * M.expenseIndex(t) / M.expenseIndex(dm),
      annualInsurance: a.insurancePerUnit * units * M.insuranceIndex(t) / M.insuranceIndex(dm),
      hoaMonthly: 0, ownerUtilitiesMonthly: a.utilitiesPerUnit * units * M.expenseIndex(t) / M.expenseIndex(dm),
      ownerPaysHeat: a.ownerPaysHeat, heatShare: a.ownerPaysHeat ? 0.6 : 0, rubsInPlace: false,
      otherMonthlyIncome: 0, otherIncomeIsLaundry: false, yearBuilt: a.yearBuilt, components: null,
      hcvAllowed: true, assumable: null, quality: q, channel: channel,
      prov: { price: 'derived', unitRents: 'derived', annualInsurance: 'derived', ownerUtilitiesMonthly: 'derived', components: 'estimated' },
      confidence: arch.confidence, issues: arch.confidence === 'guess' ? ['No sold comp: this archetype is extrapolated.'] : []
    };
  }

  /* Everything buyable this month, before financing. */
  function candidates(env, SO, t) {
    var cfg = env.cfg, S = cfg.sourcing, out = [];
    if (S.library.enabled) {
      var avail = FPE.data.dataMonth + S.library.availableMonths;
      (cfg.properties || []).forEach(function (rec) {
        if (!rec.enabled || rec.status === 'sold' || SO.boughtIds[rec.id]) return;
        if (t > avail && !rec.alwaysAvailable) return;
        if (!allowed(cfg, rec.units)) return;
        out.push(fromListing(env, rec, t));
      });
    }
    var q = S.archetypeQuality;
    if (env.rng && cfg.mc.sample.deals) q = U.clamp(q + (U.keyed(env.seed, 'quality', t) - 0.5) * 0.8, 0, 1);
    TYPES.forEach(function (k) {
      var units = k === '8' ? 8 : parseInt(k, 10);
      if (!allowed(cfg, units)) return;
      if (k === '8' && !S.archetype58) return;
      if (S.model !== 'channels') {
        var c0 = fromArchetype(env, k, t, 'mls', q);
        if (c0) { c0.sellerEligible = false; c0.creditKey = k; out.push(c0); }
        return;
      }
      ['offMarket', 'mls'].forEach(function (ch) {
        if (SO.pool[ch][k] < 1 - 1e-9) return;
        var c = fromArchetype(env, k, t, ch, q);
        if (!c) return;
        c.sellerEligible = SO.seller[ch][k] >= 1 - 1e-9;
        c.creditKey = k;
        out.push(c);
      });
    });
    return out;
  }

  function consume(env, SO, cand, t, usedSeller) {
    SO.lastClose = t;
    if (cand.origin === 'library') { SO.boughtIds[cand.sourceId] = true; return; }
    if (env.cfg.sourcing.model !== 'channels') return;
    var k = cand.creditKey, ch = cand.channel === 'offMarket' ? 'offMarket' : 'mls';
    SO.pool[ch][k] = Math.max(0, SO.pool[ch][k] - 1);
    if (usedSeller) SO.seller[ch][k] = 0;
  }

  FPE.sourcing = { init: init, accrue: accrue, candidates: candidates, consume: consume,
                   fromListing: fromListing, fromArchetype: fromArchetype, anchorAt: anchorAt,
                   typeKey: typeKey, allowed: allowed, TYPES: TYPES };
})(FPE);
