/* ============================================================================
   STRATEGIES TAB — every accelerator, each with its real cost stated
   ========================================================================== */

function stratToggle(path, label, hint) {
  return field(path, { kind: 'check', label: label, hint: hint, rerender: true });
}

/* Worst portfolio coverage and peak leverage in the CURRENT run, so the
   guardrail panel can tell you where your own plan actually sits. */
function portfolioWorstDSCR() {
  if (!RES) return 0;
  var worst = 99;
  RES.rows.forEach(function (r) {
    if (r.debtService > 0) {
      var d = (r.noi + r.opCapex) / r.debtService;
      if (d < worst) worst = d;
    }
  });
  return worst === 99 ? 0 : worst;
}
function portfolioPeakLTV() {
  if (!RES) return 0;
  var peak = 0;
  RES.rows.forEach(function (r) {
    if (r.value > 0) { var l = r.debt / r.value; if (l > peak) peak = l; }
  });
  return peak;
}

function renderStrategies() {
  var root = clear($('tab-strategies'));
  if (!RES) return;
  var S = CFG.strategies;

  root.appendChild(h('div', { class: 'callout' }, [
    h('b', {}, 'Everything here is off by default. '),
    'Each one is modeled properly, including the part that costs you something. Turn them on one at a time and watch the result strip at the top — then use the stack ranking at the bottom to see which ones actually earn their risk.'
  ]));

  /* ------------------------------------------------ equity recycling ---- */
  root.appendChild(panel('Cash-out refinance', 'Pull equity out of a property you already own and use it as the next down payment.', [
    stratToggle('strategies.cashOutRefi.enabled', 'Refinance to pull cash out',
      'Fires automatically whenever a property qualifies.'),
    S.cashOutRefi.enabled ? h('div', { class: 'grid' }, [
      field('strategies.cashOutRefi.maxLTV', { kind: 'pct', label: 'Max loan-to-value', step: 1,
        note: 'Lenders cap cash-out on investment property around 70–75%.' }),
      field('strategies.cashOutRefi.seasoningMonths', { kind: 'num', label: 'Seasoning (months)', step: 1,
        note: 'How long you must own it before a lender will refinance at the new value. Six to twelve months is typical.' }),
      field('strategies.cashOutRefi.minProceeds', { kind: 'money', label: 'Minimum worth doing', step: 2500 }),
      field('strategies.cashOutRefi.costPct', { kind: 'pct', label: 'Refinance cost', step: 0.25 }),
      field('strategies.cashOutRefi.minDSCRAfter', { kind: 'num', label: 'DSCR required after', step: 0.05,
        note: 'The bigger loan still has to be coverable. This is what stops the engine from refinancing a property into trouble.' })
    ]) : null,
    h('div', { class: 'callout warn' }, [
      h('b', {}, 'What it costs you. '),
      'You reset the amortization clock, so principal paydown starts over. The payment rises, which permanently lowers that property’s cash flow. And your equity cushion shrinks right when you might need it — run the resilience check with this on before believing the result.'
    ])
  ]));

  root.appendChild(panel('HELOC line', 'A revolving line secured by portfolio equity. Draw it to close, repay it from cash flow.', [
    stratToggle('strategies.heloc.enabled', 'Open a HELOC against the portfolio',
      'The engine draws on it only when cash is short of closing, and repays from surplus.'),
    S.heloc.enabled ? h('div', { class: 'grid' }, [
      field('strategies.heloc.maxCLTV', { kind: 'pct', label: 'Max combined LTV', step: 1 }),
      field('strategies.heloc.rate', { kind: 'pct', label: 'Rate', step: 0.25,
        note: 'HELOCs on investment property price well above a first mortgage and usually float. 9–10% is realistic in 2026.' }),
      field('strategies.heloc.seasoningMonths', { kind: 'num', label: 'Seasoning (months)', step: 1 }),
      field('strategies.heloc.minDraw', { kind: 'money', label: 'Minimum draw', step: 2500 }),
      field('strategies.heloc.repayPct', { kind: 'pct', label: 'Share of surplus used to repay', step: 5 })
    ]) : null,
    h('div', { class: 'callout warn' }, [
      h('b', {}, 'What it costs you. '),
      'The rate floats and the bank can reduce or freeze the line — that is exactly what happened to a lot of investors in 2008 and again in 2020. Interest is charged monthly against your cash flow, and the balance is subtracted from your net worth here, which many calculators quietly skip.'
    ])
  ]));

  /* --------------------------------------------------------- 1031 ------- */
  root.appendChild(panel('1031 exchange', 'Sell a smaller building and roll the whole pre-tax proceeds into a bigger one.', [
    stratToggle('strategies.exchange.enabled', 'Trade up using a 1031 exchange'),
    S.exchange.enabled ? h('div', { class: 'grid' }, [
      field('strategies.exchange.triggerType', { kind: 'select', label: 'Trigger on', rerender: true,
        options: [{ v: 'properties', t: 'Property count' }, { v: 'units', t: 'Unit count' },
                  { v: 'equity', t: 'Total equity' }] }),
      field('strategies.exchange.triggerValue', {
        kind: S.exchange.triggerType === 'equity' ? 'money' : 'num', label: 'Reaches',
        step: S.exchange.triggerType === 'equity' ? 25000 : 1 }),
      field('strategies.exchange.minGain', { kind: 'money', label: 'Minimum gain worth exchanging', step: 5000 }),
      field('strategies.exchange.sellCostPct', { kind: 'pct', label: 'Selling costs', step: 0.5,
        note: 'Commission dominates this and it is market-specific, especially after the 2024 NAR settlement. Pull real ND numbers rather than trusting the default.' }),
      field('strategies.exchange.targetPricePerUnit', { kind: 'money', label: 'Target $/unit', step: 5000 }),
      field('strategies.exchange.targetUnits', { kind: 'num', label: 'Target building size', step: 1 })
    ]) : null,
    h('div', { class: 'callout' }, [
      h('b', {}, 'It is a deferral, not a write-off. '),
      'The gain follows you into the replacement property as reduced basis, which means less depreciation for the rest of the hold. Defer long enough and you either keep exchanging forever or your heirs get a stepped-up basis — those are the two exits where the deferral becomes permanent.'
    ]),
    h('div', { class: 'callout warn' }, [
      h('b', {}, 'Three things this model enforces that most ignore. '),
      'Only the excess basis — the trade-up portion — starts a fresh 27.5-year clock and is eligible for bonus depreciation; the carryover portion keeps running the original schedule over its remaining life. Suspended passive losses do NOT release, because a deferred exchange is not a fully taxable disposition. And the 45-day identification and 180-day closing clocks both run from the earliest relinquished-property transfer, so staggered closings are dangerous.'
    ])
  ]));

  /* --------------------------------------------------- tax strategies --- */
  root.appendChild(panel('Cost segregation', 'Reclassify part of the building into 5-, 7- and 15-year property and deduct it immediately.', [
    stratToggle('strategies.costSeg.enabled', 'Run a cost segregation study on each purchase'),
    S.costSeg.enabled ? h('div', { class: 'grid' }, [
      field('strategies.costSeg.shortLifePct', { kind: 'pct', label: 'Share reclassified', step: 1,
        note: DATA_NOTES.costSegregation }),
      field('strategies.costSeg.bonusPct', { kind: 'pct', label: 'Bonus depreciation', step: 5,
        note: DATA_NOTES.bonusDepreciation }),
      field('strategies.costSeg.studyCost', { kind: 'money', label: 'Study cost', step: 250 }),
      field('strategies.costSeg.minPrice', { kind: 'money', label: 'Minimum price to bother', step: 25000 })
    ]) : null,
    h('div', { class: 'callout good' }, [
      h('b', {}, '100% bonus depreciation is back and permanent. '),
      'The One Big Beautiful Bill Act restored it for property acquired after 19 January 2025, so every purchase in this plan qualifies. The whole reclassified slice deducts in year one.'
    ]),
    h('div', { class: 'callout warn' }, [
      h('b', {}, 'But it is a timing and character trade, not free money. '),
      'It converts basis that would be recovered as Section 1250 property — recaptured at a capped 25% — into Section 1245 property, recaptured at ordinary rates up to 37%. You take the deduction now and repay it on sale at a worse rate. It wins on a long hold, or if you never sell. On a short hold it can be a wash or negative.'
    ]),
    h('div', { class: 'callout crit' }, [
      h('b', {}, 'And with a W-2 job it may do nothing at all. '),
      'The deduction creates a passive loss. Unless you have passive income, qualify for the $25,000 allowance, or hold Real Estate Professional Status, it suspends — and you have paid for a benefit you cannot use while permanently raising your recapture exposure. Set your status below before judging this one.'
    ]),
    src('Why the percentage is the weakest number here', DATA_NOTES.costSegregation)
  ]));

  root.appendChild(panel('Tax status', 'This single setting decides whether the tax strategies are worth anything.', [
    h('div', { class: 'grid' }, [
      field('setup.repsFromYear', { kind: 'num', label: 'REPS from year (blank = never)', step: 1,
        note: DATA_NOTES.reps }),
      field('setup.excessBusinessLossCap', { kind: 'money', label: 'Excess business loss cap', step: 10000,
        note: DATA_NOTES.excessBusinessLoss }),
      field('setup.annualW2Income', { kind: 'money', label: 'W-2 income',
        note: 'Drives the $25,000 passive allowance, which phases out between $100K and $150K.' })
    ]),
    h('div', { class: 'callout crit' }, [
      h('b', {}, 'The rule almost every model gets wrong: '),
      'qualifying for REPS in a later year does NOT release the losses you suspended before it. Under Section 469(f)(1) those old losses can only offset income from that same activity; anything left over stays passive until you have passive income or fully dispose of the property. This engine follows that rule, which is why switching REPS on late does less than you might expect.'
    ]),
    h('div', { class: 'callout warn' }, [
      h('b', {}, 'The 2026 excess business loss cap went DOWN, not up. '),
      '$256,000 single / $512,000 joint, from $313,000 / $626,000 in 2025, because the indexing base was reset. It binds only once you are past the passive rules, and the excess becomes an NOL carryforward limited to 80% of future income.'
    ]),
    RES.summary.suspendedLosses > 1000 ? h('div', { class: 'readout', style: 'margin-top:10px' }, [
      ro('Suspended passive losses', fmtMoney(RES.summary.suspendedLosses), 'bad'),
      ro('NOL carryforward', fmtMoney(RES.summary.nolCarry)),
      ro('Total tax paid', fmtMoney(RES.summary.totalTax))
    ]) : null
  ]));

  /* ------------------------------------------------ house-hack chaining -- */
  root.appendChild(panel('Repeat house-hacking', 'The most capital-efficient move available to you, and the one that costs the most in lifestyle.', [
    h('div', { class: 'grid' }, [
      field('rules.ownerOccupyCount', { kind: 'num', label: 'How many times you live in one', step: 1, min: 0,
        note: 'Each one needs 12 months of occupancy. FHA is generally one loan at a time, so the second and later ones use a conventional owner-occupied loan at a higher down payment.' }),
      field('rules.ownerOccupyGapMonths', { kind: 'num', label: 'Minimum months between moves', step: 1 }),
      field('rules.ownerOccupySubsequentDownPct', { kind: 'pct', label: 'Down payment after the first', step: 0.5 })
    ]),
    h('div', { class: 'callout' }, [
      h('b', {}, 'The arithmetic is brutal in its favor. '),
      'A 25%-down purchase on a $330K fourplex needs about $100K all-in. The same building owner-occupied at 5% needs about $27K. That is close to four purchases for the price of one — and capital, not deal quality, is what limits you.'
    ]),
    h('div', { class: 'callout warn' }, [
      h('b', {}, 'What it costs you. '),
      'You move house every year for as many years as you chain it, you live in a building you also manage, and one unit earns nothing while you are in it. Occupancy is a legal representation on the loan, not a formality.'
    ])
  ]));

  root.appendChild(panel('Rate buydown', null, [
    h('div', { class: 'grid' }, [
      field('strategies.buydownPoints', { kind: 'num', label: 'Discount points bought', step: 0.5, min: 0, max: 4,
        note: 'One point costs 1% of the loan and cuts the rate roughly a quarter point. Worth it only if you hold past the break-even, which is usually four to six years.' })
    ]),
    h('div', { class: 'callout' }, 'Points are cash at closing, which in this plan is the scarcest thing you have. The engine adds them to your cash-to-close, so you will see the acquisition date slip.')
  ]));

  /* =================================================== DEBT PAYDOWN ======= */
  root.appendChild(h('div', { class: 'callout', style: 'margin-top:22px' }, [
    h('b', {}, 'Below this line: retiring debt, and the cycle between paying off and borrowing again. ')
  ]));

  root.appendChild(panel('Debt paydown', 'Stop buying doors and start killing loans — then borrow against what you own free and clear.', [
    stratToggle('strategies.paydown.enabled', 'Throw surplus cash at principal',
      'Competes with acquisitions for the same money. The allocation setting decides which one wins.'),
    S.paydown.enabled ? h('div', {}, [
      h('div', { class: 'grid' }, [
        field('strategies.paydown.allocation', { kind: 'select', label: 'Who gets the cash first', rerender: true,
          options: [{ v: 'surplusAfterBuying', t: 'Buy first, pay down what is left' },
                    { v: 'pauseAcquisitions', t: 'Stop buying entirely, pay down' },
                    { v: 'splitPct', t: 'Split it' }],
          note: 'This is the actual decision. The other settings only tune it.' }),
        S.paydown.allocation === 'splitPct'
          ? field('strategies.paydown.splitPct', { kind: 'pct', label: 'Share to principal', step: 5 })
          : field('strategies.paydown.surplusPct', { kind: 'pct', label: 'Share of surplus used', step: 5 }),
        field('strategies.paydown.mode', { kind: 'select', label: 'Which loan first',
          options: [{ v: 'avalanche', t: 'Avalanche — highest rate' },
                    { v: 'snowball', t: 'Snowball — smallest balance' },
                    { v: 'highestPayment', t: 'Biggest payment' },
                    { v: 'lowestDSCR', t: 'Thinnest coverage' },
                    { v: 'worstCashFlow', t: 'Worst cash flow' },
                    { v: 'newest', t: 'Newest loan' },
                    { v: 'target', t: 'One specific property' }],
          rerender: true }),
        S.paydown.mode === 'target'
          ? field('strategies.paydown.targetSeq', { kind: 'num', label: 'Property number', step: 1, min: 1 })
          : null,
        field('strategies.paydown.startAfterProperties', { kind: 'num', label: 'Start after owning N', step: 1, min: 0,
          note: 'Build the portfolio first, then switch to retiring it. This is usually where the interesting answers are.' }),
        field('strategies.paydown.monthlyExtra', { kind: 'money', label: 'Fixed monthly extra', step: 100,
          note: 'Paid regardless of surplus.' }),
        field('strategies.paydown.stopAfterFreeAndClear', { kind: 'num', label: 'Stop after N are paid off', step: 1 }),
        field('strategies.paydown.keepMonthsBuffer', { kind: 'num', label: 'Extra buffer (months)', step: 1 })
      ]),
      h('div', { class: 'grid' }, [
        field('strategies.paydown.recast', { kind: 'check', label: 'Recast after each lump sum', rerender: true,
          note: DATA_NOTES.recast }),
        S.paydown.recast ? field('strategies.paydown.recastFee', { kind: 'money', label: 'Recast fee', step: 50 }) : null,
        S.paydown.recast ? field('strategies.paydown.recastMinPrincipal', { kind: 'money', label: 'Minimum lump sum to recast', step: 1000 }) : null,
        field('strategies.paydown.skipOwnerOccupied', { kind: 'check', label: 'Leave the one you live in alone' })
      ])
    ]) : null,
    h('div', { class: 'callout crit' }, [
      h('b', {}, 'The one thing to understand before switching this on. '),
      'Extra principal without a recast shortens the term but does NOT lower the payment. ' +
      'You get no extra monthly income at all until the loan is fully retired — every dollar ' +
      'is locked in the wall. The recast is what converts a lump sum into cash flow, and not ' +
      'every servicer allows one. FHA generally does not.'
    ]),
    h('div', { class: 'callout warn' }, [
      h('b', {}, 'And it is a worse trade than it feels. '),
      'Retiring a 6.95% mortgage is a guaranteed 6.95% return — and a tax-inefficient one, ' +
      'because you give up the interest deduction. A purchase is a leveraged, uncertain return ' +
      'that also buys appreciation and depreciation on the whole asset. In nearly every run here ' +
      'buying wins on net worth. Paying down wins on cash flow, and on surviving the month that ' +
      'ends an over-levered plan.'
    ]),
    RES.summary && RES.rows[RES.rows.length - 1].extraPrincipalTotal > 0
      ? h('div', { class: 'readout', style: 'margin-top:10px' }, [
          ro('Extra principal paid', fmtMoney(RES.rows[RES.rows.length - 1].extraPrincipalTotal)),
          ro('Properties free and clear', String(RES.rows[RES.rows.length - 1].freeAndClearCount), 'good'),
          ro('Monthly relief from recasts', fmtDollars(RES.rows[RES.rows.length - 1].recastRelief))
        ]) : null,
    src('Why the arithmetic favours buying and the risk favours paying down', DATA_NOTES.paydownVsBuy)
  ]));

  root.appendChild(panel('Rate-and-term refinance', 'No cash out. Same balance, cheaper rate, when rates fall.', [
    stratToggle('strategies.rateRefi.enabled', 'Refinance when the rate drops enough to pay for itself'),
    S.rateRefi.enabled ? h('div', { class: 'grid' }, [
      field('strategies.rateRefi.dropBps', { kind: 'num', label: 'Drop required (basis points)', step: 25 }),
      field('strategies.rateRefi.costPct', { kind: 'pct', label: 'Refinance cost', step: 0.25 }),
      field('strategies.rateRefi.minMonthsOwned', { kind: 'num', label: 'Minimum months owned', step: 1 }),
      field('strategies.rateRefi.maxPerProperty', { kind: 'num', label: 'Max per property', step: 1 }),
      field('strategies.rateRefi.resetTerm', { kind: 'check', label: 'Reset to a fresh 30-year term',
        note: 'Off is almost always right. Resetting the term restarts amortization, which is the hidden cost in most refinances — a lower payment that buys back years of interest.' })
    ]) : null,
    h('div', { class: 'callout warn' }, [
      h('b', {}, 'This fires off the rate path on the Setup tab and nothing else. '),
      'The shipped path falls only 65 basis points between 2026 and 2030, so at the default ' +
      'trigger it fires once, late. It is a bet on rates, not a lever you control. Set the path ' +
      'honestly before reading anything into the result.'
    ])
  ]));

  /* ============================================= OPPORTUNISM + GUARDRAILS = */
  root.appendChild(panel('Opportunity fund', 'Dry powder held back from the buy test, so you are liquid in the month everyone else is not.', [
    stratToggle('strategies.opportunityFund.enabled', 'Hold cash back for a downturn'),
    S.opportunityFund.enabled ? h('div', { class: 'grid' }, [
      field('strategies.opportunityFund.targetDollars', { kind: 'money', label: 'Target fund size', step: 5000 }),
      field('strategies.opportunityFund.fillPct', { kind: 'pct', label: 'Share of surplus diverted', step: 5 }),
      field('strategies.opportunityFund.deployOn', { kind: 'select', label: 'Release when',
        options: [{ v: 'recession', t: 'A downturn starts' }, { v: 'always', t: 'Immediately (control case)' }] }),
      field('strategies.opportunityFund.releaseAfterMonths', { kind: 'num', label: 'Release anyway after N months', step: 6,
        note: 'A dry-powder strategy with no release date is just cash sitting still.' })
    ]) : null,
    h('div', { class: 'callout warn' }, [
      h('b', {}, 'In this engine it usually loses money, and that is the finding. '),
      'Every month the cash sits idle is a month it is not compounding in a building. It pays off ' +
      'only if the downturn actually arrives and actually discounts prices — so switch on a ' +
      'recession under Stress and set a real discount below, or you are testing nothing.'
    ])
  ]));

  root.appendChild(panel('Counter-cyclical buying', 'What happens to asking prices in the modeled downturn, and whether you lean in or step back.', [
    stratToggle('strategies.counterCyclical.enabled', 'Model a price discount in a recession', 'Needs a recession switched on under Stress.'),
    S.counterCyclical.enabled ? h('div', { class: 'grid' }, [
      field('strategies.counterCyclical.recessionPriceDiscount', { kind: 'pct', label: 'Asking prices fall by', step: 1 }),
      field('strategies.counterCyclical.relaxDSCRInRecession', { kind: 'num', label: 'DSCR floor relaxed by', step: 0.05 }),
      field('strategies.counterCyclical.pauseInRecession', { kind: 'check', label: 'Step back instead — stop buying while it lasts',
        note: 'The opposite strategy. Run it both ways; the gap between them is the value of nerve.' })
    ]) : null,
    h('div', { class: 'callout' }, [
      h('b', {}, 'Lenders tighten in exactly the months prices fall. '),
      'The discount is real and so is the credit box closing around it. Relaxing the DSCR floor ' +
      'models a world where you can still borrow; leaving it alone models the one where you cannot.'
    ])
  ]));

  root.appendChild(panel('Portfolio guardrails', 'Floors applied to the whole portfolio after a purchase — not to the deal on its own.', [
    field('rules.guardrails.enabled', { kind: 'check', label: 'Enforce portfolio floors', rerender: true,
      hint: 'On by default, and switchable off here.' }),
    CFG.rules.guardrails.enabled ? h('div', { class: 'grid' }, [
      field('rules.guardrails.minMonthlyCashFlow', { kind: 'money', label: 'Minimum portfolio cash flow', step: 250 }),
      field('rules.guardrails.minPortfolioDSCR', { kind: 'num', label: 'Minimum portfolio coverage', step: 0.05 }),
      field('rules.guardrails.maxPortfolioLTV', { kind: 'pct', label: 'Maximum portfolio leverage', step: 1 }),
      field('rules.guardrails.minMonthsExpensesInCash', { kind: 'num', label: 'Months of expenses left in cash', step: 1 })
    ]) : null,
    h('div', { class: 'callout crit' }, [
      h('b', {}, 'These ship at ruin-avoidance levels, not prudence levels, on purpose. '),
      'Set to sensible-sounding numbers they delete most of a Fargo plan. Your current run bottoms ' +
      'out at a ' + portfolioWorstDSCR().toFixed(2) + ' portfolio coverage ratio and peaks at ' +
      (portfolioPeakLTV() * 100).toFixed(0) + '% leverage — because a 3.5%-down FHA house-hack is, ' +
      'by construction, a 98% LTV purchase. Tighten these and re-run to find where your plan ' +
      'actually stops.'
    ]),
    src('Why a portfolio floor is not a deal floor', DATA_NOTES.guardrails)
  ]));

  root.appendChild(panel('Deal hurdle rate', 'A quality bar of your own, above whatever a lender will allow.', [
    field('rules.hurdle.enabled', { kind: 'check', label: 'Refuse deals below my own bar', rerender: true }),
    CFG.rules.hurdle.enabled ? h('div', { class: 'grid' }, [
      field('rules.hurdle.minCoC', { kind: 'pct', label: 'Minimum cash-on-cash', step: 0.5 }),
      field('rules.hurdle.minCapRate', { kind: 'pct', label: 'Minimum cap rate', step: 0.25 }),
      field('rules.hurdle.minCashFlowPerUnit', { kind: 'money', label: 'Minimum cash flow per unit', step: 25 }),
      field('rules.hurdle.ignoreWhileOwnerOccupying', { kind: 'check', label: 'Exempt the one you live in',
        note: 'A live-in purchase is never going to clear an investment hurdle — one unit earns nothing and you are at 3.5% down.' })
    ]) : null,
    h('div', { class: 'callout warn' }, [
      h('b', {}, 'Switch this on and watch how little qualifies. '),
      'That is not a bug in the hurdle. It is the Fargo small-multifamily market at 2026 prices and ' +
      'rates, seen without a lender’s permission standing in for an investment thesis.'
    ])
  ]));

  /* ============================================ INCOME AND FINANCING ====== */
  root.appendChild(panel('RUBS — bill utilities back to tenants', 'The largest controllable expense on pre-1970 Fargo stock.', [
    stratToggle('strategies.rubs.enabled', 'Convert owner-paid utilities to tenant-billed'),
    S.rubs.enabled ? h('div', { class: 'grid' }, [
      field('strategies.rubs.recoveryPct', { kind: 'pct', label: 'Share of the bill recovered', step: 5 }),
      field('strategies.rubs.setupCostPerUnit', { kind: 'money', label: 'Setup cost per unit', step: 25 }),
      field('strategies.rubs.monthsAfterPurchase', { kind: 'num', label: 'Months after closing', step: 1,
        note: 'It cannot be imposed mid-lease, so it starts at renewal, not at the closing table.' }),
      field('strategies.rubs.rentOffsetPct', { kind: 'pct', label: 'Rent given back as resistance', step: 1,
        note: 'The effective rent rises, so a unit priced at market before RUBS is above market after it. Set this above zero if you want an honest answer.' })
    ]) : null,
    src('What RUBS is, and what North Dakota allows', DATA_NOTES.rubs)
  ]));

  root.appendChild(panel('Ancillary income', 'Laundry, storage, parking, pet rent, admin fees. Small, real, nearly all margin.', [
    stratToggle('strategies.ancillary.enabled', 'Add ancillary income streams'),
    S.ancillary.enabled ? h('div', { class: 'grid' }, [
      field('strategies.ancillary.laundryPerUnit', { kind: 'money', label: 'Laundry $/unit/mo', step: 2 }),
      field('strategies.ancillary.storagePerUnit', { kind: 'money', label: 'Storage $/unit/mo', step: 2 }),
      field('strategies.ancillary.parkingPerUnit', { kind: 'money', label: 'Parking $/unit/mo', step: 5 }),
      field('strategies.ancillary.petRentPerUnit', { kind: 'money', label: 'Pet rent $/unit/mo', step: 5 }),
      field('strategies.ancillary.adminFeesPerUnit', { kind: 'money', label: 'Admin fees $/unit/mo', step: 1 })
    ]) : null,
    h('div', { class: 'callout' }, [
      h('b', {}, 'Parking is the Fargo-specific one. '),
      'A garage stall or plug-in in a -20°F winter is worth real money, and unlike laundry it has ' +
      'no equipment to maintain. Two of the sold comps already run coin-op laundry; check before ' +
      'counting it twice.'
    ])
  ]));

  root.appendChild(panel('Property tax appeal', 'Aimed at the post-sale reassessment, which is when the assessor marks you to your own purchase price.', [
    stratToggle('strategies.taxAppeal.enabled', 'Appeal the assessment after buying'),
    S.taxAppeal.enabled ? h('div', { class: 'grid' }, [
      field('strategies.taxAppeal.reductionPct', { kind: 'pct', label: 'Reduction won', step: 1 }),
      field('strategies.taxAppeal.cost', { kind: 'money', label: 'Cost to pursue', step: 100 }),
      field('strategies.taxAppeal.monthsAfterPurchase', { kind: 'num', label: 'Months after closing', step: 1 })
    ]) : null,
    h('div', { class: 'callout' }, [
      h('b', {}, 'It compounds, which is why it is worth more than it looks. '),
      'The reduction lands in the base the assessor grows from every year afterwards, so a one-time ' +
      '8% win is an 8% saving for the whole hold. Note that the reduction here is an assumption ' +
      'you should set from real outcomes, not a modeled probability.'
    ])
  ]));

  root.appendChild(panel('Seller financing', 'The seller carries the paper. No bank, no DSCR gate, no conventional loan slot consumed.', [
    stratToggle('strategies.sellerFinance.enabled', 'Pursue seller-financed purchases'),
    S.sellerFinance.enabled ? h('div', { class: 'grid' }, [
      field('strategies.sellerFinance.downPct', { kind: 'pct', label: 'Down payment', step: 1 }),
      field('strategies.sellerFinance.rate', { kind: 'pct', label: 'Rate', step: 0.25 }),
      field('strategies.sellerFinance.amortYears', { kind: 'num', label: 'Amortization (years)', step: 5 }),
      field('strategies.sellerFinance.balloonYears', { kind: 'num', label: 'Balloon (years)', step: 1,
        note: 'Almost every seller-carried note balloons. That date is the real risk in this strategy — you must refinance or sell by then, on whatever terms exist that year.' }),
      field('strategies.sellerFinance.availabilityPct', { kind: 'pct', label: 'Share of sellers who would carry', step: 5,
        note: 'An assumption, not a measurement. Set it per property on the Properties tab if you know which sellers are candidates.' }),
      field('strategies.sellerFinance.closingCostPct', { kind: 'pct', label: 'Closing costs', step: 0.25 })
    ]) : null,
    h('div', { class: 'callout good' }, [
      h('b', {}, 'This is the largest single lever in the model. '),
      'Twelve percent down instead of twenty-five, no underwriter to satisfy, and none of your ' +
      'ten conventional slots used. Capital is what limits this plan, and seller financing attacks ' +
      'capital directly.'
    ]),
    h('div', { class: 'callout warn' }, [
      h('b', {}, 'And the balloon is not a detail. '),
      'A seven-year note means that in year seven you refinance at whatever rates exist then, or ' +
      'sell, or default. Run a rate shock under Stress with this on before believing the result. ' +
      'The engine will not combine seller financing with a live-in purchase, because the ' +
      'Dodd-Frank seller-financing exclusions reach owner-occupied residential.'
    ]),
    src('When a seller will actually carry paper, and the law around it', DATA_NOTES.sellerFinance)
  ]));

  root.appendChild(panel('Loan assumption', 'Take over a seller’s existing below-market FHA or VA loan.', [
    stratToggle('strategies.assumable.enabled', 'Assume an existing loan where one is entered'),
    S.assumable.enabled ? h('div', { class: 'grid' }, [
      field('strategies.assumable.assumptionFee', { kind: 'money', label: 'Assumption fee', step: 100 }),
      field('strategies.assumable.maxEquityGap', { kind: 'money', label: 'Most equity you would cover', step: 10000 })
    ]) : null,
    h('div', { class: 'callout warn' }, [
      h('b', {}, 'The equity gap is what kills it, almost every time. '),
      'A 2021 FHA loan at 3% is worth a fortune — but you must hand the seller the entire ' +
      'difference between price and balance in cash. On a $300K purchase with a $210K balance ' +
      'that is $90,000, well above the down payment you were trying to avoid. Enter the balance ' +
      'and rate on the Properties tab; only FHA, VA and USDA loans are assumable at all.'
    ]),
    src('Assumption mechanics and why sellers resist', DATA_NOTES.assumable)
  ]));

  root.appendChild(panel('Amortization and interest-only', 'How the loan is shaped, before anything else about it.', [
    h('div', { class: 'grid' }, [
      field('strategies.amortChoice.investmentYears', { kind: 'num', label: 'Investment loan term', step: 5 }),
      field('strategies.amortChoice.commercialYears', { kind: 'num', label: 'Commercial amortization', step: 5 }),
      field('strategies.amortChoice.interestOnlyYears', { kind: 'num', label: 'Interest-only years', step: 1, min: 0, max: 15,
        note: DATA_NOTES.interestOnly })
    ]),
    h('div', { class: 'callout crit' }, [
      h('b', {}, 'Interest-only is a loan against your future self. '),
      'Cash flow rises immediately and equity stops building entirely. When the interest-only ' +
      'period ends the same balance re-amortizes over a SHORTER remaining term, so the new payment ' +
      'is higher than a fully amortizing loan would have been from day one — usually by a quarter ' +
      'to a third. The engine prices that step-up and puts it on the timeline the month it lands.'
    ])
  ]));

  /* ------------------------------------------------------ stack ranking -- */
  root.appendChild(panel('Which of these actually helps', 'Runs your current plan with each strategy alone, then all of them together.', [
    h('div', { class: 'btn-row' }, [
      h('button', { class: 'btn primary', type: 'button', onclick: runStack }, 'Rank the strategies'),
      h('span', { class: 'panel-note' }, 'Runs about thirty simulations. A second or two.')
    ]),
    h('div', { id: 'stack-out', style: 'margin-top:12px' })
  ]));
}

function runStack() {
  var out = clear($('stack-out'));
  out.appendChild(h('div', { class: 'empty' }, 'Running…'));
  setTimeout(function () {
    var base = JSON.parse(JSON.stringify(CFG));
    base.strategies = { cashOutRefi: { enabled: false }, heloc: { enabled: false },
                        exchange: { enabled: false }, costSeg: { enabled: false }, buydownPoints: 0 };
    base.strategies = Object.assign(defaultConfig().strategies, {});
    base.setup.repsFromYear = null;
    base.rules.ownerOccupyCount = 1;
    var b;
    try { b = runSimulation(base); }
    catch (e) { clear(out).appendChild(h('div', { class: 'callout crit' }, 'Could not run: ' + e.message)); return; }

    function allModes(c, m) {
      c.properties.forEach(function (x) { x.rentalStrategy = m; });
      Object.keys(c.archetypes).forEach(function (k) { c.archetypes[k].rentalStrategy = m; });
    }

    var variants = [
      ['Cash-out refinancing', function (c) { c.strategies.cashOutRefi.enabled = true; }],
      ['HELOC line', function (c) { c.strategies.heloc.enabled = true; }],
      ['1031 exchange', function (c) { c.strategies.exchange.enabled = true; }],
      ['Cost segregation (W-2)', function (c) { c.strategies.costSeg.enabled = true; }],
      ['Cost segregation + REPS', function (c) {
        c.strategies.costSeg.enabled = true;
        c.setup.repsFromYear = parseMonth(c.setup.startMonth).y; }],
      ['House-hack x3', function (c) { c.rules.ownerOccupyCount = 3; }],
      ['House-hack x4', function (c) { c.rules.ownerOccupyCount = 4; }],
      ['Buy 2 points', function (c) { c.strategies.buydownPoints = 2; }],

      ['Seller financing', function (c) { c.strategies.sellerFinance.enabled = true; }],
      ['Seller financing (all sellers)', function (c) {
        c.strategies.sellerFinance.enabled = true;
        c.strategies.sellerFinance.availabilityPct = 1; }],
      ['Pay down debt (surplus)', function (c) { c.strategies.paydown.enabled = true; }],
      ['Pay down after 3 buys', function (c) {
        c.strategies.paydown.enabled = true;
        c.strategies.paydown.startAfterProperties = 3; }],
      ['Pay down, no recast', function (c) {
        c.strategies.paydown.enabled = true;
        c.strategies.paydown.startAfterProperties = 3;
        c.strategies.paydown.recast = false; }],
      ['Stop buying, pay off', function (c) {
        c.strategies.paydown.enabled = true;
        c.strategies.paydown.allocation = 'pauseAcquisitions';
        c.strategies.paydown.startAfterProperties = 3; }],
      ['Pay off then HELOC to buy', function (c) {
        c.strategies.paydown.enabled = true;
        c.strategies.paydown.startAfterProperties = 3;
        c.strategies.paydown.stopAfterFreeAndClear = 2;
        c.strategies.heloc.enabled = true; }],
      ['Rate-and-term refinancing', function (c) { c.strategies.rateRefi.enabled = true; }],
      ['RUBS', function (c) { c.strategies.rubs.enabled = true; }],
      ['Ancillary income', function (c) { c.strategies.ancillary.enabled = true; }],
      ['Property tax appeal', function (c) { c.strategies.taxAppeal.enabled = true; }],
      ['RUBS + ancillary + appeal', function (c) {
        c.strategies.rubs.enabled = true; c.strategies.ancillary.enabled = true;
        c.strategies.taxAppeal.enabled = true; }],
      ['Interest-only 10 years', function (c) { c.strategies.amortChoice.interestOnlyYears = 10; }],
      ['Mid-term furnished', function (c) { allModes(c, 'mtr'); }],
      ['By the room', function (c) { allModes(c, 'byroom'); }],
      ['Short-term nightly', function (c) { allModes(c, 'str'); }],
      ['Short-term + cost seg', function (c) {
        allModes(c, 'str'); c.strategies.costSeg.enabled = true; }],
      ['Opportunity fund', function (c) { c.strategies.opportunityFund.enabled = true; }],
      ['Deal hurdle rate on', function (c) { c.rules.hurdle.enabled = true; }],

      ['Everything at once', function (c) {
        c.strategies.cashOutRefi.enabled = true; c.strategies.heloc.enabled = true;
        c.strategies.exchange.enabled = true; c.strategies.costSeg.enabled = true;
        c.rules.ownerOccupyCount = 3;
        c.setup.repsFromYear = parseMonth(c.setup.startMonth).y + 3; }],
      ['Everything, incl. the new levers', function (c) {
        c.strategies.cashOutRefi.enabled = true; c.strategies.heloc.enabled = true;
        c.strategies.exchange.enabled = true; c.strategies.costSeg.enabled = true;
        c.strategies.sellerFinance.enabled = true; c.strategies.rateRefi.enabled = true;
        c.strategies.rubs.enabled = true; c.strategies.ancillary.enabled = true;
        c.strategies.taxAppeal.enabled = true;
        c.rules.ownerOccupyCount = 3;
        c.setup.repsFromYear = parseMonth(c.setup.startMonth).y + 3; }],
      ['The cash-flow build', function (c) {
        c.strategies.rubs.enabled = true; c.strategies.ancillary.enabled = true;
        c.strategies.taxAppeal.enabled = true; c.strategies.sellerFinance.enabled = true;
        c.rules.ownerOccupyCount = 3;
        c.strategies.paydown.enabled = true;
        c.strategies.paydown.startAfterProperties = 4; }]
    ];

    var rows = variants.map(function (v) {
      var c = JSON.parse(JSON.stringify(base));
      v[1](c);
      var r;
      try { r = runSimulation(c); } catch (e) { return null; }
      var L = r.rows[r.rows.length - 1];
      var avg = 0; for (var i = Math.max(0, r.rows.length - 12); i < r.rows.length; i++) avg += r.rows[i].cashFlow;
      avg /= Math.min(12, r.rows.length);
      return { name: v[0], res: r, last: L, avgCF: avg };
    }).filter(Boolean);

    var bL = b.rows[b.rows.length - 1];
    var bAvg = 0; for (var i = Math.max(0, b.rows.length - 12); i < b.rows.length; i++) bAvg += b.rows[i].cashFlow;
    bAvg /= Math.min(12, b.rows.length);

    rows.sort(function (x, y) { return y.last.netWorth - x.last.netWorth; });

    clear(out);
    out.appendChild(h('div', { class: 'tablewrap' }, h('table', {}, [
      h('thead', {}, h('tr', {}, ['Strategy', 'Buys', 'Units', 'Cash flow', '$/unit', 'Debt', 'Net worth', 'vs baseline']
        .map(function (c) { return h('th', {}, c); }))),
      h('tbody', {}, [h('tr', {}, [
        h('td', {}, h('b', {}, 'Baseline — nothing on')),
        h('td', { class: 'n' }, String(b.acquisitions.length)),
        h('td', { class: 'n' }, String(bL.units)),
        h('td', { class: 'n' }, fmtDollars(bAvg)),
        h('td', { class: 'n' }, fmtDollars(bAvg / Math.max(1, bL.units))),
        h('td', { class: 'n' }, fmtMoney(bL.debt)),
        h('td', { class: 'n' }, fmtMoney(bL.netWorth)),
        h('td', { class: 'n' }, '—')
      ])].concat(rows.map(function (x) {
        var d = x.last.netWorth - bL.netWorth;
        var cfDown = x.avgCF < bAvg - 200;
        return h('tr', {}, [
          h('td', {}, x.name),
          h('td', { class: 'n' }, String(x.res.acquisitions.length)),
          h('td', { class: 'n' }, String(x.last.units)),
          h('td', { class: 'n', style: cfDown ? 'color:var(--crit-ink)' : '' }, fmtDollars(x.avgCF)),
          h('td', { class: 'n' }, fmtDollars(x.avgCF / Math.max(1, x.last.units))),
          h('td', { class: 'n' }, fmtMoney(x.last.debt)),
          h('td', { class: 'n' }, fmtMoney(x.last.netWorth)),
          h('td', { class: 'n', style: 'color:' + (d < 0 ? 'var(--crit-ink)' : 'var(--good-ink)') },
            (d >= 0 ? '+' : '') + fmtMoney(d))
        ]);
      })))
    ])));

    var best = rows[0];
    var cfLosers = rows.filter(function (x) { return x.avgCF < bAvg - 200; });
    out.appendChild(h('div', { class: 'callout', style: 'margin-top:11px' }, [
      h('b', {}, 'Biggest net worth gain: ' + best.name + ' '),
      '(' + fmtMoney(best.last.netWorth - bL.netWorth) + ' over baseline). ',
      'Cash flow is a twelve-month average, not a single month, so a purchase or a management change in the final month does not distort it.'
    ]));
    if (cfLosers.length) {
      out.appendChild(h('div', { class: 'callout warn' }, [
        h('b', {}, 'More is not better. '),
        cfLosers.length + ' of these grow net worth while shrinking cash flow: ' +
        cfLosers.map(function (x) { return x.name; }).join(', ') +
        '. That is leverage working exactly as designed — more assets, thinner coverage. Run the resilience check on any of them before treating it as your plan.'
      ]));
    }
  }, 30);
}

