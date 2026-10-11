# Calculation Methodology

Code: `src/lib/calc/returns.ts` (`CALC_VERSION = returns-v1`), `src/lib/calc/peers.ts` (`peers-v1`),
`src/lib/report/screening.ts` (`screen-v2`). All dates are calendar dates (`YYYY-MM-DD`) in IST.

## Point-to-point return

```
Return (%) = (Current NAV / Reference NAV − 1) × 100
```

- **Current** = latest observation on or before the as-of date. If it is more than **5 days** old, the series is
  "stale" and no returns are produced.
- **Reference** = latest observation on or before the window's **target date**, within **7 days**. If none,
  the return is `unavailable` with a reason (`no_reference_near_target`, `insufficient_history`, …). Missing
  values are never treated as zero.
- Non-positive / non-finite values are discarded before calculation (prevents division by zero).

| Window | Target date (from the current observation's date) |
|---|---|
| 1 week (WoW) | date − 7 calendar days |
| 1 month (MoM) | same day one calendar month earlier, clamped to month end (31 Mar → 28/29 Feb) |
| Year to date | 31 December of the previous year (calendar YTD, as the brief says "year-to-date") |

Example (HDFC Mid Cap, 11 Oct 2026): current NAV 219.816 on 9 Oct; 1W target 2 Oct is Gandhi Jayanti (market
holiday) → reference snaps to 1 Oct (219.4410) → +0.17%.

## Benchmark comparison

- The benchmark series is **anchored to the fund's current NAV date**, so fund and benchmark use identical target
  dates. Excess = fund − benchmark, in **percentage points (pp)**.
- Benchmarks are price indices (see DATA_SOURCES). Over a year this flatters the fund by roughly the index's
  dividend yield; over a week the effect is ~0.03 pp.
- International: overseas index × USD/INR on the same date; USD/INR windows are anchored to the overseas index's
  date so `(1 + USD return) × (1 + FX change) − 1` equals the INR return (verified: 0.244% & 0.622% → 0.868%).
- Debt: no free feed for CRISIL indices → no benchmark comparison; never substituted with an equity index.

## Benchmark vs peer average — why both

- **Benchmark**: "did the fund beat the market segment it is meant to track/beat?" (a passive yardstick).
- **Peer average**: "did it do better or worse than similar funds Meera could have chosen?" — it controls for
  costs and style that every active fund in the category shares. A fund can lag its index but beat peers when the
  whole category lagged.

## Category peer average

1. **Universe**: AMFI NAVAll.txt → open-ended schemes in the peer rule's AMFI categories (both taxonomy labels),
   **Direct plan + Growth option only** (one row per portfolio; avoids double-counting Regular/IDCW variants);
   segregated portfolios excluded. Index funds: name-matched to the same index (e.g. only Nifty 50 index funds).
   Universes larger than 80 schemes are not computed.
2. **Observations**: each peer's NAV history from MFapi for the same window, anchored to the **same as-of date**
   as the fund (the fund's latest NAV date).
3. **Returns**: same function and rules as the tracked fund (same target dates, 7-day snapping, staleness).
4. **Average**: arithmetic, **equal-weighted** mean (AUM weights are not freely available daily); the median is
   stored too.
5. **Quality**: a peer without valid data for a window is excluded from that window only. n < 3 → no average;
   3 ≤ n < 8 → "limited sample"; n is always displayed.
6. **Audit**: every constituent's per-window return is stored in `peer_stats` and listed on the fund page.

Labelled in the UI as "average of available comparable funds" — not an official category average.

Live counts on 2026-10-09: Nifty 50 index funds 23, Mid Cap 33, Small Cap 36, Short Duration 23, FoF Overseas 49
(YTD n lower where schemes launched during 2026).

## Overall assessment screen (deterministic, before Gemini)

| Fund type | Flag "worth watching" when |
|---|---|
| Equity / international | vs peers ≤ −1.5 pp over 1M **and** ≤ −3 pp YTD |
| Short-duration debt | vs peers ≤ −0.25 pp over 1M **and** ≤ −0.75 pp YTD |
| Index fund | \|fund − index\| > 0.5 pp over 1M (tracking problem) |

0 flagged → *No action needed*; 1 → *One fund worth watching*; ≥2 → *Consider reviewing your allocation*.
Requiring two windows prevents a single bad week from triggering a label. Gemini receives this suggestion and
must give a specific, evidence-based reason; the validator enforces label/fund consistency.

**The label answers "is something wrong with a fund?", not "did my money go down?"** — the brief's question is
whether a fall is "a broad market event or fund-specific". A fund that falls with its market is not flagged. So that
"No action needed" never reads as "nothing happened", screen-v2 adds two notes the reason must mention:

| Note | Rule | Example wording |
|---|---|---|
| Market-wide dip | unflagged fund with 1M return ≤ −2% while its index (or similar funds) also fell over 1M | "3 funds fell 3.66%–5.36% this month, but their markets fell about as much (3.89%–6.04%): a market-wide dip, not a fund problem." |
| Longer-term lag | unflagged non-index fund behind similar funds this year by the flag threshold (−3 pp equity, −0.75 pp debt) | "HDFC Mid Cap and Nippon India Small Cap are still behind similar funds this year (by 3.97 and 3.59 points)." |

The assessment closes the report (email, Telegram, web report), after the three sentences per fund and the market
summary, as the brief specifies.

## Known limitations

- Price index vs TRI benchmark (disclosed).
- Peer averages are equal-weighted and depend on AMFI's category labels.
- Overseas FoF NAV timing differs from US closes; daily gaps are noisy (~1 pp), compare monthly.
- Point-to-point NAV returns, not SIP-cash-flow returns (XIRR) — Meera's personal return depends on her
  instalment dates, which the brief does not provide.
