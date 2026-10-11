import { addDays, todayIn, type ISODate } from "@/lib/dates";
import * as repo from "@/lib/db/repo";
import { optionalEnv, REPORT_TZ } from "@/lib/env";
import { buildFundPerformance, buildMarketOverview, type FundPerformance, type IndexPerformance } from "@/lib/pipeline/data";
import type { IndexSnapshot } from "@/lib/sources/nse";
import { gatherWeeklyNews } from "@/lib/sources/news";
import { generateNarrative } from "@/lib/report/generate";
import { buildReportInput } from "@/lib/report/input";
import type { GeneratedReport, ReportInput, ReportOutput } from "@/lib/report/types";

/** The Friday on or before `d` — the last trading day a Saturday report covers. */
export function weekEndingFor(d: ISODate): ISODate {
  const dow = new Date(`${d}T00:00:00Z`).getUTCDay(); // 0 Sun … 6 Sat
  const back = (dow + 2) % 7; // Sat→1, Sun→2, Mon→3 … Fri→0
  return addDays(d, -back);
}

/** Everything the report page, email and WhatsApp message render from. Stored as JSON. */
export interface ReportPayload {
  output: ReportOutput;
  funds: Omit<FundPerformance, "chart">[];
  indices: Omit<IndexPerformance, "chart">[];
  breadth: { date: ISODate; data: IndexSnapshot[] } | null;
  news: (repo.NewsItem & { id: string; evidenceId: string })[];
  meta: {
    generator: GeneratedReport["generator"];
    model: string | null;
    attempts: number;
    validationErrors: string[];
    newsErrors: string[];
    generatedAt: string;
    dataAsOf: ISODate;
  };
}

export type StoredWeeklyReport = repo.StoredReport<ReportPayload, ReportInput>;

export interface BuildOptions {
  kind: "scheduled" | "manual";
  /** Re-use already-stored news for the week instead of calling the news APIs again. */
  reuseNews?: boolean;
  asOf?: ISODate;
}

export async function createWeeklyReport(opts: BuildOptions): Promise<{ id: string; report: StoredWeeklyReport }> {
  const today = opts.asOf ?? todayIn(REPORT_TZ());
  const weekEnding = weekEndingFor(today);

  const funds = await repo.listFunds({ activeOnly: true });
  if (funds.length === 0) throw new Error("No funds are being tracked — add a fund first.");
  const performance = await Promise.all(funds.map((f) => buildFundPerformance(f, today)));
  for (const p of performance) {
    if (p.nav) await repo.savePerformanceSnapshot(p.schemeCode, p.nav.date, { ...p, chart: undefined }, p.calcVersion);
  }

  const market = await buildMarketOverview(today);

  let news = opts.reuseNews ? await repo.listNews(weekEnding) : [];
  let newsErrors: string[] = [];
  if (news.length === 0) {
    const gathered = await gatherWeeklyNews(weekEnding);
    newsErrors = gathered.errors;
    if (gathered.items.length) await repo.saveNews(weekEnding, gathered.items);
    news = gathered.items;
  }

  const input = buildReportInput({
    weekEnding,
    investorName: optionalEnv("INVESTOR_NAME", "Meera"),
    funds: performance,
    indices: market.indices,
    snapshot: market.snapshot ? { date: market.snapshot.date, data: market.snapshot.data } : null,
    news,
  });
  const gen = await generateNarrative(input);

  const payload: ReportPayload = {
    output: gen.output,
    funds: performance.map(({ chart: _chart, ...rest }) => rest),
    indices: market.indices.map(({ chart: _chart, ...rest }) => rest),
    breadth: market.snapshot ? { date: market.snapshot.date, data: market.snapshot.data } : null,
    news: news.map((n, i) => ({ ...n, evidenceId: `N${i + 1}` })),
    meta: {
      generator: gen.generator,
      model: gen.model,
      attempts: gen.attempts,
      validationErrors: gen.validationErrors.slice(0, 30),
      newsErrors: newsErrors.slice(0, 20),
      generatedAt: new Date().toISOString(),
      dataAsOf: today,
    },
  };

  const id = await repo.saveReport({
    // Scheduled reports get a deterministic id so a duplicated cron call cannot create two.
    id: opts.kind === "scheduled" ? repo.rowId("wk", weekEnding) : undefined,
    weekEnding,
    kind: opts.kind,
    assessment: gen.output.assessment.label,
    assessmentReason: gen.output.assessment.reason,
    report: payload,
    inputSnapshot: input,
    generator: gen.generator,
    model: gen.model,
  });
  const report = (await repo.getReport<ReportPayload, ReportInput>(id))!;
  return { id, report };
}
