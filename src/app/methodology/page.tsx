import { MAX_CURRENT_STALENESS_DAYS, MAX_REFERENCE_GAP_DAYS } from "@/lib/calc/returns";
import { MIN_PEERS_FOR_AVERAGE, MIN_PEERS_FOR_RELIABLE } from "@/lib/calc/peers";
import { DISCOVERY_GROUPS, PEER_RULES, SEED_FUNDS } from "@/lib/catalog";
import { THRESHOLDS } from "@/lib/report/screening";
import { FACTORS } from "@/lib/calc/rank";
import { HIGHLIGHT_RULES } from "@/lib/highlights";
import { GAP_CLEAR, GAP_SAME } from "@/lib/plain";

export const metadata = { title: "Methodology · Meera's Fund Tracker" };

function H({ children, id }: { children: React.ReactNode; id?: string }) {
  return (
    <h2 id={id} className="mt-8 scroll-mt-20 text-lg font-semibold">
      {children}
    </h2>
  );
}

export default function Methodology() {
  return (
    <article className="max-w-3xl space-y-3 leading-relaxed [&_li]:mt-1 [&_ul]:list-disc [&_ul]:pl-5">
      <h1 className="text-2xl font-semibold tracking-tight">How the numbers are calculated</h1>
      <p className="text-[var(--ink-secondary)]">
        Every number on this site is computed by deterministic code from stored source data. The AI (Gemini Flash) only writes the explanation, and its text is
        checked so that every figure it states matches the verified input.
      </p>

      <H>Returns</H>
      <p>
        <strong>Return (%) = (current NAV ÷ reference NAV − 1) × 100.</strong> Point-to-point, on published NAVs, so expenses are already deducted.
      </p>
      <ul>
        <li>
          <strong>Current NAV</strong>: the latest NAV on or before today. If it is more than {MAX_CURRENT_STALENESS_DAYS} days old the fund is flagged stale and no returns are shown.
        </li>
        <li>
          <strong>1 week</strong>: reference = last NAV on or before (current NAV date − 7 days).
        </li>
        <li>
          <strong>1 month</strong>: same calendar day one month earlier (31 Mar → 28/29 Feb).
        </li>
        <li>
          <strong>Year to date</strong>: calendar year — the last NAV on or before 31 December of the previous year.
        </li>
        <li>
          Weekends and market holidays: the reference snaps back to the previous trading day, up to {MAX_REFERENCE_GAP_DAYS} days. Beyond that the value is shown as
          unavailable, never as 0%.
        </li>
        <li>The actual reference dates used are shown on every fund page.</li>
      </ul>

      <H>Benchmark comparison</H>
      <p>
        Each fund is mapped to its <em>stated</em> benchmark from the fund house&apos;s documents. The benchmark&apos;s return is measured over exactly the same dates as the
        fund, and the difference is shown in percentage points (pp).
      </p>
      <ul>
        <li>
          Fund benchmarks are total-return indices (TRI, including dividends). Free historical TRI data is not available, so we compare with the price index. This
          flatters the fund by roughly the index&apos;s dividend yield (about 1.5% a year for the Nifty 50, ≈0.03 pp a week) — material over a year, negligible over a
          week.
        </li>
        <li>International funds are compared with the overseas index converted to rupees (index × USD/INR on the same date).</li>
        <li>Debt funds&apos; stated benchmark (CRISIL indices) has no free feed — they are compared with peers only, never with an equity index.</li>
      </ul>
      <p className="text-sm text-muted-foreground">Seed fund mappings: {SEED_FUNDS.map((s) => `${s.schemeCode} → ${s.statedBenchmark}`).join("; ")}.</p>

      <H>Category peer average</H>
      <ul>
        <li>
          <strong>Universe</strong>: open-ended, Direct-plan, Growth-option schemes in the same SEBI category, taken from AMFI&apos;s daily NAV file. AMFI currently labels
          some categories two ways (e.g. “Debt Scheme - Short Duration Fund” and “Income/Debt Oriented Schemes - Short Term Fund”); both labels are merged.
          Index funds are matched by the index they track (e.g. only Nifty 50 index funds).
        </li>
        <li>
          <strong>Calculation</strong>: each peer&apos;s return over the same dates as the fund, then a simple (equal-weighted) mean. The median is shown too.
        </li>
        <li>
          <strong>Exclusions</strong>: a peer is left out of a period if it lacks a NAV near either date (e.g. launched this year), segregated portfolios and
          IDCW/dividend options are excluded, and missing data is never counted as zero.
        </li>
        <li>
          <strong>Minimum sample</strong>: fewer than {MIN_PEERS_FOR_AVERAGE} valid peers → no average; fewer than {MIN_PEERS_FOR_RELIABLE} → shown with a
          “limited sample” label. The number of funds (n) is always shown.
        </li>
        <li>This is the “average of available comparable funds”, not an official industry average; it is not weighted by fund size.</li>
      </ul>
      <p className="text-sm text-muted-foreground">Peer groups: {PEER_RULES.map((r) => `${r.label} (${r.amfiCategories.join(" + ")})`).join("; ")}.</p>

      <H>Overall assessment</H>
      <p>A rule-based screen runs first, then Gemini writes the reason. A fund is “worth watching” only if the weakness persists:</p>
      <ul>
        <li>
          Equity and international funds: behind the peer average by at least {Math.abs(THRESHOLDS.equity.vsPeer1M)} pp over 1 month <em>and</em>{" "}
          {Math.abs(THRESHOLDS.equity.vsPeerYTD)} pp year to date.
        </li>
        <li>
          Debt funds: behind peers by at least {Math.abs(THRESHOLDS.debt.vsPeer1M)} pp over 1 month and {Math.abs(THRESHOLDS.debt.vsPeerYTD)} pp year to date.
        </li>
        <li>Index funds: drifting more than ±{THRESHOLDS.indexTracking1M} pp from their index over 1 month.</li>
        <li>0 flagged → “No action needed”; 1 → “One fund worth watching”; 2+ → “Consider reviewing your allocation”.</li>
      </ul>

      <H>The words on the home page</H>
      <p>The simple view turns this week&apos;s gap (in percentage points) into fixed words, so the same numbers always read the same way:</p>
      <ul>
        <li>
          Gap smaller than {GAP_SAME} points → &ldquo;about the same as&rdquo;; {GAP_SAME}–{GAP_CLEAR} points → &ldquo;slightly better than / slightly behind&rdquo;; {GAP_CLEAR} points or more → &ldquo;better than / behind&rdquo;.
        </li>
        <li>&ldquo;On track&rdquo; / &ldquo;Keep an eye&rdquo; on each fund card uses the same screen as the overall assessment, so one bad week never changes it.</li>
      </ul>

      <H>How the AI is kept honest</H>
      <ul>
        <li>Gemini receives only the verified figures, dates and the week&apos;s retrieved news (with ids), and must answer in a fixed JSON schema.</li>
        <li>
          A validator rejects any answer that states a number not present in the input, uses more or fewer than one sentence per field, cites a news id that does not
          exist, misses a fund or category, or tells the reader to buy/sell. Rejected answers are retried with the errors fed back (up to 3 attempts), then a
          template built from the numbers is used instead.
        </li>
        <li>Each report stores its full input snapshot, so any past report can be audited and reproduced.</li>
      </ul>

      <H id="highlights">&ldquo;What matters this week&rdquo;</H>
      <p>At most three observations, chosen by fixed rules in this order; daily wiggles never qualify:</p>
      <ul>
        <li>a fund flagged by the weekly screen above;</li>
        <li>a headline index moving {HIGHLIGHT_RULES.indexWeekMovePct}% or more in a week;</li>
        <li>the rupee moving {HIGHLIGHT_RULES.fxWeekMovePct}% or more against the dollar in a week (affects overseas funds);</li>
        <li>interest-rate news in the last week (affects debt funds);</li>
        <li>a fund at least {Math.abs(HIGHLIGHT_RULES.fundLagVsPeers1M)} points behind similar funds over the month.</li>
      </ul>

      <H id="portfolio">Portfolio amounts</H>
      <p>
        Rupee figures come only from holdings you enter. Current value = units × latest NAV; gain/loss = current value − amount invested, shown only for funds with both. Nothing is
        ever estimated from returns, and tracked or watchlisted funds are not counted as investments.
      </p>

      <H id="ranking">Explore Funds research ranking</H>
      <p>
        Every Direct-Growth scheme in {DISCOVERY_GROUPS.length} AMFI categories is measured from its NAV history and ranked <strong>only against funds in the same category</strong>. A
        fund needs at least 3 years of history to be ranked; categories need at least 4 rankable funds.
      </p>
      <ul>
        {(Object.keys(FACTORS) as (keyof typeof FACTORS)[]).map((k) => (
          <li key={k}>
            <strong>{FACTORS[k].label}</strong> ({Math.round(FACTORS[k].weight * 100)}%): {FACTORS[k].explain}
          </li>
        ))}
      </ul>
      <p>
        Each factor is converted to a percentile within the category and combined with these weights (missing factors are re-weighted). Labels: score ≥ 70 with consistency ≥ 60% →
        &ldquo;Strong historical consistency&rdquo;; score ≥ 60 → &ldquo;Worth researching&rdquo;; otherwise &ldquo;Mixed record&rdquo;; under 3 years → &ldquo;Insufficient
        history&rdquo;. Recent 1-year return has a deliberately small weight, so a single hot year cannot top the list.
      </p>
      <p className="text-sm text-muted-foreground">
        Limitations: expense ratios, official riskometers and minimum SIP amounts are not available from a free verified feed, so they are not ranking factors (all ranked funds are
        Direct plans, which removes most cost differences). Overseas fund-of-funds track different markets, so their category comparison mixes unlike funds. Past performance does
        not guarantee future returns; labels are research prompts, not recommendations.
      </p>

      <H id="analysis">Analyse a Fund outcomes</H>
      <p>Strengths and concerns are found by fixed tests against the category (e.g. 3-year return at least 1 point above or below the median, consistency ≥ 60% or &lt; 40%, worst fall 2–3 points better or worse, Regular plan, IDCW option, under 3 years of history). Then:</p>
      <ul>
        <li>no NAV match or no 3-year record and peer group → &ldquo;Insufficient data for a reliable assessment&rdquo;;</li>
        <li>two or more material concerns → &ldquo;Several concerns to investigate&rdquo;;</li>
        <li>three or more strengths and no material concerns → &ldquo;Worth researching further&rdquo;;</li>
        <li>otherwise → &ldquo;Suitable for further comparison&rdquo;.</li>
      </ul>
      <p>
        Uploaded factsheets are read once and not stored. A factsheet value is &ldquo;verified&rdquo; only if the quote Gemini gives appears in the PDF&apos;s own text and contains the
        value; unverified values are shown for reference but never used.
      </p>

      <H id="news">News and the market brief</H>
      <p>
        News is retrieved daily for seven topics and mapped to fund categories by a fixed table. Gemini adds a one-line factual summary and a labelled interpretation; any line that
        states a number not in the article, or reads like advice, is dropped. The daily brief is held to the same checks.
      </p>

      <H>Data sources</H>
      <ul>
        <li>Mutual fund NAVs: AMFI, via MFapi.in (history) and AMFI&apos;s NAVAll.txt (categories and peer universe).</li>
        <li>Indices: Yahoo Finance (Nifty 50, Midcap 150, Smallcap 250, Nasdaq-100, S&amp;P 500, USD/INR); NSE India for the Nifty Smallcap 100 history and for breadth/valuation.</li>
        <li>News: Tavily (primary) and GNews (secondary), last 7 days, de-duplicated, ranked by source credibility.</li>
      </ul>
      <p className="text-sm text-muted-foreground">Past performance does not guarantee future returns. This tool supports monitoring and is not investment advice.</p>
    </article>
  );
}
