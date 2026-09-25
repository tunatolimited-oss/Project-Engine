# Phase 1 — Audit of the Fargo Portfolio Engine

*25 September 2026. Every number below comes from running the shipped code
(`src/*`, commit `bd5366a`) unless it's marked as a source check. Scripts that
produced the figures are reproducible from the engine's public functions.*

Confidence labels: **Measured** = I ran it. **Verified** = checked against a
primary or official source. **Sourced (vendor)** = only lender or vendor
material supports it. **Judgement** = my reasoning, not evidence.

---

## 0. The short version

1. **The plan's result is almost entirely a bet on a free rent-to-market ramp.**
   Every building's rents climb to survey market rent within 12–18 months, with
   no turnover, no vacancy spike and no renovation. Remove that and 12 purchases
   become 3, and net worth falls from $3.37M to $2.06M. Stretch it to 48 months
   and cash flow drops from $3,717 to $667 a month. *(Measured)*
2. **The DSCR logic is wrong twice, and the two errors partly cancel.** The engine
   computes lender DSCR the way a commercial bank does (NOI after 8% maintenance,
   utilities, vacancy and management). Then, to stop that rejecting everything,
   it takes the *greater* of in-place and market rent. Residential DSCR lenders
   do neither: they divide **gross** rent by PITIA, using the **lesser** of lease
   and appraised rent for occupied units. Measured that way, **every property in
   the library clears 1.0 at in-place rent, even at 7.25%.** Financing isn't the
   binding constraint. Profit at in-place rent is. *(Measured; lender practice is
   Sourced (vendor))*
3. **The HANDOFF's headline results table can't be reproduced.** "$7,000/mo from
   Jan 2027, zero start" gives 12 buys / 40 units / $3.37M net worth, not
   16 / 48 / $3.54M. The first purchase is an FHA duplex, not a fourplex. The
   config that produced the table was never saved. *(Measured)*
4. **The seller-financing result (+$1.06M, "the largest lever") is a hash
   artifact.** Eligibility is `hash(id) < 30`. Every triplex archetype shares the
   id `arch3`, which hashes to 22, so every triplex the engine ever buys is
   seller-financeable. Three of the five real listings are too. "30% of sellers"
   actually behaves as "every triplex, forever". *(Measured)*
5. **Net worth is pre-liquidation and pre-tax.** Selling costs (~7%) and exit tax
   (recapture plus capital gain) on the 7K plan come to ~$770K, so $3.37M is
   roughly **$2.6M** if you walk away. That's about a 10% annual return on $1.25M
   contributed — a number that has never been compared with the obvious
   alternative. *(Measured; exit tax is my estimate)*
6. **"Cash flow" is pre-tax everywhere, including the freedom date,** although the
   Portfolio chart claims it is "after … estimated tax". The freedom date also
   compares against $3,200 held flat in nominal dollars for 15 years. *(Measured)*
7. **The appreciation input secretly controls future purchase prices,** while
   rents drift on rent growth. At 3.5% vs 3.0% the model builds in half a point a
   year of cap-rate compression, so every later deal is worse than the last. That
   is why *lowering* appreciation to 2% *raises* final cash flow from $3,717 to
   $7,906. *(Measured)*
8. **Insurance at 8% a year for 15 years** comes from a 3-year industry
   projection (+26%, 2025→2028), extrapolated. Premiums end at 3.2× today. At
   13%/yr the plan's cash flow goes negative. *(Source Verified; extrapolation is
   the issue)*

---

## 1. Results you were given that are wrong or unsupported

| Claim (where) | Status | Evidence |
|---|---|---|
| Measured-results table, HANDOFF §8 | **Not reproducible** | Stated config gives 12/40/$3,717/$3.37M vs 16/48/$4,276/$3.54M. |
| "At in-place rents nothing clears DSCR" (HANDOFF §6, test §14) | **Wrong as a statement about lenders** | Gross in-place rent ÷ PITIA at 25% down: F1 1.58, F2 1.09, F3 1.55, F4 1.52, F5 1.78, F6 1.23, F7 1.44, A1–A5 1.40–1.91, archetypes 1.31–1.68 (at 6.35%). All clear 1.0. |
| "Lenders use the appraiser's market rent (Form 1007)" (HANDOFF §6, UI) | **Mostly wrong** | DSCR lender guides: lesser of lease and market for leased units. Fannie: leases *or* Form 1025 at 75%, inside a DTI test rather than a DSCR test. Form 1007 is the single-family form; 2–4 units use Form 1025. |
| "Seller financing: +$1.06M, the largest lever" | **Artifact** | Eligibility hashes by id. `arch3`→22, so every triplex archetype qualifies; `arch4`→43, so no fourplex does. |
| "Deal flow is now the binding constraint" | **Not in the 7K baseline** | 12 buys in 14 years; the 3/yr cap never binds. Cash plus reserves binds. |
| "Better deals +39% cash flow but +$4K NW; capital dominates" | Plausible, not re-derivable | Config not recorded. |
| Net-worth rankings in the stack table | **Misleading yardstick** | Unrealised, pre-tax, and ranked by the one metric HANDOFF §13 says not to optimise. |
| "Freedom date Oct 2037" (7K plan) | **Overstated** | Pre-tax cash flow vs a nominal $3,200; the real-terms, after-tax date is later. |
| "Paydown after 5 buys beats buying on cash flow" | Direction plausible | The recast mechanics are right; FHA and many servicers don't recast (noted). |

## 2. What the plan actually depends on (7K plan, one change at a time)

| Change | Buys | Units | Cash flow (12-mo avg) | Net worth |
|---|---|---|---|---|
| Baseline | 12 | 40 | $3,717 | $3.37M |
| **No rent-to-market ramp** | **3** | **8** | $1,320 | **$2.06M** |
| Ramp only halfway to survey rent | 4 | 12 | $803 | $2.26M |
| Ramp takes 48 months | 10 | 32 | $667 | $2.93M |
| Lender DSCR on in-place rent (engine's NOI definition) | 3 | 8 | $3,580 | $2.30M |
| Rent growth 2% | 9 | 28 | $336 | $2.96M |
| Insurance inflation 13% | 9 | 28 | **−$1,174** | $2.95M |
| Investment rate +0.85pt (its own source range) | 11 | 36 | $2,503 | $3.16M |
| Vacancy 10% | 11 | 36 | $2,151 | $3.18M |
| Appreciation 2% | **14** | 48 | **$7,906** | $3.08M |
| CapEx accrual 4% instead of 8% | 13 | 44 | $7,008 | $3.56M |
| Lender reserve 0 months | 14 | 48 | $4,550 | $3.82M |
| No house-hack at all | 12 | 40 | $4,197 | $3.29M |
| Live in the house-hack 4 years | 12 | 40 | $3,631 | $3.44M |

What this says, plainly:

- **The weakest input in the system — "these units will rent at survey market
  rent within 18 months, for free" — carries most of the result.** The previous
  model's own advice was "underwrite on in-place rent; treat the gap as upside,
  not as income". The engine does the opposite.
- **Purchases 5–12 are all cash-flow negative on day one** (−$595 to −$1,320/mo,
  in-place coverage 0.58–0.66). They only work once the ramp lands.
- The house-hack is worth about $80K of net worth in this plan. That's real, but
  small next to its lifestyle cost at $7K/mo contributions.
- At the end of the 7K plan, **$611K sits idle** as cash ($316K) plus a CapEx
  pool ($296K) that grows forever and never releases. The pool is ~3× what the
  scheduled replacements need.

## 3. Engine errors (code)

**Lending**
- **Wrong DSCR definition for 1–4 unit DSCR loans** (see §0.2), **no DTI test at
  all for conventional loans** (the real Fannie/Freddie gate), and **no FHA
  self-sufficiency test** for 3–4 units (75% of appraised rent on *all* units must
  cover PITI). F1 fails it. *Verified: HUD 4000.1 via lender summaries; Fannie
  B3-3.1-08.*
- **Reserves are 6 months of PITI on every property.** Fannie is 6 months on the
  subject plus 2/4/6% of other UPB. DSCR lenders are typically subject-only. FHA
  1–2 units need none; 3–4 units need 3 months. *Verified (Fannie B3-4.1-01).*
- **Investment rate 6.95% contradicts its own source note** (7.58–8.08%). The
  DSCR rate of 6.35% is the best tier; September 2026 DSCR pricing runs
  6.125–7.375%, typically 7.0–7.5% for a 680–720 FICO borrower, plus
  0.125–0.25% for 2–4 units. The UI callout gives a third pair (6.75% vs 7.75%).
  *Sourced (vendor).*
- Cash-out and rate-and-term refis keep FHA MIP forever. The "refinance out of
  MIP" gap is a bug, not just a missing feature.
- Balloon refinance always succeeds and restarts a 25-year amortization. There's
  no LTV/DSCR retest, so balloon risk — the real risk of seller paper and
  commercial debt — is never modelled.
- Cash-out refis are priced at the DSCR rate (the cheapest in the path), which
  flatters that strategy.
- `financedCount++` runs for every purchase, including seller-financed ones.
  The UI and a test name both claim the opposite, and the test only checks a
  flag. (Fannie probably *does* count a seller-carried mortgage, so the code may
  be right and the prose wrong.)

**Acquisition and market model**
- **Deal choice uses day-one cash-on-cash**, which picks the *least negative*
  building and ignores the ramp it's betting on.
- **Future prices drift on appreciation, rents on rent growth**, so cap
  compression is built in (§0.7).
- **The library is treated as permanent inventory.** September 2026 listings get
  bought in 2029–2031 at drifted prices, still carrying 2027 lease dates and a
  2026 RUBS system.
- **A5 (5 units) can never be bought.** No ladder step allows 5-unit buildings.
- Seller-financing eligibility is an id hash (§0.4).
- The recession price discount is applied after tax is computed from the
  undiscounted price.

**Operations**
- The rent ramp is free and fast (§2), and RUBS is charged on top of full market
  rent (`rentOffsetPct` = 0), which double-dips tenants' willingness to pay.
- Ancillary laundry is added on top of listings that already book coin-laundry
  income (A1), so it counts twice.
- The CapEx pool is uncapped, never released, and invisible to the acquisition
  test.
- `unitsAffected` for a vacancy event reads the *first* event in the list, not
  the matching one.

**Tax**
- **§199A QBI is ignored.** OBBBA made the 20% deduction permanent. *Verified.*
  Rental income may qualify under the 250-hour safe harbour (Rev. Proc.
  2019-38), so tax on profitable years is overstated by up to ~20%.
- **The 3% property-tax cap is applied per property.** HB 1176's 3% is a *levy*
  cap on taxing districts, not a cap on your bill. *Verified.*
- **"Reassess on sale" is not how ND works.** Fargo reappraises *every* parcel
  each 1 February to true and full value, and must land within 90–100% of sale
  prices (*Verified, City of Fargo*). The engine's reset also **cuts** tax on
  over-assessed listings (A2 −$759, A5 −$1,319, F5 −$819/yr), silently deleting
  any special assessments embedded in those listing figures. It then stacks the
  tax-appeal strategy's 8% on top.
- The Primary Residence Credit is subtracted from income tax in December. In
  fact it is a **property-tax statement credit**, one per household, applied for
  each January–April. Duplexes are explicitly eligible; fourplexes are
  unconfirmed. *Verified.* The engine grants it to a fourplex without a flag.
- While you live in the house-hack, depreciation and expenses on *your* unit are
  deducted as if it were rented. That's the personal-use portion, which isn't
  deductible.
- HELOC interest is never deducted. Closing costs are left out of basis.
  Refinance costs aren't amortized.
- One flat marginal rate (22% + 1.95%) is used for 15 years, however large the
  rental income grows or whether you quit the W-2. `filingStatus` does nothing.
- There's no NIIT on rental income above the threshold, and no exit tax at all.

## 4. Domain claims — fact-check

| Claim | Result |
|---|---|
| ND 4+ units = commercial (5% vs 4.5% taxable ratio) | **Verified** (ND Tax Commissioner) |
| No ND transfer tax | Consistent with sources |
| Primary Residence Credit $1,600 (HB 1176) | **Verified**, but it's a property-tax credit, not income tax |
| 3% cap | **Wrong target**: a levy cap, not a per-property cap |
| "ND reassesses on sale" | **Wrong mechanism**: annual mass reappraisal, 90–100% ratio band |
| 100% bonus depreciation permanent (OBBBA) | Consistent with sources |
| §461(l) $256K/$512K for 2026 | Consistent; not independently re-verified |
| §469(f)(1): REPS doesn't free old suspended losses | Correct reading of the statute |
| Seven-day rule, §1.469-1T(e)(3)(ii)(A); averaging in §1.469-1(e)(3)(iii) | Correct |
| *Mirch v. Commissioner*, T.C. Memo. 2025-128 | **Verified** (REPS/STR hours rejected for want of records) |
| CCA 202151005 | **Mis-summarised.** It holds that *substantial services* make STR income subject to SE tax. "No SE tax on a bare STR" comes from §1402(a)(1), not from the CCA. |
| Fargo lodging tax 2%/3%/5% | Sources point to **3%**, collected by Airbnb and **paid by the guest**, so it isn't an owner expense |
| Insurance +26% through 2028 (APCIA, 21 Sept 2026) | **Verified** (Insurance Commissioner). Covers 2025→2028, blended across residential, commercial and multifamily. |
| Vacancy 6.2% (Q2 2025) | Plausible. Fargo was 3.1% in mid-2024; a 2026 CRE report says ~5.8%. The 7% default is conservative. |
| DSCR prices below agency investment | **Not supported.** Vendor sources put DSCR 1–2pts *above* conventional. |
| Fannie 5% down on 2–4 unit owner-occupied | Correct (since Nov 2023) |
| FHA MIP 1.75% upfront / 0.55% annual | Correct |
| Special assessments "not modelled, absent" | Half right. Fargo's 2026 policy funds ~20% of street reconstruction by assessment, with caps rising 7.19%/yr through 2027. Listing tax figures *may* already include specials, inconsistently. |

## 5. Data

- The seven sold comps are the only transaction evidence. Everything after
  purchase #4 is an **archetype**, i.e. an average of 2–3 comps, and the 8-unit
  has zero comps.
- Archetypes carry every comp's quirks as averages: owner utilities $272/mo,
  in-place $818 against "market" $1,175. That averaged 44% rent gap is what the
  ramp harvests on every building.
- Listing tax figures range from 0.88% to 1.76% effective. That spread is too
  wide for one mill levy. School district and special assessments are the likely
  causes, and neither is recorded.
- A2's rent is "historical split evenly", A3/A4 rents are invented from bedroom
  counts, A5's unit count is contradictory, and insurance is estimated on 9 of 12
  properties. None of this is visible to any calculation. Provenance lives only
  in prose.

## 6. Interface and prose contradicting the engine

1. The DSCR-vs-agency callout (6.75% vs 7.75%), the engine (6.35/6.95) and
   DATA_NOTES (6.13–7.38 / 7.58–8.08) give three different answers.
2. Properties tab: "These are seven real Fargo sales" — the seven are disabled;
   the five in play are active listings.
3. The market panel says "Sept 2026 asking prices" over a sold-comps table,
   quotes stale $128K/$77K figures, and says a duplex "does not clear a 1.25 DSCR
   test" (contradicts both the correction and the 1.15 default).
4. Rules: "1.20–1.25 is typical" vs a shipped 1.15.
5. Owner-occupancy: "Applies only to purchase #1" — repeat house-hacking exists.
6. Cash-flow chart: "after … estimated tax" — it isn't.
7. Resilience: "bad tenant … on each property" — only property #1.
8. "Form 1007" for 2–4 units (should be Form 1025).
9. "3% annual increase cap (ND HB 1176)" — a levy cap.
10. Primary Residence Credit callout says duplex/triplex, while the engine
    applies it to anything.

## 7. Dead configuration (implies features that do not exist)

`opportunityFund.discountPct`, `taxAppeal.repeatYears`, `amortChoice.biweekly`,
`rentalOps.byroom.bedroomsPerUnit`, `setup.filingStatus`, and **the entire exit-tax
set**: `ltcgRate`, `recapture1250Rate`, `niitRate`, `niitThreshold`,
`ndLtcgExclusion`, `sellingCostPct`. `yearBuilt`/`yearRenovated` are stored and
affect nothing (they should drive maintenance, insurance and component age).
`opportunityFund.deployOn: 'discount'` behaves exactly like `'recession'`.

## 8. Tests

- 256 pass, but **several encode the engine's choices rather than the rule**:
  "at in-place rents a Fargo duplex/triplex/fourplex never clears DSCR" and
  "lender DSCR uses the market-rent schedule" assert exactly the two DSCR errors
  above. "Seller financing does not consume conventional loan slots" asserts a
  flag, not the slot count.
- **No coverage** for: FHA self-sufficiency, DTI, tax on the personal-use
  portion, the MIP-after-refi bug, library staleness, hash-driven eligibility
  concentration, real-vs-nominal expenses, after-tax cash flow, exit/liquidation,
  or any cross-check between UI prose and engine values.
- The browser suite fails 6/142 in this sandbox only because Chromium can't
  reach Google Fonts through the proxy. That's environmental, not a regression.

## 9. Framing — is it answering the right questions?

The engine answers "what happens if I follow these switches?" The decision you
actually face is:

> *Given my real income, savings, time and tolerance for risk, which sequence of
> actions gets me to the life I want soonest and most safely — and what should I
> do in the next 6–12 months?*

Four gaps follow from that:

- **No objective.** Nothing scores a plan against *your* goal, so the tool can't
  say which plan is better, only which number is bigger.
- **No counterfactual.** It never compares with "keep renting, invest the same
  $7K/mo in index funds", which is the bar every plan has to clear.
- **No uncertainty.** Every input is a point estimate, and the conclusion flips
  on the weakest one (§2). It needs ranges, and a probability of meeting the goal.
- **No near-term action plan.** It simulates 15 years, but what you act on is:
  what to buy first, what to ask the lender, what to verify on a listing, and
  what cash you need by when.

## 10. What your inventory didn't name (also in scope)

- **The contribution model.** It's a flat nominal schedule, disconnected from
  W-2 income, raises, quitting, or a partner.
- **The person.** Hours per week, your own housing path after the house-hack,
  health insurance after quitting, and credit score.
- **Lease-level reality.** Lease end dates, turnover, and renovation on
  turnover. This is where the ramp's truth lives.
- **Market supply.** A listing's lifespan, and how the deal pipeline actually
  works (MLS vs off-market).
- **Liquidity outside the plan.** Retirement accounts can satisfy lender reserves.
- **Persistence and migration.** Saved scenarios keep whatever library and
  defaults they were saved with. The `migrate()` function only fills missing
  keys, so corrected defaults never reach old scenarios.
- **The build/test harness itself.** It depends on external fonts, and nothing
  checks that UI prose agrees with engine values.
- **Legal/entity structure** and insurance coverage. These are gaps in the
  model, not in the math.
