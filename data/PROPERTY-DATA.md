# Fargo property data — provenance, quality, and what I think of it

**Companion file:** `property-data.json` (machine-readable, same data)

> **Schema version 2 (26 September 2026).** Values are unchanged from version 1. Version 2 adds structure the rebuilt engine reads:
> `status` (sold comps vs active listings), `collected` and `availableUntil` (listings expire six months after collection),
> `unitBedrooms`, `leaseEnds` and `vacantUnits` per unit, `ownerPaysHeat` and `heatShare`, `rubsInPlace` and `rubsRecoveryPct`,
> `otherIncomeIsLaundry`, `condition`, `specialAssessmentsAnnual`, `taxYear`, and a `prov` object flagging each field as stated,
> derived or estimated. Archetypes are now low/mid/high anchors taken from the comps (price per unit, in-place rent as a share of
> survey rent, owner utilities, insurance, year built, who pays heat) instead of one average. `marketObservations` holds survey rents
> by bedroom, the Fargo Housing Authority 2026 payment standards, a placeholder utility-allowance schedule, vacancy surveys, rates,
> insurance and appreciation observations. The narrative below is the original companion text and still describes the data itself.

---

## Where this data came from — read this first

This is **not** curated, validated, or authoritative data. Two separate collections, gathered differently:

**The seven sold comps (`F1`–`F7`).** The user pasted a list of recently sold Fargo multifamily properties that he had copied off public real-estate listing websites, in September 2026. He supplied links for only the first few. I transcribed the figures from what he pasted. His own framing was: *"Here are some 2, 3, and 4 units. Didn't get to 8 units yet. Add these accordingly. Lmk if any info is missing or you think is really inaccurate."*

**The five active listings (`A1`–`A5`).** I found these myself via web search in September 2026, after the user pushed back on my analysis: *"I honestly don't think that is the industry norm or what is average for deals like this... maybe look at a listing or two real listings from Fargo, North Dakota that match this."* That challenge was correct and productive — see the corrections section of `HANDOFF.md`.

**What this means for the next model:** every number here is a transcription of a *marketing listing*, not a rent roll, not a tax statement, not an appraisal, and not an insurance quote. Listing income figures are routinely pro-forma, stale, or internally contradictory. Several of these are demonstrably all three. Treat the whole file as a starting hypothesis to be verified property by property.

Prices, rents and taxes are as-listed. The engine drifts them forward from the collection date when a simulation starts later than September 2026.

---

## The seven sold comps: what they actually establish

| | Units | Sold | $/unit | In-place rent/unit | Market rent/unit | Built | Owner-paid utilities/yr |
|---|---|---|---|---|---|---|---|
| F1 · 915 9th St S | 4 | $420,000 | $105,000 | $1,038 | $1,175 | 1987 | **$0** |
| F2 · 1605 5th Ave S | 4 | $324,000 | $81,000 | **$581** | $1,175 | 1984 | $2,400 |
| F3 · 2814 8th St N | 4 | $325,000 | $81,250 | $835 | $1,175 | 1958 | $7,404 |
| F4 · 817 9th St S | 3 | $194,500 | $64,833 | $683 | $1,175 | **1898** | **$9,864** |
| F5 · 1629 2nd Ave S | 3 | $224,000 | $74,667 | $900 | $1,175 | 1949 | $3,240 |
| F6 · 3119-3121 10th Ave N | 2 | $267,000 | $133,500 | $1,000 | $1,550 | 1975 | $1,320 |
| F7 · 3025 18th St S | 2 | $295,000 | $147,500 | $1,318 | $1,550 | 1983 | $2,460 |

**Totals: 22 units, $2,049,500, blended in-place rent $873/unit/month.**

### Three findings these comps support, with high confidence

**1. The duplex penalty is real and large.** Per unit: duplexes $140,500, triplexes $69,750, fourplexes $89,083. You pay roughly **twice per door** for a Fargo duplex. Earlier asking-price research said the same thing ($128K vs $77K per unit); the sold data confirms it independently. Buyers are paying for house-like duplexes, not for income.

**2. In-place rents run far under survey rents.** Blended $873/unit against a $1,075 market-survey figure — **19% low**, with individual buildings at $581. Market surveys measure professionally managed large complexes. Fargo small multifamily is older stock with long-tenured tenants and, often, landlord-paid utilities. *Underwrite on in-place rent; treat the gap as upside, not as income.*

**3. Owner-paid utilities are the decisive expense, not a rounding error.** Five of seven have the landlord paying some combination of heat, water, sewer, trash and lawn. The range is $1,320 to $9,864 a year. On F4 it is **40% of gross rent**. In a −20 °F climate, whoever pays the heat bill determines whether the deal works. This is the single most-overlooked line item in every generic rental calculator.

### What the comps do *not* support

- **No 8-unit comp exists.** The user said he "didn't get to 8 units yet." The 8-unit archetype in the engine is **extrapolated** from adjacent product ($55–90K/unit for Class B/C workhorse stock) and is the lowest-confidence figure in the entire system. Flag it loudly; do not let a plan rest on it.
- **Only 2 of 7 clear DSCR at in-place rents.** At market rents most do. The whole investability of this market hinges on whether you can actually move rents, and on what timeline.

---

## Data quality flags — what is stated vs. what I estimated

| Flag | Affects | Detail |
|---|---|---|
| **Insurance is estimated on 4 of 7 sold comps** | F1, F2, F3, F6 | Estimated at $800/unit/yr, the average of the three listings that stated it. F4's stated $2,750 for a 3-unit is the highest per door and is what a 128-year-old building genuinely costs. |
| **Component ages are estimates** | all except F5 | Roof/HVAC/water-heater ages are inferred from year built. Only F5 states a roof age (under 8 years). Getting these wrong moves five-figure costs by years. |
| **F2 contradicts itself on utilities** | F2 | The listing says tenant pays electricity *and* owner pays electricity, sewer, water. I assumed owner pays sewer + water + trash. Verify. |
| **F2's rents may be vacancy artifacts** | F2 | $581/unit against $1,175 market is a 51% gap — implausibly large. Either long-tenured tenants or units were empty when income was reported. This single property carries a lot of the "rent gap" thesis; if it is wrong, the thesis weakens. |
| **F2's laundry is leased, not owned** | F2 | Produces no income to the buyer. Easy to double-count. |
| **Tax years are inconsistent** | F4, F7 (2024); rest 2025 | F4 and F7 carry 2024 bills. Older figures understate the current bill. |
| **F5 appears over-assessed** | F5 | $3,617 on a $224K sale is **1.615%**, above even the ND commercial rate of 1.492%. A successful appeal is worth real money here, and it is evidence that assessments in this market are not uniform. |
| **Post-sale reassessment is not in these numbers** | all | Every stated tax bill predates the sale. ND reassesses on sale; the engine models assessed ≈ 93% of sale price. On F1 expect roughly +$1,500/yr. |
| **Special assessments are entirely absent** | all | Fargo bills street and utility infrastructure *outside* the mill levy, parcel by parcel. Can be hundreds to thousands per year. **No figure in this file includes them.** Pull the actual parcel statement before committing. |
| **Market rents are by bedroom count and I applied them bluntly** | all | The two duplexes are 3BR units and belong against $1,550, not a blended figure. The fourplexes are assumed 2BR. Unit mix drives market rent, which drives DSCR, which drives whether a deal funds at all — and unit mix is not reliably captured here. |

---

## The five active listings: buyable, and shakier

| | Units | Asking | In-place rent/unit | Owner utils/mo | Notable |
|---|---|---|---|---|---|
| A1 · 1809 13.5 St S | 4 | $315,000 | $692–782 | $278 | **Transferrable RUBS system conveys with the sale.** Best value-add on the market. |
| A2 · 1105 11th St N | 4 | $330,000 | ~$789 | $0 | Two units recently vacated — the income figure is historical. Tax is heavy at 1.62%. |
| A3 · 1036 14th St N | 2 | $265,000 | $1,250 est. | $0 | Tenants pay **all** utilities plus lawn and snow. Renovated 2025. Seller paid $245K in Dec 2024. |
| A4 · 1806 8th Ave S | 2 | $250,000 | $1,100 est. | $0 | Tenants pay all. Tax is **0.88% of price** against a 1.34% norm — understand why before assuming it holds. |
| A5 · 826 21st St S | 5 | $350,000 | $797–1,169 | $110 | The only one that cash flows from day one (~+$995/mo). **Five units means commercial financing** — no FHA. |

### Active-listing flags

- **A3 and A4 rents are estimated, not stated.** Both listings give no income. I inferred rents from bedroom count. These are the two that look cleanest on paper *because* the numbers are mine, not the seller's. That is a trap.
- **A1 price is inconsistent across sources** — $315K on three sites, $319K on the homes.com detail page.
- **A5 unit count is inconsistent within the same listing** — described as 5 units, property facts say 4. This changes the financing product *and* the property tax class. Must be resolved before use.
- **A2's claimed 8% cap rate is pro-forma**, at stabilized rents, not in-place.
- **A1's leases run to 30 April 2027** and **all four end on the same day** — four simultaneous vacancies in a Fargo spring is a very different event from four spread across a year. The engine does not model lease expiry dates at all (see gap list in `HANDOFF.md`).
- Insurance is estimated on all five.

---

## Derived archetypes — and why they exist

The engine falls back to **archetypes** when the property library is exhausted, so a 15-year simulation does not simply stop buying. These were rebuilt from the sold comps (not from asking prices):

| Archetype | Price | In-place rent/unit | Market rent/unit | Built from |
|---|---|---|---|---|
| Duplex | $281,000 | $1,159 | $1,550 | 2 sold comps |
| Triplex | $209,250 | $791 | $1,175 | 2 sold comps |
| Fourplex | $356,333 | $818 | $1,175 | 3 sold comps |
| 8-unit | $600,000 | $850 | $1,050 | **EXTRAPOLATED — no comp** |

**This is a significant modeling assumption and it deserves scrutiny.** Any run longer than a few purchases is mostly buying archetypes, not real listings. The archetype is therefore doing more work in the results than the real data is. A better design would probably treat deal supply as a distribution rather than a single representative building — see the gap list.

---

## My opinion on the data, plainly

The sold comps are the most valuable thing in this system, because they are *transactions* rather than asking prices, and because they independently confirmed a per-door price structure I had previously derived from listings. Seven is a small sample but they cluster tightly enough to be useful.

The weakest links, in order:

1. **The 8-unit archetype.** Zero comps. Pure extrapolation. Anything in a plan that depends on stepping up to 8-units is resting on air.
2. **F2's $581 rents.** If that building was half-empty when the income was reported, the blended $873 figure moves up meaningfully and the "19% below market" finding softens.
3. **Estimated rents on A3 and A4.** The two cleanest-looking active deals have rents I invented from bedroom counts.
4. **Insurance across the board.** Estimated on 9 of 12 properties, in a state where premiums rose 14% in 2024–25 and are projected +26% through 2028.
5. **Special assessments, which are simply missing.** Not estimated — absent. On a street-reconstruction parcel this could be thousands a year and would change which properties are viable.

If the next model does one thing with this file, it should be to build a **data-confidence layer** into the engine: every input carries a source, a confidence level, and a flag for whether it is stated, derived, or invented — and results should be able to show which conclusions depend on the weak inputs. Right now the provenance lives in prose notes that no calculation can see.
