# Phase 3 — Analysis and build plan

*26 September 2026. For your review before any code is written. Section 6 is
the build order; section 7 is what I'm leaving out. If you change nothing
else, check those two.*

Confidence labels as before: **Verified** (primary/official source),
**Vendor** (lender or vendor material only), **Estimate** (industry range or
my reasoning), **Guess** (no evidence — shown as a range and flagged
wherever it's used), **Yours** (a figure you set).

---

## 0. What I'm building to — your answers, compressed

| Topic | Decision |
|---|---|
| Inputs | Tool runs on whatever you enter. Rules switch on only when their input exists (no W-2 → contributions only, no DTI test). |
| Contributions | One level per run, entered as a schedule. No capital map. |
| W-2 | A schedule over time; every income-dependent rule re-checked each year. |
| Objective | **Headline: after-tax real-estate income at a target date, 80% case.** "Replace my salary" built alongside as the second objective. |
| Uncertainty | Seeded Monte Carlo layer on top of the deterministic core; plans ranked on the 80% case. |
| Career | Two stages: part-time when the portfolio covers the gap, quit when it covers everything. Lending and tax consequences follow. |
| Housing | Stay in a house-hack for years, chain house-hacks, buy your own home later. No "rent forever" assumption. |
| Would do | House-hack, self-manage (time-budgeted), renovate between tenants, balloon and recourse debt. |
| Rent-to-market | Turnover-driven: rents reset when tenants leave, with a refresh cost and downtime. |
| Prices | One price index; cap rates constant by default and editable as a separate assumption. |
| Idle cash | Per-scenario policy: best after-tax use, money market/T-bills, index fund, precious metals, bigger down payments, paydown, **your investments at 1%/mo or 2%/mo** (fixed, as you specified). Parking only — never competes with buying. |
| Deal supply | Sourcing channels (MLS, off-market) with cost, conversion, discount, supply. Off-market uses industry ranges, flagged, until you have real numbers. |
| Management | Hired when your hours exceed a weekly time budget; unit count as the alternative trigger. |
| New levers | Housing Choice Vouchers, real estate license, tenants on their own heat. |
| Rental modes | Per unit, with corrected numbers. |
| Stop rules | Cash buffer, run of negative cash-flow months, job or income loss → hold-and-survive. |
| Exit | Every result shows held and sold values. |
| Recommender | Proposes top plans within your would-do set; you choose. |
| Catalogue | Cut from 61 records to about 30 real choices; the rest retired, merged, moved to rules, or parked — each documented. |
| Screens | Desktop-first. Plan discovery first; then "should I buy this one?" (with paste-to-fill via Claude) and "what do I do next?". |
| Not now | Plan-vs-actual tracking (later, extensively), exports beyond JSON, 5–50 unit scale, renovation loans. |
| Publishing | Same link, clean start. Old scenarios are not loaded; nothing is deleted unless you say so. |

## 1. The premise, restated

The engine should answer one question well:

> **At the contribution level I enter, which plan gives me the most after-tax
> real-estate income by my target date in 80% of plausible futures — what does
> it trade away, what does it rest on, and what do I do next?**

Everything below is judged by whether it makes that answer more correct, more
trustworthy, or quicker to act on.

---

## 2. Part-by-part analysis

Each part answers five questions: **what it does now**, **what it should do**,
**what's missing**, **what would make it materially better**, and **what would
have to be true for my redesign to be wrong**.

### 2.1 Inputs and how they're collected
- **Now:** ~250 fields across 7 tabs. Defaults hard-coded in three places
  (engine fallbacks, `defaults.js`, UI prose), which is how the prose drifted
  from the engine. Provenance is prose only; no field knows its own range,
  unit, source or confidence.
- **Should:** one **field registry** — every input declared once, with label,
  unit, default, plausible range, Monte Carlo distribution, source note,
  confidence, as-of date, *when it's relevant* (dependencies), and *what it
  affects*. The UI, validation, provenance popovers, uncertainty layer,
  sensitivity ranking and stale-data warnings all read from it. Prose numbers
  are generated from it, so they can't drift again.
- **Missing:** dependency awareness. Seller-finance terms show when seller
  financing is off; FHA settings show when no house-hack is planned; W-2 rules
  run when no W-2 is entered.
- **Better:** the registry makes the interface smaller as well as more capable.
  You see only fields that currently matter, each with its confidence, and
  irrelevant ones show *why* they're hidden ("off because seller financing is
  off").
- **Wrong if:** you'd rather see every field at once. Mitigation: a
  "show everything" toggle.

### 2.2 Time-varying drivers
| Driver | Now | Rebuilt |
|---|---|---|
| Market rent | Survey rent drifts 3%/yr | Market-rent index per unit type, 3%/yr default (**Estimate**, sources span 1.2–5.7%); Monte Carlo samples a year-to-year path |
| Prices / values | Appreciation 3.5%, independent of rents | One price index = rents ÷ cap-rate path. Default cap drift 0, so values grow with rents (~3%); cap drift editable and sampled |
| Interest rates | Declining forecast path 6.95%→6.30% | **Flat at today's rates by default** (no forecast baked in); editable path; sampled as a random walk; shocks reach HELOCs and every refi/balloon |
| Insurance | 8%/yr for 15 years | 8%/yr through 2028 (the APCIA/Commissioner figure, **Verified**), then 4%/yr (**Estimate**); sampled |
| Property tax | Rate × value with a per-property 3% cap; one-shot "reassess on sale" that can *cut* | Assessed value tracks market value at ~93% (inside Fargo's required 90–100% band, **Verified**). The stated bill is a floor — never auto-cut; cuts come only from the appeal strategy. Special assessments are their own line (default **Guess** $400/parcel/yr, range $0–1,500, flagged) |
| Your expenses | Flat nominal | Inflate at CPI; shown in today's dollars |
| Contributions / W-2 | Step schedule, disconnected | Both schedules, coupled to career stages |
| Idle cash | 0% | Earns the chosen vehicle's yield, taxed per vehicle |
- **Wrong if:** Fargo cap rates compress again the way they did 2006–2021.
  That's why cap drift is an explicit, visible, sampled input rather than a
  silent side effect.

### 2.3 Rules and gates — the lending model (largest correctness change)
**Now:** one NOI-based DSCR test for every product, fed by the *greater* of
in-place and market rent; 6 months of PITI on every property; no DTI; no FHA
self-sufficiency test; every balloon refinances successfully; MIP forever.

**Rebuilt — each product gated the way that product is actually underwritten:**

| Product | Gate | Reserves | Other rules |
|---|---|---|---|
| FHA (owner-occ 1–4, one at a time) | DTI ≤ ~50% if a W-2 is entered (counts 75% of other units' rent); **self-sufficiency for 3–4 units**: 75% of appraised rent on *all* units ≥ PITI | 3 months (3–4 units) | 3.5% down, 1.75% UFMIP financed, 0.55% MIP for life of loan; **no recast** |
| Conventional owner-occ 2–4 | DTI ≤ 45% | 6 months | 5% down; PMI drops at 78% LTV; counts toward Fannie's 10 |
| Conventional investment 2–4 | DTI ≤ 45% with 75% of lease rents | 6 months subject + 2/4/6% of other UPB (**Verified**, Fannie B3-4.1-01) | 25% down; max 10 financed properties incl. your home |
| DSCR (non-QM) | Gross rent (lesser of lease and market; vacant units at market) ÷ PITIA ≥ 1.0 (**Vendor**) | 6 months subject | 25% down; 5-4-3-2-1 prepayment penalty (hits early refis and sales); no count limit; can close in an LLC |
| Local bank / commercial (5+ units) | NOI ÷ debt service ≥ 1.20 with imputed vacancy, management and reserves | 6 months | 25% down, 20–25 yr amortization, 5-yr balloon, recourse |
| Seller financing | Negotiated; source is off-market channel | — | Balloon → **refinance test at the balloon date** |
| Assumption | Equity gap in cash | — | Continues original loan |

- **Product choice:** the engine picks the cheapest qualifying product for each
  purchase and says why. You can force an order.
- **Balloon test:** at each balloon date, the new loan is limited by that year's
  LTV and coverage at that year's rate. Any shortfall must come from cash. If
  there isn't enough, it's a forced-sale event and a circuit-breaker trip. This
  is what makes balloon risk visible in the 80% case.
- **Rates (Sept 2026, confirm with quotes):** FHA 6.87% (**Vendor**, lender
  sheets); conventional owner-occ 7.00% (**Estimate**); conventional
  investment 2–4 7.60% (the low end of the engine's own source note); DSCR 2–4
  with 5-yr prepay 7.35% (**Vendor**: typical 7.0–7.5% + 2–4 unit add-on);
  commercial 7.25% (**Estimate**, extrapolated); investment HELOC 9.25%,
  floating.
- **Wrong if:** your local bank uses market rent on below-market leases.
  Possible for portfolio loans, so "lender rent basis" is a setting (default
  lesser-of), and "ask this" goes on the lender question list.

### 2.4 Operations — rent roll, turnover, vacancy, costs
- **Now:** rents ramp to survey rent in 12–18 months for free; flat 7% vacancy;
  maintenance 8% + CapEx 8% into an uncapped pool that never releases;
  components with guessed ages; three components off by default.
- **Rebuilt:**
  - **Unit-level leases.** Each unit has in-place rent, market rent for its
    type and condition, and a lease end date (from the listing where known,
    otherwise staggered).
  - **Turnover model.** At each lease end the tenant stays or leaves.
    - **Stays:** renewal rent rises by your renewal policy (e.g. +6%/yr for
      below-market tenants), capped at market.
    - **Leaves:** 1 month of downtime (1.5 months for Nov–Feb move-outs), a
      $1,500 basic turn, and an optional $5,000 refresh. Then the unit
      re-lets at full market if refreshed, or at 90% of market if not.
    - All of these are **Estimates** you can change.
    - In the deterministic run this uses expected values, so it stays
      smooth and reproducible. The Monte Carlo layer draws actual stay/leave
      events per unit, so it's lumpy like real life.
  - **Vacancy becomes an output** (turnover downtime + credit loss + a market
    softness term), not a single input. It should land near Fargo's surveyed
    3–6%; I'll check it does.
  - **Maintenance by building age** (≈7–10% of rent from `yearBuilt`,
    **Estimate**). Components derive ages from `yearBuilt` when unknown, all
    six are on, and the CapEx reserve fills to a target per unit (default
    $2,000) and then stops. Excess stays spendable.
  - **Tenants-on-own-heat project:** a per-building capital project with cost,
    payback and rent-resistance offset. It interacts with RUBS (do RUBS until
    the boiler's end of life, then convert) and with vouchers (tenant-paid
    heat raises the utility allowance, which lowers the voucher-approvable
    rent).
- **Wrong if:** Fargo tenants accept large increases without leaving (then
  the old fast ramp is closer to right), or refreshed units still can't reach
  survey rent (then the gap is smaller still). The Monte Carlo layer samples
  both. Real rent rolls are the fix, and they go on the verify list.

### 2.5 Tax
- **Keep (verified):** the two-bucket passive/non-passive structure,
  §469(f)(1), the $25K allowance, §461(l), the seven-day rule, bonus
  depreciation, the 1031 basis split, and ND's 4+ unit classification.
- **Fix or add:**
  - Progressive federal and ND brackets instead of one flat 24%.
  - **§199A QBI 20%** (permanent under OBBBA, **Verified**), gated on 250
    hours of rental services from the hours ledger. Manager hours count.
  - NIIT above $200K when not REPS.
  - The personal-use portion of a house-hack is non-deductible.
  - HELOC interest is deductible.
  - Closing costs go into basis.
  - De minimis expensing of turn costs up to $2,500 per item.
  - The Primary Residence Credit becomes what it is: a property-tax credit, one
    per household. Fourplex eligibility is flagged as unconfirmed.
  - REPS is tested from the hours ledger (>750 hours and > your W-2 hours)
    rather than typed as a year. You can still force it.
  - The grouping election when REPS applies.
- **Exit (new):** "if sold" values for any date: selling costs (6%,
  **Estimate**), unrecaptured §1250 at ≤25%, §1245 recapture on cost-seg
  property at ordinary rates, capital gain at 0/15/20%, NIIT, ND with its 40%
  LTCG exclusion, and release of suspended losses on full disposition. "If
  held" = unrealised, i.e. step-up at death.
- **Wrong if:** your CPA disagrees on QBI eligibility for your setup. It's one
  switch, and the result shows the difference.

### 2.6 Strategies — see §4 for the full catalogue
- **Now:** 49 built, mostly independent switches, some with dead settings.
  Interactions exist only as prose chips in the playbook. No realism filter.
- **Rebuilt:** the catalogue becomes **structured data** the engine reasons
  over: prerequisites, conflicts, pairs, *order* dependencies, realism for you,
  and hours cost. The recommender and the UI both read it. Interactions are
  enforced or warned, not just described.

### 2.7 Data
- **Now:** 12 properties in code, 4 archetypes averaged from 2–3 comps, and
  provenance in prose. Active listings are treated as permanent inventory.
- **Rebuilt:**
  - Every property field carries a flag: **stated** (from the listing),
    **derived** (computed from stated values), **estimated** (assumed) or
    **verified** (you checked a rent roll, tax statement or quote).
  - Active listings get an "available until" date (default: 6 months after
    collection).
  - Archetypes become **ranges from the comps**: price per unit, rent gap and
    utilities sampled in Monte Carlo, not averaged once.
  - The 8-unit archetype is marked **Guess**, and the ladder won't reach it by
    default.
  - The data file stays outside the code.

### 2.8 Outputs and visualisations
- **Now:** final-month KPIs, pre-tax cash flow, unrealised net worth, and a
  stack table ranked by net worth.
- **Rebuilt:**
  - The headline is your objective, as a band: the 80% case, median and a bad
    case.
  - After-tax and in today's dollars, with nominal on toggle.
  - Held and sold values side by side.
  - A "what this rests on" panel: inputs ranked by how much they move the
    headline, coloured by confidence. This is the feature your data file asked
    for.
  - Month-by-month timeline kept.
  - Charts: income over time with the uncertainty band, and cash vs reserves.
- **Wrong if:** band charts confuse more than they help. Every band chart has a
  one-line reading underneath.

### 2.9 Reasoning layer (new — the design had no slot for it)
- **Uncertainty.**
  - Seeded Monte Carlo on top of the unchanged deterministic run (same config
    → same distribution).
  - Each input's distribution comes from the registry.
  - It also samples: recessions (a probability per year, not a date you pick),
    evictions, job-loss events, component timing, deal arrivals, and
    special-assessment levels.
  - It uses **common random numbers** across plans, so differences between
    plans are real, not noise.
- **Objective.** The 80th-percentile after-tax real-estate income (trailing 12
  months) at your target date. A path that runs out of cash scores zero. That
  is how fragility is penalised without a separate knob. Parked-cash yield is
  shown separately and doesn't count as income.
- **Recommender.**
  1. Screen hundreds of combinations within your would-do set on the
     deterministic run, respecting prerequisites and conflicts.
  2. Re-rank the shortlist on the Monte Carlo 80% case.
  3. Present the top plans, each with: what's switched on, its 80% case and
     median, probability of a cash shortfall, units, held and sold value,
     hours per week, and *why it wins* (the contribution of each switch).
  - Nothing turns on without you.
- **Wrong if:** the distributions are mis-specified. That's garbage in,
  confidently out. The mitigation is the "rests on" panel, which shows exactly
  which guesses drive the ranking.

### 2.10 Life layer (new)
- **Career stages.**
  - You enter part-time income and a coverage buffer.
  - The engine triggers part-time, then quitting, on trailing after-tax
    coverage.
  - Each stage changes contributions, W-2 income (tax, allowance, DTI), your
    available hours (REPS), and loan eligibility. With no W-2, conventional and
    FHA need two years of rental income history, so it's mostly DSCR loans.
  - Health insurance after quitting is an input.
  - This creates a real **sequencing insight**: refinance and buy owner-occupied
    *before* you quit, while you can still qualify.
- **Housing path.**
  - How long you stay in each house-hack, chaining rules, and a later
    primary-home purchase (price, down payment, rate).
  - The home's PITI replaces rent in your expenses, adds to DTI, and uses a
    Fannie slot. The Primary Residence Credit moves with you.
- **Hours ledger.**
  - Hours per unit, turnover, refresh, acquisition, off-market outreach and
    license work.
  - It triggers management against your weekly budget, and feeds REPS and
    QBI eligibility.
- **Circuit breakers.**
  - Cash buffer, negative cash-flow run, and job/income loss → hold-and-survive
    (no buying, contributions paused, reserves defended), each marked on the
    timeline.

### 2.11 Build, tests, persistence
- **Now:** one scope, 6 source files, 256 engine tests (several encode the
  errors above), browser tests failing here on external fonts.
- **Rebuilt:**
  - Modules: core, lending, market, operations, tax, strategies, life,
    uncertainty, objective, recommender, deal, plan, ui-*. Still one
    self-contained file, still vanilla JS, still node-testable.
  - Tests are organised as domain rules, one section per rule with its source
    cited.
  - Prose-vs-engine consistency test.
  - Monte Carlo reproducibility test.
  - Hidden fields provably don't change results.
  - The browser suite blocks external requests, so it runs anywhere.
  - New storage keys (clean start).
  - Plan-vs-actual isn't built, but the state model reserves a slot for
    "actual" purchases, so adding it later is additive.

---

## 3. Architecture

```
 Field registry (inputs · ranges · provenance · dependencies)      Catalogue (strategies as data)
        │                                                                   │
        ▼                                                                   ▼
 Scenario config ──► DETERMINISTIC CORE (month loop, unchanged principle: pure, reproducible)
                      market · operations(unit leases) · lending · tax · strategies · life · sourcing
                              │
          ┌───────────────────┼─────────────────────────┬──────────────────────┐
          ▼                   ▼                         ▼                      ▼
   Exit valuation      UNCERTAINTY LAYER          SENSITIVITY           DEAL ANALYZER
   (held / sold)       seeded Monte Carlo,        ("rests on" panel)    (a listing vs your plan,
                       common random numbers                            max offer, verify list)
                              │
                              ▼
                       OBJECTIVE (80% income by date; replace-salary)
                              │
                              ▼
                       RECOMMENDER (screen → re-rank → explain)  ──►  ACTION PLAN (next 12–18 months)
```

The deterministic core stays the single source of truth. Everything added sits
around it, and none of it makes the base run random.

---

## 4. The strategy layer

### 4.1 The ~30 real choices (after the approved cut)

"You" = realism for your situation as you've described it.

| Family | Choice | Status | You | Key interactions it will enforce or warn about |
|---|---|---|---|---|
| Getting in | House-hack (stay N years) | fix: FHA self-sufficiency, DTI, conventional 5% option | ✔ realistic | Blocks seller financing on that purchase; FHA one at a time |
| | Chain house-hacks | fix | ✔ | Each chain step needs income (before quitting) |
| | Buy your own home later | **new** | ✔ | Takes a Fannie slot and DTI; PRC moves |
| | Seller financing | fix: from off-market channel, balloon test | ✔ | Needs off-market; balloon vs rate path |
| | Loan assumption | keep | rare | Equity gap |
| | DSCR loans | fix: correct definition, prepay penalty | ✔ | Prepay blocks early refi/sale |
| | Local bank loan (5+ units) | fix: balloon test | ✔ | 8-unit archetype is a guess |
| | Discount points | keep | ✔ | Break-even vs refi |
| | Interest-only | keep | ✔ | Step-up date vs career stage |
| | Delayed financing (buy cash, refi at once) | **new, later** | at higher contributions | Needs cash; prepay |
| Capital recycling | Cash-out refinance | fix: MIP, rate, prepay | ✔ | Guardrails; do it *before* quitting |
| | HELOC (floating) | fix: rate follows shocks | ✔ | Freeze risk in recessions (Monte Carlo) |
| | 1031 exchange | keep | ✔ | Grouping election; suspended losses stay |
| | FHA → conventional refi to drop MIP | **new** | ✔ | Needs 20% equity; income |
| Debt | Paydown with recast (one setting: order, timing, allocation) | merge | ✔ | FHA can't recast; idle-cash policy |
| | Rate-and-term refinance | keep | ✔ | Flat rate default, so only fires if you set a path or the dice do |
| Income | Rent-to-market via turnover + refresh | **rebuilt** | ✔ | Core lever; renewal policy vs turnover |
| | Housing Choice Vouchers | **new** | ✔ | Rent reasonableness; utility allowance vs own-heat |
| | RUBS | fix: rent resistance on by default | ✔ | Double-dips with market rent unless offset |
| | Ancillary income | fix: no double-count | ✔ | Existing coin laundry |
| | Tenants on own heat (+ energy retrofit) | **new** | ✔ | RUBS sequencing; voucher allowance |
| | Per-unit mid-term / nightly / by-the-room | rebuilt per unit | one unit, maybe | Seven-day rule; management kills participation |
| | Value-add rehab at purchase | keep | ✔ | Cash at closing |
| | Stagger lease ends out of winter | **new** (falls out of unit leases) | ✔ | Winter downtime |
| Costs | Property tax appeal | fix: no silent cut | ✔ | Specials don't appeal away |
| | Self-management (time budget) | rebuilt | ✔ | QBI hours; STR participation |
| Tax | Cost segregation (+ bonus) | keep | ✔ | Exit view; REPS; allowance |
| | REPS (from hours) + grouping election | rebuilt | after quitting | W-2 hours; §469(f)(1) |
| | QBI | **new** | ✔ | Hours ≥ 250 |
| Timing | Downturn stance (dry powder / lean in / step back) | merge | ✔ | Recessions now sampled, not scheduled |
| | Deal hurdle | keep | ✔ | Stabilised, not day-one, yields |
| Sourcing | MLS channel | **new** | ✔ | Supply and win rate |
| | Off-market outreach | **new** | planning | Hours, cost; feeds seller financing |
| | Real estate license | **new** | ✔ | Commission on own buys; REPS hours; MLS access |
| Cash | Idle-cash policy (7 options incl. your 1%/2%) | **new** | ✔ | Reserves eligibility per vehicle |

**Moved out of the strategy list into rules and facts** (always modelled):
the $25K allowance, the four-unit tax line, the Primary Residence Credit,
component schedules, reserves, deal flow, guardrails, stress/Monte Carlo, and
the bonus depreciation rule.

**Retired, documented with the reason:** subject-to, master lease,
Opportunity Zones, biweekly payments, blanket loans.

**Parked as "not for me":** renovation loans (203(k)/HomeStyle).

### 4.2 New strategies worth your attention

These come from reasoning across the system and aren't in the current
catalogue. Ones marked ✔ I'd build now; the rest go in the catalogue as
candidates.

1. ✔ **Do the income-dependent moves before you quit.** Cash-out refis, the
   next house-hack, your own home — lenders qualify you on W-2 income. After
   quitting, you're mostly limited to DSCR loans at higher rates. The engine
   will flag any plan that schedules these after the quit date.
2. ✔ **The quit-year REPS window.** REPS is tested annually, on hours. Quit
   early in a year and your real-estate hours can exceed that year's W-2 hours.
   Pair it with cost segregation on that year's purchases and the losses offset
   that year's W-2 and rental income. (Earlier suspended losses still stay
   suspended.) Timing-sensitive, legitimate, and needs contemporaneous records.
3. ✔ **Vouchers on the under-rented 2BRs.** Fargo Housing Authority's 2026
   payment standard for a 2BR is **$1,479** (**Verified**) against ~$818
   in-place and $1,175 survey rent. The cap is rent reasonableness, so the
   realistic outcome is top-of-market rent with low turnover. This is a
   *faster, cheaper* route to market rent than waiting for turnover.
4. ✔ **Heat conversion timed to the boiler's end of life.** Run RUBS until the
   central plant is due, then convert instead of replacing it.
5. ✔ **Winter-proof lease calendar.** Set first leases at 15–18 months so
   renewals land in spring, cutting downtime.
6. ✔ **Buy for the stabilised yield, not day one.** Deal scoring uses year-2
   stabilised yield on total cost (price + refresh + turn costs), which is what
   the turnover thesis is actually betting on.
7. ✔ **Max-offer price per listing.** The deal analyzer solves for the highest
   price that keeps your 80% headline at or above plan.
8. Later: **delayed financing** once contributions are large (win with cash,
   refinance within weeks).
9. Later: **seller carry-back second behind a bank first** (10% down
   structures). Lender-dependent, so it goes on the "ask" list.
10. Later: **Class 4 roof at replacement** for a hail-insurance discount. Needs
    ND insurer data.

---

## 5. Interface design (desktop-first)

**The problem, as I see it:**
- The tool shows all ~250 inputs as equals, across seven tabs, with no sense of
  which ones matter for the current plan.
- It answers "what happens with these switches" rather than "what should I do".
- Stale prose makes you distrust the numbers.

**The design:**
- **Left rail — "Your plan"** (≈10 inputs that matter most):
  - start, horizon and target date
  - contributions
  - W-2 (optional)
  - living expenses
  - would-do set
  - idle-cash policy
  - the few strategy switches that are on
- **Main area — the answer.**
  - **Plan discovery:**
    - A headline band (80% case / median / bad case) for your target date.
    - "Find better plans" → the top 3–5 proposed plans as cards: what's on,
      80% case, cash-shortfall risk, units, held and sold value, and
      hours/week. "Use this plan" makes it the working plan.
    - Under that: timeline, income chart with band, cash vs reserves, and
      "what this rests on".
  - **Execution** (once you've chosen a plan):
    - **Should I buy this one?** Paste listing text → Claude fills the form
      with stated/derived/estimated flags → verdict against your plan, lender
      approval per product, stabilised cash flow, effect on your headline,
      max offer, and a verify-before-offer checklist.
    - **What do I do next?** The next 12–18 months: target building, date your
      cash is ready, cash breakdown, which loan and the questions to ask the
      lender, and the triggers to watch.
- **Assumptions drawer.**
  - Every registry field, grouped, showing only what's relevant; hidden
    ones say why.
  - Each field has a confidence badge, source, as-of date, a stale-data warning
    and reset-to-default.
  - Changing an assumption re-runs instantly and shows how much the headline
    moved.
- **Strategies view.** About 30 cards from the catalogue data: on/off,
  parameters, realism tag, and live warnings when two switches conflict.
  The retired/merged/parked list is one click away.
- **Compare.** 2–4 plans side by side.

---

## 6. Build order

Each stage ends at a checkpoint where I show you something usable. Tests run
before every push.

| Stage | Contents | Checkpoint you'll see |
|---|---|---|
| **A. Correct the core** | Module split and field registry; lending products and gates; balloon test; MIP/PMI/recast rules; rates; one price index; insurance path; property tax and specials; CapEx reserve cap; idle-cash vehicles; tax fixes (brackets, QBI, NIIT, personal-use, PRC, basis); exit valuation; after-tax, real-dollar outputs; browser tests fixed | **Corrected baseline report:** your plan before vs after each fix, and which old conclusions survive |
| **B. Operations realism** | Unit-level leases; turnover and refresh model; vacancy from turnover; seasonality; per-unit rental modes; vouchers; heat conversion; RUBS interplay | **The plan with a realistic rent ramp**, and what vouchers and heat conversion are worth on the library |
| **C. Life and capital** | Career stages; housing path; hours ledger and time-budget management; REPS/QBI from hours; circuit breakers; sourcing channels (MLS, off-market, license); seller financing from channels | **Quit date and part-time date** on the corrected plan, and what the next building costs to find |
| **D. Reasoning** | Monte Carlo layer; objective; "rests on" panel; recommender; catalogue as data | **"Which plan is best?" for your inputs**, with the top plans and why |
| **E. Interface and publish** | New UI (plan discovery, execution mode, assumptions drawer, strategies, compare); deal analyzer with paste-to-fill; action plan; publish to the same link, clean start; new HANDOFF and data-provenance docs | **The published app** |

Stage A goes first because every later answer depends on it. A recommender
running on the current core would confidently recommend plans built on a free
rent ramp and the wrong DSCR.

**Testing:**
- The 256 existing assertions are kept wherever they encode a real rule.
- The ones that encode the errors (§8) are rewritten with the source cited,
  and each rewrite is listed in the stage report so nothing is quietly
  reverted.
- New tests are added per rule, plus Monte Carlo reproducibility,
  recommender determinism, and prose-vs-engine consistency.

## 7. What I'm leaving out, and why

| Left out | Why |
|---|---|
| Plan-vs-actual tracking | Your call — later, extensively. The data model keeps a slot for it. |
| Capital map across contribution levels | Your call. |
| Lender / CPA / family exports | Your call. JSON backup only (as a downloadable file). |
| 5–50 unit commercial scale | Your call. The lending model can extend to it later without rework. |
| Renovation loans | Parked by you. |
| Subject-to, master lease, OZ, biweekly, blanket loans | Retired (approved). |
| Installment sale on exit | Only matters if you sell to someone carrying paper. The exit view shows a plain sale; add later if you plan a sale. |
| Entity/LLC modelling | Only the financing effect is modelled (DSCR loans can close in an LLC; agency loans can't). Liability structure is a legal question, not an engine one. |
| Insurance shopping / deductible strategy | Its value depends on quotes I can't model credibly. Premium and inflation path stay editable. |
| Adding a unit (ADU) | Not selected. The four-unit tax-line trap is documented in the catalogue. |
| Live market data feeds | No reliable source the page can call. Registry as-of dates and stale warnings stand in. |
| Partial dispositions | Small effect; deferred unless Stage A's tax work makes it cheap. |

## 8. Corrections to the corrections (explicit, so nothing is quietly reverted)

| HANDOFF said | Now | Basis |
|---|---|---|
| "Lenders use Form 1007 market rent, not in-place" (correction 5) | Product-specific. DSCR loans: gross rent, lesser of lease and market. Conventional: DTI with 75% of rents. FHA 3–4 units: self-sufficiency on appraised rent. Commercial: NOI coverage. | Lender guidelines (**Vendor**), Fannie B3-3.1-08, HUD 4000.1 |
| "At in-place rents nothing clears DSCR" | Most library properties clear a DSCR loan at in-place rent. The constraint is *your* profit, not the lender. | Measured |
| Minimum DSCR 1.15 | Replaced by per-product gates (DSCR ≥ 1.0; commercial ≥ 1.20) | As above |
| Investment rate 6.95%; DSCR below agency | Conventional investment ~7.6%; DSCR ~7.35%, not below agency | Engine's own note; **Vendor** |
| 3% per-property tax cap (HB 1176) | HB 1176 caps district levies, not your bill | **Verified** |
| Reassessment on sale | Annual mass appraisal; stated bill is a floor | **Verified** (City of Fargo) |
| PRC against income tax | Property-tax statement credit, one per household | **Verified** |
| Lodging tax 5%, owner expense | 3%, guest-paid | Vendor sources agree |
| CCA 202151005 "no SE tax on bare STR" | The CCA held that substantial services → SE tax; "no SE tax" is §1402(a)(1) | **Verified** |
| Seller financing uses no loan slot | Fannie likely counts a seller mortgage you're personally liable on — flagged, and you can switch it | Judgement, flagged |

Everything else in HANDOFF §5–6 that I checked stands.

## 9. What could make this plan wrong

1. **My turnover defaults are estimates.** If they're far off, Stage B's
   answer is too. Real rent rolls are the fix; the verify list asks for them.
2. **Lender behaviour varies by lender.** DSCR rent basis, the reserves
   convention, and whether a local bank will do 2–4 unit portfolio loans at
   better terms. Each is a setting, and each goes on the lender question list.
3. **The 80% headline is only as good as the distributions.** Mitigated by
   the "rests on" panel and by showing the median beside it.
4. **Scope risk.** This is a large build. If you want the new interface
   sooner, Stage E can start after Stage A on the corrected core, with B–D
   landing into it. I'd advise against it: you'd be using a new interface to
   read numbers I've told you are wrong.
