import { VIEWS, VIEW_IDS, type ViewId } from "@/lib/catalog";
import { round, WINDOWS, type WindowKey } from "@/lib/calc/returns";
import type { ISODate } from "@/lib/dates";
import type { NewsItem } from "@/lib/db/repo";
import type { FundPerformance, IndexPerformance } from "@/lib/pipeline/data";
import type { IndexSnapshot } from "@/lib/sources/nse";
import { screenFund, suggestLabel } from "@/lib/report/screening";
import { REPORT_SCHEMA_VERSION, type FundInput, type ReportInput } from "@/lib/report/types";

const shortName = (n: string) => n.replace(/\s*-\s*Direct Plan.*$/i, "").replace(/\s*-\s*Growth.*$/i, "").trim();

/** Rounded fund / benchmark / peer figures per window — the exact numbers the report and screen use. */
export function metricTriples(f: Pick<FundPerformance, "windows">): FundInput["returns"] {
  const returns = {} as FundInput["returns"];
  for (const w of WINDOWS) {
    const c = f.windows[w];
    returns[w] = {
      fund: round(c.fund.returnPct),
      benchmark: round(c.benchmark?.returnPct ?? null),
      peerAverage: round(c.peer?.mean ?? null),
      vsBenchmarkPp: round(c.vsBenchmarkPp),
      vsPeerPp: round(c.vsPeerPp),
      referenceDate: c.fund.referenceDate,
      peerCount: c.peer?.n ?? 0,
    };
  }
  return returns;
}

export function buildReportInput(args: {
  weekEnding: ISODate;
  investorName: string;
  funds: FundPerformance[];
  indices: IndexPerformance[];
  snapshot: { date: ISODate; data: IndexSnapshot[] } | null;
  news: (NewsItem & { id: string })[];
}): ReportInput {
  const funds: FundInput[] = args.funds.map((f) => {
    const returns = metricTriples(f);
    return {
      schemeCode: f.schemeCode,
      name: shortName(f.schemeName),
      view: f.viewId,
      navDate: f.nav?.date ?? null,
      nav: f.nav?.value ?? null,
      benchmarkName: f.benchmark ? `${f.benchmark.name} (price index)` : null,
      statedBenchmark: f.benchmark?.stated ?? f.statedBenchmarkOnly,
      peerGroup: f.peer?.label ?? null,
      returns,
      dataNotes: f.flags,
      screening: screenFund(f.viewId, returns),
    };
  });

  const flagged = funds.filter((f) => f.screening.flag).map((f) => ({ name: f.name, reason: f.screening.reason }));
  const s = suggestLabel(flagged);

  const news = args.news.map((n, i) => ({
    id: `N${i + 1}`,
    title: n.title,
    publisher: n.publisher,
    publishedAt: n.publishedAt,
    url: n.url,
    summary: n.summary,
    views: n.views.filter((v): v is ViewId => (VIEW_IDS as string[]).includes(v)),
  }));

  return {
    schemaVersion: REPORT_SCHEMA_VERSION,
    weekEnding: args.weekEnding,
    investorName: args.investorName,
    funds,
    indices: args.indices.map((ix) => ({
      id: ix.id,
      name: ix.name,
      date: ix.current?.date ?? null,
      level: ix.current ? round(ix.current.value) : null,
      returns: Object.fromEntries(WINDOWS.map((w) => [w, round(ix.windows[w].returnPct)])) as Record<WindowKey, number | null>,
    })),
    breadth: (args.snapshot?.data ?? []).map((b) => ({
      index: b.index,
      pe: b.pe,
      advances: b.advances,
      declines: b.declines,
      dividendYield: b.dividendYield,
    })),
    breadthDate: args.snapshot?.date ?? null,
    news,
    views: VIEW_IDS.map((id) => ({
      id,
      title: VIEWS[id].title,
      focus: VIEWS[id].focus,
      fundCodes: funds.filter((f) => f.view === id).map((f) => f.schemeCode),
      indexIds: VIEWS[id].marketIndices,
    })),
    screening: { suggestedLabel: s.label, rationale: s.rationale },
  };
}
