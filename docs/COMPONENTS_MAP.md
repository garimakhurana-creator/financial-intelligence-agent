# Components Map

How the pieces fit together, mapped to the files that implement them. Arrows show data flow.

```
                ┌─────────────────────────── EXTERNAL SOURCES ───────────────────────────┐
                │ MFapi.in (NAV history)   AMFI NAVAll.txt (categories)   Yahoo Finance   │
                │ NSE India (Smallcap 100 history, breadth, P/E)   Tavily + GNews (news)  │
                └───────────────┬───────────────────────┬──────────────────────┬─────────┘
                                │                       │                      │
                   1 NAV ingestion          2 Index ingestion         4 News retrieval
               sources/mfapi.ts         sources/yahoo.ts, nse.ts     sources/news.ts
               pipeline/data.ts         sources/indices.ts           (dedupe, credibility,
               (refreshFundNav)         (fallback order, INR series)  date window)
                                │                       │                      │
                                ▼                       ▼                      ▼
        ┌──────────────────────────── APPWRITE TABLESDB (db/schema.ts, db/repo.ts) ─────────────────────────┐
        │ tracked_funds · nav_history · index_history · market_snapshots · peer_stats ·                      │
        │ performance_snapshots · market_news · weekly_reports (+input snapshot) · delivery_logs · scheduled_runs │
        └───────────┬──────────────────────────┬────────────────────────────────────────────────────┬───────┘
                    │                          │                                                    │
       3 Peer universe & averages     5 Deterministic calculations                                 │
       sources/amfi.ts (universe,     calc/returns.ts (1W/1M/YTD, holiday                          │
         Direct-Growth filter)          snapping, staleness)                                       │
       calc/peers.ts (equal-weighted  pipeline/data.ts (buildFundPerformance:                      │
         mean, median, n, quality)      fund vs benchmark vs peers, flags)                         │
                    └──────────────┬───────────┘                                                   │
                                   ▼                                                               │
                      report/input.ts + report/screening.ts                                        │
                      (verified ReportInput snapshot + rule-based watch screen)                    │
                                   │                                                               │
                                   ▼                                                               │
                      6 Gemini narrative  report/gemini.ts → report/validate.ts                    │
                      (JSON schema, number grounding, sentence count, evidence ids,                │
                       no buy/sell) → retry with feedback ×3 → report/fallback.ts                   │
                                   │                                                               │
                                   ▼                                                               │
                      7 Persistence & delivery  report/build.ts → db (weekly_reports)              │
                      delivery/deliver.ts (idempotent per report+channel)                          │
                        ├─ Email: Resend (delivery/channels.ts, render.ts) + status sync           │
                        ├─ Telegram: Bot API                                                        │
                        └─ WhatsApp: Cloud API template + /api/webhooks/whatsapp status             │
                                                                                                   │
  SCHEDULER  Vercel Cron → /api/cron/daily, /api/cron/weekly → lib/jobs.ts (claimRun idempotency) ──┘
  UI (Next.js server components, view-data.ts)
     /  dashboard · /funds/[code] · /categories/[view] ×5 · /reports · /reports/[id] · /methodology · /manage
  ADMIN API (owner session, lib/auth.ts)  /api/funds (add) · /api/funds/[code] (remove/edit mapping)
     /api/funds/lookup · /api/reports/generate · /api/reports/[id]/send · /api/jobs/run · /api/admin/login
```

## Component table

| # | Component | Responsibility | Key files | External service |
|---|---|---|---|---|
| 1 | NAV ingestion | Fetch/validate NAV history per tracked fund; incremental with 10-day overlap | `src/lib/sources/mfapi.ts`, `src/lib/pipeline/data.ts` | MFapi.in (AMFI data) |
| 2 | Index ingestion | Nifty 50, Midcap 150, Smallcap 100/250, Nasdaq-100, S&P 500, USD/INR; ordered fallbacks; derived INR series | `src/lib/sources/{yahoo,nse,indices}.ts`, `src/lib/catalog.ts` | Yahoo Finance, NSE |
| 3 | Peer universe & averages | AMFI category → canonical peer group (both taxonomies merged), Direct-Growth only, equal-weighted mean/median with n | `src/lib/sources/amfi.ts`, `src/lib/calc/peers.ts` | AMFI, MFapi.in |
| 4 | News & macro | 2–3 queries per category view, last 7 days, dedupe by URL/headline, credibility ranking | `src/lib/sources/news.ts` | Tavily, GNews |
| 5 | Calculations | Point-to-point returns, holiday snapping, staleness, excess returns | `src/lib/calc/returns.ts`, `src/lib/dates.ts` | — |
| 6 | AI narrative | Gemini Flash structured output, validator, retry with feedback, fallback | `src/lib/report/*` | Gemini API |
| 7 | Persistence | Appwrite TablesDB schema + repository; idempotent setup script | `src/lib/db/*`, `scripts/setup-db.ts` | Appwrite Cloud (Frankfurt) |
| 8 | Delivery | Email (Resend), Telegram, WhatsApp; per-channel logs; status sync/webhook | `src/lib/delivery/*`, `src/app/api/webhooks/whatsapp` | Resend, Telegram, Meta |
| 9 | Scheduling | Daily + Saturday jobs, run history, duplicate protection | `src/lib/jobs.ts`, `src/app/api/cron/*`, `vercel.json` | Vercel Cron |
| 10 | Fund management | Lookup → confirm → add; soft remove; editable mapping | `src/lib/pipeline/funds.ts`, `src/app/api/funds/*`, `src/components/manage-panel.tsx` | MFapi.in |
| 11 | UI | Dashboard, fund detail, 5 category views, report + archive, manage, methodology | `src/app/**/page.tsx`, `src/components/*` | — |
| 12 | Security | Owner session (HMAC cookie), cron secret, webhook signature, rate limit, escaping | `src/lib/auth.ts`, `src/lib/api.ts` | — |

## Five category views

| View | Benchmark/indices shown | Peer group | View-specific panel |
|---|---|---|---|
| Large-cap index funds | Nifty 50 | Nifty 50 index funds (name-matched) | Tracking difference vs index |
| Mid-cap growth funds | Nifty Midcap 150 vs Nifty 50 | Mid Cap category | Relative performance + P/E + breadth |
| Small-cap funds | Nifty Smallcap 100 & 250 vs Nifty 50 | Small Cap category | Relative performance, breadth, distance from 52-week high |
| Short-duration debt | none (no equity index by design) | Short Duration category (2 AMFI labels) | Rates explainer; RBI/yield/inflation news |
| International FoF | Nasdaq-100 (USD, INR), S&P 500, USD/INR | FoF Overseas (2 AMFI labels) | Currency decomposition of the INR return |
