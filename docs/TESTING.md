# Testing

## Commands

```bash
npm test            # Vitest unit tests
npm run typecheck   # tsc --noEmit
npm run lint        # ESLint (next/core-web-vitals + typescript)
npm run build       # production build
npx tsx --env-file=.env.local scripts/smoke-sources.ts   # live check of every data source
```

## Results (2026-10-11)

| Check | Result |
|---|---|
| `npm test` | **44 passed / 44** (4 files) |
| `npm run typecheck` | 0 errors |
| `npm run lint` | 0 errors, 0 warnings |
| `npm run build` | succeeded (Next.js 16.4, all pages partially prerendered, API routes dynamic) |

### Unit tests (mocked / pure — deterministic)

| File | Covers |
|---|---|
| `test/returns.test.ts` (18) | MFapi/AMFI date parsing; month-end clamping; calendar YTD reference; IST vs UTC "today"; return formula; zero/negative/NaN reference; holiday snapping (2 Oct → 1 Oct); insufficient history → unavailable (not 0%); data gap beyond 7 days; stale current NAV; invalid NAV rows dropped; benchmark anchored to the fund's dates; excess return null handling |
| `test/peers.test.ts` (3) | Equal-weighted mean and median; peers with missing data excluded (not counted as 0%); no average below the minimum sample; limited-sample label |
| `test/report.test.ts` (15) | Sentence counting with decimals/abbreviations; validator accepts a grounded report; rejects numbers not in the input, multi-sentence fields, buy/sell instructions, unknown evidence ids, missing category views, inconsistent "One fund worth watching", labels outside the three allowed; fallback always validates; retry-with-feedback then success; fallback after repeated failure; screening thresholds for equity, index and debt funds; label mapping |
| `test/delivery.test.ts` (8) | Email HTML escaping (model/user text), test labelling, plain-text link; Telegram splitting under 4,096 chars without dropping funds; recipient masking; WhatsApp template parameter cleaning; Yahoo null closes dropped; weekend prints dropped only for FX |

### Integration checks run against real services (not mocked)

| Integration | How verified | Outcome |
|---|---|---|
| MFapi scheme lookup + history | smoke script; add-fund API | 5 seed funds + Parag Parikh Flexi Cap resolved; invalid code 9999999 rejected |
| AMFI NAVAll parsing + peer universes | smoke script | 14,372 schemes; peers: Nifty 50 index 23, mid 33, small 36, short duration 23, FoF overseas 49 |
| Index ingestion (Yahoo + NSE) | smoke script; **production** daily cron | 7/7 series OK on Vercel (`bom1`), including NSE Smallcap 100 |
| Numerical validation vs source | UTI Nifty 50 Index Fund vs Nifty 50: 1M −3.91% vs −3.89%, 1W 0.43% vs 0.44% | Consistent with an index fund (TRI vs price gap ≈ 0.7 pp YTD) |
| FX decomposition | `scripts/check-index-dates.ts` | (1+0.244%)(1+0.622%)−1 = 0.868% = INR series |
| Appwrite persistence | setup script (idempotent re-run), full pipeline | 10 tables created; re-run made no changes |
| News (Tavily + GNews) | report generation | 27 items, dated, de-duplicated; one GNews query 400 (rephrased) |
| Gemini structured output | local and **production** report generation | `gemini-3.8-flash`, valid on attempt 1 (prod: 79 s incl. data refresh) |
| Email (Resend) | local + production test sends; `scripts/email-status.ts` | Accepted, then Resend `last_event: delivered`; report page shows "Delivered (confirmed by provider)" |
| Telegram | `scripts/send-test.ts telegram` and production test send (bot @Mutualfund_friend_bot) | Accepted by Telegram API (message ids recorded); bots receive no delivery receipts |
| WhatsApp | pending Meta setup | not verified — code path reports `awaiting_configuration` |
| Cron auth + idempotency | production `curl` without/with secret, twice | 401 without secret; second call `skipped: already completed` |
| Admin API | local `curl` | unauth → 401; wrong password → 401; invalid/nonexistent/duplicate codes rejected; add → NAV backfilled; remove → soft; remove again → error; past reports intact |

### UI checks

Dashboard, fund detail, category (international), report and manage pages rendered with live data in the
browser preview at a narrow (~720 px) width; tables scroll inside their cards; no console errors. Charts use a
palette validated with the data-viz validator (all checks pass light/dark; one light-mode contrast warning
mitigated by direct labels and adjacent tables).

## Not covered / limitations

- No automated browser (E2E) tests; flows were checked manually and via API calls.
- Repository functions are exercised against the real Appwrite project, not by unit tests with a mocked SDK.
- WhatsApp Cloud API sends have not been verified (Meta credentials/template pending); a wa.me one-tap share link is available meanwhile.
- The validator checks that each stated number exists in the input, not which metric it is attached to.
