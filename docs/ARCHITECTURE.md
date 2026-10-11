# Architecture

## Principles

1. **Numbers and words are separate systems.** Every figure is computed by deterministic TypeScript from stored
   source data. Gemini only explains those figures, and a validator rejects any narrative that states a number
   not present in the verified input.
2. **Store everything that a report depended on.** Each report saves its full input snapshot, so a past report can
   be audited and reproduced even after funds are removed or data is revised.
3. **Fail visibly, not silently.** Missing data is "unavailable", never 0%. Each pipeline step and each delivery
   channel records its own outcome; one failure never blocks the others.
4. **Idempotent by key, not by luck.** Scheduled runs, scheduled reports and production deliveries all use
   deterministic row IDs with conditional inserts, so duplicated cron invocations are harmless.

## Runtime

- **Vercel** (region `bom1`, Mumbai — chosen so NSE's API, which filters some cloud IP ranges, is reachable;
  verified on 2026-10-11 by a successful production daily run). Functions run on Node.js with `maxDuration = 300`
  for jobs (Hobby-plan maximum).
- **Next.js 16 App Router** with Cache Components: pages are prerendered shells; data sections are server
  components inside `<Suspense>` that call `connection()` so they always render from the latest stored data.
- **Appwrite Cloud TablesDB** (Frankfurt region) — accessed only from the server with an API key. Tables have no
  client permissions.

## Pipelines

| # | Pipeline | Trigger | Writes |
|---|---|---|---|
| 1 | NAV acquisition (`refreshFundNav`) | daily, weekly, on add, on manual generate | `nav_history`, `tracked_funds.last_nav_date` |
| 2 | Benchmark & index acquisition (`refreshIndices`, `refreshMarketSnapshot`) | daily, weekly, manual | `index_history`, `market_snapshots` |
| 3 | Peer universe & averages (`refreshPeers`) | weekly, manual generate | `peer_stats` (with every constituent's returns) |
| 4 | News & macro (`gatherWeeklyNews`) | report generation | `market_news` |
| 5 | Calculations (`buildFundPerformance`) | page render, report generation | `performance_snapshots` (per report) |
| 6 | Gemini narrative (`generateNarrative`) | report generation | inside `weekly_reports.report` |
| 7 | Persistence & delivery (`createWeeklyReport`, `deliverAll`) | weekly; manual generate (no send); test sends | `weekly_reports`, `delivery_logs` |

## Saturday job (`runWeekly`)

1. Authenticate (`Authorization: Bearer CRON_SECRET`).
2. `claimRun("weekly", <week-ending Friday>)` — conditional insert into `scheduled_runs`. A second invocation is
   skipped if the first succeeded or is still inside its 15-minute lease; a crashed run can be retried.
3. Refresh NAVs → indices → NSE breadth snapshot → peer averages (each step logged with timing).
4. Re-use this week's report if a previous attempt created it (`wk_<date>` id); otherwise build the input
   snapshot, gather news, call Gemini (validated, ≤3 attempts, else template), persist.
5. Deliver on email, Telegram and WhatsApp independently, each guarded by a `delivery_logs` row keyed by
   report + channel. Not-configured channels are logged as `awaiting_configuration`.
6. Close the run as `succeeded`, `partial` (some step or channel failed) or `failed`.

## Data model (Appwrite TablesDB)

Defined in `src/lib/db/schema.ts`, created by `scripts/setup-db.ts` (additive, idempotent; `SCHEMA_VERSION = 1`).

| Table | Row id | Purpose |
|---|---|---|
| `tracked_funds` | scheme code | Fund identity, category view, peer group, benchmark mapping (+ its source), active flag, timestamps |
| `nav_history` | `n_<code>_<yyyymmdd>` | One NAV per scheme per day; unique (scheme_code, date); source + retrieved_at |
| `index_history` | `<INDEX>_<yyyymmdd>` | One close per index per day; unique (index_id, date); source + retrieved_at |
| `market_snapshots` | `m_<yyyymmdd>` | NSE breadth, P/E, dividend yield, 52-week range for key indices |
| `peer_stats` | `<peer>_<yyyymmdd>` | Peer averages per window + all constituents' returns, universe size, method version |
| `performance_snapshots` | `p_<code>_<yyyymmdd>` | Full computed comparison per fund, for multi-week trend tracking |
| `market_news` | sha1(canonical URL) | Headline, publisher, publication date, URL, summary, category tags, provider |
| `weekly_reports` | `wk_<date>` (scheduled) / random (manual) | Assessment, narrative + verified figures, **input snapshot**, generator, model |
| `delivery_logs` | `<report>_<channel>` (prod) / `t_<ts>_<channel>` (test) | Per-channel status, masked recipient, provider message id, error, attempts |
| `scheduled_runs` | `<job>_<date>` | Run status, trigger, attempts, per-step results, error |

JSON payloads that can grow (report, input snapshot, peer constituents) are `longtext` columns, keeping indexed
columns small. Removing a fund only sets `active = false`, so history and past reports are untouched.

## Security

- All secrets are server-only env vars (no `NEXT_PUBLIC_`); logs mask secret-looking keys and strip query strings.
- Public: read-only pages and `/api/health` (booleans only). Owner-only: every mutation and every send, via an
  HMAC-signed, httpOnly, SameSite=strict session cookie obtained with `ADMIN_PASSWORD` (login rate-limited).
- Cron routes require `CRON_SECRET`; the WhatsApp webhook verifies Meta's `X-Hub-Signature-256` HMAC.
- Inputs are validated (scheme codes, ids, enums); emails escape all dynamic text; external payloads are parsed
  with zod; news URLs are restricted to http(s) and social/UGC hosts are dropped.
- Recipient addresses are never shown in the UI or logs, only masked.

## Scaling notes

- Per-fund cost is ~1 MFapi call/day plus ~200 rows/year; peer universes are fetched once per (group, date)
  and shared by every fund in the group.
- Multi-user would need: a `user_id` on funds/reports/deliveries, per-user recipients and consent, and peer stats
  remaining shared across users (they do not depend on the user).
- Longer jobs could be split into per-step cron calls or a queue; today the full weekly run takes ~1–2 minutes.

## Redesign additions (schema v2, 2026-10-11)

### New pipelines

| # | Pipeline | Trigger | Writes |
|---|---|---|---|
| 8 | Explore Funds discovery (`refreshDiscovery`): metrics + within-category ranking for 19 groups | daily cron, script | `fund_metrics`, `discovery_groups` |
| 9 | Topic news + Gemini fact/why lines (`refreshMarketNews`) | daily cron, script | `market_news` (+ `topics`, `relevance`) |
| 10 | Market brief (`writeMarketBrief`, validated) | daily cron | `market_briefs` |
| 11 | Fund analysis (`runAnalysis`): NAV metrics, peers, optional PDF extraction, deterministic outcome, Gemini narrative | owner action | `fund_analyses` |

The daily job now runs: NAVs → indices → NSE snapshot → email status sync → Explore Funds → news + brief
(about 110 s in production, well inside the 300 s limit).

### New tables (additive migration, `SCHEMA_VERSION = 2`)

| Table | Row id | Purpose |
|---|---|---|
| `fund_metrics` | `fm_<code>` | Per-scheme metrics, ranking result, labels (no raw NAV series) |
| `discovery_groups` | `g_<group>` | Category medians, reference-index returns, counts, errors |
| `watchlist` | `w_<code>` | Research watchlist, never treated as holdings |
| `holdings` | `h_<code>` | Units, amount invested, SIP amount/day entered by the owner |
| `preferences` | `owner` | SIP questionnaire answers |
| `fund_analyses` | random | Saved analyses: facts, verified document fields (no file), narrative, outcome |
| `market_briefs` | `b_<yyyymmdd>` | Daily "What happened in the market?" with its input |
| `market_news` (+cols) | sha1(url) | `topics` (7 topics) and `relevance` (Gemini fact/why JSON) |

### Concepts kept separate

Tracked funds (`tracked_funds`, monitored weekly) · held funds (`holdings`, the only source of rupee amounts) ·
watchlisted funds (`watchlist`, research) · analysed funds (`fund_analyses`). A fund can be in any combination.

### Privacy

Holdings, preferences, watchlist and analyses are readable only with the owner session. Uploaded PDFs are processed
in memory and never stored; only extracted fields, file name, size, page count and SHA-256 fingerprint are kept.
