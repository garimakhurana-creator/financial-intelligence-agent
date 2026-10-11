# Competitor Research: Mutual Fund Performance Tracker

*Student project. Persona: Meera, 28, a non-expert retail investor in India with five SIPs (large-cap index, mid-cap, small-cap, short-duration debt, international FoF).*

## 1. Scope and method

**Products reviewed:** Morningstar India, Value Research Online (VRO), INDmoney, Tickertape, Kuvera, ET Money.

**Aspects covered:** portfolio tracking and import; performance views; benchmark and category comparison; insights and alerts; reports and digests; AI features; pricing model; differentiators.

**Method:** We used public web pages only, through web search and page fetches. We did not log in, create accounts or install apps. All sources were accessed on **2026-10-11**. Some official sites could not be read by our fetch tool: valueresearchonline.com returned HTTP 403, etmoney.com refused the fetch, and morningstar.in fund data sits behind a login. For those products we used app-store listings, the company's own help or blog pages, and a small number of third-party pages, each labelled below.

**Evidence legend**

| Tag | Meaning |
|---|---|
| **[V]** | Verified: we read the claim on the cited page, which is the vendor's own site or app-store listing. |
| **[V-3P]** | Seen on a cited third-party page (review, press release or encyclopedia). It may be out of date or biased. |
| **[S]** | Seen only in a search-result excerpt of the vendor's domain. We could not open the full page. |
| **[U]** | Assumed or not verified. This is a hypothesis, not a finding. |

Page dates matter. Several of the sources are older than 2026, and we give their dates where they are known.

## 2. Comparison table

| Aspect | Morningstar India | Value Research | INDmoney | Tickertape | Kuvera | ET Money |
|---|---|---|---|---|---|---|
| Portfolio import | No MF tracker described [V] | MF Central QR / CAS import [S][V] | MF Central OTP sync [V] | OTP-based MF fetch [V] | CAS import [V] | External fund tracking, PDF upload [V][S] |
| Performance views | Trailing, yearly, monthly and quarterly returns [V, 2013 page] | Fund pages with returns (layout not verified) | XIRR, fund-wise returns [V] | Top 3 / bottom 3 by P&L and XIRR [V] | Portfolio returns, insights [V] | Current and lifetime XIRR [V] |
| Benchmark / category comparison | Category and benchmark on fund pages [V, 2013 page] | Category benchmarks used in ratings [S] | Not verified | Not verified | "Custom benchmarks", Nifty comparison [V] | Category-adjusted Report Card [V] |
| Insights / alerts | Notifications menu, triggers not stated [V] | Good / Steady / Exit labels; alerts before buying weak funds [V] | Overlap, regular-plan flags [V]; alerts per user forum [V-3P] | Personal alerts (Pro, 12-month) [V-3P] | "Signals" mentioned [V] | Health Check score, Portfolio Fix [V] |
| Reports / digests | Free monthly FundInvestor newsletter [V, 2013 page] | Tax report [V]; weekly digest not verified | Not verified | CSV export [V] | Capital gains and ELSS reports [V] | Capital gains statement [V] |
| AI features | Not verified | None stated; "algorithmic" ratings [V] | None stated on feature pages [V]; hosted MCP server [S] | None stated [V-3P] | None stated [V] | Described as rules-based, not an LLM [V-3P] |
| Pricing | Free registration [V]; premium not verified | Fund Advisor ₹490/month, family of up to 6 [V] | Free MF tracking (page title) [V]; MF pricing not verified | Pro ₹299/month to ₹2,399/year [V-3P] | Free, direct plans [V] | Free app; Genius ₹249/month [V-3P] |

## 3. Competitor profiles

### 3.1 Morningstar India

- **Tracking and import:** The homepage shows a stock watchlist called Stock Monitor and a My Account menu with Notifications. It does not show a mutual fund portfolio tracker [V].[^ms-home] A 2018 reader comment on the site's user guide asks how to import a portfolio from Excel or CSV, and the guide gives no answer [V].[^ms-guide]
- **Performance, benchmark and category:** The user guide is dated 8 April 2013. It describes a Performance tab with trailing, year-on-year, monthly and quarterly returns, each compared with the fund's category and a benchmark. It also describes a "Growth of 10,000" chart on the Overview tab [V].[^ms-guide] The current homepage shows category returns from 1 day to 10 years, best-YTD fund lists and a compare tool [V].[^ms-home] A current fund page lists Performance, Risk & Rating and Analysis tabs, but the values are locked behind sign-in [V].[^ms-fund]
- **Ratings:** Star ratings and analyst Medalist ratings (Gold through Negative) are listed on the homepage [V].[^ms-home]
- **Digest:** The 2013 guide describes a free monthly FundInvestor newsletter [V].[^ms-guide] We did not verify whether it is still published.
- **AI:** Not verified.
- **Pricing:** Registration is free [V].[^ms-guide] A retail premium tier is not verified.
- **Differentiator:** A globally consistent rating methodology combined with qualitative analyst research.

### 3.2 Value Research Online

- **Tracking and import:** Search excerpts from VRO pages describe an import flow. The user starts on VRO, gets an OTP from MF Central, generates a CAS QR code and uploads it, after which the import runs automatically [S].[^vro-search] The Value Research Advisor app listing confirms the MF Central import, the QR step and a family dashboard for up to six members [V].[^vro-app]
- **Performance, benchmark and category:** Search excerpts of VRO's rating methodology say each category has a standard benchmark. They also say the ratings are purely quantitative, weight 5-year and 3-year scores, and compare excess return with the category average [S].[^vro-method] We could not open the fund pages to verify their layout (HTTP 403).
- **Insights and alerts:** The app gives buy, sell or hold opinions on funds the user already owns, labels each holding Good, Steady or Exit, and warns before the user buys a weak fund [V].[^vro-app]
- **Reports:** The app offers a downloadable tax report on imported investments [V].[^vro-app] We did not verify a weekly email digest.
- **AI:** The listing does not mention AI. It calls the ratings algorithmic [V].[^vro-app]
- **Pricing:** Research is free on the website. Fund Advisor costs ₹490 per month and covers up to six family members [V].[^vro-app] An older pricing page lists ₹1,495 per quarter or ₹4,999 per year [S].[^vro-pricing] The figures conflict, so treat the app listing as the more current one.
- **Differentiator:** Independent, flat-fee opinions on funds the user already holds, from a long-established Indian research house.

### 3.3 INDmoney

- **Tracking and import:** In the "Track Other Funds" flow, the user consents through an MF Central OTP, selects AMCs and syncs. The page says the import does not move any money [V].[^ind-track]
- **Performance views:** Invested versus current value, XIRR across SIPs and lump sums, fund-wise returns, total monthly SIP commitment, and allocation by category, sector and market cap [V].[^ind-track]
- **Insights:** Portfolio overlap, flags on regular plans that may carry higher costs, capital gains for tax review, and detection of forgotten SIPs [V].[^ind-track] The analytics page promises personalised recommendations but does not mention benchmark or category comparison [V].[^ind-analytics] A user post on a forum reports alerts when a fund manager changes [V-3P].[^ind-forum]
- **Reports or digests:** Not verified.
- **AI:** Neither feature page mentions AI [V].[^ind-track][^ind-analytics] Search results point to a hosted MCP server for external AI tools [S].[^ind-mcp] Its scope is not verified.
- **Pricing:** The tracking page title calls the service free [V].[^ind-track] The pricing page covers only stocks, so mutual fund pricing is not verified [V].[^ind-pricing]
- **Differentiator:** A whole-of-wealth view (net worth, family accounts, Indian and US markets) with strong portfolio hygiene checks [V].[^ind-home]

### 3.4 Tickertape

- **Tracking and import:** A March 2023 blog post describes fetching mutual fund holdings through mobile OTP. It requires the PAN to be linked to the mobile number. The post also covers filters by category, sub-category, AUM and AMC, and a CSV export [V].[^tt-blog] A third-party review from 2026 says portfolios connect through brokers and does not mention file import [V-3P].[^tt-review]
- **Performance views:** The top 3 and bottom 3 holdings by P&L and XIRR [V].[^tt-blog] On the homepage, funds are grouped by category with 1-year returns, and there are prebuilt MF screens [V].[^tt-home]
- **Benchmark and category comparison:** Not verified.
- **Alerts:** The 12-month Pro plan includes personal alerts, according to the third-party review [V-3P].[^tt-review]
- **AI:** None mentioned [V-3P].[^tt-review]
- **Pricing:** Freemium. Pro costs about ₹299 per month, ₹699 for 3 months or ₹2,399 for 12 months, with a 14-day trial [V-3P].[^tt-review]
- **Differentiator:** Screener-first design with more than 200 filters across stocks and funds, plus Pro diversification and overlap scores [V-3P].[^tt-review]

### 3.5 Kuvera

- **Tracking and import:** External investments can be imported via CAS. The platform offers more than 5,000 direct plans with no commission, and one login can cover family members [V].[^kv-app] The service now appears as "Kuvera by CRED" [V].[^kv-home]
- **Performance, benchmark and category:** The app listing mentions comparison against custom benchmarks and against Nifty indices, plus insights on discipline, allocation and performance [V].[^kv-app] We did not verify comparison against category peers.
- **Alerts:** The listing mentions "signals" but does not describe notification features [V].[^kv-app]
- **Reports:** Capital gains and ELSS reports [V].[^kv-app]
- **Tax harvesting:** Kuvera monitors the portfolio and recommends redemptions that use the annual LTCG exemption [V]. The blog post describing this is from 2022 and uses the older ₹1 lakh limit.[^kv-tax] The current site wording cites ₹1.25 lakh [S].[^kv-search]
- **AI:** Not mentioned [V].[^kv-app]
- **Pricing:** The app is listed as free, with direct plans only [V].[^kv-app]
- **Differentiator:** Free direct investing combined with tax harvesting and goal planning.

### 3.6 ET Money

- **Tracking and import:** External mutual funds can be tracked for free, with current and lifetime XIRR [V].[^et-app] An earlier listing describes uploading a PDF statement [S].[^et-search]
- **Performance and category comparison:** The Fund Report Card ranks a fund on return consistency and downside protection within its category. Fund Verdict judges whether a fund suits the user's risk profile. Portfolio Breakdown shows allocation by sector and credit rating [V].[^et-app] We did not verify a dedicated benchmark comparison.
- **Insights:** Portfolio Health Check gives an overall score built from more than 100 factors, and Portfolio Fix suggests replacements for weak funds [V].[^et-app]
- **Reports:** Downloadable capital gains statements [V].[^et-app] Weekly digests are not verified.
- **AI:** The listing claims no AI [V].[^et-app] A competitor's page describes Genius as rules-based rather than an LLM [V-3P].[^et-richify]
- **Pricing:** The app is free, with commission-free direct funds [V-3P].[^et-wiki] Genius, launched in 2022, costs ₹249 per month and offers quant asset-allocation strategies with monthly rebalancing [V-3P].[^et-genius] We did not verify current Genius pricing. 360 ONE WAM agreed to acquire ET Money in 2024 [V-3P].[^et-wiki]
- **Differentiator:** Opinionated scoring (Health Check, Report Card) aimed at non-experts.

## 4. Gap analysis

### What these products do well

1. **One-step import.** Using MF Central OTP or CAS, INDmoney, VRO, Kuvera and ET Money can pull in all of a user's folios in a few minutes.
2. **Category-relative judgement.** VRO ratings and the ET Money Report Card both judge a fund against its own category rather than in isolation. That is the right mental model for Meera.
3. **Simple verdicts.** VRO's Good / Steady / Exit labels and ET Money's Health Check reduce complexity to one signal.
4. **Portfolio hygiene.** Overlap checks, flags on regular plans, forgotten-SIP detection and capital gains reports.

### What we learn

- Simple labels work, but none of the reviewed products shows how a verdict was computed. We found no public description of the date window, the peer set or the peer count behind a label.
- Comparison against the benchmark and against category peers is mostly locked inside fund pages or ratings. It is not pushed to the user when something changes.
- Based on the pages we checked, the digest channels are mainly in-app or monthly. Morningstar's FundInvestor newsletter is described as monthly on a 2013 page. We found no weekly, personalised digest on email or Telegram [U: absence is not proof].
- **AI:** None of the six publicly markets an LLM-written, per-portfolio narrative on the pages we checked. That is a gap, and it also means we need to show that our AI is trustworthy.

### How our product differentiates

| Our feature | Competitor gap it addresses |
|---|---|
| **Personalised Saturday report.** Gemini writes 3 sentences per fund and one of three portfolio labels. | Competitors show verdicts on screen. We did not find any that send a weekly plain-language narrative. |
| **Traceable numbers.** Every number in the report is checked against source NAV data, and the dates and peer sample size *n* are shown. | Competitor ratings are opaque at the point of use. Showing exact dates and the peer count is our trust feature. |
| **Two comparisons side by side.** Each fund is compared with its stated benchmark *and* with an equal-weighted average of Direct-Growth peers in its AMFI category. | Most tools show one or the other. Using only Direct-Growth peers avoids distortion from regular-plan expense ratios. |
| **Short windows.** 1-week, 1-month and calendar-YTD returns. | These suit a weekly cadence. Competitors focus on 1-, 3- and 5-year figures and XIRR. |
| **Category intelligence.** Five category-level views. | Morningstar shows category returns on its homepage [V], but they are not tied to the user's own five funds. |
| **Delivery.** Email and Telegram now, WhatsApp planned, with a weekly snapshot archive. | Competitor digests are in-app or monthly. Our archive makes week-to-week change auditable. |

**Caution:** Short-window returns are noisy. The report should frame 1-week moves as context, not as signals, so that the "worth watching" label is not overused. This is especially true for the small-cap fund and the international FoF.

## 5. Scope decisions for this assignment

| Idea seen in competitors | Decision | Reason |
|---|---|---|
| Benchmark and category-relative comparison | **In scope (core)** | It is the main analytical value, and it can be done with AMFI NAV data plus index data. |
| Simple portfolio verdict label | **In scope** | Already designed as three labels. Learned from VRO and ET Money. |
| Overlap or regular-plan flags | *Optional stretch* | A regular-plan flag is cheap once the scheme code is known. Overlap needs holdings data, which is out of scope. |
| Weekly snapshot archive | **In scope** | Supports week-over-week narrative and auditing. |
| XIRR with SIP cash flows | **Out of scope** | Needs transaction history. Our product measures fund performance, not the investor's money-weighted return, so we will say so explicitly in the report. |
| CAS / MF Central import | **Out of scope** | It handles PII and needs OTP or consent flows. Manual entry of AMFI scheme codes is enough for five funds. |
| Tax harvesting and capital gains reports | **Out of scope** | Needs lot-level holdings and tax rules. It is regulated-advice territory. |
| Direct investing or transactions | **Out of scope** | Needs distributor or RIA registration. Not a student-project concern. |
| Buy/sell recommendations and model portfolios (Genius, Fund Advisor) | **Out of scope** | These are investment advice. Our labels should stay descriptive ("worth watching") and carry a disclaimer. |
| Screeners with 200+ filters | **Out of scope** | Not needed for a five-fund personal tracker. |

## 6. Sources

All accessed 2026-10-11.

[^ms-home]: Morningstar India homepage. https://www.morningstar.in/
[^ms-guide]: Morningstar India, user guide to Morningstar.in (dated 8 Apr 2013). https://www.morningstar.in/posts/17675/a-users-guide-to-morningstarin.aspx
[^ms-fund]: Morningstar India fund page (sample index fund, values locked). https://www.morningstar.in/mutualfunds/f00000pd8s/uti-nifty-50-index-fund-direct-growth/overview.aspx
[^vro-search]: Web-search excerpts of VRO import help notices (page returned 403). https://www.valueresearchonline.com/stories/
[^vro-app]: Value Research Advisor, App Store listing. https://apps.apple.com/app/id6751192384
[^vro-method]: VRO fund rating methodology (search excerpt; page returned 403). https://www.valueresearchonline.com/fund-rating-methodology/
[^vro-pricing]: VRO Fund Advisor pricing policy (search excerpt). https://www.valueresearchonline.com/fund-advisor/pricing-policy/
[^ind-home]: INDmoney homepage. https://www.indmoney.com/
[^ind-track]: INDmoney, Track External Mutual Funds. https://www.indmoney.com/mutual-funds/track-mutual-funds
[^ind-analytics]: INDmoney, Mutual Fund Analytics. https://www.indmoney.com/features/mutual-fund-analytics
[^ind-pricing]: INDmoney pricing page. https://www.indmoney.com/pricing
[^ind-forum]: TradingQnA user post (third-party, anecdotal). https://tradingqna.com/t/would-zerodha-consider-offering-mf-in-non-demat-form/104311
[^ind-mcp]: MCP bundle listing for INDmoney (search excerpt). https://www.mcpbundles.com/skills/indmoney-mcp-5c8b051caa
[^tt-home]: Tickertape homepage. https://www.tickertape.in/
[^tt-blog]: Tickertape blog, "How To Analyse Mutual Funds Portfolio With Tickertape?" (13 Mar 2023). https://www.tickertape.in/blog/wp-json/wp/v2/posts/12156
[^tt-review]: Strike.money, Tickertape Review 2026 (third-party; dated 14 Jan 2026, updated 28 Apr 2026). https://www.strike.money/?p=10077
[^kv-home]: Kuvera homepage. https://kuvera.in/
[^kv-app]: Kuvera, App Store listing. https://apps.apple.com/app/id1329701793
[^kv-tax]: Kuvera blog, Tax Harvesting (26 Jul 2022, updated 17 Aug 2022). https://kuvera.in/blog/tax-harvesting/
[^kv-search]: Kuvera site, search excerpt on tax harvesting limit. https://www.kuvera.in/mutual-funds/top-searched
[^et-app]: ET Money, App Store listing. https://apps.apple.com/in/app/et-money-mutual-fund-sip-app/id1212752482
[^et-search]: Web-search excerpt of an ET Money listing on external fund PDF upload. https://apple.co/2Cn7aZ7
[^et-wiki]: Wikipedia, ET Money (third-party). https://en.wikipedia.org/wiki/ET_Money
[^et-genius]: Mediainfoline press release on ET Money Genius (9 Feb 2022, third-party). https://www.mediainfoline.com/special/et-money-opens-complete-access-to-genius-a-premium-membership-service-that-delivers-personalized-investing-intelligence
[^et-richify]: Richify, "best AI personal finance app" (competitor marketing, third-party). https://www.richify.ai/in/best-ai-personal-finance-app
