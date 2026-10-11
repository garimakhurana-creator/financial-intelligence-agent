# Data Sources

All sources were tested live on **2026-10-11** before implementation (evidence: `scripts/smoke-sources.ts`, and
the production daily run `daily_2026-10-11`, which succeeded on Vercel).

## Mutual fund NAVs

| Source | Used for | Notes / limitations |
|---|---|---|
| **MFapi.in** `https://api.mfapi.in/mf/<code>?startDate=&endDate=` | NAV history, scheme name, AMC, AMFI category | Free, no key. Returns AMFI data. **Unknown codes return HTTP 200 with `scheme_code: 0`** — we treat that as "not found". Supports date ranges (e.g. 27 rows for Sep–Oct vs 3,389 for full history), which keeps peer fetches small. |
| **AMFI NAVAll.txt** `https://portal.amfiindia.com/spages/NAVAll.txt` | Category membership for peer universes | The old URL (`www.amfiindia.com/spages/NAVAll.txt`) now redirects. ~14,370 schemes. Columns: code; ISINs; name; **Plan; Option**; NAV; date. ~5,700 rows leave Plan/Option blank — we then require "Direct" and "Growth" in the name, otherwise exclude. **AMFI currently mixes two category taxonomies** (e.g. "Equity Scheme - Mid Cap Fund" and "Equity Schemes - Mid Cap Fund"; "Debt Scheme - Short Duration Fund" and "Income/Debt Oriented Schemes - Short Term Fund"); peer rules merge both. |

Refresh: daily (incremental from the last stored date with a 10-day overlap to catch revisions), plus on add
and before on-demand reports. Retention: from 45 days before the previous year-end, or 400 days, whichever is earlier.

## Indices

| Index | Primary source | Fallback | History check (2026-10-11) |
|---|---|---|---|
| Nifty 50 | Yahoo `^NSEI` | NSE `NIFTY 50` | 248 pts / 1y |
| Nifty Midcap 150 | Yahoo `NIFTYMIDCAP150.NS` | NSE | 248 pts / 1y |
| **Nifty Smallcap 100** | **NSE** `historicalOR/indicesHistory?indexType=NIFTY SMALLCAP 100` | — | Yahoo `^CNXSC` returns **1 point only** (no history), so NSE is primary |
| Nifty Smallcap 250 | Yahoo `NIFTYSMLCAP250.NS` | NSE | 1y available |
| Nasdaq-100 / S&P 500 | Yahoo `^NDX` / `^GSPC` | — | 251 pts / 1y |
| USD/INR | Yahoo `INR=X` | — | weekend prints dropped |
| Nasdaq-100 in INR, S&P 500 in INR | derived: index × USD/INR on the same date (FX within 4 days before) | — | — |
| Breadth, P/E, dividend yield, 52-week range | NSE `api/allIndices` (latest session) | — | — |

NSE notes: the history endpoint caps responses at ~70 rows and 365 days, so we request 60-day chunks. NSE
blocks some cloud IP ranges; the Vercel functions run in `bom1` (Mumbai) and the production run succeeded.
If NSE fails, Smallcap 100 is reported as unavailable (not substituted silently).

Source discrepancy noted: NSE has a Smallcap 100 close for **Sunday 1 Feb 2026** (special Budget-day session)
while Yahoo's Nifty 50 series does not. Equity series keep weekend sessions; only FX drops weekend prints.

**Price vs total-return:** all index feeds are price indices. Fund benchmarks are TRI; free TRI history was not
found (NSE `indexType=NIFTY 50 TRI` returned no data). The gap ≈ the index dividend yield (NSE reports 1.52%/yr
for Nifty 50 → ~0.03 pp/week). Disclosed in the UI and report.

## Stated benchmarks of the seed funds

| Scheme code | Fund (Direct, Growth) | Stated benchmark | Evidence | Compared with |
|---|---|---|---|---|
| 120716 | UTI Nifty 50 Index Fund | Nifty 50 TRI | UTI scheme objective | Nifty 50 (price) |
| 118989 | HDFC Mid Cap Fund | Nifty Midcap 150 TRI | HDFC Fund Facts, July 2026 (an aggregator listing Nifty 50 TRI as primary was contradicted by HDFC's own document) | Nifty Midcap 150 |
| 118778 | Nippon India Small Cap Fund | Nifty Smallcap 250 TRI (AMFI Tier I) | Nippon product note, Aug 2026 | Nifty Smallcap 250 |
| 119016 | HDFC Short Term Fund | CRISIL Short Duration Debt A-II Index | HDFC Fund Facts, July 2026 | Peers only (no free feed) |
| 150751 | Axis NASDAQ 100 US Specific Equity Passive FOF | Nasdaq-100 TRI (primary) | Scheme factsheet via aggregators | Nasdaq-100 in INR |
| 119581 | Sundaram Mid Cap Fund (tracked since 12 Oct 2026) | Nifty Midcap 150 — **suggested from its AMFI category, not yet verified** against Sundaram's factsheet | Category-based suggestion in the add-fund form | Nifty Midcap 150 |

**Portfolio change, 12 Oct 2026:** HDFC Mid Cap (118989) was replaced with Sundaram Mid Cap (119581) through the
app's own add/remove form, so the demo portfolio shows the "One fund worth watching" label with real data: on the
9 Oct week Sundaram was 1.62 points behind similar mid-cap funds over the month and 4.36 points behind this year —
the only mid-cap fund meeting both screen thresholds. HDFC Mid Cap's history and past reports are kept.

Note: the brief's market context uses the Nifty Smallcap 100; the small-cap fund's stated benchmark is the
Smallcap 250 — both are shown on the small-cap view.

Measured check: the daily tracking error of the Axis FoF vs Nasdaq-100-in-INR is ~1.0 pp RMSE with same-day
alignment and ~1.7 pp with a one-day lag (`scripts/check-fof-lag.ts`), so same-day alignment is used and
weekly gaps of ~1 pp for this fund are expected noise.

## News

| Source | Use | Limits |
|---|---|---|
| **Tavily** `/search` (`topic: news`, `days: 7`) | Primary, 2–3 queries per category view | Free dev tier credits; ~12 queries/week |
| **GNews** `/api/v4/search` (`from` = week start) | Secondary | Free tier daily request cap; one query with a hyphen returned 400 and was rephrased |

Processing: http(s) only; social/UGC hosts dropped; undated items dropped (cannot show an old event as new);
must be published within the week window; de-duplicated by canonical URL and near-identical headline; ranked by a
credibility list (RBI, NSE, SEBI, PIB, Reuters, Bloomberg, Mint, ET, Business Standard…) and capped at 6 per view.
We store publication date (not event date) and label it as such.

## AI

Gemini API (`@google/genai`), model `gemini-flash-latest` (resolved to `gemini-3.8-flash` on 2026-10-11; the
concrete model version returned is stored on each report). A fallback API key is supported.

## Explore Funds and Analyse a Fund (added 2026-10-11)

| Data | Source | Notes |
|---|---|---|
| Fund universe, categories, plan/option, fund house | AMFI NAVAll.txt | 19 groups, Direct-Growth only, both AMFI taxonomies merged; AMC name lines now parsed |
| 5-year NAV history per scheme | MFapi.in ranged requests | about 620 schemes refreshed daily in about 20 s (8 concurrent requests) |
| Category reference indices (3Y/5Y) | Yahoo Finance 10-year daily (`^NSEI`, `NIFTYMIDCAP150.NS`, `NIFTYSMLCAP250.NS`, `^CRSLDX` Nifty 500) | price indices, labelled "reference", not each fund's stated benchmark |
| Expense ratio, riskometer, minimum SIP, holdings, sectors | Uploaded factsheet only | No verified free bulk feed: AMFI's TER page (amfiindia.com/ter-of-mf-schemes) is an interactive web app without a documented data endpoint, so it is not scraped |
| Factsheet text | unpdf (PDF.js) | used to verify every extracted quote |

Topic news (7 topics x 2 queries, daily) uses about 14 Tavily credits a day plus the weekly report's queries.
