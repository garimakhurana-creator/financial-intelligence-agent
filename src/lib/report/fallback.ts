import { VIEW_IDS, VIEWS } from "@/lib/catalog";
import type { ReportInput, ReportOutput } from "@/lib/report/types";

// Template-based report used when Gemini is unavailable or keeps failing validation.
// It only restates verified numbers, so it is always safe — just less readable.

const pct = (n: number | null) => (n === null ? "n/a" : `${n > 0 ? "+" : ""}${n.toFixed(2)}%`);
const pp = (n: number | null) => (n === null ? "n/a" : `${Math.abs(n).toFixed(2)} percentage points ${n >= 0 ? "ahead of" : "behind"}`);

export function fallbackReport(input: ReportInput): ReportOutput {
  const funds = input.funds.map((f) => {
    const w = f.returns["1W"];
    const m = f.returns["1M"];
    const y = f.returns["YTD"];
    const performance = `${f.name} returned ${pct(w.fund)} over the week, ${pct(m.fund)} over the month and ${pct(y.fund)} so far this year (NAV dated ${f.navDate ?? "unknown"}).`;
    const parts: string[] = [];
    if (w.benchmark !== null) parts.push(`${pp(w.vsBenchmarkPp)} ${f.benchmarkName} this week`);
    if (w.peerAverage !== null) parts.push(`${pp(w.vsPeerPp)} the ${f.peerGroup} average of ${pct(w.peerAverage)} (${w.peerCount} funds)`);
    const comparison = parts.length
      ? `It was ${parts.join(", and ")}.`
      : "No benchmark or peer data was available for a like-for-like comparison this week.";
    const marketContext = "An automated summary was used this week, so no market explanation is offered; see the market news section for context.";
    return { schemeCode: f.schemeCode, performance, comparison, marketContext, evidenceIds: [] };
  });

  const categories = VIEW_IDS.map((id) => {
    const v = input.views.find((x) => x.id === id)!;
    const ix = input.indices.filter((i) => v.indexIds.includes(i.id));
    const summary =
      ix.length > 0
        ? ix.map((i) => `${i.name} moved ${pct(i.returns["1W"])} over the week and ${pct(i.returns["1M"])} over the month.`).join(" ")
        : "No market index is tracked for this category; see the news items below for rate and policy developments.";
    return { viewId: id, headline: `${VIEWS[id].title}: weekly figures`, summary, watchItems: [], evidenceIds: [] };
  });

  const headline = input.indices.filter((i) => ["NIFTY50", "NIFTY_MIDCAP150", "NIFTY_SMALLCAP100"].includes(i.id));
  const flagged = input.funds.find((f) => f.screening.flag);
  return {
    funds,
    categories,
    marketSummary: {
      text: headline.length
        ? `Headline index moves for the week: ${headline.map((i) => `${i.name} ${pct(i.returns["1W"])}`).join(", ")}. This summary was generated automatically from verified figures.`
        : "Headline index data was not available this week, so no market summary is shown. See the news section for context.",
      evidenceIds: [],
    },
    assessment: {
      label: input.screening.suggestedLabel,
      reason: input.screening.rationale,
      fundOfConcern: input.screening.suggestedLabel === "One fund worth watching" && flagged ? flagged.schemeCode : null,
    },
  };
}
