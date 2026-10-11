import { connection } from "next/server";
import { INDICES, VIEWS, type IndexId, type ViewId } from "@/lib/catalog";
import { addDays, todayIn } from "@/lib/dates";
import { isAdmin } from "@/lib/auth";
import * as cached from "@/lib/db/cached";
import * as repo from "@/lib/db/repo";
import * as research from "@/lib/db/research";
import { weeklyHighlights } from "@/lib/highlights";
import { computeFundMetrics } from "@/lib/calc/metrics";
import { fetchSchemeHistory } from "@/lib/sources/mfapi";
import { summarisePortfolio } from "@/lib/portfolio";
import { integrationStatus, REPORT_TZ } from "@/lib/env";
import { syncEmailStatuses } from "@/lib/delivery/deliver";
import { historyStart, type FundPerformance, type StoredPeerStats } from "@/lib/pipeline/data";
import type { ReportPayload, StoredWeeklyReport } from "@/lib/report/build";
import type { ReportInput } from "@/lib/report/types";
import type { IndexSnapshot } from "@/lib/sources/nse";

// Read-side loaders for server components. Every loader awaits connection() so pages always
// render from the latest stored data at request time (never from a build-time snapshot).

export async function loadDashboard() {
  await connection();
  const asOf = todayIn(REPORT_TZ());
  const [funds, admin] = await Promise.all([cached.funds(), isAdmin()]);
  const [performance, headline, fx, snapshot, latestReportMeta, runs, recentNews, holdings] = await Promise.all([
    Promise.all(funds.map((f) => cached.fundPerformance(f, asOf))),
    Promise.all((["NIFTY50", "NIFTY_MIDCAP150", "NIFTY_SMALLCAP100"] as IndexId[]).map((id) => cached.indexPerformance(id, asOf))),
    cached.indexSet(["NASDAQ100", "USDINR"], asOf).then((s) => s.find((i) => i.id === "USDINR") ?? null),
    cached.latestMarketSnapshot<IndexSnapshot[]>(),
    cached.reports(1),
    repo.listRuns(5),
    cached.newsSinceDay(addDays(asOf, -7), 200).catch(() => []),
    admin ? research.listHoldings().catch(() => []) : Promise.resolve([]),
  ]);
  const latestReport = latestReportMeta[0] ? await cached.report<ReportPayload, ReportInput>(latestReportMeta[0].id) : null;
  const news = latestReport ? latestReport.report.news.slice(0, 6) : [];
  const withPeer = performance.map((p, i) => ({ ...p, peerKey: funds[i].peerKey }));
  const portfolio = admin ? summarisePortfolio(holdings, withPeer) : null;
  const highlights = weeklyHighlights({ funds: performance, indices: headline, fx, news: recentNews });
  const lastRefresh = runs.find((r) => r.status !== "running" && r.finishedAt) ?? null;
  // A few explained headlines for the home story strip, preferring news about the kinds of funds held.
  const tracked = new Set(funds.map((f) => f.viewId).filter(Boolean) as string[]);
  const storyNews = recentNews
    .filter((n) => n.relevance)
    .sort((x, y) => Number(y.views.some((v) => tracked.has(v))) - Number(x.views.some((v) => tracked.has(v))))
    .slice(0, 3)
    .map((n) => ({ id: n.id, title: n.title, topics: n.topics }));
  return { asOf, admin, funds, performance, headline, snapshot, latestReport, news, runs, lastRefresh, portfolio, highlights, storyNews, integrations: integrationStatus() };
}

export async function loadFund(schemeCode: number) {
  await connection();
  const asOf = todayIn(REPORT_TZ());
  const fund = (await cached.funds(false)).find((f) => f.schemeCode === schemeCode) ?? null;
  if (!fund) return null;
  const perf = await cached.fundPerformance(fund, asOf);
  const bench = fund.benchmarkId && fund.benchmarkId in INDICES ? await cached.indexSeries(fund.benchmarkId as IndexId, historyStart(asOf)) : null;
  const peer = fund.peerKey && perf.nav ? await cached.peerStats<StoredPeerStats>(fund.peerKey, perf.nav.date) : null;
  const [history, full, news] = await Promise.all([
    cached.performanceSnapshots<Omit<FundPerformance, "chart">>(schemeCode, 26),
    // Full NAV history for long-term risk measures and the "All" chart period (live, not stored).
    fetchSchemeHistory(schemeCode).catch(() => null),
    cached.newsSinceDay(addDays(asOf, -30), 300).catch(() => []),
  ]);
  const longTerm = full ? computeFundMetrics(full.series, asOf) : null;
  const relevantNews = fund.viewId ? news.filter((n) => n.views.includes(fund.viewId!)).slice(0, 6) : [];
  return { asOf, fund, perf, benchSeries: bench?.series ?? [], peer: peer?.stats ?? null, history, fullSeries: full?.series ?? perf.chart, longTerm, relevantNews };
}

export async function loadCategory(viewId: ViewId) {
  await connection();
  const asOf = todayIn(REPORT_TZ());
  const view = VIEWS[viewId];
  const funds = (await cached.funds()).filter((f) => f.viewId === viewId);
  const [performance, indices, snapshot, latestMeta] = await Promise.all([
    Promise.all(funds.map((f) => cached.fundPerformance(f, asOf))),
    cached.indexSet(view.marketIndices, asOf),
    cached.latestMarketSnapshot<IndexSnapshot[]>(),
    cached.reports(1),
  ]);
  const peerKeys = [...new Set(funds.map((f) => f.peerKey).filter(Boolean) as string[])];
  const peers = (await Promise.all(peerKeys.map((k) => cached.latestPeerStats<StoredPeerStats>(k)))).filter(Boolean).map((p) => p!.stats);
  const report = latestMeta[0] ? await cached.report<ReportPayload, ReportInput>(latestMeta[0].id) : null;
  const summary = report?.report.output.categories.find((c) => c.viewId === viewId) ?? null;
  const news = report ? report.report.news.filter((n) => n.views.includes(viewId)) : [];
  return { asOf, view, performance, indices, snapshot, peers, report, summary, news };
}

export async function loadReport(id: string): Promise<{ report: StoredWeeklyReport; deliveries: repo.DeliveryLog[] } | null> {
  await connection();
  const report = await cached.report<ReportPayload, ReportInput>(id);
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
  return cached.reports(52);
}

export async function loadManage() {
  await connection();
  const [funds, runs, reports] = await Promise.all([repo.listFunds(), repo.listRuns(15), repo.listReports(10)]);
  return { funds, runs, reports, integrations: integrationStatus() };
}

export async function loadPortfolio() {
  await connection();
  const asOf = todayIn(REPORT_TZ());
  const [funds, admin] = await Promise.all([cached.funds(), isAdmin()]);
  const performance = await Promise.all(funds.map((f) => cached.fundPerformance(f, asOf)));
  const holdings = admin ? await research.listHoldings().catch(() => []) : [];
  const withPeer = performance.map((p, i) => ({ ...p, peerKey: funds[i].peerKey }));
  const portfolio = admin ? summarisePortfolio(holdings, withPeer) : null;
  return { asOf, admin, funds, performance, holdings, portfolio };
}

export async function loadMarket() {
  await connection();
  const asOf = todayIn(REPORT_TZ());
  const [indices, snapshot, brief, news, funds] = await Promise.all([
    cached.indexSet(["NIFTY50", "NIFTY_MIDCAP150", "NIFTY_SMALLCAP100", "NIFTY_SMALLCAP250", "NASDAQ100", "USDINR"], asOf),
    cached.latestMarketSnapshot<IndexSnapshot[]>(),
    cached.latestMarketBrief<{ brief: import("@/lib/news/brief").MarketBrief; input: import("@/lib/news/brief").BriefInput }>().catch(() => null),
    cached.newsSinceDay(addDays(asOf, -30), 600).catch(() => []),
    cached.funds(),
  ]);
  const trackedViews = [...new Set(funds.map((f) => f.viewId).filter(Boolean) as string[])];
  return { asOf, indices, snapshot, brief, news, trackedViews };
}

export async function loadExplore() {
  await connection();
  const admin = await isAdmin();
  const [metrics, groups, prefs, watch] = await Promise.all([
    cached.fundMetrics<import("@/lib/pipeline/discovery").DiscoveryFundData>(),
    cached.discoveryGroups<import("@/lib/pipeline/discovery").DiscoveryGroupData>(),
    admin ? research.getPreferences().catch(() => null) : Promise.resolve(null),
    admin ? research.listWatchlist().catch(() => []) : Promise.resolve([]),
  ]);
  const { toUniverseRow, groupLabelMap } = await import("@/lib/explore");
  const labels = groupLabelMap(groups);
  const rows = metrics.map((m) => toUniverseRow(m, labels[m.groupKey] ?? m.groupKey)).filter((r): r is NonNullable<typeof r> => r !== null);
  const computedAt = groups.map((g) => g.computedAt).sort().at(-1) ?? null;
  return { admin, rows, groups, prefs, watch, computedAt };
}
