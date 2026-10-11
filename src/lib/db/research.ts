import { deleteRow, getRow, sql, upsertRow, upsertRows, type Row } from "@/lib/db/client";
import { newId, rowId } from "@/lib/db/repo";

// Persistence for the research features: Explore Funds metrics, watchlist, holdings/SIPs,
// preferences, saved analyses and daily market briefs. Kept separate from repo.ts (weekly
// tracking) so the concepts "tracked", "held", "watchlisted" and "analysed" stay distinct.

const nowIso = () => new Date().toISOString();

// ---------------------------------------------------------------------------------------------
// Explore Funds metrics

export interface StoredFundMetrics<D = unknown> {
  schemeCode: number;
  schemeName: string;
  amc: string;
  groupKey: string;
  plan: string;
  option: string;
  nav: number | null;
  navDate: string | null;
  score: number | null;
  label: string | null;
  data: D;
  computedAt: string;
}

function toMetrics<D>(r: Row): StoredFundMetrics<D> {
  return {
    schemeCode: r.scheme_code,
    schemeName: r.scheme_name,
    amc: r.amc ?? "",
    groupKey: r.group_key,
    plan: r.plan ?? "",
    option: r.option ?? "",
    nav: r.nav ?? null,
    navDate: r.nav_date ?? null,
    score: r.score ?? null,
    label: r.label ?? null,
    data: JSON.parse(r.data) as D,
    computedAt: r.computed_at,
  };
}

export async function saveFundMetrics(rows: Omit<StoredFundMetrics, "computedAt">[]) {
  const computed_at = nowIso();
  await upsertRows(
    "fund_metrics",
    rows.map((m) => ({
      id: rowId("fm", m.schemeCode),
      scheme_code: m.schemeCode,
      scheme_name: m.schemeName.slice(0, 255),
      amc: m.amc.slice(0, 128),
      group_key: m.groupKey,
      plan: m.plan.slice(0, 24),
      option: m.option.slice(0, 32),
      nav: m.nav,
      nav_date: m.navDate,
      score: m.score,
      label: m.label,
      data: JSON.stringify(m.data),
      computed_at,
    })),
    200,
  );
}

export async function listFundMetrics<D>(groupKey?: string): Promise<StoredFundMetrics<D>[]> {
  const db = sql();
  const rows = groupKey ? await db`select * from fund_metrics where group_key = ${groupKey}` : await db`select * from fund_metrics`;
  return rows.map((r) => toMetrics<D>(r));
}

export async function getFundMetrics<D>(schemeCode: number): Promise<StoredFundMetrics<D> | null> {
  const r = await getRow("fund_metrics", rowId("fm", schemeCode));
  return r ? toMetrics<D>(r) : null;
}

export async function getFundMetricsMany<D>(codes: number[]): Promise<StoredFundMetrics<D>[]> {
  if (codes.length === 0) return [];
  const db = sql();
  const rows = await db`select * from fund_metrics where scheme_code in ${db(codes)}`;
  return rows.map((r) => toMetrics<D>(r));
}

export async function saveDiscoveryGroup(groupKey: string, data: unknown) {
  await upsertRow("discovery_groups", rowId("g", groupKey), { group_key: groupKey, data: JSON.stringify(data), computed_at: nowIso() });
}

export async function listDiscoveryGroups<D>(): Promise<{ groupKey: string; data: D; computedAt: string }[]> {
  const db = sql();
  const rows = await db`select * from discovery_groups`;
  return rows.map((r) => ({ groupKey: r.group_key, data: JSON.parse(r.data) as D, computedAt: r.computed_at }));
}

// ---------------------------------------------------------------------------------------------
// Watchlist (research only — never treated as holdings)

export interface WatchItem {
  schemeCode: number;
  schemeName: string;
  groupKey: string | null;
  note: string;
  source: string;
  addedAt: string;
}

export async function listWatchlist(): Promise<WatchItem[]> {
  const db = sql();
  const rows = await db`select * from watchlist order by added_at desc`;
  return rows.map((r) => ({ schemeCode: r.scheme_code, schemeName: r.scheme_name, groupKey: r.group_key ?? null, note: r.note ?? "", source: r.source ?? "", addedAt: r.added_at }));
}

export async function addToWatchlist(w: Omit<WatchItem, "addedAt">) {
  await upsertRow("watchlist", rowId("w", w.schemeCode), {
    scheme_code: w.schemeCode,
    scheme_name: w.schemeName.slice(0, 255),
    group_key: w.groupKey,
    note: w.note.slice(0, 2000),
    source: w.source.slice(0, 16),
    added_at: nowIso(),
  });
}

export async function removeFromWatchlist(schemeCode: number) {
  await deleteRow("watchlist", rowId("w", schemeCode));
}

// ---------------------------------------------------------------------------------------------
// Holdings and SIPs (entered by the owner; the only source of rupee amounts in the app)

export interface Holding {
  schemeCode: number;
  units: number | null;
  invested: number | null;
  sipAmount: number | null;
  sipDay: number | null;
  startDate: string | null;
  updatedAt: string;
}

export async function listHoldings(): Promise<Holding[]> {
  const db = sql();
  const rows = await db`select * from holdings`;
  return rows.map((r) => ({
    schemeCode: r.scheme_code,
    units: r.units ?? null,
    invested: r.invested ?? null,
    sipAmount: r.sip_amount ?? null,
    sipDay: r.sip_day ?? null,
    startDate: r.start_date ?? null,
    updatedAt: r.updated_at,
  }));
}

export async function saveHolding(h: Omit<Holding, "updatedAt">) {
  await upsertRow("holdings", rowId("h", h.schemeCode), {
    scheme_code: h.schemeCode,
    units: h.units,
    invested: h.invested,
    sip_amount: h.sipAmount,
    sip_day: h.sipDay,
    start_date: h.startDate,
    updated_at: nowIso(),
  });
}

export async function deleteHolding(schemeCode: number) {
  await deleteRow("holdings", rowId("h", schemeCode));
}

// ---------------------------------------------------------------------------------------------
// Preferences (SIP questionnaire)

export interface Preferences {
  goal: string | null;
  horizonYears: number | null;
  monthlyBudget: number | null;
  riskComfort: "low" | "medium" | "high" | null;
  preferredGroups: string[];
}

export const EMPTY_PREFERENCES: Preferences = { goal: null, horizonYears: null, monthlyBudget: null, riskComfort: null, preferredGroups: [] };

export async function getPreferences(): Promise<Preferences> {
  const r = await getRow("preferences", "owner");
  return r ? { ...EMPTY_PREFERENCES, ...(JSON.parse(r.data) as Partial<Preferences>) } : EMPTY_PREFERENCES;
}

export async function savePreferences(p: Preferences) {
  await upsertRow("preferences", "owner", { data: JSON.stringify(p), updated_at: nowIso() });
}

// ---------------------------------------------------------------------------------------------
// Saved analyses

export interface StoredAnalysis<D = unknown> {
  id: string;
  schemeCode: number | null;
  schemeName: string;
  sourceType: string;
  outcome: string | null;
  data: D;
  createdAt: string;
}

export async function saveAnalysis(a: Omit<StoredAnalysis, "id" | "createdAt">): Promise<string> {
  const id = newId();
  await upsertRow("fund_analyses", id, {
    scheme_code: a.schemeCode,
    scheme_name: a.schemeName.slice(0, 255),
    source_type: a.sourceType,
    outcome: a.outcome,
    data: JSON.stringify(a.data),
    created_at: nowIso(),
  });
  return id;
}

export async function getAnalysis<D>(id: string): Promise<StoredAnalysis<D> | null> {
  const r = await getRow("fund_analyses", id);
  return r
    ? { id: r.id, schemeCode: r.scheme_code ?? null, schemeName: r.scheme_name, sourceType: r.source_type, outcome: r.outcome ?? null, data: JSON.parse(r.data) as D, createdAt: r.created_at }
    : null;
}

/** The owner's saved analyses (visitor runs, marked with a "v-" source type, are excluded). */
export async function listAnalyses(limit = 50) {
  const db = sql();
  const rows = await db`select id, scheme_code, scheme_name, source_type, outcome, created_at from fund_analyses where source_type not like 'v-%' order by created_at desc limit ${limit}`;
  return rows.map((r) => ({
    id: r.id as string,
    schemeCode: (r.scheme_code ?? null) as number | null,
    schemeName: r.scheme_name as string,
    sourceType: r.source_type as string,
    outcome: (r.outcome ?? null) as string | null,
    createdAt: r.created_at as string,
  }));
}

/** Delete saved analyses by id (maintenance). */
export async function deleteAnalyses(ids: string[]) {
  if (ids.length === 0) return 0;
  const db = sql();
  const out = await db`delete from fund_analyses where id in ${db(ids)}`;
  return out.count;
}

// ---------------------------------------------------------------------------------------------
// Market briefs

export async function saveMarketBrief(date: string, data: unknown, generator: string, model: string | null) {
  await upsertRow("market_briefs", rowId("b", date.replaceAll("-", "")), { date, data: JSON.stringify(data), generator, model, created_at: nowIso() });
}

export async function getLatestMarketBrief<D>(): Promise<{ date: string; data: D; generator: string; model: string | null; createdAt: string } | null> {
  const db = sql();
  const [r] = await db`select * from market_briefs order by "date" desc limit 1`;
  return r ? { date: r.date, data: JSON.parse(r.data) as D, generator: r.generator ?? "", model: r.model ?? null, createdAt: r.created_at } : null;
}
