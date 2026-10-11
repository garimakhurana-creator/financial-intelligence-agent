# Viva Preparation

Short answers you can say aloud. Numbers are from the live system on 11 Oct 2026.

**1. What problem does this solve?**
Meera sees only absolute returns and NAV, so she can't tell whether a bad week is the market or her fund, and
she asks a CA friend on WhatsApp once a month. This tool answers "compared with what?" every week — against
each fund's own benchmark and against similar funds — and tells her in plain words whether to do anything.

**2. How is AI used — isn't this just a chatbot?**
No chat. Gemini Flash is a step in a pipeline: it turns verified numbers and the week's retrieved news into a
three-sentence explanation per fund, five category summaries and a one-line verdict. The value is translation and
causal context in plain language, which a formula can't produce.

**3. Why Gemini Flash?**
The brief requires it, and it fits: small structured input, needs to be fast and cheap, and it supports JSON
schema output, which lets us validate every response. We use `gemini-flash-latest`; the exact version that
answered (gemini-3.8-flash) is saved with each report.

**4. How do you stop it hallucinating numbers?**
Three layers. (1) It only receives pre-computed, rounded numbers and news with ids. (2) A validator rejects any
answer that states a number not in the input, uses more than one sentence per field, cites a news id that doesn't
exist, or says buy/sell. (3) Rejected answers are retried with the errors fed back, up to three times, then a
template from the verified numbers is used. The validator even caught a wrong figure in my own test fixture.

**5. Where does the data come from?**
NAVs: AMFI data via MFapi.in. Categories for peers: AMFI's NAVAll file. Indices: Yahoo Finance; NSE for the
Smallcap 100 history (Yahoo only has one point for it) and for breadth and P/E. News: Tavily and GNews.

**6. How are returns calculated?**
(Current NAV ÷ reference NAV − 1) × 100. Week = 7 days back, month = same date last month, YTD = last NAV of the
previous year. If the start date is a holiday we use the previous trading day — e.g. 2 Oct (Gandhi Jayanti) →
1 Oct. If there's no NAV within 7 days, it shows "unavailable", never 0%.

**7. Benchmark vs peer average — what's the difference?**
The benchmark is the index the fund says it's trying to match or beat. The peer average is how similar funds
did. A mid-cap fund can trail the Midcap 150 but beat other mid-cap funds if the whole category struggled —
that's "market, not the fund".

**8. How is the peer average built and what are its limits?**
All Direct-Growth schemes in the same SEBI category from AMFI's file — merging AMFI's two naming schemes for the
same category — each measured over the same dates, then a simple average; n is shown. Limits: equal-weighted (no
AUM weights), depends on AMFI labels, and it's "average of available funds", not an official figure. Below 3
funds we don't publish it; below 8 we flag "limited sample".

**9. Why are your benchmark numbers price indices?**
Funds' stated benchmarks are total-return indices including dividends; free TRI history isn't available. The
gap is roughly the dividend yield — about 1.5% a year for the Nifty 50, about 0.03 pp a week — and it's
disclosed on every comparison. You can see it: the UTI index fund is −13.13% YTD vs −13.81% for the price index.

**10. How do the five category views differ?**
Large-cap index: tracking difference vs Nifty 50. Mid-cap: Midcap 150 vs Nifty 50, P/E and breadth. Small-cap:
Smallcap 100 and 250 vs Nifty 50, breadth and distance from 52-week high. Short-duration debt: no equity index at
all — rates, yields, inflation, RBI. International: splits the rupee return into the Nasdaq move plus the
dollar-rupee move.

**11. How is history stored?**
Appwrite TablesDB: daily NAV and index rows (one per day, unique keys), peer stats with every constituent's
returns, a performance snapshot per fund per report, and every report with its full input snapshot so it can be
reproduced. Removing a fund only deactivates it.

**12. Why Appwrite when the brief says Supabase?**
It was my choice; the requirement is persistent weekly snapshots for trend tracking, which this meets. The data
layer is isolated in `src/lib/db/`, so switching databases only touches that folder.

**13. How does Saturday morning work?**
Vercel Cron calls `/api/cron/weekly` between 08:00 and 08:59 IST with a secret. It claims a run keyed by the
week-ending date, refreshes data, computes peers, gathers news, generates and validates the report, saves it,
then sends email, Telegram and WhatsApp independently. A daily cron keeps NAV history building every day.

**14. What if the cron fires twice?**
Nothing is duplicated. The run, the scheduled report and each delivery have deterministic ids created with a
conditional insert; the second call gets "already completed". I tested this on production.

**15. How do email and WhatsApp work?**
Email via Resend, HTML plus plain text; we record "accepted" and then read Resend's events to mark it
"delivered" — the test email was confirmed delivered. WhatsApp uses Meta's official Cloud API with an approved
template, because business-initiated messages need one; delivery receipts come back through a signed webhook.
While Meta approval is pending, Telegram's Bot API delivers the same report.

**16. What happens when an API fails?**
Retries with backoff for transient errors; index sources fall back in order; each step and channel records its
own result, so the run becomes "partial", not a crash. If Gemini fails, the template report is used and labelled.
Missing data shows as unavailable with a reason.

**17. How are secrets and endpoints protected?**
All keys are server-only environment variables, never in the browser or git. Cron routes need the cron secret;
owner actions need a signed httpOnly session cookie from the admin password, with login rate-limiting; the
WhatsApp webhook verifies Meta's HMAC signature. Recipient addresses are masked in logs and UI.

**18. How would it scale?**
Peer averages are per category and date, so they're shared across funds and would be shared across users. Adding
users means a user id on funds, reports and deliveries. Longer jobs could be split per step or queued.

**19. What's live, cached, simulated, blocked?**
Live: NAVs, indices, breadth, news, Gemini, Appwrite, email. Stored/cached: everything is read from the database
between refreshes, with freshness badges. Simulated: nothing. Blocked: WhatsApp until Meta template approval;
Telegram until the bot token is added; email can only go to the Resend account owner until a domain is verified.

**20. Which brief requirements are met, with evidence?**

| Brief requirement | Evidence |
|---|---|
| Latest NAV daily from public MF APIs | Daily cron; `nav_history`; freshness badge on dashboard |
| WoW, MoM, YTD returns | Dashboard and fund page with exact dates; 18 return/date tests |
| vs stated benchmark | Benchmark column + sources (AMC documents) |
| vs category average from public MF data | Peer average with n from AMFI + MFapi |
| Saturday market context: Nifty 50, Midcap 150, Smallcap 100, macro news | Market tiles, category views, cited news |
| Gemini: 3-sentence summary per fund + 3-label assessment with reason | Report page; validator enforces it |
| Weekly snapshots stored for trend tracking | `performance_snapshots`, report archive, fund snapshot history |
| Add/remove by scheme code via a form, no code changes | Manage page; tested add/duplicate/invalid/remove |
| Deployed on Vercel, public URL, GitHub, Components Map | Live URL, repo, `docs/COMPONENTS_MAP.md` |
| Live external data; Gemini only, no Claude API | All sources live; only `@google/genai` |

**21. One limitation you'd fix next?**
Use SIP cash-flow returns (XIRR) once Meera's instalment dates are known, and get a TRI data source so
benchmark comparisons are exactly like-for-like.

## Redesign questions

**22. How do you rank funds in Explore without calling one "the best"?**
Only within the same category, on 5 years of NAV history: 3- and 5-year returns versus the category median,
consistency (how often it beat the median over rolling 1-year periods), worst fall and volatility, with 1-year return
weighted at just 10%. Labels say "Worth researching" or "Strong historical consistency", never "best". A test proves a
fund with one hot year cannot rank first.

**23. Why don't you show expense ratios in Explore?**
There is no verified free feed: AMFI's TER page is an interactive app, not a data API, so I show "not in our data"
instead of guessing. All ranked funds are Direct plans, which removes most cost gaps, and a factsheet uploaded in
Analyse a Fund gives the exact expense ratio, verified against the PDF.

**24. How do you stop Gemini inventing numbers from an uploaded factsheet?**
Gemini must return a short verbatim quote for every value. We extract the PDF's own text and accept a value only if the
quote is in the document and contains that number. Unverified values are shown as reference only and never used.

**25. How is the portfolio total calculated?**
Only from what the owner enters: units x latest NAV for value, minus amount invested for gain. If units are missing we
show nothing rather than estimate; returns alone cannot tell you how much money someone has.

**26. What is the difference between tracked, held, watchlisted and analysed?**
Tracked funds get the weekly check; holdings carry rupee amounts; the watchlist is research only; analyses are saved
research reports. They are separate tables, so a watchlisted fund is never counted as an investment.

**27. What does "What matters this week" use?**
Fixed rules: a flagged fund, an index moving 2%+ in a week, the rupee moving 1%+, interest-rate news, or a fund 1.5+
points behind similar funds over a month. At most three, each linked to its evidence.
