# Testing

## Commands

```bash
npm test            # Vitest unit tests
npm run typecheck   # tsc --noEmit
npm run lint        # ESLint (next/core-web-vitals + typescript)
npm run build       # production build
npx tsx --env-file=.env.local scripts/smoke-sources.ts   # live check of every data source
```

## Results (2026-10-11, commit after the redesign)

| Check | Result |
|---|---|
| `npm test` | **88 passed / 88** (10 files) |
| `npm run typecheck` | 0 errors |
| `npm run lint` | 0 errors, 0 warnings |
| `npm run build` | succeeded — 36 routes; pages partially prerendered, data streamed at request time |

### Unit tests (deterministic; external services mocked or not called)

| File | Tests | Covers |
|---|---|---|
| `returns.test.ts` | 18 | Date parsing; month-end clamping; calendar YTD; IST "today"; return formula; zero/negative/NaN references; holiday snapping; missing history → unavailable (never 0%); stale NAV; benchmark anchored to fund dates |
| `peers.test.ts` | 3 | Equal-weighted mean/median; missing data excluded; minimum sample |
| `metrics.test.ts` | 10 | CAGR (3Y/5Y), no annualising under a year, short history → null, volatility, max drawdown, weekly closes, rolling consistency vs category median, partial history |
| `rank.test.ts` | 5 | Percentiles; a steady fund outranks a one-hot-year fund; < 3 years never ranked; small categories not ranked; 5-year factor re-weighting |
| `explore.test.ts` | 3 | Preferences filter risky/long categories; shortlist ignores hot-year "Mixed record" funds and caps two per category; explains empty results |
| `portfolio.test.ts` | 4 | Value only from units × NAV; gain only where both amounts exist; nothing invented without holdings; allocation from valued holdings; highlights ignore small moves and cap at three |
| `report.test.ts` | 20 | Report validator (numbers grounded at written precision, one sentence per field, no advice, evidence ids, labels, jargon in headline/fund text); fallback validity; retry with feedback; screening thresholds; advice guard allows disclaimers; full-precision figures |
| `delivery.test.ts` | 10 | Email escaping and TEST labelling; Telegram splitting; recipient masking; WhatsApp template params; Yahoo parsing (nulls, FX weekends); wa.me number handling and number-less public link |
| `document.test.ts` | 8 | PDF header/type/size validation; real text extraction (unpdf) from a generated PDF; quote verification (wrong number, quote not in document, comma-grouped numbers); analysis outcome rules (strong, several concerns, insufficient history, Regular plan) |
| `plain.test.ts` | 3 | Plain-language gap wording thresholds; no invented comparison when data missing |

The PDF used in tests is a **synthetic fixture** generated in `test/fixtures/make-pdf.ts`; its values are invented
and clearly labelled. Analyses created from it during testing were deleted from the database.

### Integration checks against real services (not mocked)

| Integration | How verified | Outcome |
|---|---|---|
| MFapi / AMFI | smoke script; discovery run; add-fund and analysis APIs | 619 Direct-Growth schemes across 19 categories (505 ranked); invalid codes rejected |
| Indices (Yahoo + NSE) | production daily job | 8/8 series incl. NSE Smallcap 100 from Vercel `bom1` |
| Numbers vs source | UTI Nifty 50 Index Fund vs Nifty 50 (1M −3.91% vs −3.89%); FX decomposition 0.244% & 0.622% → 0.868% | consistent |
| Postgres (Nhost) | schema v3 setup, then a full data load and report run | 17 tables; re-running setup makes no changes |
| News (Tavily + GNews) | daily job in production | 55 topic items, 54 with validated explanations |
| Gemini | weekly report, market brief, fund analysis, factsheet extraction — local and production | `gemini-3.8-flash`; validated outputs; template fallback exercised when validation failed |
| Email (Resend) | test sends; status sync | accepted, then `delivered` per Resend events |
| Telegram | production test send | accepted by Telegram (no read receipts for bots) |
| WhatsApp Cloud API | `hello_world` template to the owner's number via the Meta test number | accepted (`message_status: accepted`); custom template `weekly_fund_report` **pending Meta review** |
| Production daily job | owner-triggered forced run | succeeded in 109 s (limit 300 s): NAVs, indices, snapshot, email sync, Explore (19/19), news + brief |
| Cron auth & idempotency | production calls | 401 without secret; duplicate run skipped |
| Owner APIs in production | holdings PUT/DELETE, watchlist add/remove, preferences save/reset, unauthenticated write | all behaved as specified; test holding removed afterwards |
| Upload route | PDF + linked fund via HTTP; random bytes named .pdf | analysis created (then deleted); non-PDF rejected by header check |

### UI checks

All six sections, compare, analysis report, fund detail, category and reports pages return 200 in production with
live data. At 375 px width no page scrolls horizontally (checked on 8 pages) and the menu drawer opens with every
section. Charts use the validated palette (8 categorical slots pass the adjacent-pair CVD and normal-vision checks;
low-contrast slots are relieved by legends and the numeric labels under each chart).

## Not covered / limitations

- No automated end-to-end browser tests; flows were checked manually and through the HTTP APIs.
- Repository functions are exercised against the real Nhost Postgres database rather than a mock.
- A real (non-synthetic) factsheet PDF has not yet been run through the upload path.
- Validators check that each stated number exists in the verified input, not which metric it is attached to.
