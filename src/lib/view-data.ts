import { connection } from "next/server";
import { INDICES, VIEWS, type IndexId, type ViewId } from "@/lib/catalog";
import { addDays, todayIn } from "@/lib/dates";
import { isAdmin } from "@/lib/auth";
import * as repo from "@/lib/db/repo";
import * as research from "@/lib/db/research";
import { weeklyHighlights } from "@/lib/highlights";
import { summarisePortfolio } from "@/lib/portfolio";
import { integrationStatus, REPORT_TZ } from "@/lib/env";
import { syncEmailStatuses } from "@/lib/delivery/deliver";
import { buildFundPerformance, buildIndexPerformance, buildIndexSet, getIndexSeries, historyStart, type FundPerformance, type StoredPeerStats } from "@/lib/pipeline/data";
import type { ReportPayload, StoredWeeklyReport } from "@/lib/report/build";
import type { ReportInput } from "@/lib/report/types";
import type { IndexSnapshot } from "@/lib/sources/nse";

// Read-side loaders for server components. Every loader awaits connection() so pages always
// render from the latest stored data at request time (never from a build-time snapshot).

export async function loadDashboard() {
  await connection();
  const asOf = todayIn(REPORT_TZ());
  const [funds, admin] = await Promise.all([repo.listFunds({ activeOnly: true }), isAdmin()]);
  const [performance, headline, fx, snapshot, latestReportMeta, runs, recentNews, holdings] = await Promise.all([
    Promise.all(funds.map((f) => buildFundPerformance(f, asOf))),
    Promise.all((["NIFTY50", "NIFTY_MIDCAP150", "NIFTY_SMALLCAP100"] as IndexId[]).map((id) => buildIndexPerformance(id, asOf))),
    buildIndexSet(["NASDAQ100", "USDINR"], asOf).then((s) => s.find((i) => i.id === "USDINR") ?? null),
    repo.getLatestMarketSnapshot<IndexSnapshot[]>(),
    repo.listReports(1),
    repo.listRuns(5),
    repo.listNewsSince(addDays(asOf, -7) + "T00:00:00.000Z", 200).catch(() => []),
    admin ? research.listHoldings().catch(() => []) : Promise.resolve([]),
  ]);
  const latestReport = latestReportMeta[0] ? await repo.getReport<ReportPayload, ReportInput>(latestReportMeta[0].id) : null;
  const news = latestReport ? latestReport.report.news.slice(0, 6) : [];
  const withPeer = performance.map((p, i) => ({ ...p, peerKey: funds[i].peerKey }));
  const portfolio = admin ? summarisePortfolio(holdings, withPeer) : null;
  const highlights = weeklyHighlights({ funds: performance, indices: headline, fx, news: recentNews });
  const lastRefresh = runs.find((r) => r.status !== "running" && r.finishedAt) ?? null;
  return { asOf, admin, funds, performance, headline, snapshot, latestReport, news, runs, lastRefresh, portfolio, highlights, integrations: integrationStatus() };
}

export async function loadFund(schemeCode: number) {
  await connection();
  const asOf = todayIn(REPORT_TZ());
  const fund = await repo.getFund(schemeCode);
  if (!fund) return null;
  const perf = await buildFundPerformance(fund, asOf);
  const bench = fund.benchmarkId && fund.benchmarkId in INDICES ? await getIndexSeries(fund.benchmarkId as IndexId, historyStart(asOf)) : null;
  const peer = fund.peerKey && perf.nav ? await repo.getPeerStats<StoredPeerStats>(fund.peerKey, perf.nav.date) : null;
  const history = await repo.listPerformanceSnapshots<Omit<FundPerformance, "chart">>(schemeCode, 26);
  return { asOf, fund, perf, benchSeries: bench?.series ?? [], peer: peer?.stats ?? null, history };
}

export async function loadCategory(viewId: ViewId) {
  await connection();
  const asOf = todayIn(REPORT_TZ());
  const view = VIEWS[viewId];
  const funds = (await repo.listFunds({ activeOnly: true })).filter((f) => f.viewId === viewId);
  const [performance, indices, snapshot, latestMeta] = await Promise.all([
    Promise.all(funds.map((f) => buildFundPerformance(f, asOf))),
    buildIndexSet(view.marketIndices, asOf),
    repo.getLatestMarketSnapshot<IndexSnapshot[]>(),
    repo.listReports(1),
  ]);
  const peerKeys = [...new Set(funds.map((f) => f.peerKey).filter(Boolean) as string[])];
  const peers = (await Promise.all(peerKeys.map((k) => repo.getLatestPeerStats<StoredPeerStats>(k)))).filter(Boolean).map((p) => p!.stats);
  const report = latestMeta[0] ? await repo.getReport<ReportPayload, ReportInput>(latestMeta[0].id) : null;
  const summary = report?.report.output.categories.find((c) => c.viewId === viewId) ?? null;
  const news = report ? report.report.news.filter((n) => n.views.includes(viewId)) : [];
  return { asOf, view, performance, indices, snapshot, peers, report, summary, news };
}

export async function loadReport(id: string): Promise<{ report: StoredWeeklyReport; deliveries: repo.DeliveryLog[] } | null> {
  await connection();
  const report = await repo.getReport<ReportPayload, ReportInput>(id);
  if (!report) return null;
  let deliveries = await repo.listDeliveries(id);
  // Ask Resend for confirmed status only when an email is still "accepted, not confirmed".
  if (deliveries.some((d) => d.channel === "email" && d.status === "sent_to_provider")) {
    if ((await syncEmailStatuses([id]).catch(() => 0)) > 0) deliveries = await repo.listDeliveries(id);
  }
  return { report, deliveries };
}

export async function loadArchive() {
  await connection();
  return repo.listReports(52);
}

export async function loadManage() {
  await connection();
  const [funds, runs, reports] = await Promise.all([repo.listFunds(), repo.listRuns(15), repo.listReports(10)]);
  return { funds, runs, reports, integrations: integrationStatus() };
}

export async function loadPortfolio() {
  await connection();
  const asOf = todayIn(REPORT_TZ());
  const [funds, admin] = await Promise.all([repo.listFunds({ activeOnly: true }), isAdmin()]);
  const performance = await Promise.all(funds.map((f) => buildFundPerformance(f, asOf)));
  const holdings = admin ? await research.listHoldings().catch(() => []) : [];
  const withPeer = performance.map((p, i) => ({ ...p, peerKey: funds[i].peerKey }));
  const portfolio = admin ? summarisePortfolio(holdings, withPeer) : null;
  return { asOf, admin, funds, performance, holdings, portfolio };
}
