# What the rebuilt tool says — stages B to D

This covers the uncertainty layer, the strategy families (vouchers, heat,
RUBS, unit modes), the life and capital layers, and the recommender. It uses
your default inputs and the "7K plan". Every number below comes from
`node tools/findings-report.js`; the generated tables follow the summary.

## The short version

1. **Your defaults: $970 a month by December 2036, in the 80% case.** That
   is after tax, in today's dollars. The median future pays $2,080. The calm
   economy (no recession, no job loss, every cost at its most likely value)
   pays $2,428. In 80% of futures you go part-time by January 2038; quitting
   does not happen within 15 years.
2. **The 7K plan is bigger and more fragile.** Its calm run pays $3,826 at
   2036, but its 80% case is −$37. It keeps buying up to the target date,
   and every purchase is cash-flow negative for a year or two while leases
   turn over. In a bad fifth of futures (a recession, cost overruns, slow
   turnover) the portfolio's income on that date is negative. Speed widens
   the spread.
3. **Better plans exist within what you said you would do.** The
   recommender's best combination for your defaults reaches **$5,750 in the
   80% case**, about six times your plan as it stands ($994). It is built
   from: billing utilities back (RUBS), buying only triplexes and
   fourplexes, ancillary income, a HELOC for down payments, vouchers on
   vacant units, waiting cash in your investments at 1% a month, and
   refinancing when rates fall. Without RUBS the best plan reaches $3,135.
4. **That combination rests on assumptions you should check before acting
   on it:**
   - how much of a billed-back heat bill tenants accept (70% by default, an
     estimate);
   - ancillary income of $42 per unit a month (an estimate);
   - whether any lender will open a HELOC on your investment property;
   - your 1%-a-month figure, which is modelled as you asked, without
     volatility.
   The Strategies view shows each one's badge and source.
5. **What your plan's answer rests on most:**
   - purchase prices against the seven sold comps (±10% moves 2036 income
     by −$1,073 to +$1,519);
   - rent growth;
   - cap-rate drift;
   - interest rates;
   - which deal you actually win;
   - in-place rents against the comps;
   - special assessments, which are a guess.
   The first thing to verify is **price**. Seven sales in three months set
   every archetype.

## Strategy families, each alone on your defaults

- **RUBS: +$1,792 in the 80% case.** The largest single lever, because the
  triplex comps pay about $180 per unit a month in utilities (owner-paid
  heat). It leans on the tenant-resistance estimate. Billing back heat from
  a central boiler is less common than billing water and sewer.
- **Vouchers: +$754.** The gain comes from voucher tenants staying longer
  (18% a year move out, against 25–40% for other tenants) and from rent reasonableness
  allowing 5% over market. The engine enforces the interaction: moving
  tenants onto their own heat raises the utility allowance, which lowers
  the voucher ceiling. That is why vouchers plus heat conversion together
  (+$1,143) are worth less than the two separately.
- **Tenants on their own heat, soon after buying: +$617.** Timed to the
  boiler's end of life instead, nothing happens before 2036: the boilers
  start mid-life.
- **One mid-term furnished unit per building: −$1,381.** On the calm run it
  helps (+$417). In simulated futures, the extra hours (40 a unit a year)
  push you past your 10 hours a week, and a manager's 10% fee lands on
  every unit.
- **Stopping purchases two years before the target: +$234**, and
  **paying down after buying: +$656**. Both trade size for a steadier
  income on the date that matters.

## The life layer

- **House-hacking** is worth about $290 in the 80% case against not doing
  it. **Chaining three house-hacks** helps the calm run (+$959) but not the
  80% case (−$81): each move puts a new building in service right before a
  bad year can hit it.
- **Buying your own home after four purchases** costs about $190 a month of
  2036 income in the 80% case. It is a life choice, and the recommender never
  switches it on for you.
- **Going straight to quitting, with no part-time step**, costs about $170.
  The part-time step keeps W-2 income for lending and tax while the
  portfolio grows.

## The capital layer

- **A portfolio HELOC alone lowers the 80% case (−$726)**: it floats with
  rates, can be frozen in a recession, and adds debt. Inside the best
  combination it adds value, because RUBS and vouchers make the extra
  buildings pay for the line.
- **Cash-out refinancing (−$482) and 1031 exchanges (−$169) lose** on your
  defaults by 2036. Both reset leverage when buildings are still thin.
- **Seller financing** is judged on simulated futures (a carry-back seller
  is rare), and its gain does not clear the noise. The recommender drops it.

## Changes to the engine made while producing these numbers

- A portfolio shortfall now follows the order a real owner would: defer
  what can wait, draw a HELOC if there is one, sell the weakest building,
  and only then fail. Before this, 12% of futures "ran out of cash" by
  never deferring anything. It is now 0% on your defaults, with a forced
  sale in 0.7%.
- A job loss before the first purchase, with little saved, puts bills on
  credit at card interest. It no longer counts as the plan failing.
- The manager is hired on a 12-month average of your hours. A three-month
  average hired one in a third of futures after a single busy stretch.
- Random vacancies were running 25% longer than the stated downtime.
- Deal supply now counts only while you could act on it. The calm run used
  to let the best building wait for you indefinitely.
- The recommender accepts a strategy judged on simulated futures only when
  its paired gain clears twice its standard error.

---

# Findings — generated numbers

_`node tools/findings-report.js`, 2026-09-26. Money in today's dollars; 300 simulated futures per plan (seed 20260926)._

## Your defaults as they stand

| | |
|---|---|
| 80% case, after-tax income at Dec 2036 | **$970/mo** |
| Median future | $2,080/mo |
| One future in ten below | $414/mo |
| Calm economy (the deterministic run) | $2,428/mo |
| Runs out of cash / has to sell a building | 0% / 0.7% |
| Part-time, in 80% of futures, by | Jan 2038 |
| Quit, in 80% of futures, by | not within 15 years |
| Units at the end (median) | 22 |
| Worth at the end if sold (median, today's dollars) | $774K |

## The 7K plan ($7,000 a month from Jan 2027, zero start)

| | |
|---|---|
| 80% case, after-tax income at Dec 2036 | **−$37/mo** |
| Median future | $2,960/mo |
| One future in ten below | −$1,076/mo |
| Calm economy (the deterministic run) | $3,826/mo |
| Runs out of cash / has to sell a building | 0% / 1.0% |
| Part-time, in 80% of futures, by | Jan 2040 |
| Quit, in 80% of futures, by | not within 15 years |
| Units at the end (median) | 29 |
| Worth at the end if sold (median, today's dollars) | $1.06M |

## Better plans for your defaults

**Best combination found** — 80% case $5,750/mo, median $7,692/mo, forced sale 0%, 38 units at the end, 10.9 hrs/week
- RUBS on owner-paid utilities: +$2,760/mo
- Triplexes and fourplexes only: +$2,703/mo
- Ancillary income: +$1,537/mo
- HELOC for down payments: +$1,533/mo
- Vouchers on vacant units: +$1,194/mo
- Waiting cash in your investments at 1%/month (your figure): +$824/mo
- Refinance when rates fall: +$409/mo (judged on simulated futures)

**Best plan without "RUBS on owner-paid utilities"** — 80% case $3,135/mo, median $5,108/mo, forced sale 1.0%, 34 units at the end, 9.9 hrs/week
- Triplexes and fourplexes only: +$1,650/mo
- Ancillary income: +$1,053/mo
- Vouchers on vacant units: +$823/mo
- HELOC for down payments: +$785/mo
- Waiting cash in your investments at 1%/month (your figure): +$615/mo
- Interest-only for 5 years: +$410/mo

**The one change worth most on its own** — 80% case $2,771/mo, median $3,749/mo, forced sale 0%, 23 units at the end, 6.0 hrs/week
- RUBS on owner-paid utilities: +$1,616/mo

**Your plan as it stands** — 80% case $994/mo, median $2,018/mo, forced sale 0.5%, 22 units at the end, 5.6 hrs/week

Each change alone, on the calm run (top 15):

| Change | Calm run | Simulated futures |
|---|---:|---:|
| RUBS on owner-paid utilities | +$1,616 | — |
| Triplexes and fourplexes only | +$1,180 | — |
| Chain 3 house-hacks, 12 months each | +$959 | — |
| Stop buying at 5 buildings and pay down | +$721 | — |
| Ancillary income | +$668 | — |
| Chain 2 house-hacks, 18 months each | +$590 | — |
| Vouchers on vacant units | +$584 | — |
| Convert heat soon after buying | +$576 | — |
| Waiting cash in your investments at 1%/month (your figure) | +$541 | — |
| Best after-tax use of waiting cash | +$523 | — |
| Interest-only for 5 years | +$489 | — |
| 40% down | +$371 | — |
| HELOC for down payments | +$305 | — |
| Only deals yielding 8%+ stabilized | +$303 | — |
| Push renewals 12% a year | +$208 | — |

## What the default answer rests on

| Input | Trust | Low → high | Income at 2036 moves |
|---|---|---|---|
| Purchase prices vs the sold comps | Estimate | −10% → +10% | −$1,073 to +$1,519 |
| Market rent growth | Estimate | 0.0217 → 0.0383 | −$574 to +$1,084 |
| Cap-rate drift | Estimate | -6.6334 → 6.6334 | −$648 to +$761 |
| Interest rates on every product | Lender terms | −0.75 pt → +0.75 pt | −$663 to +$622 |
| Typical deal you win (comp range) | Estimate | 0.2789 → 0.7211 | −$285 to +$486 |
| In-place rents vs the sold comps | Estimate | −10% → +10% | −$398 to +$336 |
| Special assessments where unknown | Guess | 244.949 → 1093.7981 | −$406 to +$133 |
| Operating cost inflation | Estimate | 0.025 → 0.0389 | −$241 to +$175 |
| Empty months per turnover | Estimate | 0.8191 → 1.4902 | −$261 to +$133 |
| Built before 1940 | Estimate | 0.079 → 0.1115 | −$202 to +$151 |
| Basic turn cost | Estimate | 1296.4752 → 2051.4315 | −$225 to +$121 |
| Move-out rate, tenants at market | Estimate | 0.3447 → 0.4553 | −$102 to +$154 |

Check first: Purchase prices vs the sold comps; Market rent growth; Cap-rate drift; Special assessments where unknown; Typical deal you win (comp range).

## Strategy families on the defaults (each alone)

| Strategy | Calm run | 80% case | Units at end (calm) |
|---|---:|---:|---:|
| Vouchers on vacant units | +$584 | +$754 | 23 |
| RUBS on owner-paid utilities | +$1,616 | +$1,792 | 24 |
| Tenants on their own heat, at boiler end of life | +$0 | +$33 | 24 |
| Tenants on their own heat, soon after buying | +$576 | +$617 | 21 |
| RUBS then heat at boiler end of life | +$1,616 | +$1,794 | 24 |
| Vouchers and own heat together | +$1,151 | +$1,143 | 21 |
| One mid-term furnished unit per building | +$417 | −$1,381 | 24 |
| Chain 3 house-hacks, 12 months each | +$959 | −$81 | 28 |
| No house-hack | +$159 | −$293 | 22 |
| Buy your own home after 4 purchases | −$467 | −$192 | 16 |
| No part-time step (straight to quitting) | +$84 | −$172 | 28 |
| Portfolio HELOC | +$305 | −$726 | 29 |
| Cash-out refinance while employed | −$149 | −$482 | 33 |
| 1031 into bigger buildings | +$0 | −$169 | 24 |
| Pay down after buying | +$170 | +$656 | 11 |
| Stop buying 2 years before the target | +$110 | +$234 | 15 |
| Real estate license | +$181 | +$2 | 27 |
| Seller financing where offered | +$0 | −$115 | 24 |
| Idle cash in your investments at 1%/month (your figure) | +$541 | +$182 | 26 |

Base for this table: calm $2,428/mo, 80% case $964/mo (150 futures).
