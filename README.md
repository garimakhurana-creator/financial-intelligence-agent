# Meera's Fund Tracker — Mutual Fund Performance Tracker

MESA School of Business · AI and its Applications · Section 1 Final Evaluation · Problem Statement 19.

**Live:** https://financial-intelligence-agent-lake.vercel.app
**Code:** https://github.com/garimakhurana-creator/financial-intelligence-agent

A personal mutual-fund intelligence system for Meera, a 28-year-old professional with five SIPs who wants to
understand her money in plain language. Every day it stores the latest NAVs and index closes; every Saturday
morning it compares each fund with its stated benchmark and with the average of similar funds, gathers the
week's market and macro news, and has **Gemini Flash** write a plain-language report — three sentences per fund
and one overall verdict (*No action needed* / *One fund worth watching* / *Consider reviewing your allocation*)
— which is stored, shown in the app, emailed, and sent by Telegram (WhatsApp is wired and awaiting Meta setup).

| Question Meera asks | Where it is answered |
|---|---|
| How are my funds doing? | Dashboard table: NAV, 1W / 1M / YTD returns with the exact dates used |
| Compared with what they should do? | vs stated benchmark (pp) and vs category peer average (pp, with n) |
| Is it the market or the fund? | Market tiles (Nifty 50 / Midcap 150 / Smallcap 100), five category views, cited news |
| Do I need to act? | Rule-based screen + Gemini-written verdict and reason, every Saturday |

## What is real and what is not

- **Real data, end to end:** NAVs (AMFI via MFapi.in), category membership (AMFI NAVAll.txt), indices (Yahoo
  Finance, NSE), news (Tavily, GNews), narrative (Gemini Flash, `gemini-flash-latest` → currently
  `gemini-3.8-flash`). No mock data is shown anywhere in the app.
- **Benchmarks are price indices**, while funds' stated benchmarks are total-return indices (TRI); this is
  disclosed on every comparison. The debt fund's CRISIL benchmark has no free feed, so it is compared with peers only.
- **Peer averages** are the equal-weighted mean of available Direct-Growth schemes in the same AMFI category —
  not an official industry figure.

## Stack

Next.js 16 (App Router, TypeScript) · Tailwind CSS 4 + shadcn/ui · Recharts · Appwrite TablesDB · Gemini Flash
(`@google/genai`) · Tavily + GNews · Resend · Telegram Bot API · WhatsApp Business Cloud API · Vercel (+ Cron).

> The brief names Supabase for storage; this build uses **Appwrite TablesDB** by the owner's choice. The schema
> and access layer are in `src/lib/db/`.

## Run locally

```bash
npm install
cp .env.example .env.local        # fill in the values (see docs/DELIVERY_AND_SCHEDULING.md)
npx tsx --env-file=.env.local scripts/setup-db.ts      # create Appwrite database/tables (idempotent)
npx tsx --env-file=.env.local scripts/run-data.ts      # seed Meera's 5 funds + ingest NAVs, indices, peers
npx tsx --env-file=.env.local scripts/generate-report.ts   # generate a report with Gemini
npm run dev
```

Other scripts: `scripts/smoke-sources.ts` (live check of every data source), `scripts/send-test.ts <email|telegram|whatsapp>`
(labelled test send of the latest report), `scripts/telegram-chat-id.ts`, `scripts/email-status.ts`.

Checks: `npm test` (Vitest), `npm run typecheck`, `npm run lint`, `npm run build`.

## Deploy

The GitHub repo is connected to the Vercel project; pushing to `main` deploys to production. Environment
variables are set in Vercel → Project → Settings → Environment Variables (same names as `.env.example`).
`vercel.json` pins functions to Mumbai (`bom1`) and defines two crons:

| Cron (UTC) | IST window | Job |
|---|---|---|
| `30 18 * * *` | daily 00:00–00:59 | `/api/cron/daily` — NAVs, indices, NSE breadth, email status sync |
| `30 2 * * 6` | Saturday 08:00–08:59 | `/api/cron/weekly` — refresh, peers, news, Gemini report, email + Telegram + WhatsApp |

## Using it

- **Dashboard** (`/`), **fund detail** (`/funds/<code>`), **five category views** (`/categories/<view>`),
  **report archive** (`/reports`), **methodology** (`/methodology`) are public.
- **Manage** (`/manage`) needs the owner password (`ADMIN_PASSWORD`): add a fund by scheme code (looked up and
  confirmed before saving), remove a fund (history and past reports kept), generate a report now, run jobs.
- Test sends are on each report page (owner only) and are labelled TEST in the message and the log.

## Documentation

`docs/ARCHITECTURE.md` · `docs/COMPONENTS_MAP.md` · `docs/DATA_SOURCES.md` · `docs/CALCULATION_METHODOLOGY.md` ·
`docs/AI_REPORT_DESIGN.md` · `docs/DELIVERY_AND_SCHEDULING.md` · `docs/COMPETITOR_RESEARCH.md` · `docs/TESTING.md` ·
`docs/VIVA_PREPARATION.md`

Past performance does not guarantee future returns. This is a monitoring tool, not investment advice.
