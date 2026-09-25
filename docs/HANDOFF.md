# Fargo Portfolio Engine — project handoff

**Prepared 24 September 2026, for transfer into a fresh session.**
Companion files: `SOURCE.md` (complete code), `property-data.json` + `PROPERTY-DATA.md` (the input data and its provenance), `NEW-CHAT-PROMPT.md` (the brief for the next session).

---

## 1. What this is and who it is for

A deterministic, month-by-month simulation of building a small multifamily rental portfolio in **Fargo, North Dakota**. The owner's stated purpose, in his own words:

> *"The purpose of this tool is to most accurately predict the portfolio expansion with as many personalized details as possible. This helps me understand and confidently pick the best approach in every angle. This also helps me plan my actions, finances, and everything else to an exact — allowing me to achieve the desired goals with realism, authenticity, proven data, and solid evidence to support me."*

It is a planning instrument for one specific person in one specific market, not a generic rental calculator. Every default is Fargo-specific and sourced. The design principle that has governed every decision so far: **model the part that costs you something, and say so.** Where a strategy has a hidden price, the engine charges it and the interface names it.

The owner intends to go full-time in real estate at some point, currently has a W-2, and is renting (not a homeowner). He does **not** want outside capital beyond seller financing — no partners, no syndication, no private money.

---

## 2. Current state at a glance

| | |
|---|---|
| Source | 11 files, ~7,500 lines, vanilla JS, no framework, no runtime dependencies |
| Build | `node build.js` → `dist/index.html`, 313KB, fully self-contained |
| Tests | 256 engine tests (22 sections) + 142 browser tests (Playwright, light + dark). **All passing.** |
| Published | Engine app and a 68-strategy reference "playbook", both as private artifacts |
| Horizon | Default 15 years, configurable 1–30 |
| Determinism | Total. No randomness anywhere. Same config → same result, always. Several tests assert this. |

**Two things are deliberately true and should stay true:** the engine is a pure function of config (`runSimulation(cfg)` touches no DOM and runs in node), and every strategy ships **off by default** except two risk guardrails.

---

## 3. Decisions already made — do not re-litigate these

These came out of four rounds of structured questioning plus later follow-ups. They are settled unless the owner reopens them.

**Product shape**
- Interactive web app, not a spreadsheet or a static report.
- Property library **plus** auto-pick **plus** archetypes — all three, not one.
- Scenario comparison **and** automatic sensitivity sweep. (He qualified: *"only if you think it's realistically developable without a headache."* It was, and both exist.)
- Scenarios save to the account (currently artifact `db` capability).

**Acquisition and rules**
- Rate path over time with manual override — not a single fixed rate.
- Equity strategies **off by default**.
- Gates: lender reserves **and** DSCR **and** the 10-loan conventional cap — all three.
- Turnkey purchases with optional rehab, rather than rehab-first.
- Rules ladder: which unit types are allowed changes as the portfolio grows.
- Lender reserve **and** a personal emergency fund, modeled separately.
- Management is **threshold-triggered** and applies portfolio-wide once it fires.
- Profit handling: all three modes (reinvest all / fixed draw / draw after threshold), switchable.

**Owner-occupancy**
- Originally: applies to the **first** property only.
- Later extended at his request to repeat house-hacking, with a configurable count, a minimum gap between moves, and a higher down payment on the second and later ones (FHA is one loan at a time).

**Tax**
- Full tax modeling including depreciation, not a simplified effective rate.
- Cost segregation, REPS, the $25K allowance and the passive-loss machinery all modeled explicitly.

**Stress**
- Recession **and** scheduled vacancy/eviction/capex events. On the question of how to trigger them he said: *"Not sure how you plan on implementing these. Maybe a switch per run? Or randomized automatically for realism? Or another approach? Decide what's best."* → Implemented as explicit switches, because randomness would destroy determinism and make scenario comparison meaningless. **Keep determinism.** If probabilistic modeling is added, add it as a separate Monte Carlo layer on top, never by making the base run stochastic.

**Strategies (later round)**
- Model everything but default everything off.
- Model strategy chaining, but let him choose the combination per scenario rather than auto-optimizing.
- 1031 off by default.
- Risk guardrails on by default, **switchable off**.
- Rental type: model all three alternatives (mid-term, by-the-room, short-term) **per property**.
- Outside capital: **seller financing only**.

---

## 4. Architecture

```
build/
├── src/
│   ├── engine.js      1,971  the simulation — pure, no DOM, node-testable
│   ├── defaults.js      479  Fargo data, property library, DATA_NOTES, defaultConfig()
│   ├── ui.js            903  primitives (h/field/panel) + Setup, Properties, Rules tabs
│   ├── ui2.js           592  Timeline tab
│   ├── ui4.js           605  Strategies tab + stack ranking
│   ├── ui3.js           557  Portfolio, Compare, charts, sweep, resilience, boot  ← LAST
│   ├── styles.css       440
│   └── page.html         38  shell with /*__CSS__*/ and /*__JS__*/ placeholders
├── build.js              42  concatenate + sanity-check → dist/index.html
├── test.js            1,534  256 assertions, 22 sections
└── browsertest.js       375  142 assertions, Playwright
```

**Concatenation order is load-bearing:** `engine, defaults, ui, ui2, ui4, ui3`. `ui3.js` boots the app and must come last. Everything shares one scope in the bundle; the `module.exports` tails are stripped at build time.

### The month loop — order of operations

This ordering is the result of several real bug fixes. Changing it will break things in ways tests catch but that are easy to misdiagnose.

1. **Contributions** — plus a housing credit while owner-occupying (rent you stop paying elsewhere)
2. **January escalations** — property tax (with post-sale reassessment), insurance, HOA, utilities
3. **Per-property operations**, in this sequence per property:
   rent anniversary bump → rent-to-market ramp → owner-occupancy ends → appreciation → **income levers that mature on a schedule** (RUBS, ancillary, tax appeal) → rent roll → **rental-mode economics** → vacancy and scheduled events → opex → `loanStep` (interest-only handling) → balloon refinance → depreciation (shell + 1031 carryover slice + un-bonused short-life) → component replacements → scheduled capex → cash flow → **per-property taxable income split into passive / non-passive buckets**
4. **3b. Portfolio strategies** — HELOC limit and interest, cash-out refis, rate-and-term refis, 1031 exchange
5. **Management trigger**
6. **Year accumulation**
7. **Owner draw**, then HELOC repayment from surplus
8. **6b. Debt paydown** — only in `pauseAcquisitions` mode, where it outranks buying
9. **6c. Opportunity fund** — accumulate or release
10. **Acquisition attempt** — deal-flow gate → ladder → candidates → financing options (bank / seller / assume) → underwrite → cash, DSCR, cash-flow gates → **portfolio guardrails** → **deal hurdle** → HELOC bridge → purchase
11. **7b. December taxes** — *after* the acquisition, so a December purchase counts in that tax year
12. **7c. Debt paydown** — normal mode, only if nothing was bought this month
13. **Milestones**
14. **Record the row**

### Key structures

- **`runSimulation(cfg)`** returns `{ rows, acquisitions, milestones, years, summary, properties, projection, warnings }`. One `row` per month with ~60 fields.
- **Loans** carry `balance, rate, amortYears, payment, mipMonthly, balloonMonths, ioMonthsLeft, extraPrincipalPaid, recasts, sellerFinanced, assumed`.
- **Properties** carry their own tax/insurance/utilities, rent array, rent-ramp state, depreciation basis (split into shell / short-life / 1031 carryover), components with due dates, rental strategy, and the scheduled maturity months for RUBS, ancillary and tax appeal.
- **`DATA_NOTES`** in `defaults.js` is a provenance dictionary — ~40 entries, each explaining where a figure came from and how much to trust it. The UI surfaces these as expandable source notes. **This is one of the more valuable things in the system and should be extended, not dropped.**

---

## 5. Domain knowledge established

### North Dakota / Fargo specifics — high confidence, and commonly gotten wrong

- **Four or more units is COMMERCIAL for property tax in ND** (not 5+ as in most states). 1.343% residential vs 1.492% commercial of market value. Source: ND Tax Commissioner. Most templates get this wrong and understate every fourplex by 11%.
- **No real estate transfer tax in ND** — which is why 3% closing costs is right, not the 4–5% typical elsewhere.
- **ND income tax**: 2026 single — $0–49,575 = 0%, $49,575–250,400 = 1.95%, above = 2.50%. Lowest effective rate of any state that levies one.
- **ND Primary Residence Credit**: $1,600/yr (HB 1176, May 2025). Investment property does not qualify; it applies while owner-occupying. A fourplex being commercial-classified likely complicates it — **unverified**.
- **ND excludes 40% of net long-term capital gain** (N.D.C.C. 57-38-30.3). Applies to capital gain, not to ordinary §1245 recapture.
- **Insurance inflation ~8%/yr**, not 3%. ND premiums rose 14% in 2024–25; APCIA projects +26% through 2028. ND averages 38 thunderstorm days/yr; hail drives it.
- **Special assessments**: Fargo funds street/utility infrastructure *outside* the mill levy, billed per parcel. **Not modeled at all.** Every tax figure in the system excludes them.

### Tax rules implemented — verified against the regulations

- **§469(f)(1): qualifying for REPS in a later year does NOT release losses suspended before it.** Those can only offset income from the same activity. Almost every model gets this wrong. The engine follows the rule, which is why switching REPS on late does less than expected.
- **§461(l) excess business loss cap, 2026: $256,000 single / $512,000 joint** — *down* from $313K/$626K in 2025 because OBBBA reset the indexing base. Binds only after the passive rules. Excess becomes an NOL limited to 80% of future income.
- **$25,000 passive allowance** phases out 50¢ per dollar of MAGI over $100K, gone at $150K. **Never inflation-indexed since 1986** — so the engine holds these nominal, does not inflate them.
- **100% bonus depreciation is permanent** for property acquired after 19 Jan 2025 (OBBBA, P.L. 119-21, signed 4 July 2025; IRS Notice 2026-11 is interim guidance).
- **Cost segregation is a character trade, not free money** — converts §1250 property (recapture capped at 25%) into §1245 property (ordinary, up to 37%).
- **1031**: replacement basis splits. The **carryover** slice continues the *original* depreciation schedule over its remaining life; only the **excess** basis starts a fresh 27.5-year clock and is the only part bonus depreciation can touch. Suspended PALs do **not** release — a deferred exchange is not a fully taxable disposition.
- **The seven-day rule, §1.469-1T(e)(3)(ii)(A)**, verbatim: an activity is not a rental activity where *"the average period of customer use for such property is seven days or less."* With material participation the loss is **non-passive without REPS**. Average period is computed under **§1.469-1(e)(3)(iii)** — the *final* regulation; the temporary `1.469-1T(e)(3)(iii)` is **[Reserved]** — and is weighted by gross rental income across the class of property.
  - Material participation still required under one of the seven tests of §1.469-5T(a). The 100-hour test requires your hours to **equal or exceed those of any other individual** — a cleaning service alone can defeat it.
  - *Mirch v. Commissioner*, T.C. Memo. 2025-128, rejected 944.5 claimed hours in full for want of contemporaneous records.
  - No SE tax on a bare STR (CCA 202151005); substantial services flip it and **do** trigger SE tax.
  - **Only STR gets this.** Mid-term at ~91 days and by-the-room at 270+ days are rental activities. They earn a rent premium and **no** tax advantage.
- **ND lodging tax applies only to stays under 30 days** — mid-term escapes it entirely.

### Market data, with confidence

| Figure | Value | Confidence |
|---|---|---|
| Property tax residential / commercial | 1.343% / 1.492% | High |
| Appreciation | 3.5% | Medium — FHFA Fargo MSA: 20yr 3.89%, 10yr 4.74%, 5yr 6.29%. Haircut deliberately. |
| Rent growth | 3.0% | Medium — sources span 1.2% (ApartmentList) to 5.7% (Zumper). Clear deceleration. |
| Vacancy | 7% | Medium-low — Appraisal Services F-M survey says 6.2% but is ~15 months stale. Fargo went 2.2% → 10.2% between 2013 and 2018 on ~6,000 units of new supply. |
| Investment rate | 6.95% | High — Sept 2026 lender sheets |
| DSCR rate | 6.35% | High — and note DSCR currently prices **below** agency investment, which is unusual and worth exploiting |
| Market rent by bedroom | 1BR $1,000–1,050, 2BR $1,175–1,195, 3BR $1,550–1,805 | Medium-high |
| Maintenance / CapEx | 8% / 8% of rent | Medium — industry norm 8–12% for this vintage |
| Management | 10% + 75% of first month leasing ≈ 13% all-in | High (RenPro Fargo, July 2026) |
| Commercial loan terms | 7.25%, 20–25yr amort, 5yr balloon, 75% LTV, recourse | **Low — extrapolated** from upper-Midwest community bank patterns. Confirm with Bell, Gate City, Bremer, or Choice. |
| 8-unit pricing | $600K / $75K per unit | **Lowest confidence in the system — zero comps** |

---

## 6. Corrections already made — do not regress these

Each of these was a claim I made and then had to reverse. They cost real effort to establish; re-deriving them would be waste, and reverting them would be worse.

| I originally claimed | The correction |
|---|---|
| "A market-priced Fargo duplex loses money and fails DSCR; triplexes and fourplexes work" | Wrong. On the sold comps, at **in-place** rents **nothing** clears. At **market** rents **most** do. The binding constraint is rent, not property type. |
| Investment rate 7.75% | 6.95%. Lender sheets show DSCR at 6.13–7.38%, pricing below agency. |
| Minimum DSCR 1.25 | 1.15. DSCR lenders go to 1.0. |
| Maintenance 5% of rent | Corrected **upward** to 8%. Industry norm is 8–12% for this vintage. |
| DSCR should use my full 8% CapEx accrual | No. Lenders use a ~$300/unit/yr replacement reserve and, on 1–4 unit investment purchases, the **appraiser's market-rent schedule (Form 1007)**, not in-place rent. Underwriting on in-place rent rejects deals a bank would happily fund. The engine now computes `dscr` (lender) and `dscrConservative` (yours) separately. |
| REPS would unlock pre-REPS suspended losses | It does not. §469(f)(1). Caught before shipping. |
| More down payment and cheaper debt fix the failing comps | They do not. **Rent is the binding constraint.** |
| Deal quality is what limits the plan | **Capital is** — and after seller financing was added, **deal flow** became the binding constraint instead. Better deals gave +39% cash flow but only +$4K net worth; capital contributed per month dominates everything. |

**The most important meta-lesson:** the owner challenged my analysis once — *"I honestly don't think that is the industry norm"* — and he was right on two of three points. That challenge produced the single most valuable research pass in the project. Invite that, don't defend against it.

---

## 7. Bugs found and fixed — do not reintroduce

- **`String.replace` with `$'` in the replacement.** Every literal `$'` in the JS was being read as a substitution pattern and swallowing part of the file. Fixed by using replacer **functions** in `build.js`. A `new Function(js)` parse check was added to the build.
- **Tax override silently overwritten.** An entered tax bill was replaced by the market-rate formula at the first January. Fixed with a `taxIsOverride` flag plus growth-from-entered-value, and a separate `pendingReassess` path for the post-sale jump.
- **DSCR too strict** — see corrections above.
- **Chart text stretched** by `preserveAspectRatio="none"`; removed, `height:auto` added.
- **Chart labels overflowing the viewBox** — first label anchored `start`, last `end`, right padding increased. A test now asserts labels stay inside bounds.
- **Acquisition month reported 0 units** — the aggregate was computed before the purchase. The new property is now added to the aggregate after purchase.
- **Bonus depreciation landing one month late**, which pushed a December purchase into the wrong tax year. Fixed by applying `pendingBonus` immediately on purchase into both the monthly and yearly accumulators, *and* by moving the December tax block to after the acquisition step.
- **A "30% of sellers" filter selecting all or none.** A polynomial hash put sequential ids (A1, A2, A3) into sequential buckets. Replaced with FNV-1a plus a final avalanche. A test asserts the hash scatters.
- **Guardrails silently deleting the whole plan.** Defaults set at *prudent* levels (0.95 portfolio DSCR) blocked every purchase, because the real plan genuinely runs at 0.32 coverage and 98% LTV. Defaults were reset to **ruin-avoidance** levels with an explicit note explaining why, and a test asserts the shipped guardrails do not change the baseline result.
- **Unlimited deal supply.** Stacked strategies were "buying" 12 buildings a year in a market that transacts perhaps 25–30 total. A deal-flow cap was added (3/year, 2 months apart), which cut the extreme runs roughly in half.

---

## 8. Measured results — the $7,000/month plan

Baseline: $7,000/mo contributions from Jan 2027, zero starting capital, FHA fourplex house-hack first, 15-year horizon, deal flow capped at 3/year. Cash flow is a trailing 12-month average.

| Run | Buys | Units | Cash flow | $/unit | Debt | Net worth | vs base |
|---|---|---|---|---|---|---|---|
| **Baseline** | 16 | 48 | $4,276 | $89 | $3.28M | $3.54M | — |
| RUBS | 20 | 60 | **$13,405** | $223 | $4.17M | $4.14M | +$606K |
| RUBS + ancillary + appeal | 21 | 63 | $16,286 | $259 | $4.37M | $4.40M | +$863K |
| Seller financing | 24 | 72 | $1,884 | $26 | $5.44M | **$4.59M** | **+$1.06M** |
| Paydown after 5 buys | 6 | 18 | $11,894 | $661 | **$0** | $2.98M | −$563K |
| Paydown, no recast | 6 | 18 | $10,366 | $576 | $20.9K | $2.87M | −$673K |
| Cost seg + REPS | 17 | 51 | $4,938 | $97 | $3.40M | $3.93M | +$391K |
| HELOC line | 22 | 60 | −$2,732 | −$46 | $4.66M | $4.02M | +$486K |
| Cash-out refinancing | 25 | 73 | $70 | $1 | $6.84M | $3.73M | +$196K |
| Interest-only 10yr | 19 | 57 | $6,739 | $118 | $4.23M | $3.74M | +$203K |
| 1031 exchange | 15 | 48 | $3,465 | $72 | $3.42M | $3.50M | −$39K |
| Mid-term furnished | 9 | 27 | −$190 | −$7 | $1.87M | $2.50M | −$1.04M |
| Short-term nightly | 4 | 12 | −$8,555 | **−$713** | $0.85M | $1.38M | **−$2.16M** |
| Deal hurdle rate on | 2 | 4 | $1,398 | **$349** | $0.35M | $1.85M | −$1.69M |
| **The cash-flow build** | 7 | 21 | **$14,916** | **$710** | $70.7K | $3.21M | −$326K |
| **The net-worth build** | 39 | 148 | **−$1,494** | −$10 | $12.7M | **$7.68M** | +$4.14M |

### What the numbers mean

**The levers split into two families that pull against each other.** One buys doors (seller financing, HELOC, cash-out refi, house-hacking): grows net worth, shrinks cash flow per unit, because every door arrives with debt. The other retires debt or raises rent on doors you already own (paydown + recast, RUBS, ancillary, tax appeal): grows cash flow, caps net worth. **Per-unit cash flow is the honest measure**; total cash flow just rewards whatever bought the most doors.

**Recast is the whole debt-paydown strategy.** Extra principal without one shortens the term but never lowers the payment — zero extra income until the loan is fully retired. The no-recast run ends with *less* debt and $1,528/mo *less* cash flow.

**Paydown timing matters more than paydown ordering.** Starting after the 5th purchase beats starting immediately by $407K of net worth *and* $1,335/mo of cash flow. The five ordering modes (avalanche / snowball / highest-payment / thinnest-coverage / target) converge by the end of a long horizon; only the path differs.

**Stacking everything is not the best version of anything.** The net-worth build reaches $7.68M and **−$1,494/mo** against $12.7M of debt — it needs outside money every month to survive.

**The short-term rental result is the sharpest finding.** The seven-day tax treatment works exactly as the regulation says — it turns a $55,853 tax bill into a $77,060 refund with no REPS. And the strategy is still the worst in the model, because Fargo nightly economics don't support it and a lender underwrites the building on its long-term rent. A genuine loophole attached to a bad business.

---

## 9. Strategy inventory

68 catalogued (49 built, 19 not). Compact list — detail lives in the published playbook artifact and in the code comments.

**Getting in with less capital** — house hacking (FHA 3.5%) · serial house-hacking · seller financing · loan assumption · DSCR loans · local bank portfolio loans · discount points · interest-only · *[not built: subject-to · master lease with option · FHA 203(k) · delayed financing exemption · blanket loans · ND buyer programs]*

**Getting capital back out** — cash-out refinance · portfolio HELOC · free-and-clear line uplift · 1031 exchange · mortgage recast · *[partial: BRRRR]*

**Shaping and retiring debt** — debt paydown with 5 orderings (avalanche, snowball, highest-payment, thinnest-coverage, target) · 3 allocation policies · extra principal drip · rate-and-term refinance · term preservation on refi · balloon management · *[not built: biweekly payments — the config flag exists and does nothing, which is worse than absent]*

**Making the building earn more** — rent-to-market ramp · RUBS · ancillary income · value-add rehab · mid-term furnished · by-the-room · short-term nightly · *[not built: adding a unit / basement ADU · housing choice vouchers]*

**Making it cost less** — property tax appeal · self-management vs. threshold-triggered PM · scheduled component replacement · *[not built: insurance shopping and deductible strategy · energy retrofit to cut owner-paid heat]*

**Tax** — cost segregation · 100% bonus depreciation · REPS · the seven-day rule · $25K allowance · ND Primary Residence Credit · the four-unit tax line · *[not built: §1.469-4 grouping election · installment sale on exit · hold to step-up in basis · §199A QBI · Opportunity Zones]*

**Timing and opportunism** — opportunity fund (dry powder) · counter-cyclical buying · pausing in a downturn · deal hurdle rates · *[not built: off-market / direct-to-seller acquisition]*

**Not going broke** — portfolio guardrails · deal-flow limits · emergency fund + lender reserves · recession and rate-shock testing · *[not built: entity and liability structure · staggered lease expirations]*

---

## 10. Known gaps, ranked

**Would change an answer you'd act on:**

1. **No modelled exit.** There is no sale other than a 1031. Every net-worth figure is **unrealised** — a $7.68M portfolio with $12.7M of debt and heavy §1245 recapture is worth far less liquidated. Strategies are currently being compared on a yardstick that ignores the tax bill at the end.
2. **Special assessments.** Fargo bills infrastructure outside the mill levy, per parcel, hundreds to thousands a year. Absent, not estimated.
3. **Off-market deal flow as a channel.** Deal flow is a cap, not a channel with cost-per-contact, conversion rate, price discount and its own supply. It is now the binding constraint on every stacked strategy — the model runs out of buildings before it runs out of money — and the one lever that would relieve it is unmodelled.
4. **Per-property rent rolls and lease dates.** No lease end dates, no turnover timing, no unit mix by bedroom count. One listing has all four leases ending the same day. Unit mix drives market rent → DSCR → fundability.

**Worth building:** §199A QBI (engine overstates tax on profitable runs by up to a fifth) · partial dispositions / component retirement · lumpy rather than flat vacancy · sensitivity and break-even analysis · entity and liability structure · refinancing out of FHA MIP (~$150/mo forever on the first and most important building).

**Nice to have:** biweekly payments (or remove the dead flag) · ARMs and a floating HELOC rate (a rate shock currently doesn't reach the HELOC, understating exactly its risk) · inflation on personal living expenses (constant across 15 years = 56% understatement) · tenant quality and bad-debt rates by strategy · simultaneous rather than sequential shocks · exportable plan for a lender · confidence bands on inputs that are ranges in the source · regulatory-change risk.

---

## 11. Open questions — unresolved, flagged in the UI

- **Fargo lodging tax rate: 2%, 3% or 5%?** Three sources, three answers. Default set to 5% (most conservative). Confirm with the ND Tax Commissioner and the City of Fargo.
- **Does Fargo require a short-term rental permit?** Appears not — but that rests on a vendor blog plus the *absence* of a city page, which is weak. The Land Development Code rewrite is live in 2026 and West Fargo passed an STR ordinance in June 2025.
- **Does the ND Primary Residence Credit survive a commercial-classified fourplex?** Unverified.
- **Commercial loan terms** are extrapolated, not sourced. Confirm with a named local bank.
- **Is F2's $581/unit real, or a vacancy artifact?** It carries a lot of the rent-gap thesis.
- **A5: four units or five?** The listing contradicts itself. Changes both the financing product and the property tax class.
- **Cost segregation reclassification %** — every source for the 20–40% range is a cost segregation vendor, and one disclaims its own table as calculator assumptions rather than data.

---

## 12. Testing philosophy

`test.js` is not incidental — it **encodes the domain rules as executable assertions**. Sections 3, 7, 14, 19 and 22 in particular are where the ND tax classification, the depreciation and passive-loss machinery, the in-place-vs-market-rent finding, the seven-day rule and the two-bucket tax reconciliation are pinned down. A change that breaks those is almost certainly wrong about the law or the market, not about the code.

Specific invariants worth preserving:
- Determinism: same config → identical output.
- Economic monotonicity: more money in must not produce a worse outcome.
- The two tax buckets must reconcile to total taxable income every month (asserted to within $0.50).
- Shipped guardrails must not change the baseline result.
- Charts must keep their labels inside the viewBox.

Run both suites after any engine change: `node test.js && node browsertest.js`. Browser tests need `executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'` in this environment.

---

## 13. Traps

- **Don't make the base simulation stochastic.** Determinism is what makes scenario comparison meaningful. Monte Carlo belongs as a layer on top.
- **Don't "simplify" the build's replacer functions back to strings.** See §7.
- **Don't set guardrail defaults to prudent-sounding values** without checking they don't delete the plan. Ship them loose and make tightening them an explicit act.
- **Don't drop `DATA_NOTES`.** Provenance is half the value of this thing.
- **Don't let a strategy default to on.** The owner asked for everything off so he can see each one's isolated effect.
- **Don't confuse total cash flow with per-unit cash flow** when ranking strategies.
- **Don't trust the 8-unit archetype.** Zero comps.
- **Don't treat net worth as the objective.** The net-worth-maximising stack is cash-flow negative and, without an exit model, its headline number is partly fictional.
