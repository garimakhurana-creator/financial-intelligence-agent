# Explore Funds — research ranking methodology

Code: `src/lib/calc/metrics.ts` (`metrics-v1`), `src/lib/calc/rank.ts` (`rank-v1`), `src/lib/pipeline/discovery.ts`,
`src/lib/explore.ts`. Tests: `test/metrics.test.ts`, `test/rank.test.ts`, `test/explore.test.ts`.

The goal is to help Meera decide **which funds are worth researching** for a future SIP — not to name "the best
fund". Everything below is deterministic and computed from public NAV data; Gemini is not involved.

## Universe

- Source: AMFI `NAVAll.txt` (categories, plan/option, fund house) + MFapi.in (NAV history, last 5 years).
- 19 discovery groups (`DISCOVERY_GROUPS` in `src/lib/catalog.ts`): Nifty 50 index funds, large cap, flexi cap,
  multi cap, large & mid cap, mid cap, small cap, value, focused, ELSS, aggressive hybrid, balanced advantage,
  multi-asset, overseas FoF, short duration, corporate bond, banking & PSU, gilt, liquid.
- Only **open-ended, Direct plan, Growth option** schemes (segregated portfolios excluded); both AMFI category
  labels are merged where AMFI uses two taxonomies. On 2026-10-11: **619 schemes, 505 rankable**.
- Refreshed daily (`explore_funds` step of the daily cron, ~20 s).

## Measures (per fund, from its own NAV history)

| Measure | Definition |
|---|---|
| 1M, 3M, 6M, 1Y return | Point-to-point, reference = last NAV on or before the target date (≤ 7-day gap) |
| 3Y, 5Y return | Annualised (CAGR): `(NAV_now / NAV_then)^(1/years) − 1` |
| Volatility (3Y) | Std. dev. of weekly log returns × √52; needs ≥ 80% of expected weeks |
| Worst fall (3Y) | Largest peak-to-trough decline, with its dates |
| Consistency | % of rolling 1-year windows (monthly, over 3 years, 25 windows) in which the fund beat the **category median for the same window**; needs ≥ 12 comparable windows |

## Score (within one category only)

A fund is **eligible** with ≥ 3 years of history and measurable consistency and worst fall; a category needs ≥ 4
eligible funds. Each factor is converted to a percentile among eligible funds in the same category, then combined:

| Factor | Weight | Direction |
|---|---|---|
| 3-year return minus category median | 25% | higher better |
| 5-year return minus category median | 15% | higher better (skipped if < 5 years; weights re-normalised) |
| Consistency | 25% | higher better |
| Worst fall (3Y) | 15% | smaller fall better |
| Volatility (3Y) | 10% | lower better |
| 1-year return minus category median | 10% | higher better — deliberately small |

Labels: score ≥ 70 **and** consistency ≥ 60% → *Strong historical consistency*; score ≥ 60 → *Worth researching*;
otherwise *Mixed record*; not eligible → *Insufficient history*. "Strengths" and "cautions" shown on each card come
from fixed percentile thresholds (top/bottom third), including a caution when a fund had a strong last year but a
less consistent longer record (unit-tested: such a fund cannot rank first).

## Shortlist ("Funds worth exploring")

Up to 6 funds, at most 2 per category, round-robin across categories, drawn only from funds labelled *Strong
historical consistency* or *Worth researching*. If preferences are saved, categories are first filtered by chosen
categories, risk comfort (category risk band) and horizon (category typical horizon). Without preferences, a spread
across common SIP categories is shown.

## What is deliberately NOT used

- **Expense ratio, official riskometer, minimum SIP** — no verified free machine-readable feed was found (AMFI's TER
  page is an interactive web app). They are shown as "not in our data" and can be read from a factsheet in Analyse a
  Fund. Ranking Direct plans only removes most cost differences.
- **Each fund's stated benchmark** — not available in bulk; a category-level *reference index* (price index) is shown
  instead and labelled as such.
- **AUM weighting, fund manager tenure, portfolio holdings** — not in the free data.

## Known limitations

- Overseas FoFs track different countries/indices, so their category median mixes unlike funds (flagged in UI).
- Index-fund differences mostly reflect cost and tracking error (flagged in UI).
- Survivorship: merged/closed schemes are absent from AMFI's current list.
- Past performance does not guarantee future returns; labels are prompts for research, not recommendations.
