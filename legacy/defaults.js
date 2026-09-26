/* ============================================================================
   FARGO, ND DEFAULTS — every figure sourced from Sept 2026 market research.
   See DATA_NOTES for provenance and confidence. All of it is editable in the UI.
   ========================================================================== */

var DATA_NOTES = {
  propTaxResidential: 'Fargo total mill levy 298.43 (2025) x 4.5% taxable ratio = 1.343% of market value. Cross-checked against Ownwell median effective rate of 1.34%. HIGH confidence.',
  propTaxCommercial: 'North Dakota classifies buildings with FOUR OR MORE units as commercial (not 5+ as in most states). 5.0% taxable ratio x 298.43 mills = 1.492%. Source: ND Tax Commissioner, Property Valuation Concepts. HIGH confidence — and commonly gotten wrong.',
  insuranceInflation: 'ND premiums rose 14% in 2024-25; APCIA projects +26% through 2028 (presented Sept 21 2026, Bismarck). 26% over 3yr = 8.0%/yr. Hail exposure: ND averages 38 thunderstorm days/yr.',
  vacancy: 'Appraisal Services Inc. F-M metro survey: 6.2% (Q2 2025, latest available). Default set to 7% deliberately conservative — the reading is ~15 months stale and Fargo went from 2.2% to 10.2% vacancy between 2013 and 2018 on ~6,000 units of new supply. Downtown Fargo was 16.3%.',
  appreciation: 'FHFA All-Transactions HPI, Fargo ND-MN MSA (ATNHPIUS22020Q), Q2 2026. 20yr annualized 3.89%, 10yr 4.74%, 5yr 6.29%. Default 3.5% — haircut below the 20yr figure because the 5yr number is inflated by the 2021-22 anomaly and current YoY is decelerating.',
  rentGrowth: 'Sources span 1.2% (ApartmentList) to 5.7% (Zumper) YoY. ApartmentList shows Fargo rents up only 2.0% through Aug 2026 vs +7.2% same period 2025 — clear deceleration. 3.0% is the defensible middle.',
  rates: 'Sept 22 2026. Investment 2-4 unit at 25% down: 7.58-8.08%. FHA owner-occupied: 6.87%. DSCR: 6.13-7.38%. Note DSCR currently prices BELOW agency investment — unusual, worth exploiting.',
  commercial: 'A $600K 8-unit does NOT qualify for Fannie/Freddie small-balance programs (those start at $2M). It will be a local bank portfolio loan: ~7.25%, 20-25yr amortization, 5yr balloon, 75% LTV, recourse. EXTRAPOLATED from upper-Midwest community bank patterns — confirm with Bell Bank, Gate City, Bremer, or Choice Bank.',
  prices: 'Now based on SEVEN ACTUAL SALES, Jun-Aug 2026 (22 units, $2.05M), not asking prices. Per unit: duplexes $140,500, triplexes $69,750, fourplexes $89,083. The duplex penalty is confirmed and it is large — you pay roughly twice per door for a Fargo duplex. Earlier asking-price research said $128K vs $77K per unit; the sold data says the same thing.',
  inPlaceRents: 'CRITICAL. Blended in-place rent across the seven sold comps is $873/unit/mo — 19% below the $1,075 market-survey figure, and individual properties run as low as $581. Market surveys measure professionally-managed large complexes; Fargo small multifamily is older stock with long-tenured tenants and, often, landlord-paid utilities. Underwrite on in-place rent, not survey rent.',
  ownerUtilities: 'The hidden expense. Five of seven comps have the landlord paying some combination of heat, water, sewer, trash and lawn. It ranges from $1,320/yr to $9,862/yr. On the 1898 triplex it is 40% of gross rent. In a -20F climate, whoever pays the heat bill determines whether the deal works.',
  eightUnit: 'EXTRAPOLATED — zero 8-unit listings were active in Fargo at research time. Bracketed from adjacent comps: workhorse Class B/C product clusters at $55-90K/unit. Lowest-confidence figure here.',
  rents: 'Market rent by bedroom count, consensus across RentCafe, Zumper, Apartments.com, ApartmentAdvisor and ApartmentList (Aug-Sep 2026): 1BR $1,000, 2BR $1,175, 3BR $1,550. Each comp carries the market rent for ITS bedroom count, which matters — the two duplexes are 3BR units and belong against $1,550, not a blended figure.',
  closingCosts: 'North Dakota levies NO real estate transfer tax, which is why 3% is right rather than the 4-5% typical elsewhere. Range 2-5%.',
  management: 'RenPro Fargo, July 2026. 10% monthly is standard; leasing 50-100% of first month (75% typical). All-in steady state runs ~13% of gross rent once turnover is counted.',
  ndIncomeTax: '2023 reform collapsed brackets to three and zero-rated the bottom. 2026: single $0-49,575 = 0%, $49,575-250,400 = 1.95%, above = 2.50%. Lowest effective state income tax of any state that levies one.',
  primaryResidenceCredit: 'HB 1176 (May 2025) raised the ND Primary Residence Credit to $1,600/yr. INVESTMENT PROPERTY DOES NOT QUALIFY — but it applies while you owner-occupy a duplex or triplex. A fourplex is commercial-classified, which likely complicates it; verify with the Tax Commissioner.',
  bonusDepreciation: 'The One Big Beautiful Bill Act (P.L. 119-21, signed 4 July 2025) restored 100% bonus depreciation PERMANENTLY for qualified property acquired after 19 January 2025. IRS Notice 2026-11 (14 Jan 2026) is the interim guidance. It applies to the 5/7/15-year property a cost segregation study identifies, not to the 27.5-year building shell. Every purchase in this plan qualifies.',
  costSegregation: 'Typically reclassifies 20-40% of the DEPRECIABLE basis into short-life property on an apartment building; 25% is a reasonable default and the error bar is wide. Study cost runs $1,800 (tech-enabled) to $6,500 (traditional engineering); practical floor is around a $250-300K purchase price. WARNING: every source for the 20-40% range is a cost segregation vendor, and one disclaims its own table as calculator assumptions rather than data. Treat the percentage as an assumption to sensitivity-test, not a fact.',
  costSegCatch: 'Cost segregation is a TIMING AND CHARACTER trade, not free money. It converts basis that would be recovered as Section 1250 property (recaptured at a capped 25%) into Section 1245 property (recaptured at ORDINARY rates, up to 37%). You accelerate the deduction and repay it on sale at a worse rate. It wins on a long hold, or if you never sell - 1031 forever, or step-up in basis at death. On a short hold with no rate change it can be a wash or negative.',
  passiveLosses: 'The $25,000 special allowance for active participation phases out 50 cents per dollar of MAGI above $100,000 and is gone at $150,000. Neither figure has been inflation-indexed since 1986 - they are 1986 nominal dollars, so this model holds them constant rather than inflating them. Suspended losses carry forward indefinitely and are released only by passive income, the allowance, or a fully taxable disposition of the entire interest.',
  reps: 'Real Estate Professional Status requires more than 750 hours in real property trades or businesses AND more than half of all your personal services, tested annually. On a joint return one spouse must meet it ALONE - hours cannot be pooled for the gate, though both spouses hours count toward material participation once one clears it. CRITICAL AND COMMONLY MISUNDERSTOOD: qualifying in a later year does NOT release losses suspended from earlier years against your W-2 income. Under Section 469(f)(1) those old losses can only offset income from that same activity; anything left stays passive. This model follows that rule.',
  excessBusinessLoss: 'Section 461(l) caps how much business loss can offset non-business income, and it binds AFTER the passive rules - so it only matters once you qualify for REPS. The 2026 cap DROPPED to $256,000 single / $512,000 joint, down from $313,000 / $626,000 in 2025, because OBBBA reset the indexing base. Excess becomes an NOL carryforward subject to the 80% limitation.',
  exchange1031: 'Unchanged by the 2025 legislation. 45 days to identify, 180 days to close (or the return due date including extensions, whichever is earlier). Replacement basis = cost minus deferred gain, and it splits: the carryover portion continues the ORIGINAL depreciation schedule over its remaining life, while only the EXCESS basis starts a fresh 27.5-year clock. Bonus depreciation applies to the excess basis ONLY - there is no second year one on carryover basis. Suspended passive losses are NOT released, because a deferred exchange is not a fully taxable disposition.',
  recapture: 'Unrecaptured Section 1250 gain is capped at 25%. Section 1245 recapture on cost-segregated personal property is ordinary income, up to 37%. North Dakota excludes 40% of net long-term capital gain (N.D.C.C. 57-38-30.3), so the effective ND rate on LTCG at the top bracket is 1.50% - but that exclusion applies to capital gain, not to ordinary 1245 recapture, so cost segregation plausibly costs you the ND exclusion on the reclassified slice too.',
  specialAssessments: 'NOT MODELED. Fargo funds street and utility infrastructure through special assessments billed on the tax statement but OUTSIDE the mill levy. These can add hundreds to thousands per year and vary parcel by parcel. Every effective-rate figure here excludes them. Pull the actual parcel statement before committing to any property.',

  recast: 'A recast (re-amortization) re-computes the payment on the REMAINING balance over the REMAINING term at the SAME rate, after a lump-sum principal payment. Fee is typically $150-500. This is the difference between a paydown that raises your monthly income and one that does not: extra principal alone shortens the term but leaves the payment untouched, so you get no cash flow benefit at all until the loan is fully retired. Not every servicer allows it, FHA generally does not, and it is not a refinance - no new appraisal, no new rate, no credit pull.',
  paydownVsBuy: 'Retiring a 6.95% mortgage is a guaranteed, tax-inefficient 6.95% return (tax-inefficient because you lose the interest deduction). A new acquisition is a leveraged, uncertain return that also buys appreciation and depreciation on the whole asset. The paydown wins on certainty and on cash flow per dollar; buying wins on expected net worth in nearly every run in this engine. The case for paydown is not arithmetic - it is that it lowers the portfolio DSCR floor and lets you survive the vacancy that ends an over-levered plan.',
  strSevenDay: 'Reg. 1.469-1T(e)(3)(ii)(A): an activity is NOT a rental activity if "the average period of customer use for such property is seven days or less." A sub-7-day short-term rental is therefore an ordinary trade or business, and with material participation its loss is NON-PASSIVE - without REPS. This is the only rental mode in this engine that gets that treatment. Average period of use is computed under Reg. 1.469-1(e)(3)(iii) (the final regulation; the temporary 1.469-1T(e)(3)(iii) is [Reserved]) and is weighted by GROSS RENTAL INCOME across the class of property. Material participation is still required, under one of the seven tests of Reg. 1.469-5T(a); the 100-hour test requires your hours to equal or exceed those of ANY other individual, which a cleaning service alone can defeat. Mirch v. Commissioner, T.C. Memo. 2025-128, rejected 944.5 claimed hours in full for want of contemporaneous records.',
  strNoSETax: 'A bare short-term rental with no substantial services does not generate self-employment tax (CCA 202151005). Providing substantial services - daily housekeeping, meals, transport - flips it into a hotel-like trade and DOES trigger SE tax at 15.3%. The 30-day/services exception is the trap.',
  mtrTaxTreatment: 'A mid-term rental at 30-120 days averages well over seven days, so it IS a rental activity and its losses ARE passive. It gets no part of the short-term-rental treatment. It escapes ND lodging tax (which reaches only stays under 30 days) and it escapes most short-term-rental ordinances, but it earns no tax advantage over a long-term rental.',
  mtrFargo: 'Furnished Finder showed 199 Fargo mid-term listings (Sept 2026): 1BR $845-$2,150, 2BR $1,800-$2,000, against Zumper long-term medians of 1BR $1,050 and 2BR $1,195. That is a +33% to +71% premium; 40-55% is the conservative planning range used here. Furnishing cost is ESTIMATED at $4,000-$7,000 for a 1BR and $6,000-$10,000 for a 2BR - no Fargo-specific source. National average stay is 102 days, implying ~3.5 turns/yr; the 18% vacancy default is an estimate, not a measurement.',
  strFargo: 'Two vendors disagree sharply on Fargo short-term rental performance: AirDNA reports $138 ADR at 63% occupancy ($28,800/yr) while AirROI reports $176 ADR at 40.8% occupancy ($21,070/yr). AirDNA also reports +92.1% YoY revenue growth, which is not plausible for this market and casts doubt on the whole series. Median is around $1,934/mo. Defaults here sit between the two. UNRESOLVED: Fargo appears to have no short-term rental permit requirement, but that rests on a vendor blog plus the absence of a city page, not on an ordinance - and the Land Development Code rewrite is live in 2026. West Fargo passed a short-term rental ordinance in June 2025. Verify with Fargo Planning before buying for this use.',
  lodgingTax: 'UNRESOLVED. Three sources give three different Fargo lodging tax rates - 2%, 3% and 5%. The default here is 5% (the most conservative). North Dakota lodging tax applies only to accommodation furnished for fewer than 30 consecutive days, so mid-term rentals escape it entirely. Confirm the rate with the ND Tax Commissioner and the City of Fargo before modeling short-term rental income.',
  byRoom: 'Fargo rooms rent at $450-$800/mo. It only beats a whole-unit lease at three or more bedrooms, and NDSU enrollment is 11,954 - not the ~14,500 often cited - with 4,075 students on campus and dorms at $475-$615/mo all-inclusive, which is direct competition at the bottom of the range. The nine-month academic year erases much of the premium unless you secure twelve-month leases or summer tenants. Management load is materially higher: more leases, more turnover, more conflict.',
  rubs: 'Ratio Utility Billing Systems allocate a master-metered utility bill to tenants by unit count, square footage or occupancy. North Dakota has no statute prohibiting it, but it must be disclosed in the lease and it generally cannot be imposed mid-lease - so recovery starts at renewal, not at closing. Recovery of 70-80% of the bill is typical once administrative cost and vacancy loss are netted out. Expect some rent resistance: the effective rent rises, so a unit priced at market before RUBS is above market after it.',
  sellerFinance: 'Seller financing works when the seller owns free and clear and wants to spread the gain under the installment method (Section 453), which is why it appears most often with retiring long-hold owners - exactly the profile of Fargo pre-1970 small multifamily. There is no bank, so no DSCR test, no appraisal gate and no conventional loan slot consumed, and terms are whatever both sides accept. The Dodd-Frank/SAFE Act seller-financing exclusions apply to owner-occupied residential; an investment purchase is outside them, but a property you intend to live in is not - get counsel before combining seller financing with house-hacking. The availability figure in this model is an assumption, not a measurement.',
  assumable: 'Only FHA, VA and USDA loans are assumable. A 2020-21 FHA loan at 2.75-3.25% is worth real money, but you must pay the seller the entire difference between the price and the loan balance in cash - on a $300K purchase with a $210K balance that is $90K, which is usually more than the down payment you were avoiding. VA assumption by a non-veteran also burns the seller entitlement, so sellers resist. Servicer processing routinely takes 60-120 days and the fee is capped (FHA around $900-1,800).',
  interestOnly: 'Interest-only raises cash flow immediately and builds zero equity. At the end of the IO period the payment re-amortizes over the SHORTER remaining term, so the step-up is larger than the original payment - typically 25-40% higher on a 30-year loan with a 10-year IO. It is a bet that you will refinance, sell or have grown income before that date. Commercial portfolio lenders in this market offer it more readily than agency lenders.',
  guardrails: 'These are portfolio-level floors, applied after a prospective purchase, not deal-level tests. The distinction matters: every property in a failing portfolio passed its own underwriting at the time it was bought. The binding constraint in a collapse is almost never the newest deal - it is the aggregate coverage ratio and months of cash on hand.'
};

var FARGO_MARKET = {
  appreciation: 0.035,
  rentGrowth: 0.03,
  expenseInflation: 0.03,
  insuranceInflation: 0.08,
  vacancy: 0.07,
  propTaxRateResidential: 0.01343,
  propTaxRateCommercial: 0.01492,
  commercialUnitThreshold: 4,
  applyTaxCap: true,
  propTaxCapPct: 0.03,
  insurancePerUnit: 800,
  buildingPctOfValue: 0.80,
  depreciationYears: 27.5,
  capexValueCapture: 0.5,
  rehabValueCapture: 1.0,
  lenderReplacementReservePerUnit: 300,
  driftListingPrices: true,
  primaryResidenceCredit: 1600,
  reassessOnSale: true,
  assessedToSaleRatio: 0.93,
  ltcgRate: 0.15,
  recapture1250Rate: 0.25,
  niitRate: 0.038,
  niitThreshold: 200000,
  ndLtcgExclusion: 0.40,
  sellingCostPct: 0.07
};

var FARGO_FINANCING = {
  ratePath: [
    { fromYear: 2026, investment: 0.0695, fha: 0.0687, dscr: 0.0635, commercial: 0.0653 },
    { fromYear: 2028, investment: 0.0660, fha: 0.0650, dscr: 0.0610, commercial: 0.0625 },
    { fromYear: 2030, investment: 0.0630, fha: 0.0620, dscr: 0.0590, commercial: 0.0600 }
  ],
  defaultDownPct: 0.25,
  ownerOccDownPct: 0.035,
  loanTermYears: 30,
  commercialAmortYears: 25,
  commercialBalloonYears: 5,
  commercialMaxLTV: 0.75,
  closingCostPct: 0.03,
  refiCostPct: 0.01,
  conventionalLoanCap: 10,
  postCapProduct: 'dscr',
  fhaUpfrontMIP: 0.0175,
  fhaAnnualMIP: 0.0055
};

/* Archetypes rebuilt from the seven SOLD comps (Jun-Aug 2026), not asking prices.
   `rentPerUnit` is what these buildings actually collect today; `marketRentPerUnit`
   is what the units should command. The gap between them is the whole strategy in
   this market. */
var FARGO_ARCHETYPES = {
  '2': { units: 2, price: 281000, rentPerUnit: 1159, marketRentPerUnit: 1550,
         nickname: 'Fargo duplex (from 2 sold comps)', annualInsurance: 1675,
         hoaMonthly: 0, ownerUtilitiesMonthly: 158 },
  '3': { units: 3, price: 209250, rentPerUnit: 791, marketRentPerUnit: 1175,
         nickname: 'Fargo triplex (from 2 sold comps)', annualInsurance: 2375,
         hoaMonthly: 0, ownerUtilitiesMonthly: 546 },
  '4': { units: 4, price: 356333, rentPerUnit: 818, marketRentPerUnit: 1175,
         nickname: 'Fargo fourplex (from 3 sold comps)', annualInsurance: 3200,
         hoaMonthly: 0, ownerUtilitiesMonthly: 272 },
  '8': { units: 8, price: 600000, rentPerUnit: 850, marketRentPerUnit: 1050,
         nickname: 'Fargo 8-unit (EXTRAPOLATED — no comp)', annualInsurance: 6400,
         hoaMonthly: 0, ownerUtilitiesMonthly: 550 }
};

/* ---------------------------------------------------------------------------
   RENTAL MODES. Set per property. The tax treatment differs sharply between
   them and it is not intuitive:

   - LTR and MTR and by-the-room are all RENTAL ACTIVITIES under
     Reg. 1.469-1T(e)(3). Losses are passive. You need REPS to use them
     against a W-2.
   - A short-term rental whose AVERAGE period of customer use is seven days
     or less is expressly NOT a rental activity — Reg. 1.469-1T(e)(3)(ii)(A).
     It is an ordinary trade or business. With material participation, the
     loss is non-passive WITHOUT REPS. That is the whole of the so-called
     "STR loophole", and it is the only mode here that gets it.
   All figures below are Fargo-specific and sourced in DATA_NOTES.
   ------------------------------------------------------------------------ */
var RENTAL_OPS = {
  mtr: {
    label: 'Mid-term (30–120 day furnished)',
    premiumPct: 0.45, furnishPerUnit: 7000, vacancyPct: 0.18,
    utilitiesPerUnit: 220, internetPerUnit: 75, cleanPerStay: 150,
    staysPerYear: 3.5, mgmtFeePct: 0.12, avgStayDays: 91, lodgingTaxPct: 0
  },
  byroom: {
    label: 'By the room',
    premiumPct: 0.25, furnishPerUnit: 2500, vacancyPct: 0.08,
    utilitiesPerUnit: 240, internetPerUnit: 75, cleanPerStay: 0,
    staysPerYear: 0, mgmtAddPct: 0.05, bedroomsPerUnit: 3,
    leaseMonthsPerYear: 12, avgStayDays: 270, lodgingTaxPct: 0
  },
  str: {
    label: 'Short-term (nightly)',
    premiumPct: 0.55, furnishPerUnit: 9000, occupancy: 0.45, adr: 150,
    utilitiesPerUnit: 260, internetPerUnit: 75, cleanPerStay: 95,
    staysPerMonth: 4.5, suppliesPct: 0.04, platformFeePct: 0.03,
    lodgingTaxPct: 0.05, mgmtFeePct: 0.20, avgStayDays: 3,
    materialParticipation: true, useAdrModel: true
  }
};

/* Seven real Fargo sales, Jun-Aug 2026. Figures transcribed from the listings.
   Where a listing did not state insurance it is estimated at $800/unit/yr, the
   average of the three that did. Component ages are estimates except where noted. */
function seedLibrary() {
  function comps(age) {
    return [
      { name: 'Roof', lifeYears: 25, ageYears: age.roof, cost: age.roofCost, enabled: true },
      { name: 'Furnace / HVAC', lifeYears: 20, ageYears: age.hvac, cost: age.hvacCost, enabled: true },
      { name: 'Water heaters', lifeYears: 12, ageYears: age.wh, cost: age.whCost, enabled: true },
      { name: 'Driveway / lot', lifeYears: 30, ageYears: 15, cost: age.lotCost, enabled: false },
      { name: 'Windows', lifeYears: 30, ageYears: 18, cost: age.winCost, enabled: false },
      { name: 'Exterior paint / siding', lifeYears: 20, ageYears: 9, cost: age.extCost, enabled: false }
    ];
  }
  return [
    { id: 'F1', enabled: false, nickname: '915 9th St S (4u, sold $420K Aug 2026)', units: 4,
      price: 420000, unitRents: [1038, 1038, 1038, 1038], marketRentPerUnit: 1175,
      annualTax: 4802, annualInsurance: 3200, hoaMonthly: 0, ownerUtilitiesMonthly: 0,
      yearBuilt: 1987, yearRenovated: null, rehabCost: 0, rehabRentBump: 0,
      otherMonthlyIncome: 0, vacancyOverride: null, rentIsCollected: false,
      notes: 'Built 1987, 3,360 sqft, 8BR/4BA, 4-car garage. TENANT PAYS ALL UTILITIES — the only one here where that is true, and it is why this deal works. In-unit laundry. Listing NOI $33,004. Tax year 2025; assessed value trails the $420K sale, so expect roughly +$1,500/yr after reassessment. Insurance estimated.',
      components: comps({ roof: 15, roofCost: 19400, hvac: 14, hvacCost: 10400, wh: 7, whCost: 6000,
                          lotCost: 9600, winCost: 5600, extCost: 10000 }) },

    { id: 'F2', enabled: false, nickname: '1605 5th Ave S (4u, sold $324K Jul 2026)', units: 4,
      price: 324000, unitRents: [581, 581, 581, 581], marketRentPerUnit: 1175,
      annualTax: 4275, annualInsurance: 3200, hoaMonthly: 0, ownerUtilitiesMonthly: 200,
      yearBuilt: 1984, yearRenovated: null, rehabCost: 0, rehabRentBump: 0,
      otherMonthlyIncome: 0, vacancyOverride: null, rentIsCollected: false,
      notes: 'Built 1984, 3,568 sqft, 9BR/4BA. RENTS ARE HALF OF MARKET — $581/unit against $1,175 for a Fargo 2BR. Either long-tenured tenants or units were vacant when the income was reported. This is the biggest rent gap in the set and the whole thesis of the deal. Listing contradicts itself on utilities (tenant pays electricity AND owner pays electricity/sewer/water); assumed owner pays sewer+water+trash. Coin-op laundry is leased, so it produces no income to you. Insurance estimated.',
      components: comps({ roof: 15, roofCost: 19400, hvac: 15, hvacCost: 10400, wh: 8, whCost: 6000,
                          lotCost: 9600, winCost: 5600, extCost: 10000 }) },

    { id: 'F3', enabled: false, nickname: '2814 8th St N (4u, sold $325K Jun 2026)', units: 4,
      price: 325000, unitRents: [835, 835, 835, 835], marketRentPerUnit: 1175,
      annualTax: 4501, annualInsurance: 3200, hoaMonthly: 0, ownerUtilitiesMonthly: 617,
      yearBuilt: 1958, yearRenovated: null, rehabCost: 0, rehabRentBump: 0,
      otherMonthlyIncome: 0, vacancyOverride: null, rentIsCollected: false,
      notes: 'Built 1958 — 68 years old. OWNER PAYS GAS, HEAT, HOT WATER, LAWN, SEWER AND WATER on a hot-water-heat building in North Dakota. Estimated $7,400/yr, which is 18% of gross rent and the single reason this deal does not work. Getting tenants onto their own meters is worth more than any rent increase here. Common laundry, security building, 1-car garage. Insurance estimated.',
      components: comps({ roof: 14, roofCost: 19400, hvac: 18, hvacCost: 12000, wh: 9, whCost: 7000,
                          lotCost: 9600, winCost: 6400, extCost: 11000 }) },

    { id: 'F4', enabled: false, nickname: '817 9th St S (3u, sold $194.5K Jul 2026)', units: 3,
      price: 194500, unitRents: [683, 683, 683], marketRentPerUnit: 1175,
      annualTax: 2535, annualInsurance: 2750, hoaMonthly: 0, ownerUtilitiesMonthly: 822,
      yearBuilt: 1898, yearRenovated: null, rehabCost: 0, rehabRentBump: 0,
      otherMonthlyIncome: 0, vacancyOverride: null, rentIsCollected: false,
      notes: 'BUILT 1898 — 128 years old. Stated fuel expense alone is $4,335/yr; total owner-paid operating costs run $9,862/yr against $24,575 of rent, or 40% of gross. Listing NOI of $8,478 is a 2.3% cap rate. At 0.44 DSCR this is unfinanceable as it stands. Tax figure is from 2024, older than the rest. Insurance $2,750 is the highest per unit in the set, which is what a 128-year-old building costs to insure.',
      components: comps({ roof: 16, roofCost: 16800, hvac: 16, hvacCost: 10400, wh: 9, whCost: 4500,
                          lotCost: 8700, winCost: 4200, extCost: 8500 }) },

    { id: 'F5', enabled: false, nickname: '1629 2nd Ave S (3u, sold $224K 2026)', units: 3,
      price: 224000, unitRents: [900, 900, 900], marketRentPerUnit: 1175,
      annualTax: 3617, annualInsurance: 2000, hoaMonthly: 0, ownerUtilitiesMonthly: 270,
      yearBuilt: 1949, yearRenovated: null, rehabCost: 0, rehabRentBump: 0,
      otherMonthlyIncome: 0, vacancyOverride: null, rentIsCollected: false,
      notes: 'The best deal in the set. Built 1949, roof under 8 years old (stated). Listing NOI $21,048 is a 9.4% cap rate. Owner pays gas, heat, lawn, sewer, snow, trash and water but it only runs $3,240/yr. Note the tax bill is HIGH relative to price — $3,617 on $224K is 1.615%, above even the commercial rate, so this one is over-assessed and a successful appeal would be worth real money.',
      components: comps({ roof: 8, roofCost: 16800, hvac: 14, hvacCost: 10400, wh: 7, whCost: 4500,
                          lotCost: 8700, winCost: 4200, extCost: 8500 }) },

    { id: 'F6', enabled: false, nickname: '3119-3121 10th Ave N (2u, sold $267K 2026)', units: 2,
      price: 267000, unitRents: [1000, 1000], marketRentPerUnit: 1550,
      annualTax: 2887, annualInsurance: 1600, hoaMonthly: 0, ownerUtilitiesMonthly: 110,
      yearBuilt: 1975, yearRenovated: null, rehabCost: 0, rehabRentBump: 0,
      otherMonthlyIncome: 0, vacancyOverride: null, rentIsCollected: false,
      notes: 'Side-by-side, 3BR each, 2-car detached garage. $133,500/unit — the per-unit price that makes Fargo duplexes hard to justify. But 3BR units renting at $1,000 against a $1,550 market is a 55% gap, the second largest here. Operating expense of $1,320/yr matches trash $30/mo plus water-sewer $80/mo exactly, so that figure excludes tax and insurance. Insurance estimated.',
      components: comps({ roof: 15, roofCost: 14200, hvac: 13, hvacCost: 5200, wh: 7, whCost: 3000,
                          lotCost: 7800, winCost: 2800, extCost: 7000 }) },

    { id: 'F7', enabled: false, nickname: '3025 18th St S (2u, sold $295K Aug 2026)', units: 2,
      price: 295000, unitRents: [1317.5, 1317.5], marketRentPerUnit: 1550,
      annualTax: 3861, annualInsurance: 1550, hoaMonthly: 0, ownerUtilitiesMonthly: 205,
      yearBuilt: 1983, yearRenovated: null, rehabCost: 0, rehabRentBump: 0,
      otherMonthlyIncome: 0, vacancyOverride: null, rentIsCollected: false,
      notes: 'Up-and-down duplex, 3BR each. The highest in-place rent per unit in the set at $1,318, already close to the $1,550 3BR market — which is exactly why it has the smallest upside. At $147,500/unit it is also the most expensive per door. Tax figure is from 2024. Owner pays electric $1,800, water-sewer $480, trash $180.',
      components: comps({ roof: 15, roofCost: 14200, hvac: 14, hvacCost: 5200, wh: 8, whCost: 3000,
                          lotCost: 7800, winCost: 2800, extCost: 7000 }) },

    /* ---- ACTIVE LISTINGS, Sept 2026. These are buyable today. ---------- */
    { id: 'A1', enabled: true, nickname: '1809 13.5 St S (4u, $315K, RUBS in place)', units: 4,
      price: 315000, unitRents: [714, 782, 692, 757], marketRentPerUnit: 1169, monthsToMarket: 18,
      annualTax: 3851, annualInsurance: 3200, hoaMonthly: 0, ownerUtilitiesMonthly: 278,
      yearBuilt: 1957, yearRenovated: null, rehabCost: 0, rehabRentBump: 0,
      otherMonthlyIncome: 200, vacancyOverride: null, rentIsCollected: false,
      notes: 'The best value-add on the market. Units collect $692-782 against a $1,169 Fargo 2BR market - roughly 40% under. Critically, it carries a TRANSFERRABLE RUBS ratio-billing system that passes utilities through to tenants and conveys with the sale; owner utilities average $278/mo and RUBS recovers most of it. Plus coin laundry. Leases run to 30 Apr 2027. Price shows $315K on three sources and $319K on the homes.com detail page - verify. Insurance estimated.',
      components: null },

    { id: 'A2', enabled: true, nickname: '1105 11th St N (4u, $330K)', units: 4,
      price: 330000, unitRents: [789, 789, 789, 788], marketRentPerUnit: 1169, monthsToMarket: 12,
      annualTax: 5338, annualInsurance: 3200, hoaMonthly: 0, ownerUtilitiesMonthly: 0,
      yearBuilt: 1965, yearRenovated: null, rehabCost: 0, rehabRentBump: 0,
      otherMonthlyIncome: 0, vacancyOverride: null, rentIsCollected: false,
      notes: 'Two units recently vacated, so the $3,155/mo is historical rather than current - underwrite the vacancy risk. Listing claims an 8% cap at stabilised rents, which is a pro-forma, not in-place. Electric baseboard implies tenants pay their own heat, the structure you want. Mix is 2x2BR + 2x1BR. Tax is heavy at 1.62% of price. Rents shown here are the historical total split evenly - get the real rent roll. Insurance estimated.',
      components: null },

    { id: 'A3', enabled: true, nickname: '1036 14th St N (2u, $265K, tenant pays all)', units: 2,
      price: 265000, unitRents: [1250, 1250], marketRentPerUnit: 1535, monthsToMarket: 18,
      annualTax: 2963, annualInsurance: 1600, hoaMonthly: 0, ownerUtilitiesMonthly: 0,
      yearBuilt: 1928, yearRenovated: 2025, rehabCost: 0, rehabRentBump: 0,
      otherMonthlyIncome: 0, vacancyOverride: null, rentIsCollected: false,
      notes: 'Best expense structure in Fargo: tenants pay ALL utilities plus lawn care and snow removal. New AC, water heater, updated plumbing, new flooring, fresh paint. Leased to 31 Jul 2027. Seller paid $245,000 in Dec 2024, so this is an $20K ask over a two-year hold. RENT IS ESTIMATED - the listing states no income; 6BR/2BA implies 3BR units, which market at ~$1,535. Verify before relying on it. Insurance estimated.',
      components: null },

    { id: 'A4', enabled: true, nickname: '1806 8th Ave S (2u, $250K, tenant pays all)', units: 2,
      price: 250000, unitRents: [1100, 1100], marketRentPerUnit: 1169, monthsToMarket: 12,
      annualTax: 2190, annualInsurance: 1600, hoaMonthly: 0, ownerUtilitiesMonthly: 0,
      yearBuilt: 1951, yearRenovated: null, rehabCost: 0, rehabRentBump: 0,
      otherMonthlyIncome: 0, vacancyOverride: null, rentIsCollected: false,
      notes: 'Tenants pay all utilities. Listing claims minimal vacancy over five years. Lowest property tax in the whole set at $2,190, which is 0.88% of price against a 1.34% norm - worth understanding why before assuming it holds. One unit leased to Apr 2027, the other month-to-month. Forced air gas. RENT IS ESTIMATED from the 2BR-each configuration. Insurance estimated.',
      components: null },

    { id: 'A5', enabled: true, nickname: '826 21st St S (5u, $350K, 1.35% rent/price)', units: 5,
      price: 350000, unitRents: [985, 797, 797, 1169, 985], marketRentPerUnit: 1050, monthsToMarket: 12,
      annualTax: 6175, annualInsurance: 4000, hoaMonthly: 0, ownerUtilitiesMonthly: 110,
      yearBuilt: 1915, yearRenovated: null, rehabCost: 0, rehabRentBump: 0,
      otherMonthlyIncome: 80, vacancyOverride: null, rentIsCollected: false,
      notes: 'The only listing that cash flows meaningfully from day one - roughly +$995/mo. All units rented, tenants pay all utilities, coin-op laundry. Mix is 2x1BR, 2 studio, 1x2BR. FIVE UNITS MEANS COMMERCIAL FINANCING: no FHA, no 3.5% down, 25% down and a local bank portfolio loan. Built 1915, so budget maintenance at the top of the range. Tax is heavy at 1.76% of price. Resident manager expense of $1,321/yr is disclosed. Unit count is listed as 5 in the description and 4 in the property facts - verify. Rents ESTIMATED from the bedroom mix.',
      components: null }
  ];
}

function defaultConfig() {
  return {
    meta: { name: 'Baseline', city: 'Fargo, ND', created: null },
    setup: {
      startMonth: '2026-10',
      horizonYears: 15,
      startingCapital: 18000,
      contributions: [
        { fromMonth: '2026-10', monthly: 3000 },
        { fromMonth: '2028-01', monthly: 4500 }
      ],
      personalMonthlyExpenses: 3200,
      currentHousingCost: 1100,
      annualW2Income: 72000,
      filingStatus: 'single',
      federalMarginalRate: 0.22,
      stateMarginalRate: 0.0195,
      modelTaxes: true,
      repsFromYear: null,
      excessBusinessLossCap: 256000
    },
    strategies: {
      cashOutRefi: { enabled: false, maxLTV: 0.75, seasoningMonths: 12,
                     minProceeds: 20000, costPct: 0.02, minDSCRAfter: 1.20 },
      heloc:       { enabled: false, maxCLTV: 0.80, freeAndClearCLTV: 0.85, rate: 0.095,
                     seasoningMonths: 12, minDraw: 10000, repayFromSurplus: true, repayPct: 0.50 },
      exchange:    { enabled: false, triggerType: 'properties', triggerValue: 4,
                     minGain: 60000, sellCostPct: 0.07, qiFee: 1200, targetUnits: 12,
                     targetPricePerUnit: 80000 },
      costSeg:     { enabled: false, shortLifePct: 0.25, bonusPct: 1.00,
                     studyCost: 3500, minPrice: 250000 },
      buydownPoints: 0,

      /* ---- DEBT PAYDOWN ------------------------------------------------
         Stop reinvesting into new doors and retire debt instead. The single
         most important setting here is `recast`: extra principal WITHOUT a
         recast shortens the term but does not lower the payment, so it buys
         you no monthly income at all until the loan is fully gone. */
      paydown: {
        enabled: false,
        mode: 'avalanche',           // avalanche | snowball | highestPayment | lowestDSCR | worstCashFlow | target
        targetSeq: 1,
        allocation: 'surplusAfterBuying', // surplusAfterBuying | pauseAcquisitions | splitPct
        splitPct: 0.50,
        monthlyExtra: 0,             // a fixed drip on top of surplus
        surplusPct: 1.00,
        keepMonthsBuffer: 0,
        startMonth: null,
        startAfterProperties: 0,
        stopAfterFreeAndClear: 99,
        recast: true,
        recastFee: 350,
        recastMinPrincipal: 5000,
        skipOwnerOccupied: true
      },

      /* ---- RATE-AND-TERM REFINANCE -------------------------------------
         No cash out. Same balance, cheaper rate, when the rate path drops.
         resetTerm:false keeps the remaining term so you do not restart
         amortization — the hidden cost in almost every refinance. */
      /* NOTE: this fires off the rate path on the Setup tab, and nothing else.
         The shipped path declines only 65bps between 2026 and 2030, so at the
         default 50bps trigger it fires once, late. It is a bet on rates, not a
         lever you control — set the path honestly before reading the result. */
      rateRefi: { enabled: false, dropBps: 50, costPct: 0.02, minMonthsOwned: 12,
                  maxPerProperty: 2, resetTerm: false, minMonthsBetween: 18 },

      /* ---- OPPORTUNITY FUND --------------------------------------------
         Dry powder deliberately withheld from the acquisition test until a
         trigger fires, so you have cash exactly when everyone else is out. */
      opportunityFund: { enabled: false, targetDollars: 45000, fillPct: 0.30,
                         deployOn: 'recession', discountPct: 0.10,
                         releaseAfterMonths: 48 },

      /* ---- COUNTER-CYCLICAL ---------------------------------------------
         What actually happens to asking prices in the modeled downturn, and
         whether you lean in or step back. */
      counterCyclical: { enabled: false, recessionPriceDiscount: 0.09,
                         pauseInRecession: false, relaxDSCRInRecession: 0 },

      /* ---- RUBS: ratio utility billing ----------------------------------
         Push owner-paid utilities back onto tenants. In Fargo this is the
         largest single controllable expense on pre-1970 stock. */
      rubs: { enabled: false, recoveryPct: 0.75, setupCostPerUnit: 165,
              monthsAfterPurchase: 6, minUtilitiesMonthly: 50, rentOffsetPct: 0 },

      /* ---- ANCILLARY INCOME ---------------------------------------------
         Per occupied unit per month. Small, real, and nearly all margin. */
      ancillary: { enabled: false, laundryPerUnit: 12, parkingPerUnit: 0,
                   storagePerUnit: 8, petRentPerUnit: 15, adminFeesPerUnit: 4,
                   monthsAfterPurchase: 3 },

      /* ---- PROPERTY TAX APPEAL ------------------------------------------
         Aimed at the post-sale reassessment, which is when the assessor
         marks you to your own purchase price. */
      taxAppeal: { enabled: false, reductionPct: 0.08, cost: 500,
                   monthsAfterPurchase: 14, repeatYears: 0 },

      /* ---- SELLER FINANCING ---------------------------------------------
         The only outside capital modeled, at your instruction. No bank, so
         no DSCR test and no conventional loan slot consumed. */
      sellerFinance: { enabled: false, downPct: 0.12, rate: 0.065, amortYears: 30,
                       balloonYears: 7, availabilityPct: 0.30, closingCostPct: 0.015,
                       preferOverBank: true },

      /* ---- LOAN ASSUMPTION ----------------------------------------------
         Take over an existing below-market FHA/VA loan. The equity gap is
         almost always what kills it. */
      assumable: { enabled: false, assumptionFee: 1200, maxEquityGap: 120000 },

      /* ---- AMORTIZATION CHOICE ------------------------------------------
         Interest-only lifts cash flow now and builds no equity, then hands
         you a payment step-up at the end of the IO period. */
      amortChoice: { investmentYears: 30, commercialYears: 25, interestOnlyYears: 0,
                     biweekly: false }
    },

    /* Parameters for the three non-long-term rental modes. Set the mode per
       property on the Properties tab; these numbers drive all of them. */
    rentalOps: JSON.parse(JSON.stringify(RENTAL_OPS)),
    market: JSON.parse(JSON.stringify(FARGO_MARKET)),
    financing: JSON.parse(JSON.stringify(FARGO_FINANCING)),
    rules: {
      minDSCR: 1.15,
      dscrUsesMarketRent: true,
      defaultMonthsToMarket: 18,
      lenderReserveMonths: 6,
      emergencyFund: { mode: 'months', months: 6, dollars: 20000 },
      requirePositiveCashFlow: false,
      ownerOccupyFirst: true,
      ownerOccupyMonths: 12,
      ownerOccupyCount: 1,
      ownerOccupyGapMonths: 12,
      ownerOccupySubsequentDownPct: 0.05,
      ladder: [
        { triggerType: 'purchases', triggerValue: 1, types: [2, 3, 4], label: 'Start: any 2-4 unit' },
        { triggerType: 'purchases', triggerValue: 4, types: [3, 4], label: 'From #4: 3-4 units only' },
        { triggerType: 'purchases', triggerValue: 9, types: [4, 8], label: 'From #9: step up to 8-units' }
      ],
      dealScore: 'coc',
      maintenancePctOfRent: 0.08,
      capexPctOfRent: 0.08,
      management: {
        trigger: 'units', threshold: 12, feePct: 0.10,
        leasingFeePct: 0.75, turnoverPerYear: 0.5
      },
      /* Hard floors applied to the PORTFOLIO after a prospective purchase, not
         to the deal in isolation. A deal can pass its own DSCR test and still
         be the one that breaks you. Switchable off in one click. */
      /* These ship at RUIN-AVOIDANCE levels, not prudence levels, and that is
         deliberate: set to sensible-sounding values they silently delete most
         of a Fargo plan. For reference, the shipped baseline run bottoms out at
         a 0.38 portfolio DSCR and peaks at 98% portfolio LTV — because a 3.5%
         down FHA house-hack is, by construction, a 98% LTV purchase. Tighten
         these and re-run to find where your own plan actually stops. */
      guardrails: {
        enabled: true,
        minMonthlyCashFlow: -2500,
        minPortfolioDSCR: 0.30,
        maxPortfolioLTV: 0.99,
        minMonthsExpensesInCash: 0
      },
      /* DEAL FLOW. Without this the engine assumes an infinite supply of
         buildings, and a fully stacked strategy run will "buy" a dozen
         properties in a single year. The seven sold comps span June-August
         2026, so the whole Fargo 2-4 unit market transacts on the order of
         25-30 buildings a year — and you are competing for every one of them
         against buyers who already own in the market. Winning three in a year
         would be an exceptional year. */
      dealFlow: { enabled: true, maxPerYear: 3, minMonthsBetween: 2 },
      /* A quality bar for the deal itself, separate from what a lender allows.
         Off by default because in this market it stops you buying anything. */
      hurdle: {
        enabled: false,
        minCoC: 0.04,
        minCapRate: 0.055,
        minCashFlowPerUnit: 0,
        ignoreWhileOwnerOccupying: true
      },
      profitMode: 'reinvestAll',
      drawThreshold: 5000,
      drawAmount: 2000,
      goalMonthlyProfit: 8000,
      goalEquity: 1000000,
      stopWhenGoalMet: false
    },
    properties: seedLibrary(),
    archetypes: JSON.parse(JSON.stringify(FARGO_ARCHETYPES)),
    stress: {
      recession: { enabled: false, startYear: 2030, durationYears: 2,
                   rentDropPct: 0.06, vacancyAddPts: 0.05, appreciationOverride: -0.02 },
      rateShock: { enabled: false, fromYear: 2029, addPct: 0.02 },
      events: []
    }
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { defaultConfig: defaultConfig, seedLibrary: seedLibrary,
                     FARGO_MARKET: FARGO_MARKET, FARGO_FINANCING: FARGO_FINANCING,
                     FARGO_ARCHETYPES: FARGO_ARCHETYPES, DATA_NOTES: DATA_NOTES,
                     RENTAL_OPS: RENTAL_OPS };
}

