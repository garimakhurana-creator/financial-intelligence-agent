# Meera's Fund Intelligence — Mutual Fund Performance Tracker

MESA School of Business · AI and its Applications · Section 1 Final Evaluation · Problem Statement 19.

**Live:** https://financial-intelligence-agent-lake.vercel.app
**Code:** https://github.com/garimakhurana-creator/financial-intelligence-agent

A personal mutual-fund intelligence platform for Meera, a 28-year-old professional with five SIPs who wants to
understand her money in plain language. It tracks her funds every day, compares each with its stated benchmark and
with similar funds, explains the market, helps her research new funds, analyses a fund before she invests, and every
Saturday morning sends a Gemini-written report by email and Telegram (WhatsApp Cloud API wired; template awaiting
Meta approval).

## Six sections

| Section | What it answers | Highlights |
|---|---|---|
| **My Dashboard** `/` | How am I doing this week? | Greeting, holdings-based totals (only from entered data), weekly assessment + "Why am I seeing this?", all funds at a glance, interactive growth chart, "What matters this week", quick actions |
| **My Portfolio** `/portfolio` | How do my funds compare? | Sortable/filterable comparison table, allocation from real holdings, holdings & SIP editor, add/remove funds by name or scheme code |
| **Market & News** `/market` | What happened in the market? | Index overview (day/week/month, breadth, P/E), trend chart, validated daily brief, 7-topic news centre with filters and "why it may matter" |
| **Explore Funds** `/explore` | Which funds are worth researching for a SIP? | 619 Direct-Growth schemes in 19 categories, transparent within-category ranking, shortlist, filters, compare up to 4, SIP preferences, research watchlist |
| **Analyse a Fund** `/analyse` | Should I look closer before investing? | Search / scheme code / PDF factsheet; 10-section evidence report; factsheet fields verified against the PDF text; saved history |
| **Weekly Reports** `/reports` | What did each Saturday say? | Archive by month, 3 sentences per fund, 5 category views, sources, delivery status, print view |

Plus fund pages (`/funds/<code>`), five category views (`/categories/<view>`), methodology (`/methodology`) and
Settings & funds (`/manage`).

## What is real and what is not

- **Live data:** NAVs and categories (AMFI via MFapi.in and NAVAll.txt), indices (Yahoo Finance, NSE), news (Tavily,
  GNews), AI text (Gemini Flash `gemini-flash-latest` → `gemini-3.8-flash`). No mock data is shown.
- **Rupee amounts** appear only from holdings the owner enters; nothing is estimated from returns.
- **Not available from a verified free feed** (shown as such, never guessed): expense ratios, official riskometers,
  minimum SIP amounts, TRI benchmark history, CRISIL debt indices. Factsheet uploads can supply some of these.
- **AI never decides numbers or labels**: all figures, rankings, assessments and outcomes are deterministic; Gemini
  explains them and every output is validated (numbers must exist in the input, no advice language, evidence ids real).

## Stack

Next.js 16 (App Router, TypeScript) · Tailwind CSS 4 + shadcn/ui · Recharts · Appwrite TablesDB · Gemini Flash
(`@google/genai`) · unpdf · Tavily + GNews · Resend · Telegram Bot API · WhatsApp Business Cloud API · Vercel + Cron.

> The brief names Supabase; this build uses **Appwrite TablesDB** by the owner's choice (`src/lib/db/`).

## Run locally

```bash
npm install
cp .env.example .env.local                                   # fill in values
npx tsx --env-file=.env.local scripts/setup-db.ts            # create/migrate Appwrite tables (idempotent)
npx tsx --env-file=.env.local scripts/run-data.ts            # seed Meera's 5 funds, ingest NAVs/indices/peers
npx tsx --env-file=.env.local scripts/refresh-discovery.ts   # Explore Funds metrics + ranking (~20 s)
npx tsx --env-file=.env.local scripts/refresh-news.ts        # topic news + market brief (~90 s)
npx tsx --env-file=.env.local scripts/generate-report.ts     # weekly report with Gemini
npm run dev
```

Checks: `npm test` (84 tests), `npm run typecheck`, `npm run lint`, `npm run build`.

## Deploy and schedule

Pushing to `main` deploys to Vercel (functions in `bom1`, Mumbai). Crons (`vercel.json`):

| Cron (UTC) | IST | Job |
|---|---|---|
| `30 18 * * *` | daily 00:00–00:59 | NAVs, indices, NSE breadth, email status sync, Explore Funds refresh, topic news + market brief (~110 s) |
| `30 2 * * 6` | Saturday 08:00–08:59 | refresh, peer averages, news, Gemini report, email + Telegram + WhatsApp |

## Access

Reading the dashboard, market, explore, reports and methodology is public. Holdings, SIP preferences, the watchlist,
fund analyses, fund management, report generation and sends require the owner password (`ADMIN_PASSWORD`).

## Documentation

`docs/ARCHITECTURE.md` · `docs/COMPONENTS_MAP.md` · `docs/DATA_SOURCES.md` · `docs/CALCULATION_METHODOLOGY.md` ·
`docs/RANKING_METHODOLOGY.md` · `docs/AI_REPORT_DESIGN.md` · `docs/DELIVERY_AND_SCHEDULING.md` ·
`docs/COMPETITOR_RESEARCH.md` · `docs/TESTING.md` · `docs/VIVA_PREPARATION.md`

Past performance does not guarantee future returns. Research and monitoring only — not investment advice.
