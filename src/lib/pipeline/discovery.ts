import { DISCOVERY_GROUPS, findPeerRule, INDICES, type DiscoveryGroup } from "@/lib/catalog";
import { computeFundMetrics, consistencyVsCategory, type FundMetrics } from "@/lib/calc/metrics";
import { rankCategory, RANK_VERSION, type RankResult } from "@/lib/calc/rank";
import { round } from "@/lib/calc/returns";
import { addDays, minusMonths, type ISODate } from "@/lib/dates";
import * as research from "@/lib/db/research";
import { mapLimit } from "@/lib/http";
import { errorMessage, log } from "@/lib/log";
import { AMFI_SOURCE, fetchNavAll, selectPeerUniverse, type AmfiScheme } from "@/lib/sources/amfi";
import { fetchSchemeHistory, MFAPI_SOURCE } from "@/lib/sources/mfapi";
import { fetchYahooDaily } from "@/lib/sources/yahoo";

/** What we store per fund in fund_metrics.data (no raw NAV series — keeps rows small). */
export interface DiscoveryFundData {
  metrics: Omit<FundMetrics, "rolling1Y">;
  consistency: { beatPct: number; windows: number } | null;
  rank: RankResult;
  /** Fund minus the group's reference index, annualised pp, where both exist. */
  vsReference: { r1: number | null; r3: number | null; r5: number | null } | null;
  /** Fund minus the group median, pp. */
  vsCategory: { r1: number | null; r3: number | null; r5: number | null };
  sources: string[];
}

export interface DiscoveryGroupData {
  groupKey: string;
  label: string;
  asOf: ISODate;
  universe: number;
  fetched: number;
  ranked: number;
  medians: { r1: number | null; r3: number | null; r5: number | null; vol: number | null; dd: number | null };
  reference: { id: string; name: string; r1: number | null; r3: number | null; r5: number | null; source: string } | null;
  amfiCategories: string[];
  rankVersion: string;
  errors: string[];
}

function median(xs: (number | null | undefined)[]): number | null {
  const v = xs.filter((x): x is number => typeof x === "number" && Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

const diff = (a: number | null | undefined, b: number | null | undefined) => (a == null || b == null ? null : round(a - b));

async function referenceReturns(g: DiscoveryGroup, asOf: ISODate) {
  if (!g.referenceIndex) return null;
  const def = INDICES[g.referenceIndex];
  const y = def.sources.find((s) => s.kind === "yahoo");
  if (!y || y.kind !== "yahoo") return null;
  try {
    const series = await fetchYahooDaily(y.symbol, "10y");
    const m = computeFundMetrics(series, asOf);
    return { id: def.id, name: def.name, r1: m.returns["1Y"].total, r3: m.returns["3Y"].annualised, r5: m.returns["5Y"].annualised, source: `Yahoo Finance (${y.symbol}), price index` };
  } catch (e) {
    log.warn("discovery.reference_failed", { group: g.key, error: errorMessage(e) });
    return null;
  }
}

/** Compute metrics + within-category ranking for every Direct-Growth scheme in one group. */
export async function refreshDiscoveryGroup(g: DiscoveryGroup, amfi: AmfiScheme[], asOf: ISODate) {
  const rule = findPeerRule(g.key);
  if (!rule) throw new Error(`No peer rule for ${g.key}`);
  const universe = selectPeerUniverse(amfi, rule);
  const errors: string[] = universe.problem ? [universe.problem] : [];
  // 5 years + a margin covers every metric; ranged requests keep payloads small.
  const from = addDays(minusMonths(asOf, 60), -15);
  const hist = await mapLimit(universe.members, 8, (m) => fetchSchemeHistory(m.schemeCode, { from, to: asOf }));

  const ok: { scheme: AmfiScheme; metrics: FundMetrics }[] = [];
  hist.forEach((r, i) => {
    if (r.status === "fulfilled") ok.push({ scheme: universe.members[i], metrics: computeFundMetrics(r.value.series, asOf) });
    else errors.push(`${universe.members[i].schemeCode}: ${errorMessage(r.reason)}`);
  });
  // Only funds with a current NAV take part.
  const live = ok.filter((f) => f.metrics.asOf !== null);
  const categoryRolling = live.map((f) => f.metrics.rolling1Y);
  const withCons = live.map((f) => ({ ...f, consistency: consistencyVsCategory(f.metrics.rolling1Y, categoryRolling) }));

  const ranks = rankCategory(
    withCons.map((f) => ({
      schemeCode: f.scheme.schemeCode,
      r1: f.metrics.returns["1Y"].total,
      r3: f.metrics.returns["3Y"].annualised,
      r5: f.metrics.returns["5Y"].annualised,
      consistency: f.consistency?.beatPct ?? null,
      drawdown: f.metrics.maxDrawdown3Y?.pct ?? null,
      volatility: f.metrics.volatility3Y,
    })),
  );
  const rankBy = new Map(ranks.map((r) => [r.schemeCode, r]));
  const medians = {
    r1: median(live.map((f) => f.metrics.returns["1Y"].total)),
    r3: median(live.map((f) => f.metrics.returns["3Y"].annualised)),
    r5: median(live.map((f) => f.metrics.returns["5Y"].annualised)),
    vol: median(live.map((f) => f.metrics.volatility3Y)),
    dd: median(live.map((f) => f.metrics.maxDrawdown3Y?.pct)),
  };
  const reference = await referenceReturns(g, asOf);

  await research.saveFundMetrics(
    withCons.map((f) => {
      const { rolling1Y: _rolling, ...metrics } = f.metrics;
      const rank = rankBy.get(f.scheme.schemeCode)!;
      const data: DiscoveryFundData = {
        metrics,
        consistency: f.consistency,
        rank,
        vsReference: reference
          ? { r1: diff(metrics.returns["1Y"].total, reference.r1), r3: diff(metrics.returns["3Y"].annualised, reference.r3), r5: diff(metrics.returns["5Y"].annualised, reference.r5) }
          : null,
        vsCategory: {
          r1: diff(metrics.returns["1Y"].total, medians.r1),
          r3: diff(metrics.returns["3Y"].annualised, medians.r3),
          r5: diff(metrics.returns["5Y"].annualised, medians.r5),
        },
        sources: [`${MFAPI_SOURCE} NAV history`, `${AMFI_SOURCE} category`],
      };
      return {
        schemeCode: f.scheme.schemeCode,
        schemeName: f.scheme.schemeName,
        amc: f.scheme.amc,
        groupKey: g.key,
        plan: f.scheme.plan || "Direct",
        option: f.scheme.option || "Growth",
        nav: metrics.nav,
        navDate: metrics.asOf,
        score: rank.score === null ? null : round(rank.score, 1),
        label: rank.label,
        data,
      };
    }),
  );

  const groupData: DiscoveryGroupData = {
    groupKey: g.key,
    label: rule.label,
    asOf,
    universe: universe.members.length,
    fetched: ok.length,
    ranked: ranks.filter((r) => r.eligible).length,
    medians,
    reference,
    amfiCategories: rule.amfiCategories,
    rankVersion: RANK_VERSION,
    errors: errors.slice(0, 20),
  };
  await research.saveDiscoveryGroup(g.key, groupData);
  return groupData;
}

/** Refresh some or all groups. Each group is independent; one failure does not stop the rest. */
export async function refreshDiscovery(asOf: ISODate, keys?: string[]) {
  const amfi = await fetchNavAll();
  const groups = DISCOVERY_GROUPS.filter((g) => !keys || keys.includes(g.key));
  const out: { group: string; ok: boolean; detail: string }[] = [];
  for (const g of groups) {
    try {
      const d = await refreshDiscoveryGroup(g, amfi, asOf);
      out.push({ group: g.key, ok: true, detail: `${d.fetched}/${d.universe} funds, ${d.ranked} ranked` });
    } catch (e) {
      out.push({ group: g.key, ok: false, detail: errorMessage(e) });
    }
  }
  return out;
}
