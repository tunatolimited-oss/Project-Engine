# Fargo Portfolio Engine — handoff

**Rebuilt 26 September 2026.** The previous handoff (24 September) is kept
at `legacy/HANDOFF-2026-09-24.md`, next to the old engine in `legacy/`.

## 1. What this is

A month-by-month simulation of building a small multifamily portfolio (2–8
units) in Fargo, North Dakota, for one person deciding a plan and then
carrying it out. It answers three questions in this order:

1. **Which plan is best?** The headline is after-tax income at your target
   date, at the confidence you choose: the 80% case by default, the level 80%
   of simulated futures meet or beat. A recommender proposes better plans
   within the strategies you would use.
2. **Should I buy this one?** A listing is put on offer inside your plan's
   own future. The verdict is the change it makes to your headline.
3. **What do I do next?** The next purchase, its cash and loan, questions for
   the lender, and the triggers to watch.

## 2. State at a glance

| | |
|---|---|
| Source | `src/engine` (12 modules), `src/analysis` (7), `src/ui` (14 + styles and page), vanilla JS, no dependencies at runtime |
| Build | `node tools/build.js` → `dist/fargo-portfolio-engine.html`, one self-contained file (about 550 KB) |
| Tests | `node test/run.js`: 225 engine and analysis tests. `node test/browser.js`: 44 checks in Chromium, light, dark and phone width, with external requests blocked |
| Speed | Calm run about 5 ms; one simulated future about 6 ms; 300 futures about 2 s; the recommender about 30 s, all in background workers |
| Published | https://claude.ai/artifact/DtUUPcRb5KhrB8yDnP8y8n (same link as before; a clean start with new storage keys) |
| Reports | `docs/PHASE1-AUDIT.md`, `docs/PHASE3-PLAN.md`, `docs/STAGE-A-REPORT.md`, `docs/FINDINGS.md` |

## 3. How it is built

```
data/property-data.json      listings, sold comps, archetype anchors, market data (schema v2)
src/engine/00-core           months, loan maths, seeded randomness, formatting
          /01-data           tax tables, lender constants, source notes, provenance classes
          /02-registry       every input declared once: label, unit, default, range,
                             provenance, the switch that makes it relevant, its distribution
          /03-market         rents, prices (rents ÷ cap rate), costs, insurance, CPI, rates, recessions
          /04-lending        FHA, conventional (owner and investor), DSCR, bank, seller, assumed
          /05-tax            federal and ND income tax, passive rules, QBI, NIIT, sale tax
          /06-operations     units, leases, turnover, vacancy, vouchers, RUBS, heat, components
          /07-life           career stages, housing, contributions, hours
          /08-sourcing       deal supply by channel, listings library, archetypes
          /09-strategies     refinancing, HELOC, paydown, 1031, appeals, idle cash
          /10-exit           held and sold values, exit tax
          /11-sim            the month loop
src/analysis/20-montecarlo   seeded futures with common random numbers
            /21-objective    the headline and the replace-my-salary date
            /22-sensitivity  "what this rests on"
            /23-recommender  screen, climb, re-rank on futures, explain
            /24-deal         should I buy this one
            /25-actionplan   what do I do next
            /26-catalogue    the 35 strategies as data
src/ui/*                     the page: rail, seven views, charts, workers, saving
tools/bundle.js              one engine source for the page, the workers and the tests
tools/build.js               the single-file page
tools/stage-a-report.js      old assumptions → corrected, step by step
tools/findings-report.js     the numbers in docs/FINDINGS.md
test/*.test.js               domain rules with sources, invariants, one test per audit correction
test/browser.js              the page in Chromium
legacy/                      the engine as handed off, still runnable (node legacy/test.js)
```

The page, its workers and the node tests all run the same engine bytes,
assembled by `tools/bundle.js`.

## 4. Settled decisions (September 2026)

- The tool runs on whatever you enter. With no W-2 it runs on contributions
  alone. A W-2 is a schedule, and income-dependent rules are re-checked
  every year.
- One contribution level per run, from $1K to $20K a month now and more
  later. Scope stays at 2–8 units.
- The objective is the most after-tax income by a date, with "replace my
  salary" as the second option. The headline confidence is your choice
  (80% by default).
- Career: go part-time first, then quit when the portfolio carries you.
  Both are triggered by coverage, or set by date.
- Rents move to market only at turnover or renewal.
- You would house-hack, self-manage for a while, and renovate between
  tenants. Balloon and recourse debt are acceptable.
- Idle cash is a per-plan option that never competes with buying: best
  after-tax use, money market, T-bills, index fund, metals, bigger down
  payments, or your investments at exactly 1% or 2% a month (no volatility,
  as you asked).
- Off-market outreach is planned, not yet done, so its rates are industry
  estimates and are flagged as such.
- Management is triggered by your time budget first; a unit count is the
  alternative.
- Stop rules: a cash buffer, the rentals' cash flow running negative, and
  job loss.
- Exit values are shown both held and sold. Cap rates are constant by
  default.
- Housing: stay in a house-hack for years, chain them, and buy your own home
  eventually.
- New levers: Housing Choice Vouchers, a real estate license, and tenants on
  their own heat. Renovation loans are parked.
- The recommender proposes and you choose. Plan-versus-actual tracking is
  not built yet; the data model leaves room for it.
- Desktop-first. Same link, clean start. Exports are for you (a JSON
  backup). Paste-to-fill uses Claude.
- **Most things are options, even realistic ones.** Management, vacancy, tax
  and every strategy can be switched or changed. Property tax and insurance
  are unavoidable and cannot be switched off.

## 5. Trust and provenance

Every input carries one of eight classes, shown as a badge wherever it
appears:

- **Verified:** checked against law, an agency guide, or government data.
- **Lender terms:** one lender's published terms.
- **Rule:** how a law or program works.
- **Estimate:** reasoned from comparable data.
- **Guess:** a placeholder with little evidence behind it.
- **Yours:** facts about you.
- **Choice:** a decision you make.
- **Derived:** computed from other inputs.

Source notes are in `src/engine/01-data.js` (`NOTES`). Listing facts carry
their own flags: stated, derived, or estimated. "What this rests on" ranks
inputs by how far they move the headline, and names the weakly evidenced
ones to check first.

## 6. Corrections that must not come back

`test/60-corrections.test.js` pins each finding of the September 2026 audit:

- no free rent ramp;
- DSCR on gross rent using the lesser of lease and market;
- DTI and FHA self-sufficiency;
- rates from their own sources;
- seller financing from the market, not an id hash;
- held and sold values;
- after-tax income;
- one price index;
- insurance inflation ending in 2028;
- listings that expire;
- no per-property tax cap;
- no deduction for your own unit;
- no dead configuration.

## 7. Known limits and next steps

- **Prices and in-place rents rest on seven sales and five listings.** Every
  archetype, and so every plan, leans on them. The triplex archetype comes
  from two sales. More comps is the most valuable data work.
- **Deal supply and win rate are estimates.** They are now the largest
  correction, so a year of MLS counts for 2–4 unit sales would sharpen
  everything.
- **The 2026 FHA loan limits for Cass County are estimates**, not
  re-verified.
- **Married-filing-jointly tax tables** are carried from the same releases
  as the single tables without independent re-verification.
- **Unemployment benefits are not modelled.** A job loss draws living costs
  from savings, which is conservative.
- **Plan-versus-actual** is not built. Saved plans hold everything needed to
  add "actual purchases" alongside the plan later.
- **Later strategies from the plan:**
  - delayed financing, once contributions are large;
  - a seller carry-back second behind a bank first loan;
  - a Class 4 roof for an insurance discount.

## 8. Running it

```
node test/run.js              engine and analysis tests
node tools/build.js           build the page
node test/browser.js          browser checks (needs Playwright; SHOTS=1 saves screenshots)
node tools/stage-a-report.js  the before/after walk
node tools/findings-report.js the findings numbers
node legacy/test.js           the old engine's own tests
```
