/* ============================================================================
   REFERENCE DATA — tax law tables, lender rules and provenance notes.
   Property and market observations live in data/property-data.json (injected
   as FPE.RAW_DATA). Every number an interface shows is either in this file,
   in that data file, or computed by the engine: prose never carries its own.
   ========================================================================== */
(function (FPE) {
  'use strict';

  /* ------------------------------------------------------------- tax law
     2026 values. Sources: IRS Rev. Proc. 2025-32 (brackets, standard
     deduction, capital-gain breakpoints — single verified against three
     independent tables); OBBBA P.L. 119-21 §70105 (QBI permanent at 20%,
     phase-in widened to $75K/$150K); §461(l) 2026 amounts; §469(i) allowance
     (never indexed since 1986); §1411 NIIT thresholds (statutory, not
     indexed); N.D.C.C. 57-38 (ND brackets, 40% LTCG exclusion).
     MFJ figures and the ND MFJ brackets are carried from the same releases but
     were not independently re-verified — flagged in NOTES.taxTables.          */
  var TAX = {
    baseYear: 2026,
    federal: {
      single: { std: 16100, brackets: [[12400, 0.10], [50400, 0.12], [105700, 0.22], [201775, 0.24],
                                        [256225, 0.32], [640600, 0.35], [Infinity, 0.37]],
                ltcg: [[49450, 0], [545500, 0.15], [Infinity, 0.20]] },
      mfj:    { std: 32200, brackets: [[24800, 0.10], [100800, 0.12], [211400, 0.22], [403550, 0.24],
                                        [512450, 0.32], [768700, 0.35], [Infinity, 0.37]],
                ltcg: [[98900, 0], [613700, 0.15], [Infinity, 0.20]] }
    },
    nd: {
      single: [[49575, 0], [250400, 0.0195], [Infinity, 0.025]],
      mfj:    [[82850, 0], [304950, 0.0195], [Infinity, 0.025]],
      ltcgExclusion: 0.40
    },
    niit: { rate: 0.038, single: 200000, mfj: 250000 },
    qbi: { rate: 0.20, single: { threshold: 201750, range: 75000 }, mfj: { threshold: 403500, range: 150000 },
           ubiaPct: 0.025, safeHarborHours: 250 },
    ebl: { single: 256000, mfj: 512000 },
    passive: { allowance: 25000, phaseStart: 100000, phaseEnd: 150000 },
    unrecaptured1250Max: 0.25,
    fica: 0.0765,
    reps: { hours: 750 }
  };

  /* ------------------------------------------------------ lender rules
     What the reserves and product rules are, in one place. */
  var LENDER = {
    fannieOtherReserves: [[4, 0.02], [6, 0.04], [10, 0.06]],   // financed count -> % of other UPB
    fhaLoanLimits2026: { 1: 541287, 2: 693050, 3: 837700, 4: 1041125 },
    dscrPrepayRateAdd: { 0: 0.0075, 3: 0.0025, 5: 0 },
    creditTierRateAdd: { excellent: -0.00125, good: 0, fair: 0.00375 }
  };

  /* ------------------------------------------------ provenance notes
     Keyed text the field registry points at. Corrections made in the
     September 2026 audit are stated inside the note, so they cannot be
     quietly reverted.                                                    */
  var NOTES = {
    propTaxResidential: 'Fargo total mill levy 298.43 (2025) × 4.5% taxable ratio = 1.343% of market value. Cross-checked against Ownwell median effective rate of 1.34%. HIGH confidence.',
    propTaxCommercial: 'North Dakota classifies buildings with FOUR OR MORE units as commercial (not 5+ as in most states): 5.0% taxable ratio × 298.43 mills = 1.492%. Source: ND Tax Commissioner, Property Valuation Concepts. VERIFIED.',
    assessment: 'Fargo reappraises every parcel each 1 February to true and full value, and must keep assessments within 90–100% of sale prices (City of Fargo, VERIFIED). A sale does not itself trigger a reassessment — the September 2026 audit corrected that. Across the seven sold comps assessed value ran about 93% of price. The engine treats the stated bill as a floor: it grows with value and is never cut automatically; cuts come only from the appeal strategy.',
    levyCap: 'HB 1176 (2025) caps annual LEVY increases for taxing districts at 3% without a vote. It does not cap your individual bill — an earlier version of this engine applied it per property, which was wrong.',
    specialAssessments: 'GUESS. Fargo funds part of street and utility reconstruction by special assessment, billed on the tax statement outside the mill levy; the 2026 policy funds roughly 20% of reconstruction this way with caps rising 7.19% a year through 2027 (City of Fargo). Amounts vary parcel by parcel. Some listing tax figures may already include specials. Pull the parcel statement before committing.',
    insurance: 'ND residential property insurance rose 14% in 2024–25 and is projected +26% from 2025 to 2028 (ND Insurance Commissioner at the APCIA roundtable, 21 Sept 2026 — VERIFIED; blended across residential, commercial and multifamily). That is ~8%/yr through 2028. Beyond 2028 the engine reverts to 4%/yr — an ESTIMATE, not a projection; extrapolating the 3-year figure for 15 years triples premiums.',
    vacancy: 'Fargo apartment vacancy: 3.1% (June 2024, Appraisal Services), 6.2% (Q2 2025, F-M metro), ~5.8% (2026 CRE report). Fargo went from 2.2% to 10.2% between 2013 and 2018 on new supply. In this engine vacancy is normally an OUTPUT of turnover × downtime plus credit loss, not a single input.',
    rentGrowth: 'Sources span 1.2% (ApartmentList) to 5.7% (Zumper) YoY; ApartmentList shows Fargo up 2.0% through Aug 2026 vs 7.2% a year earlier. 3.0% is the defensible middle. ESTIMATE.',
    priceIndex: 'Building values and future purchase prices follow one index: market rents divided by a cap-rate path. With no cap-rate drift, prices grow with rents (~3%/yr). FHFA Fargo MSA appreciation was 3.89%/yr over 20 years, a period of falling rates and compressing cap rates; the drift setting is where you express a view on that.',
    rates: 'September 2026. FHA 6.87% (lender sheets). Conventional investment 2–4 unit at 25% down 7.58–8.08% (lender sheets; 7.60% used). DSCR 6.125–7.375% by tier, typically 7.0–7.5% for a 680–720 FICO at 20–25% down, plus 0.125–0.25% for 2–4 units (vendor rate pages) — 7.35% used with a 5-year prepayment penalty. DSCR does NOT price below agency: the September 2026 audit corrected an earlier claim. Conventional owner-occupied and commercial are ESTIMATES. Rates are held flat by default — no forecast is built in.',
    rateRandom: 'Uncertainty layer only: a mean-reverting random walk shared by every product, so a rate shock reaches refinances, balloons and the HELOC together.',
    commercial: 'A 5–8 unit does not qualify for agency small-balance programs (those start around $2M). It is a local bank portfolio loan: ~7.25%, 20–25 year amortization, 5-year balloon, 75% LTV, recourse. EXTRAPOLATED — confirm with Bell Bank, Gate City, Bremer or Choice Bank.',
    fha: 'FHA: 3.5% down, 1.75% upfront MIP financed, 0.55%/yr annual MIP for the life of the loan when down payment is under 10%. One FHA loan at a time. For 3–4 units the SELF-SUFFICIENCY test applies: 75% of the appraiser\'s market rent for ALL units (yours included) must cover the full payment (HUD 4000.1). FHA loans cannot be recast. The 2026 Cass County loan limits in the engine are ESTIMATES carried from the conforming-limit ratio, not re-verified against HUD\'s published table — check before relying on a 4-unit FHA purchase near the limit.',
    convOO: 'Fannie Mae allows 5% down on an owner-occupied 2–4 unit (since Nov 2023). PMI ends automatically at 78% of original value. Qualification is debt-to-income, not DSCR. Counts toward the 10 financed properties.',
    convInv: 'Fannie Mae 2–4 unit investment purchase: 25% down; approval by debt-to-income using 75% of lease or appraised rent (B3-3.1-08); reserves of 6 months on the subject plus 2%/4%/6% of the unpaid balance of other financed properties for 1–4/5–6/7–10 financed (B3-4.1-01, VERIFIED); maximum 10 financed properties including your home.',
    dscr: 'DSCR (non-QM): approval by GROSS rent ÷ PITIA, typically ≥ 1.0. For a leased unit most lenders use the LESSER of the lease and the appraiser\'s market rent; vacant units use market rent (vendor lender guides). The September 2026 audit corrected an earlier version that used the GREATER of the two on an NOI basis. 75–80% LTV, reserves 2–6 months, 5-4-3-2-1 prepayment penalty standard (no penalty costs ~+0.75% in rate). No limit on property count; can close in an LLC.',
    dti: 'Debt-to-income: total monthly debts (including the new and existing mortgages, net of 75% of rent) ÷ gross monthly income. Conventional ≤ 45% (up to 50% with automated approval); FHA up to ~50%. Only checked when a W-2 is entered. After quitting, lenders generally want two years of rental income on tax returns before counting it.',
    reserves: 'Lender reserves are liquid assets left AFTER closing. Parked cash counts at a factor that depends on where it sits: cash and money market in full, brokerage accounts at 70% (common haircut), precious metals not at all.',
    balloon: 'At each balloon date the engine tries to refinance at that year\'s rate, value and coverage. If the new loan falls short of the balance, the gap must come from cash; if cash cannot cover it, the property is sold (or the loan extended at a penalty rate, if you choose). Every earlier version assumed balloons always refinance.',
    turnover: 'ESTIMATES. National apartment turnover runs ~45–50% a year; long-tenured below-market tenants in small Fargo buildings move less, but move more when pushed. A sitting tenant\'s rent is raised at renewal by your renewal policy; when a tenant leaves the unit sits empty (longer in winter), costs a basic turn, optionally gets a refresh, and re-lets at market rent for its condition. This replaces the old free 12–18 month ramp, on which the September 2026 audit found the whole plan depended.',
    asIsFactor: 'ESTIMATE. Survey rents measure professionally managed, updated complexes. An unrenovated unit in older stock achieves less — 90% of survey is the default. A refresh brings it to full survey rent.',
    maintenance: 'ESTIMATE. Routine repairs as a share of rent, rising with building age. Turnover costs, refreshes and big-ticket components are modelled separately, so this is lower than the 8% all-in figure used before.',
    capexReserve: 'A reserve account for roofs, furnaces and the like: funded from rent until it reaches a target per unit, then contributions stop. Earlier versions accrued 8% of rent forever into a pool that never released; the 7K plan ended with $296K trapped in it.',
    management: 'RenPro Fargo, July 2026: 10% of collected rent monthly plus 50–100% of one month\'s rent per new lease (75% typical); ~13% all-in once turnover is counted.',
    hours: 'ESTIMATES of the hours each activity takes. They drive when management is hired (against your weekly time budget), whether REPS is available (>750 hours and more than your W-2 hours), and the 250-hour QBI safe harbour. REPS needs contemporaneous records: Mirch v. Commissioner, T.C. Memo. 2025-128, rejected 944.5 claimed hours in full.',
    reps: 'Real Estate Professional Status: more than 750 hours in real property trades or businesses AND more than half of all your working hours, tested every year. Qualifying later does NOT release losses suspended earlier — under §469(f)(1) they only offset income from the same activity. With a property manager your own rental hours usually fall below the 500-hour material-participation test.',
    allowance: 'The $25,000 special allowance for active participation phases out 50¢ per dollar of modified AGI over $100,000 and is gone at $150,000. Never inflation-indexed since 1986, so held constant. Pre-tax 401(k)/HSA contributions lower modified AGI.',
    ebl: '§461(l) caps business losses against non-business income: 2026 $256,000 single / $512,000 joint, down from $313,000 / $626,000 in 2025 because OBBBA reset the indexing base. Indexed after 2026. Excess becomes an NOL usable against 80% of future taxable income.',
    qbi: '§199A: 20% deduction on qualified business income, made permanent by OBBBA (P.L. 119-21 §70105). Rental real estate reaches it as a trade or business — the Rev. Proc. 2019-38 safe harbour needs 250+ hours of rental services a year, which a manager\'s hours can supply. Above $201,750 (single, 2026) a wage/property limit phases in over $75,000; for rentals the 2.5%-of-property-basis limit usually leaves most of it.',
    niit: '3.8% net investment income tax above $200,000 single / $250,000 joint (not indexed). Rental income is investment income unless you are REPS and materially participate.',
    prc: 'ND Primary Residence Credit: up to $1,600 a year applied to the PROPERTY TAX statement of your primary residence (HB 1176, VERIFIED) — not to income tax, as an earlier version modelled it. One per household; apply online 1 January–1 April each year. Duplexes are explicitly eligible; whether an owner-occupied fourplex (commercial class) qualifies is UNCONFIRMED — ask the Tax Commissioner.',
    personalUse: 'While you live in a unit, that unit\'s share of depreciation and operating expenses is personal and not deductible against the rent from the others.',
    bonus: 'OBBBA (P.L. 119-21, signed 4 July 2025) made 100% bonus depreciation permanent for property acquired after 19 January 2025. It applies to the 5/7/15-year property a cost segregation study identifies, not the 27.5-year shell.',
    costSeg: 'Cost segregation typically reclassifies 20–40% of depreciable basis; 25% is the default and every source for the range is a cost segregation vendor. It is a timing and character trade: §1250 property (recapture capped at 25%) becomes §1245 property (recaptured at ordinary rates). It wins on a long hold or a hold-for-life (stepped-up basis), and can lose on a short hold.',
    exitTax: 'On a sale: selling costs, then gain = net price − adjusted basis. Cost-segregated property is recaptured at ordinary rates (§1245); straight-line depreciation on the building at up to 25% (unrecaptured §1250); the rest is long-term capital gain at 0/15/20%, plus 3.8% NIIT where it applies. North Dakota excludes 40% of net long-term capital gain (N.D.C.C. 57-38-30.3), not ordinary recapture. A full taxable disposition releases suspended passive losses.',
    sellingCost: 'ESTIMATE. Commission plus closing costs on a sale, post-2024 NAR settlement. Pull real ND figures before relying on it.',
    closingCost: 'North Dakota levies no real estate transfer tax, which is why ~3% buyer closing costs is right rather than the 4–5% seen elsewhere. Range 2–5%.',
    hcv: 'Fargo Housing Authority 2026 payment standards: 0BR $1,203, 1BR $1,320, 2BR $1,479, 3BR $1,861, 4BR $2,388 (VERIFIED). The standard caps GROSS rent (contract rent + the authority\'s utility allowance), and every rent must also pass a rent-reasonableness test against comparable unassisted units — so the realistic voucher rent is near the top of market rent, not the payment standard. Voucher tenants stay longer and the housing authority\'s share arrives reliably; units need an inspection before lease-up and annually.',
    hcvUtility: 'ESTIMATE. The utility allowance schedule was not retrieved; these placeholders scale with bedrooms and with who pays heat. Converting a building to tenant-paid heat RAISES the allowance, which LOWERS the most rent a voucher can approve — the interaction the engine enforces.',
    heatConversion: 'ESTIMATE. Putting tenants on their own heat (individual furnaces or boilers and separate gas meters, or electric heat) runs ~$3,000–10,000 per unit; $6,000 is the default. It removes most of the owner-paid utility bill permanently, but the effective rent tenants will pay falls by part of their new heat cost. Cheapest timed to the end of life of the central boiler, which then does not need replacing.',
    rubs: 'Ratio Utility Billing: bill a master-metered utility back to tenants. ND has no statute prohibiting it; it must be in the lease and generally starts at renewal. 70–80% recovery is typical. Tenants resist the higher effective rent, so part of the recovery comes back as lower rent — 30% by default. A1 conveys a working RUBS system with the sale.',
    license: 'ND real estate salesperson license: 90 hours of pre-licensing education, exam $131, total $539–854 including the course (ND Real Estate Commission / course providers, 2026). Ongoing brokerage, MLS, errors-and-omissions and education fees are an ESTIMATE. On your own purchases the buyer-side commission (negotiated after the 2024 NAR settlement; ~2–2.5% assumed) comes back to you less the brokerage split, and is taxable. Brokerage hours count toward REPS when you are an independent contractor rather than an employee.',
    offMarket: 'ESTIMATES from vendor and industry material, not Fargo measurements: direct-mail response 0.5–2% (higher on handwritten or motivated-seller lists); $0.30–1.50 per piece; skip tracing $0.02–0.25 per record; $500–3,000 per closed deal on single-family wholesale. A small-multifamily owner list in Fargo is finite, so repeated touches to the same owners are the norm. Off-market is also where seller financing actually comes from.',
    mlsSupply: 'ESTIMATE. The seven sold comps span June–August 2026, which suggests the Fargo 2–4 unit market transacts on the order of 25–35 buildings a year. How many you win depends on price, speed and competition from buyers who already own nearby.',
    sellerFinance: 'Seller financing appears most with retiring owners who own free and clear and want to spread the gain under §453 — the profile of Fargo pre-1970 small multifamily. Terms are negotiated; almost every note balloons in 5–10 years. The engine will not combine it with a live-in purchase (Dodd-Frank/SAFE Act seller-financing exclusions reach owner-occupied residential). Fannie Mae probably counts a seller mortgage you are personally liable on toward its 10 financed properties.',
    assumable: 'Only FHA, VA and USDA loans are assumable. You pay the seller the whole difference between price and loan balance in cash; servicers take 60–120 days; FHA fees are capped around $900–1,800.',
    idleCash: 'Where money waits between purchases. Money market and T-bill yields are ESTIMATES for late 2026; the index-fund and precious-metals returns are long-run expectations with volatility in the uncertainty layer. "Your investments" at 1% or 2% a month are YOUR figures (12.7% and 26.8% a year), modelled exactly as given, with no volatility. Idle cash only: it never competes with buying.',
    taxTables: '2026 federal brackets, standard deduction, capital-gain breakpoints and QBI threshold for single filers are VERIFIED against IRS Rev. Proc. 2025-32 tables. Joint-filer figures and ND joint brackets are carried from the same releases without independent re-verification. Brackets are indexed at CPI after 2026 unless you turn indexing off.',
    sevenDay: 'Reg. §1.469-1T(e)(3)(ii)(A): an activity is not a rental activity if the average period of customer use is seven days or less. With material participation its loss is non-passive without REPS. The average is computed under Reg. §1.469-1(e)(3)(iii), weighted by gross rental income across the class of property. Material participation under Reg. §1.469-5T(a) is lost in practice when a manager runs it. Applying the rule unit by unit inside a mixed building is an interpretation — ask a CPA.',
    seDoc: 'CCA 202151005 held that where SUBSTANTIAL services are provided (daily cleaning, meals, transport), short-term rental income is subject to self-employment tax. A bare short-term rental escapes SE tax under §1402(a)(1) — that is the statute, not the CCA.',
    lodgingTax: 'Fargo lodging tax is 3% on stays under 30 nights, collected by Airbnb and paid by the GUEST — not an owner expense. (Earlier versions charged 5% to the owner.) Whether Fargo requires a short-term rental permit is still unconfirmed.',
    mtr: 'Furnished Finder showed 199 Fargo mid-term listings (Sept 2026) at a 33–71% premium over long-term rents; 40–55% is the planning range. Furnishing $4,000–10,000 per unit is an ESTIMATE. Still a rental activity: losses stay passive.',
    str: 'AirDNA reports $138 ADR at 63% occupancy; AirROI $176 at 40.8% — two vendors, sharply different. Defaults sit between them. A lender underwrites the building on long-term rent, not nightly projections.',
    byRoom: 'Fargo rooms rent at $450–800/mo. NDSU enrolment 11,954 with dorms at $475–615 all-inclusive competing at the bottom of the range; the nine-month academic year erases much of the premium.',
    buildingShare: 'Land is not depreciable. 80% building / 20% land is a common split; your assessor statement gives the real one.',
    emergencyFund: 'Your own cushion, separate from anything a lender requires. Sized in months of living costs plus housing.',
    breakers: 'Circuit breakers pause buying when a condition trips, and the timeline marks it. They are portfolio-level: every property in a failing portfolio passed its own underwriting on the day it was bought.',
    career: 'Going part-time and then quitting are modelled as coupled events: contributions change, living costs must come from the portfolio, your W-2 disappears from debt-to-income (so conventional and FHA loans need two years of rental history), your hours free up for REPS, and your tax bracket moves. Refinance and buy owner-occupied BEFORE you quit, while you still qualify.',
    ownHome: 'Buying your own home later takes a down payment, adds its payment to your debt-to-income, uses one of Fannie Mae\'s 10 financed-property slots, and moves the Primary Residence Credit to it.',
    heloc: 'ESTIMATE. Most banks will not open a HELOC on investment property; the credit unions and portfolio lenders that do cap combined loan-to-value around 70–80% and cap the line itself (often $100K–$250K). The draw payment counts in debt-to-income. The line can be frozen or cut in a downturn — the 2008–09 pattern — which is why the freeze option exists.',
    archetypes: 'An archetype is a typical building of its size, interpolated across the sold comps from the cheapest (quality 0) to the best-kept (quality 1). The triplex archetype rests on TWO sales, an 1898 and a 1949 building, both with owner-paid heat — it is the cheapest per unit and the plan leans on it. The 5–8 unit archetype has no sold comps at all and is off unless you switch it on.',
    evictions: 'ESTIMATE. North Dakota evictions move fast by national standards (a 3-day notice and a hearing within weeks), but the cost still stacks up: filing and attorney, rent not covered by the deposit, cleanup, then a turnover. 1–2% of units a year is typical for workforce housing; the base run charges the expected cost every month, the uncertainty layer draws actual evictions.',
    shortfall: 'What happens when a run of bad months meets a thin cash balance. A real owner defers what can wait (refreshes, a replacement for a few months), leans on a credit line, and only then sells. The engine does the same, in that order, and the uncertainty layer counts how often each step is needed.',
    headline: 'The headline is the income that the chosen share of simulated futures meets or beats at your target date (the "80% case" by default). A path that runs out of cash scores zero, which is how fragile plans are penalised.'
  };

  var RENT_BR = [0, 1, 2, 3, 4].map(function (b) { return FPE.RAW_DATA.marketObservations.rentByBedroom.values[String(b)]; });
  var PS_BR = [0, 1, 2, 3, 4].map(function (b) { return FPE.RAW_DATA.marketObservations.hcvPaymentStandards2026.values[String(b)]; });

  /* How much to trust each input, shown beside it everywhere. */
  var PROVENANCE = {
    verified: { label: 'Verified', text: 'Checked against a primary source: law, an agency guide, or government data.' },
    vendor:   { label: 'Lender terms', text: 'One lender\'s or vendor\'s published terms. Others differ — get quotes.' },
    rule:     { label: 'Rule', text: 'How a law or program works. The engine applies it; change it only if the rule changes.' },
    estimate: { label: 'Estimate', text: 'Reasoned from comparable data, not checked for your case.' },
    guess:    { label: 'Guess', text: 'A placeholder with little evidence behind it. The sensitivity view shows whether it matters.' },
    yours:    { label: 'Yours', text: 'About you — only you can supply it.' },
    choice:   { label: 'Choice', text: 'A decision. Set it to what you would actually do.' },
    derived:  { label: 'Derived', text: 'Computed from other inputs.' }
  };

  FPE.data = {
    raw: FPE.RAW_DATA,
    TAX: TAX, LENDER: LENDER, NOTES: NOTES, PROVENANCE: PROVENANCE,
    rentByBedroom: function (br) { return RENT_BR[Math.max(0, Math.min(4, Math.round(br)))]; },
    paymentStandard: function (br) { return PS_BR[Math.max(0, Math.min(4, Math.round(br)))]; },
    utilityAllowance: function (br, tenantPaysHeat) {
      var u = FPE.RAW_DATA.marketObservations.hcvUtilityAllowanceEstimate;
      var t = tenantPaysHeat ? u.tenantPaysHeat : u.ownerPaysHeat;
      return t[String(Math.max(0, Math.min(4, Math.round(br))))];
    },
    dataMonth: FPE.util.parseMonth(FPE.RAW_DATA._meta.collected || '2026-09')
  };
})(FPE);
