import {
  DERIVED_INDEX_IDS,
  findPeerRule,
  HEADLINE_INDICES,
  INDICES,
  RAW_INDEX_IDS,
  VIEWS,
  type IndexId,
  type ViewId,
} from "@/lib/catalog";
import { computePeerAverage, type PeerAverageResult, type PeerWindowStat } from "@/lib/calc/peers";
import {
  CALC_VERSION,
  computeWindowReturns,
  excessReturn,
  WINDOWS,
  type Observation,
  type WindowKey,
  type WindowResult,
} from "@/lib/calc/returns";
import { addDays, previousYearEnd, type ISODate } from "@/lib/dates";
import * as repo from "@/lib/db/repo";
import { mapLimit } from "@/lib/http";
import { errorMessage, log } from "@/lib/log";
import { AMFI_SOURCE, fetchNavAll, selectPeerUniverse, type AmfiScheme } from "@/lib/sources/amfi";
import { deriveInrSeries, fetchRawIndex } from "@/lib/sources/indices";
import { fetchSchemeHistory, MFAPI_SOURCE } from "@/lib/sources/mfapi";
import { fetchNseAllIndices, NSE_SOURCE, type IndexSnapshot } from "@/lib/sources/nse";

/** Earliest date we keep/need: covers YTD (previous 31-Dec), the 1M window in January, and a 1-year chart. */
export function historyStart(asOf: ISODate): ISODate {
  const ytd = addDays(previousYearEnd(asOf), -45);
  const year = addDays(asOf, -400);
  return ytd < year ? ytd : year;
}

// ---------------------------------------------------------------------------------------------
// Ingestion

export async function refreshFundNav(fund: repo.TrackedFund, asOf: ISODate): Promise<{ rows: number; lastDate: ISODate | null }> {
  const start = historyStart(asOf);
  // Incremental after the first load; re-fetch a 10-day overlap to pick up late NAV corrections.
  const from = fund.lastNavDate && fund.lastNavDate > start ? addDays(fund.lastNavDate, -10) : start;
  const h = await fetchSchemeHistory(fund.schemeCode, { from, to: asOf });
  if (h.series.length) await repo.saveNavHistory(fund.schemeCode, h.series, MFAPI_SOURCE);
  const lastDate = h.series.at(-1)?.date ?? fund.lastNavDate;
  await repo.updateFund(fund.schemeCode, { last_nav_date: lastDate, last_refreshed_at: new Date().toISOString() });
  return { rows: h.series.length, lastDate: lastDate ?? null };
}

export async function refreshAllFundNavs(asOf: ISODate) {
  const funds = await repo.listFunds({ activeOnly: true });
  const results = await mapLimit(funds, 4, (f) => refreshFundNav(f, asOf));
  return funds.map((f, i) => {
    const r = results[i];
    return r.status === "fulfilled"
      ? { schemeCode: f.schemeCode, ok: true as const, ...r.value }
      : { schemeCode: f.schemeCode, ok: false as const, error: errorMessage(r.reason) };
  });
}

export async function refreshIndices(asOf: ISODate) {
  const from = historyStart(asOf);
  const out: { id: IndexId; ok: boolean; points?: number; source?: string; error?: string; fallbacks?: string[] }[] = [];
  for (const id of RAW_INDEX_IDS) {
    try {
      const r = await fetchRawIndex(id, from, asOf);
      await repo.saveIndexHistory(id, r.series, r.source);
      out.push({ id, ok: true, points: r.series.length, source: r.source, fallbacks: r.fallbacks });
    } catch (e) {
      log.error("index.refresh_failed", { id, error: errorMessage(e) });
      out.push({ id, ok: false, error: errorMessage(e) });
    }
  }
  return out;
}

/** NSE names for the indices whose breadth/valuation we keep. */
const SNAPSHOT_INDICES = ["NIFTY 50", "NIFTY MIDCAP 150", "NIFTY SMALLCAP 100", "NIFTY SMALLCAP 250", "NIFTY 500"];

export async function refreshMarketSnapshot() {
  const all = await fetchNseAllIndices();
  const picked = all.filter((s) => SNAPSHOT_INDICES.includes(s.index));
  const date = picked[0]?.asOf;
  if (!date || picked.length === 0) throw new Error("NSE snapshot had no usable rows");
  await repo.saveMarketSnapshot(date, picked, `${NSE_SOURCE} allIndices`);
  return { date, indices: picked.length };
}

export async function getIndexSeries(id: IndexId, from: ISODate): Promise<{ series: Observation[]; source: string | null; retrievedAt: string | null }> {
  const def = INDICES[id];
  const derived = def.sources.find((s) => s.kind === "derived");
  if (derived && derived.kind === "derived") {
    const [base, fx] = await Promise.all([repo.getIndexSeries(derived.base, from), repo.getIndexSeries(derived.fx, from)]);
    return {
      series: deriveInrSeries(base.series, fx.series),
      source: `Derived: ${INDICES[derived.base].name} × ${INDICES[derived.fx].name} (${base.source ?? "?"})`,
      retrievedAt: base.retrievedAt,
    };
  }
  return repo.getIndexSeries(id, from);
}

// ---------------------------------------------------------------------------------------------
// Peer averages

export interface StoredPeerStats {
  peerKey: string;
  label: string;
  asOf: ISODate;
  universeSize: number;
  fetched: number;
  fetchFailures: number;
  windows: Record<WindowKey, PeerWindowStat>;
  constituents: PeerAverageResult["constituents"];
  methodVersion: string;
  amfiCategories: string[];
  problem?: string;
}

export async function computeAndStorePeers(peerKey: string, asOf: ISODate, amfi: AmfiScheme[]): Promise<StoredPeerStats> {
  const rule = findPeerRule(peerKey);
  if (!rule) throw new Error(`Unknown peer group ${peerKey}`);
  const universe = selectPeerUniverse(amfi, rule);
  const from = addDays(previousYearEnd(asOf), -10);
  const histories = await mapLimit(universe.members, 8, (m) => fetchSchemeHistory(m.schemeCode, { from, to: asOf }));
  const peers = histories.flatMap((r, i) =>
    r.status === "fulfilled"
      ? [{ schemeCode: universe.members[i].schemeCode, schemeName: universe.members[i].schemeName, series: r.value.series }]
      : [],
  );
  const result = computePeerAverage(peers, asOf);
  const stats: StoredPeerStats = {
    peerKey,
    label: rule.label,
    asOf,
    universeSize: universe.members.length,
    fetched: peers.length,
    fetchFailures: universe.members.length - peers.length,
    windows: result.windows,
    constituents: result.constituents,
    methodVersion: result.methodVersion,
    amfiCategories: rule.amfiCategories,
    ...(universe.problem ? { problem: universe.problem } : {}),
  };
  await repo.savePeerStats(peerKey, asOf, universe.members.length, stats, result.methodVersion, `${AMFI_SOURCE} + ${MFAPI_SOURCE}`);
  return stats;
}

/** Compute peer stats for every (peer group, fund NAV date) needed by the active funds. */
export async function refreshPeers(asOf: ISODate) {
  const funds = await repo.listFunds({ activeOnly: true });
  const needed = new Map<string, { peerKey: string; date: ISODate }>();
  for (const f of funds) {
    if (!f.peerKey) continue;
    const date = f.lastNavDate && f.lastNavDate <= asOf ? f.lastNavDate : asOf;
    needed.set(`${f.peerKey}|${date}`, { peerKey: f.peerKey, date });
  }
  if (needed.size === 0) return [];
  const amfi = await fetchNavAll();
  const out = [];
  for (const { peerKey, date } of needed.values()) {
    try {
      const s = await computeAndStorePeers(peerKey, date, amfi);
      out.push({ peerKey, date, ok: true, universe: s.universeSize, fetched: s.fetched, n1W: s.windows["1W"].n });
    } catch (e) {
      out.push({ peerKey, date, ok: false, error: errorMessage(e) });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Fund performance (deterministic — the only numbers the report is allowed to use)

export interface WindowComparison {
  fund: WindowResult;
  benchmark: WindowResult | null;
  peer: PeerWindowStat | null;
  /** Fund minus benchmark, percentage points. */
  vsBenchmarkPp: number | null;
  /** Fund minus peer mean, percentage points. */
  vsPeerPp: number | null;
}

export interface FundPerformance {
  schemeCode: number;
  schemeName: string;
  fundHouse: string;
  amfiCategory: string;
  viewId: ViewId | null;
  nav: { value: number; date: ISODate; source: string; retrievedAt: string | null } | null;
  benchmark: { id: IndexId; name: string; stated: string | null; statedSource: string | null; source: string | null; note: string } | null;
  statedBenchmarkOnly: string | null;
  peer: { key: string; label: string; asOf: ISODate; universeSize: number; fetched: number; methodVersion: string; problem?: string } | null;
  windows: Record<WindowKey, WindowComparison>;
  /** 1-year NAV history for charts. */
  chart: Observation[];
  flags: string[];
  calcVersion: string;
}

const PRICE_INDEX_NOTE =
  "Compared with the price index. The fund's stated benchmark is the total-return (TRI) version, which also adds dividends, so the gap is overstated in the fund's favour by roughly the index dividend yield.";

export async function buildFundPerformance(fund: repo.TrackedFund, asOf: ISODate): Promise<FundPerformance> {
  const from = historyStart(asOf);
  const [series, navMeta] = await Promise.all([repo.getNavSeries(fund.schemeCode, from), repo.getNavMeta(fund.schemeCode)]);
  const { current, windows: fundWindows } = computeWindowReturns(series, asOf);
  const flags: string[] = [];
  if (!current) flags.push(series.length ? "Latest NAV is older than 5 days — data may be stale." : "No NAV history stored yet.");
  const anchor = current?.date ?? asOf;

  let benchmark: FundPerformance["benchmark"] = null;
  let benchWindows: Record<WindowKey, WindowResult> | null = null;
  const benchmarkId = (fund.benchmarkId ?? null) as IndexId | null;
  if (benchmarkId && INDICES[benchmarkId]) {
    const b = await getIndexSeries(benchmarkId, from);
    benchWindows = computeWindowReturns(b.series, anchor, { anchorTo: anchor }).windows;
    benchmark = {
      id: benchmarkId,
      name: INDICES[benchmarkId].name,
      stated: fund.statedBenchmark,
      statedSource: fund.benchmarkSource,
      source: b.source,
      note: PRICE_INDEX_NOTE,
    };
    if (b.series.length === 0) flags.push(`No stored data for benchmark ${INDICES[benchmarkId].name}.`);
  } else if (fund.statedBenchmark) {
    flags.push(`No free data feed for the stated benchmark (${fund.statedBenchmark}); compared with category peers only.`);
  }

  let peer: FundPerformance["peer"] = null;
  let peerStats: StoredPeerStats | null = null;
  if (fund.peerKey) {
    const p = (await repo.getPeerStats<StoredPeerStats>(fund.peerKey, anchor)) ?? null;
    peerStats = p?.stats ?? null;
    if (peerStats) {
      peer = {
        key: peerStats.peerKey,
        label: peerStats.label,
        asOf: peerStats.asOf,
        universeSize: peerStats.universeSize,
        fetched: peerStats.fetched,
        methodVersion: peerStats.methodVersion,
        ...(peerStats.problem ? { problem: peerStats.problem } : {}),
      };
    } else {
      flags.push(`Peer average for ${anchor} has not been computed yet.`);
    }
  }

  const windows = {} as Record<WindowKey, WindowComparison>;
  for (const w of WINDOWS) {
    const f = fundWindows[w];
    const b = benchWindows?.[w] ?? null;
    const p = peerStats?.windows[w] ?? null;
    windows[w] = {
      fund: f,
      benchmark: b,
      peer: p,
      vsBenchmarkPp: excessReturn(f.returnPct, b?.returnPct ?? null),
      vsPeerPp: excessReturn(f.returnPct, p?.mean ?? null),
    };
  }

  return {
    schemeCode: fund.schemeCode,
    schemeName: fund.schemeName,
    fundHouse: fund.fundHouse,
    amfiCategory: fund.amfiCategory,
    viewId: (fund.viewId as ViewId) ?? null,
    nav: current ? { value: current.value, date: current.date, source: navMeta?.source ?? MFAPI_SOURCE, retrievedAt: navMeta?.retrievedAt ?? null } : null,
    benchmark,
    statedBenchmarkOnly: benchmark ? null : fund.statedBenchmark,
    peer,
    windows,
    chart: series.filter((o) => o.date >= addDays(anchor, -365)),
    flags,
    calcVersion: CALC_VERSION,
  };
}

// ---------------------------------------------------------------------------------------------
// Market overview

export interface IndexPerformance {
  id: IndexId;
  name: string;
  current: Observation | null;
  windows: Record<WindowKey, WindowResult>;
  source: string | null;
  retrievedAt: string | null;
  chart: Observation[];
}

export async function buildIndexPerformance(id: IndexId, asOf: ISODate): Promise<IndexPerformance> {
  const s = await getIndexSeries(id, historyStart(asOf));
  const { current, windows } = computeWindowReturns(s.series, asOf);
  return {
    id,
    name: INDICES[id].name,
    current,
    windows,
    source: s.source,
    retrievedAt: s.retrievedAt,
    chart: s.series.filter((o) => o.date >= addDays(asOf, -365)),
  };
}

export async function buildMarketOverview(asOf: ISODate) {
  const ids = new Set<IndexId>([...HEADLINE_INDICES, ...Object.values(VIEWS).flatMap((v) => v.marketIndices), ...DERIVED_INDEX_IDS]);
  const indices = await Promise.all([...ids].map((id) => buildIndexPerformance(id, asOf)));
  const snapshot = await repo.getLatestMarketSnapshot<IndexSnapshot[]>();
  return { indices, snapshot };
}
