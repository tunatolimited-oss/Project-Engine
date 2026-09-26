/* ============================================================================
   THE STRATEGY CATALOGUE — every real choice as data.

   Each entry says what it is, where its switch and settings live in the
   registry, how realistic it is for you (from your answers in September
   2026), what it needs, what it fights with, and the variants the
   recommender should try. The Strategies view, the recommender and the
   interaction warnings all read this one list.

   Fields:
     id, family, name, one        name and one-line description
     how                          what the engine does, in a sentence or two
     on / off                     config patches that switch it on / off
     params                       registry paths shown under it
     realism                      'yes' | 'maybe' | 'rare' | 'planning' | 'lifestyle' | 'rule'
     wouldDo                      in your would-do set by default
     explore                      [{ label, patch }] variants to screen
     requires(cfg) → reason|null  why it cannot apply right now
     warn(cfg) → [text]           interactions worth knowing, given the plan
   ========================================================================== */
(function (FPE) {
  'use strict';
  var U = FPE.util;
  function g(cfg, p) { return U.getPath(cfg, p); }
  function sw(path) { var o = {}; o[path] = true; return o; }
  function off(path) { var o = {}; o[path] = false; return o; }
  function S(id) { return 'strategies.' + id + '.enabled'; }
  function monthsBefore(cfg, n) { return U.iso(U.parseMonth(cfg.plan.objective.targetMonth) - n); }

  var C = [
    /* ------------------------------------------------------------ GETTING IN */
    { id: 'houseHack', family: 'Getting in', name: 'House-hack', realism: 'yes', wouldDo: true,
      one: 'Live in the first building on an owner-occupied loan (3.5–5% down).',
      how: 'The first purchase uses FHA or a 5%-down conventional loan; you live in the largest unit for the stay you set, and the rent you no longer pay counts as income. FHA 3–4 unit buildings must pass self-sufficiency.',
      on: sw('life.houseHack.enabled'), off: off('life.houseHack.enabled'),
      params: ['life.houseHack.stayMonths', 'life.houseHack.count', 'life.houseHack.afterLast', 'life.houseHack.product'],
      explore: [{ label: 'House-hack, stay 2 years', patch: { 'life.houseHack.enabled': true, 'life.houseHack.stayMonths': 24 } },
                { label: 'House-hack, stay 4 years', patch: { 'life.houseHack.enabled': true, 'life.houseHack.stayMonths': 48 } }],
      warn: function (cfg) {
        var w = [];
        if (!cfg.income.w2.enabled) w.push('Owner-occupied loans are qualified on income; with no W-2 modelled the engine cannot check debt-to-income.');
        if (g(cfg, S('sellerFinance'))) w.push('Seller financing is never combined with the house-hack purchase itself.');
        return w;
      } },
    { id: 'chainHack', family: 'Getting in', name: 'Chain house-hacks', realism: 'yes', wouldDo: true,
      one: 'Move into each new purchase after a year or two, on another owner-occupied loan.',
      how: 'After each stay you move into the next building. FHA is one loan at a time, so later moves use a 5%-down conventional loan unless the FHA loan is refinanced away.',
      on: { 'life.houseHack.enabled': true, 'life.houseHack.count': 3 }, off: { 'life.houseHack.count': 1 },
      params: ['life.houseHack.count', 'life.houseHack.stayMonths'],
      requires: function (cfg) { return g(cfg, 'life.houseHack.enabled') ? null : 'Needs the house-hack switched on.'; },
      explore: [{ label: 'Chain 2 house-hacks, 18 months each', patch: { 'life.houseHack.enabled': true, 'life.houseHack.count': 2, 'life.houseHack.stayMonths': 18 } },
                { label: 'Chain 3 house-hacks, 12 months each', patch: { 'life.houseHack.enabled': true, 'life.houseHack.count': 3, 'life.houseHack.stayMonths': 12 } }],
      warn: function (cfg) { return cfg.life.career.enabled ? ['Each move needs W-2 income to qualify; the engine will not schedule one after you quit.'] : []; } },
    { id: 'ownHome', family: 'Getting in', name: 'Buy your own home later', realism: 'lifestyle', wouldDo: true, lifestyle: true,
      one: 'A home of your own, bought after a number of purchases or on a date.',
      how: 'Takes a down payment, adds its payment to debt-to-income, uses a Fannie Mae financed-property slot, and moves the Primary Residence Credit to it. A life choice: the recommender never switches it for you.',
      on: sw('life.ownHome.enabled'), off: off('life.ownHome.enabled'),
      params: ['life.ownHome.trigger', 'life.ownHome.afterPurchases', 'life.ownHome.date', 'life.ownHome.price', 'life.ownHome.downPct'], explore: [] },
    { id: 'sellerFinance', stochastic: true, family: 'Getting in', name: 'Seller financing', realism: 'yes', wouldDo: true,
      one: 'The seller carries the loan: less down, no bank, a balloon in 5–10 years.',
      how: 'Available only when a seller in the channel would carry (a share of listed sellers, more off-market). The balloon is retested against a lender when it comes due; if it cannot refinance the building is sold or extended.',
      on: sw(S('sellerFinance')), off: off(S('sellerFinance')),
      params: ['strategies.sellerFinance.downPct', 'strategies.sellerFinance.rate', 'strategies.sellerFinance.balloonYears', 'sourcing.mls.sellerCarryShare', 'sourcing.offMarket.sellerCarryShare'],
      explore: [{ label: 'Seller financing where offered', patch: sw(S('sellerFinance')) }],
      warn: function (cfg) {
        var w = [];
        if (!cfg.sourcing.offMarket.enabled) w.push('Most carry-back sellers are found off-market; with outreach off, offers are rare.');
        if (!cfg.lending.balloon.test) w.push('The balloon test is off — every balloon refinances automatically, which flatters this strategy.');
        return w;
      } },
    { id: 'assumption', stochastic: true, family: 'Getting in', name: 'Assume the seller\'s loan', realism: 'rare', wouldDo: false,
      one: 'Take over an FHA loan at its old rate; pay the whole equity gap in cash.',
      how: 'Only listings that carry an assumable loan qualify. The gap between price and balance is cash at closing.',
      on: sw(S('assumption')), off: off(S('assumption')), params: ['strategies.assumption.maxEquityGap', 'strategies.assumption.fee'],
      explore: [{ label: 'Assume where possible', patch: sw(S('assumption')) }] },
    { id: 'points', family: 'Financing', name: 'Buy down the rate', realism: 'yes', wouldDo: true,
      one: 'Pay points at closing for a lower rate.',
      how: 'Each point costs 1% of the loan and cuts the rate by the amount you set. Deducted over the loan\'s life.',
      on: sw(S('points')), off: off(S('points')), params: ['strategies.points.points', 'strategies.points.ratePerPoint'],
      explore: [{ label: 'One point on each loan', patch: sw(S('points')) }] },
    { id: 'interestOnly', family: 'Financing', name: 'Interest-only period', realism: 'yes', wouldDo: true,
      one: 'Pay interest only for the first years of DSCR and bank loans.',
      how: 'Lower payments early; the payment steps up when amortisation starts, and no principal is paid meanwhile.',
      on: sw(S('interestOnly')), off: off(S('interestOnly')), params: ['strategies.interestOnly.years'],
      explore: [{ label: 'Interest-only for 5 years', patch: sw(S('interestOnly')) }],
      warn: function (cfg) { return ['Check the step-up dates against your career plan: a payment rise the year you quit is the worst timing.']; } },
    { id: 'biggerDown', family: 'Financing', name: 'Put more down', realism: 'yes', wouldDo: true,
      one: 'A larger down payment on each purchase: fewer buildings, more cash flow each.',
      how: 'Raises the down payment on every non-owner-occupied purchase to the level you set.',
      on: sw('cash.biggerDown.enabled'), off: off('cash.biggerDown.enabled'), params: ['cash.biggerDown.pct'],
      explore: [{ label: '40% down', patch: { 'cash.biggerDown.enabled': true, 'cash.biggerDown.pct': 0.40 } }] },

    /* ------------------------------------------------------ CAPITAL RECYCLING */
    { id: 'cashOutRefi', family: 'Capital recycling', name: 'Cash-out refinance', realism: 'yes', wouldDo: true,
      one: 'Refinance a seasoned building and use the equity for the next purchase.',
      how: 'After seasoning, a DSCR (or bank) loan sized by the lesser of LTV and coverage replaces the old one; FHA mortgage insurance ends with it. Prepayment penalties and costs are paid.',
      on: sw(S('cashOutRefi')), off: off(S('cashOutRefi')),
      params: ['strategies.cashOutRefi.maxLtv', 'strategies.cashOutRefi.seasoningMonths', 'strategies.cashOutRefi.minProceeds', 'strategies.cashOutRefi.beforeQuitOnly'],
      explore: [{ label: 'Cash-out refinance', patch: sw(S('cashOutRefi')) },
                { label: 'Cash-out refinance, only while employed', patch: { 'strategies.cashOutRefi.enabled': true, 'strategies.cashOutRefi.beforeQuitOnly': true } }],
      warn: function (cfg) {
        var w = [];
        if (cfg.lending.dscr.prepayYears >= 3) w.push('DSCR loans carry a ' + cfg.lending.dscr.prepayYears + '-year prepayment penalty; refinancing early pays it.');
        return w;
      } },
    { id: 'heloc', family: 'Capital recycling', name: 'Portfolio HELOC', realism: 'maybe', wouldDo: true,
      one: 'A credit line on your equity for down payments, repaid from surplus.',
      how: 'Draws to close when cash falls short, repays a share of each month\'s surplus, floats with rates, can be frozen in a recession, and backstops a cash shortfall.',
      on: sw(S('heloc')), off: off(S('heloc')),
      params: ['strategies.heloc.maxCltv', 'strategies.heloc.lineCap', 'strategies.heloc.repayShare', 'strategies.heloc.freezeInRecession'],
      explore: [{ label: 'HELOC for down payments', patch: sw(S('heloc')) }],
      warn: function () { return ['Few lenders offer HELOCs on investment property; confirm one exists for you before counting on it.']; } },
    { id: 'exchange1031', family: 'Capital recycling', name: '1031 exchange', realism: 'yes', wouldDo: true,
      one: 'Sell a smaller building and roll all the proceeds into a bigger one, tax deferred.',
      how: 'Once equity passes your trigger, the building with the most equity is exchanged for the largest the proceeds can carry. Suspended losses stay suspended; the carried-over basis keeps its schedule.',
      on: sw(S('exchange1031')), off: off(S('exchange1031')),
      params: ['strategies.exchange1031.trigger', 'strategies.exchange1031.targetUnits', 'strategies.exchange1031.maxExchanges'],
      requires: function (cfg) { return (cfg.sourcing.allow4 || (cfg.sourcing.allow58 && cfg.sourcing.archetype58)) ? null : 'Needs fourplexes, or the 5–8 unit archetype, to trade up into.'; },
      explore: [{ label: '1031 into bigger buildings', patch: sw(S('exchange1031')) }] },
    { id: 'fhaRefi', family: 'Capital recycling', name: 'Refinance out of FHA insurance', realism: 'yes', wouldDo: true,
      one: 'Once you have 20% equity, refinance the FHA loan to end its mortgage insurance.',
      how: 'Fires when the balance is under 80% of value and the savings repay the costs within your limit. Also frees the one-FHA-at-a-time slot.',
      on: sw(S('fhaRefi')), off: off(S('fhaRefi')), params: ['strategies.fhaRefi.maxBreakevenMonths'],
      requires: function (cfg) { return cfg.life.houseHack.enabled && cfg.lending.fha.enabled ? null : 'Only matters with an FHA house-hack.'; },
      explore: [{ label: 'Refinance out of FHA insurance', patch: sw(S('fhaRefi')) }] },

    /* ------------------------------------------------------------------ DEBT */
    { id: 'paydown', family: 'Debt', name: 'Pay down debt', realism: 'yes', wouldDo: true,
      one: 'Send spare cash to principal, recasting where the loan allows.',
      how: 'Chooses the loan by the order you set; lump sums over the minimum recast the payment (FHA loans cannot). Can come after buying, instead of buying, or split.',
      on: sw(S('paydown')), off: off(S('paydown')),
      params: ['strategies.paydown.order', 'strategies.paydown.allocation', 'strategies.paydown.startAfterProperties', 'strategies.paydown.recast'],
      explore: [{ label: 'Pay down after buying', patch: { 'strategies.paydown.enabled': true, 'strategies.paydown.allocation': 'afterBuying' } },
                { label: 'Stop buying at 5 buildings and pay down', patch: { 'strategies.paydown.enabled': true, 'strategies.paydown.allocation': 'pauseBuying', 'strategies.paydown.startAfterProperties': 5 } }] },
    { id: 'rateRefi', stochastic: true, family: 'Debt', name: 'Rate-and-term refinance', realism: 'yes', wouldDo: true,
      one: 'Refinance when rates fall enough to repay the costs.',
      how: 'Rates are flat by default, so this only fires if you set a rate path or in simulated futures where rates fall.',
      on: sw(S('rateRefi')), off: off(S('rateRefi')), params: ['strategies.rateRefi.dropBps', 'strategies.rateRefi.maxBreakevenMonths'],
      explore: [{ label: 'Refinance when rates fall', patch: sw(S('rateRefi')) }] },

    /* ---------------------------------------------------------------- INCOME */
    { id: 'renewalPush', family: 'Income', name: 'Push renewals toward market', realism: 'yes', wouldDo: true,
      one: 'Raise below-market tenants faster at renewal; some will leave.',
      how: 'Below-market tenants get the push increase at renewal (never above market). Move-outs rise with how far the increase exceeds normal.',
      on: { 'ops.renewal.policy': 'push' }, off: { 'ops.renewal.policy': 'market' },
      params: ['ops.renewal.pushPct', 'ops.turnover.sensitivity'],
      explore: [{ label: 'Market increases only at renewal', patch: { 'ops.renewal.policy': 'market' } },
                { label: 'Push renewals 12% a year', patch: { 'ops.renewal.policy': 'push', 'ops.renewal.pushPct': 0.12 } }] },
    { id: 'refresh', family: 'Income', name: 'Refresh units', realism: 'yes', wouldDo: true,
      one: 'Update each unit to reach full market rent — at turnover, at purchase, or never.',
      how: 'A refreshed unit rents at survey rent; an unrenovated one at the as-is share. At turnover it costs extra empty time; at purchase it costs cash at closing.',
      on: { 'ops.refresh.policy': 'onTurnover' }, off: { 'ops.refresh.policy': 'never' },
      params: ['ops.refresh.policy', 'ops.refresh.costPerUnit', 'ops.refresh.extraDowntime', 'ops.asIsFactor'],
      explore: [{ label: 'Refresh every unit at purchase', patch: { 'ops.refresh.policy': 'atPurchase' } },
                { label: 'Never refresh', patch: { 'ops.refresh.policy': 'never' } }] },
    { id: 'hcv', family: 'Income', name: 'Housing Choice Vouchers', realism: 'yes', wouldDo: true,
      one: 'Offer vacant units to voucher holders: top-of-market rent, longer stays.',
      how: 'Voucher rent is the lesser of the payment standard less the utility allowance and rent reasonableness. Voucher tenants move less; units need an inspection before lease-up.',
      on: sw(S('hcv')), off: off(S('hcv')), params: ['strategies.hcv.share', 'strategies.hcv.rrPremium', 'strategies.hcv.moveOut', 'strategies.hcv.inspectionDelay'],
      explore: [{ label: 'Vouchers on vacant units', patch: sw(S('hcv')) }],
      warn: function (cfg) { return g(cfg, S('heatConversion')) ? ['Moving tenants onto their own heat raises the utility allowance and lowers the most rent a voucher approves.'] : []; } },
    { id: 'rubs', family: 'Income', name: 'Bill utilities back (RUBS)', realism: 'yes', wouldDo: true,
      one: 'Recover owner-paid utilities from tenants by formula.',
      how: 'Starts at the first renewal. Tenants give back part of the recovery in lower rent (the resistance share). Billing back heat from a central boiler is less common than water and sewer; the result leans on tenants accepting most of it.',
      on: sw(S('rubs')), off: off(S('rubs')), params: ['strategies.rubs.recoveryPct', 'strategies.rubs.resistanceShare', 'strategies.rubs.setupPerUnit'],
      explore: [{ label: 'RUBS on owner-paid utilities', patch: sw(S('rubs')) }],
      warn: function (cfg) { return g(cfg, S('heatConversion')) ? ['Once tenants pay their own heat, RUBS only recovers the rest of the bill.'] : []; } },
    { id: 'ancillary', family: 'Income', name: 'Ancillary income', realism: 'maybe', wouldDo: true,
      one: 'Laundry, storage, parking and plug-ins, pet rent.',
      how: 'Starts a few months after purchase; laundry is skipped where the listing already books laundry income.',
      on: sw(S('ancillary')), off: off(S('ancillary')), params: ['strategies.ancillary.laundry', 'strategies.ancillary.storage', 'strategies.ancillary.parking', 'strategies.ancillary.pets'],
      explore: [{ label: 'Ancillary income', patch: sw(S('ancillary')) }] },
    { id: 'heatConversion', family: 'Income', name: 'Tenants on their own heat', realism: 'yes', wouldDo: true,
      one: 'Replace the central boiler with unit heat when it fails; tenants pay heat.',
      how: 'At the boiler\'s end of life (or soon after buying) the building converts; owner utilities fall by the heat share, tenants give back part in rent.',
      on: sw(S('heatConversion')), off: off(S('heatConversion')), params: ['strategies.heatConversion.timing', 'strategies.heatConversion.costPerUnit', 'strategies.heatConversion.rentGiveBack'],
      explore: [{ label: 'Convert heat at the boiler\'s end of life', patch: sw(S('heatConversion')) },
                { label: 'Convert heat soon after buying', patch: { 'strategies.heatConversion.enabled': true, 'strategies.heatConversion.timing': 'afterPurchase' } }] },
    { id: 'unitModes', family: 'Income', name: 'Furnished or nightly units', realism: 'maybe', wouldDo: false,
      one: 'Run one unit per building mid-term furnished, nightly, or by the room.',
      how: 'Converted at a lease end after furnishing. Nightly stays of 7 days or less are not a rental activity; with your own participation their losses are non-passive.',
      on: sw(S('unitModes')), off: off(S('unitModes')), params: ['strategies.unitModes.mode', 'strategies.unitModes.unitsPerProperty', 'strategies.unitModes.premiumPct', 'strategies.unitModes.vacancy'],
      explore: [{ label: 'One mid-term furnished unit per building', patch: { 'strategies.unitModes.enabled': true, 'strategies.unitModes.mode': 'mtr', 'strategies.unitModes.unitsPerProperty': 1 } }],
      warn: function (cfg) { return (g(cfg, S('unitModes')) && cfg.strategies.unitModes.mode === 'str') ? ['With a manager you no longer materially participate, so nightly losses turn passive again.'] : []; } },
    { id: 'winterProof', family: 'Income', name: 'Winter-proof the lease calendar', realism: 'yes', wouldDo: true,
      one: 'Set lease lengths so renewals land in spring and summer.',
      how: 'New leases are lengthened so they end outside November–February, when empty units take longer to fill.',
      on: sw('ops.turnover.winterProof'), off: off('ops.turnover.winterProof'), params: ['ops.turnover.winterFactor'],
      explore: [{ label: 'Winter-proof leases', patch: sw('ops.turnover.winterProof') }] },

    /* ----------------------------------------------------------------- COSTS */
    { id: 'taxAppeal', family: 'Costs', name: 'Appeal the assessment', realism: 'yes', wouldDo: true,
      one: 'Appeal where the bill sits above what the assessment formula implies.',
      how: 'Once, about 14 months after purchase; only where the bill is over the formula by default. Specials cannot be appealed away.',
      on: sw(S('taxAppeal')), off: off(S('taxAppeal')), params: ['strategies.taxAppeal.reductionPct', 'strategies.taxAppeal.onlyOverAssessed'],
      explore: [{ label: 'Appeal over-assessed buildings', patch: sw(S('taxAppeal')) }] },
    { id: 'management', family: 'Costs', name: 'Self-manage', realism: 'yes', wouldDo: true,
      one: 'Manage yourself until your hours run out — or on your own rule.',
      how: 'By default a manager is hired when your real-estate hours stay above your weekly budget for a year. You can instead hire at a unit count, a date, from day one, or never.',
      on: { 'ops.management.enabled': true, 'ops.management.trigger': 'timeBudget' }, off: { 'ops.management.enabled': true, 'ops.management.trigger': 'always' },
      params: ['ops.management.trigger', 'ops.management.feePct', 'ops.management.leasingPct', 'life.hours.budgetFullTime'],
      explore: [{ label: 'Hire a manager from the start', patch: { 'ops.management.enabled': true, 'ops.management.trigger': 'always' } },
                { label: 'Self-manage to 20 units', patch: { 'ops.management.enabled': true, 'ops.management.trigger': 'units', 'ops.management.units': 20 } }] },

    /* ------------------------------------------------------------------- TAX */
    { id: 'costSeg', family: 'Tax', name: 'Cost segregation', realism: 'yes', wouldDo: true,
      one: 'Reclassify part of each building to short lives and take bonus depreciation.',
      how: 'On purchases above the minimum price. Helps only when the losses can be used — the allowance under $100K of income, REPS, or later rental income. Recaptured at ordinary rates on sale.',
      on: sw(S('costSeg')), off: off(S('costSeg')), params: ['strategies.costSeg.shortLifePct', 'strategies.costSeg.bonusPct', 'strategies.costSeg.minPrice'],
      explore: [{ label: 'Cost segregation on each purchase', patch: sw(S('costSeg')) }] },
    { id: 'reps', family: 'Tax', name: 'Real Estate Professional Status', realism: 'rule', wouldDo: true, info: true,
      one: 'Earned from your hours each year, not switched on.',
      how: 'More than 750 real-estate hours and more than your job hours, tested every year. Quitting early in a year opens a window. Losses suspended before you qualify stay suspended.',
      params: ['tax.reps.mode', 'tax.reps.materialHours'], explore: [] },
    { id: 'qbi', family: 'Tax', name: '§199A deduction', realism: 'rule', wouldDo: true, info: true,
      one: '20% off qualifying rental income when the rentals run as a business.',
      how: 'Needs 250 hours of rental services a year under the safe harbour — a manager\'s hours count.',
      params: ['tax.qbi.enabled', 'tax.qbi.qualify'], explore: [] },

    /* ---------------------------------------------------------------- TIMING */
    { id: 'stopBuying', family: 'Timing', name: 'Stop buying on a date', realism: 'yes', wouldDo: true,
      one: 'Make the last purchase a year or two before the date that matters.',
      how: 'New purchases cost cash flow while leases turn over. After the date, spare cash follows your idle-cash policy or paydown.',
      on: sw(S('stopBuying')), off: off(S('stopBuying')), params: ['strategies.stopBuying.month'],
      explore: [{ label: 'Last purchase 2 years before the target', patch: function (cfg) { return { 'strategies.stopBuying.enabled': true, 'strategies.stopBuying.month': monthsBefore(cfg, 24) }; } },
                { label: 'Last purchase 3 years before the target', patch: function (cfg) { return { 'strategies.stopBuying.enabled': true, 'strategies.stopBuying.month': monthsBefore(cfg, 36) }; } },
                { label: 'Last purchase 1 year before the target', patch: function (cfg) { return { 'strategies.stopBuying.enabled': true, 'strategies.stopBuying.month': monthsBefore(cfg, 12) }; } }] },
    { id: 'hurdle', family: 'Timing', name: 'Your own deal hurdle', realism: 'yes', wouldDo: true,
      one: 'Refuse deals below a stabilized yield or cash flow per unit.',
      how: 'Judged on the stabilized economics (every unit at achievable rent), not day one. The house-hack can be exempt.',
      on: sw(S('hurdle')), off: off(S('hurdle')), params: ['strategies.hurdle.minStabilizedYield', 'strategies.hurdle.minCashFlowPerUnit', 'strategies.hurdle.exemptHouseHack'],
      explore: [{ label: 'Only deals yielding 8%+ stabilized', patch: { 'strategies.hurdle.enabled': true, 'strategies.hurdle.minStabilizedYield': 0.08 } },
                { label: 'Only deals with $150+/unit stabilized cash flow', patch: { 'strategies.hurdle.enabled': true, 'strategies.hurdle.minCashFlowPerUnit': 150 } }] },
    { id: 'downturn', stochastic: true, family: 'Timing', name: 'Downturn stance', realism: 'yes', wouldDo: true,
      one: 'In a recession: keep buying at the discount, stop, or hold a fund for it.',
      how: 'Recessions are random in simulated futures (or scheduled as a stress test). Credit tightens in them.',
      on: sw(S('downturn')), off: off(S('downturn')), params: ['strategies.downturn.stance', 'strategies.downturn.discount', 'strategies.downturn.fundTarget'],
      explore: [{ label: 'Keep buying in a recession', patch: { 'strategies.downturn.enabled': true, 'strategies.downturn.stance': 'leanIn' } },
                { label: 'Stop buying in a recession', patch: { 'strategies.downturn.enabled': true, 'strategies.downturn.stance': 'stepBack' } },
                { label: 'Hold dry powder for a recession', patch: { 'strategies.downturn.enabled': true, 'strategies.downturn.stance': 'dryPowder' } }] },
    { id: 'goalStop', family: 'Timing', name: 'Stop at an income goal', realism: 'yes', wouldDo: true,
      one: 'Stop buying once trailing income reaches your goal.',
      how: 'After that, spare cash follows the idle-cash policy or paydown.',
      on: sw(S('goalStop')), off: off(S('goalStop')), params: ['strategies.goalStop.monthlyIncome'], explore: [] },

    /* -------------------------------------------------------------- SOURCING */
    { id: 'offMarket', family: 'Sourcing', name: 'Off-market outreach', realism: 'planning', wouldDo: true,
      one: 'Letters and calls to owners: deals below market, more sellers who carry.',
      how: 'Touches convert to deals at response × conversion rates (industry estimates, not Fargo measurements), for money and hours.',
      on: sw('sourcing.offMarket.enabled'), off: off('sourcing.offMarket.enabled'),
      params: ['sourcing.offMarket.touches', 'sourcing.offMarket.costPerTouch', 'sourcing.offMarket.responseRate', 'sourcing.offMarket.conversionRate', 'sourcing.offMarket.discount'],
      explore: [{ label: 'Off-market outreach, 400 touches a month', patch: sw('sourcing.offMarket.enabled') }] },
    { id: 'license', family: 'Sourcing', name: 'Real estate license', realism: 'yes', wouldDo: true,
      one: 'Get licensed: commission on your own purchases, better access, real-estate hours.',
      how: 'Costs the course and yearly fees; earns the buyer-side commission net of your broker\'s split on each purchase and raises your MLS win rate. Hours count toward REPS.',
      on: sw(S('license')), off: off(S('license')), params: ['strategies.license.startMonth', 'strategies.license.commissionPct', 'strategies.license.brokerSplit', 'strategies.license.winRateUplift'],
      explore: [{ label: 'Get a real estate license', patch: sw(S('license')) }] },
    { id: 'buildingMix', family: 'Sourcing', name: 'What you buy', realism: 'yes', wouldDo: true,
      one: 'Which building sizes you will buy.',
      how: 'Duplexes, triplexes, fourplexes and 5–8 units, each with its own supply, price and loan. The 5–8 unit archetype has no sold comps.',
      params: ['sourcing.allow2', 'sourcing.allow3', 'sourcing.allow4', 'sourcing.allow58', 'sourcing.archetype58', 'sourcing.archetypeQuality'],
      explore: [{ label: 'Triplexes and fourplexes only', patch: { 'sourcing.allow2': false } },
                { label: 'Add 5–8 unit buildings (archetype is a guess)', patch: { 'sourcing.allow58': true, 'sourcing.archetype58': true } }] },

    /* ------------------------------------------------------------------ CASH */
    { id: 'idleCash', family: 'Cash', name: 'Where waiting cash sits', realism: 'yes', wouldDo: true,
      one: 'Money market, T-bills, an index fund, metals, or your own investments.',
      how: 'Only cash waiting between purchases; it never competes with buying. Returns are taxed by kind and do not count as portfolio income. Your 1% and 2% a month are your figures, modelled without volatility as you asked.',
      params: ['cash.policy', 'cash.bestUseVehicle', 'cash.mmYield', 'cash.tbillYield', 'cash.indexReturn'],
      explore: [{ label: 'Waiting cash in T-bills', patch: { 'cash.policy': 'tbills' } },
                { label: 'Waiting cash in your investments at 1%/month (your figure)', patch: { 'cash.policy': 'yours1' } },
                { label: 'Best after-tax use of waiting cash', patch: { 'cash.policy': 'bestUse' } }] }
  ];

  /* Retired and parked choices, with the reason — one click away in the UI. */
  var RETIRED = [
    { name: 'Subject-to', reason: 'Takes title while the seller\'s loan stays in their name. Due-on-sale risk and title complications you ruled out; not modelled.' },
    { name: 'Master lease with option', reason: 'Rare in Fargo small multifamily and hard to value without a counterparty; retired in the September 2026 cut.' },
    { name: 'Opportunity Zones', reason: 'Requires rolling a capital gain into a qualified fund; you will not have that kind of gain early, and Fargo\'s zones don\'t match the stock you buy.' },
    { name: 'Biweekly payments', reason: 'One extra payment a year — the same as paydown at a fixed amount. Covered by the paydown setting.' },
    { name: 'Blanket loans', reason: 'Cross-collateralise several buildings; lenders offer them at 5+ properties on terms that are not public. Parked until you have a quote.' },
    { name: 'Renovation loans (203(k), HomeStyle)', reason: 'Parked: "not for me". The refresh settings cover cosmetic updates paid in cash.', parked: true }
  ];

  function applyPatch(cfg, patch) {
    var p = typeof patch === 'function' ? patch(cfg) : patch;
    Object.keys(p || {}).forEach(function (k) { U.setPath(cfg, k, p[k]); });
    return cfg;
  }
  function isOn(cfg, e) {
    if (!e.on) return null;
    return Object.keys(e.on).every(function (k) { return U.getPath(cfg, k) === e.on[k]; });
  }
  /* Everything the Strategies view needs for one plan. */
  function state(cfg) {
    return C.map(function (e) {
      return { id: e.id, on: isOn(cfg, e), blocked: e.requires ? e.requires(cfg) : null,
               warnings: (e.warn && isOn(cfg, e) !== false) ? e.warn(cfg) : [] };
    });
  }

  FPE.catalogue = { ENTRIES: C, RETIRED: RETIRED, applyPatch: applyPatch, isOn: isOn, state: state,
                    byId: function (id) { return C.filter(function (e) { return e.id === id; })[0] || null; } };
})(FPE);
