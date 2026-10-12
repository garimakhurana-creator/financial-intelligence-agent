import { DISCOVERY_GROUPS, type AssetClass, type DiscoveryGroup } from "@/lib/catalog";
import type { Preferences, StoredFundMetrics } from "@/lib/db/research";
import type { DiscoveryFundData, DiscoveryGroupData } from "@/lib/pipeline/discovery";

// Explore Funds: compact rows for the browser and a small, explainable shortlist.

export interface UniverseRow {
  code: number;
  name: string;
  amc: string;
  group: string;
  groupLabel: string;
  assetClass: AssetClass;
  riskBand: DiscoveryGroup["riskBand"];
  horizon: string;
  horizonYears: number;
  plan: string;
  option: string;
  nav: number | null;
  navDate: string | null;
  historyStart: string | null;
  r1: number | null;
  r3: number | null;
  r5: number | null;
  vol: number | null;
  dd: number | null;
  cons: number | null;
  score: number | null;
  label: string | null;
  rank: number | null;
  of: number;
  vsRef3: number | null;
  vsCat3: number | null;
  strengths: string[];
  cautions: string[];
}

const r2 = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? null : Math.round(n * 100) / 100);

export function toUniverseRow(m: StoredFundMetrics<DiscoveryFundData>, groupLabel: string): UniverseRow | null {
  const g = DISCOVERY_GROUPS.find((x) => x.key === m.groupKey);
  if (!g) return null;
  const d = m.data;
  return {
    code: m.schemeCode,
    name: m.schemeName,
    amc: m.amc,
    group: g.key,
    groupLabel,
    assetClass: g.assetClass,
    riskBand: g.riskBand,
    horizon: g.horizon,
    horizonYears: g.horizonYears,
    plan: m.plan,
    option: m.option,
    nav: m.nav,
    navDate: m.navDate,
    historyStart: d.metrics.historyStart,
    r1: r2(d.metrics.returns["1Y"].total),
    r3: r2(d.metrics.returns["3Y"].annualised),
    r5: r2(d.metrics.returns["5Y"].annualised),
    vol: r2(d.metrics.volatility3Y),
    dd: r2(d.metrics.maxDrawdown3Y?.pct),
    cons: d.consistency ? Math.round(d.consistency.beatPct) : null,
    score: m.score,
    label: m.label,
    rank: d.rank.rank,
    of: d.rank.of,
    vsRef3: d.vsReference?.r3 ?? null,
    vsCat3: d.vsCategory.r3,
    strengths: d.rank.strengths,
    cautions: d.rank.cautions,
  };
}

const RISK_ORDER = { Lower: 0, Moderate: 1, Higher: 2, Highest: 3 } as const;
const COMFORT_MAX = { low: 1, medium: 2, high: 3 } as const;

/** Groups that fit the stated preferences; explains why others were left out. */
export function groupsForPreferences(p: Preferences): { keys: string[]; notes: string[] } {
  const notes: string[] = [];
  let groups = DISCOVERY_GROUPS;
  if (p.preferredGroups.length) {
    groups = groups.filter((g) => p.preferredGroups.includes(g.key));
    notes.push("Limited to the categories you picked.");
  }
  if (p.riskComfort) {
    const max = COMFORT_MAX[p.riskComfort];
    const before = groups.length;
    groups = groups.filter((g) => RISK_ORDER[g.riskBand] <= max);
    if (groups.length < before) notes.push(`Left out categories that usually swing more than a "${p.riskComfort}" risk comfort suggests.`);
  }
  if (p.horizonYears !== null) {
    const before = groups.length;
    groups = groups.filter((g) => g.horizonYears <= p.horizonYears!);
    if (groups.length < before) notes.push(`Left out categories that usually need longer than ${p.horizonYears} years.`);
  }
  return { keys: groups.map((g) => g.key), notes };
}

const DEFAULT_GROUPS = ["index_nifty50", "flexi_cap", "large_cap", "mid_cap", "aggressive_hybrid", "short_duration"];

/**
 * "Funds worth exploring": up to `max` funds, at most two per category, chosen from funds the
 * ranking labels "Strong historical consistency" or "Worth researching" — never by recent return.
 */
export function shortlist(rows: UniverseRow[], prefs: Preferences | null, max = 6): { rows: UniverseRow[]; notes: string[]; basis: "preferences" | "default" } {
  const hasPrefs = !!prefs && (prefs.preferredGroups.length > 0 || prefs.riskComfort !== null || prefs.horizonYears !== null);
  const { keys, notes } = hasPrefs ? groupsForPreferences(prefs!) : { keys: DEFAULT_GROUPS, notes: ["No preferences saved, so this is a spread across common SIP categories."] };
  const good = rows.filter((r) => keys.includes(r.group) && (r.label === "Strong historical consistency" || r.label === "Worth researching") && r.score !== null);
  const perGroup = new Map<string, UniverseRow[]>();
  for (const r of good.sort((a, b) => (b.score ?? 0) - (a.score ?? 0))) {
    const list = perGroup.get(r.group) ?? [];
    if (list.length < 2) list.push(r);
    perGroup.set(r.group, list);
  }
  // Round-robin across categories so the list stays diverse.
  const out: UniverseRow[] = [];
  const lists = keys.map((k) => perGroup.get(k) ?? []).filter((l) => l.length);
  for (let i = 0; out.length < max && lists.some((l) => l[i]); i++) for (const l of lists) if (l[i] && out.length < max) out.push(l[i]);
  if (out.length === 0) notes.push("No fund in the matching categories currently meets the shortlist bar.");
  return { rows: out, notes, basis: hasPrefs ? "preferences" : "default" };
}

export function groupLabelMap(groups: { groupKey: string; data: DiscoveryGroupData }[]): Record<string, string> {
  return Object.fromEntries(groups.map((g) => [g.groupKey, g.data.label]));
}

// ---------------------------------------------------------------------------------------------
// Compact form for the browser: 617 funds share 19 categories, so category facts travel once.

type GroupFacts = Pick<UniverseRow, "groupLabel" | "assetClass" | "riskBand" | "horizon" | "horizonYears">;
export type CompactRow = Omit<UniverseRow, keyof GroupFacts | "plan" | "option" | "historyStart" | "rank" | "of" | "vsRef3">;

export function compactRows(rows: UniverseRow[]): { rows: CompactRow[]; groupFacts: Record<string, GroupFacts> } {
  const groupFacts: Record<string, GroupFacts> = {};
  const out = rows.map((r) => {
    groupFacts[r.group] ??= { groupLabel: r.groupLabel, assetClass: r.assetClass, riskBand: r.riskBand, horizon: r.horizon, horizonYears: r.horizonYears };
    const { groupLabel: _a, assetClass: _b, riskBand: _c, horizon: _d, horizonYears: _e, plan: _f, option: _g, historyStart: _h, rank: _i, of: _j, vsRef3: _k, ...rest } = r;
    return rest;
  });
  return { rows: out, groupFacts };
}

export function expandRows(rows: CompactRow[], groupFacts: Record<string, GroupFacts>): UniverseRow[] {
  return rows.map((r) => ({ ...groupFacts[r.group], ...r, plan: "", option: "", historyStart: null, rank: null, of: 0, vsRef3: null }));
}
