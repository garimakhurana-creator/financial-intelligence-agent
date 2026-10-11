# AI Report Design (Gemini Flash)

Code: `src/lib/report/` — `input.ts` (input snapshot), `screening.ts`, `gemini.ts` (prompt + call),
`validate.ts`, `fallback.ts`, `generate.ts` (retry loop), `build.ts` (orchestration + persistence).

## Why Gemini Flash

Required by the brief ("All AI tasks must use Gemini Flash"). It also suits the job: the task is structured
summarisation of a small, fully-specified input (≈5 funds, ~15 indices, ~25 news items), where Flash's speed and
free-tier cost matter more than deep reasoning. It supports **structured output** (`responseMimeType:
application/json` + `responseJsonSchema`), which we rely on. The model id defaults to `gemini-flash-latest`
(override with `GEMINI_MODEL`); the concrete `modelVersion` returned (e.g. `gemini-3.8-flash`) is stored per report.

## What the model receives (`ReportInput`)

Only verified, pre-computed data — the model never fetches or calculates anything:

- per fund: name, view, NAV + date, benchmark name (labelled "price index"), stated benchmark, peer group,
  for 1W/1M/YTD: fund %, benchmark %, peer mean %, vs-benchmark pp, vs-peer pp, reference date, peer n; data notes;
  the rule-based screen result;
- indices: level, date, 1W/1M/YTD returns; NSE breadth/P/E/dividend yield with date;
- news: id (`N1`…), title, publisher, publication time, URL, provider summary, category tags;
- the five views with their focus text, fund codes and index ids;
- the screen's suggested label + rationale.

All numbers are rounded to 2 dp **before** they reach the model, so it can quote them exactly.

## Output schema (`ReportOutput`, zod + JSON Schema)

```json
{
  "funds": [{ "schemeCode": 118989, "performance": "…", "comparison": "…", "marketContext": "…", "evidenceIds": ["N3"] }],
  "categories": [{ "viewId": "mid_cap", "headline": "…", "summary": "…", "watchItems": ["…"], "evidenceIds": ["N3"] }],
  "marketSummary": { "text": "…", "evidenceIds": ["N1"] },
  "assessment": { "label": "No action needed", "reason": "…", "fundOfConcern": null }
}
```

`label` is an enum of exactly the three phrases in the brief.

## Prompt strategy (system instruction, `SYSTEM_PROMPT`)

- Audience: a 28-year-old non-expert; plain, calm English; explain unavoidable terms in a few words.
- Use only numbers in the input, quoted exactly; tie each number to the metric it belongs to; say "not
  available" for nulls.
- Each fund: exactly three one-sentence fields (≤40 words): performance → comparison (lead with the week; add a
  longer window only if it changes the picture) → market explanation citing news ids, with cautious causal
  wording ("coincided with", "may reflect"); if no news is relevant, say so instead of guessing.
- No buy/sell/switch/stop-SIP instructions; do not judge on one week.
- Category summaries must use that category's own indices, breadth and news; debt talks rates/yields/inflation/RBI.
- Follow the screen's label unless the data clearly contradicts it; give a specific reason naming funds and numbers.
- `temperature: 0.3` for week-to-week consistency.

## Validation (`validateReport`) — run on every response

| Check | Why |
|---|---|
| zod schema (types, lengths, enum label, 5 views) | Structural correctness |
| exactly one summary per tracked fund, no extras/duplicates | Coverage |
| each fund field is exactly **one sentence**, ≤50 words | "Three-sentence summary" requirement; readability |
| **every number in the text exists in the input** at the precision written (small integers ≤31 and years allowed) | Prevents invented or recomputed figures |
| every evidence id exists in the input news | Prevents fabricated citations |
| no buy/sell/redeem/switch/"guaranteed" phrasing | Not personalised trading advice |
| "One fund worth watching" ⇒ `fundOfConcern` is a tracked fund | Specific, consistent verdict |

Two real catches during development: a test fixture claiming "0.25 points" when the input said 0.24 was rejected;
and a first validator version accepted 9.99 because it rounded to 10.0 at 1 dp — fixed by matching at the
precision the model wrote. A limitation remains: the validator checks that a number exists, not which metric it is
attached to; this is mitigated in the prompt and by displaying the verified table under every narrative.

## Retry and fallback (`generateNarrative`)

Up to **3** Gemini attempts. Validator errors from attempt *n* are appended to the prompt of attempt *n+1*
("your previous answer was rejected for…"). Auth/quota errors try the fallback API key. If all attempts fail,
`fallbackReport()` builds the same JSON from templates using only verified numbers (always passes validation, unit
tested), labelled in the UI as "automated summary (Gemini unavailable)". The label then comes straight from the
deterministic screen.

## Persistence and audit

`weekly_reports` stores: the validated output; all verified per-fund comparisons and index figures; the news list
with evidence ids; meta (generator, model version, attempts, validation errors, news errors, data-as-of date); and
the complete `ReportInput` as `input_snapshot`. The model can never overwrite verified numbers — the UI, email and
Telegram render figures from the stored computations, and the narrative only from the validated text.

First live run (2026-10-11): `gemini-3.8-flash`, valid on attempt 1, 27 news items, ~20–60 s end to end.
