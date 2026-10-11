import { discoveryGroup, findPeerRule, suggestPeerRule, type AssetClass } from "@/lib/catalog";
import type { Holding } from "@/lib/db/research";
import type { FundPerformance } from "@/lib/pipeline/data";

// Portfolio totals come ONLY from holdings the owner entered (units, amount invested, SIP).
// Nothing here is derived from NAV returns alone: no units → no current value; no invested amount
// → no gain/loss. Tracked or watchlisted funds without a holding are not part of the portfolio.

export interface PortfolioSummary {
  holdingsCount: number;
  valuedCount: number;
  currentValue: number | null;
  invested: number | null;
  /** Only over funds that have BOTH units and an invested amount. */
  gain: { amount: number; pct: number; funds: number } | null;
  monthlySip: number | null;
  sipCount: number;
  latestNavDate: string | null;
  missing: string[];
  rows: { schemeCode: number; name: string; value: number | null; invested: number | null; units: number | null; sip: number | null; assetClass: AssetClass | null; domestic: boolean | null; groupLabel: string | null }[];
}

export function assetClassOf(perf: Pick<FundPerformance, "amfiCategory" | "schemeName">, peerKey: string | null): { assetClass: AssetClass | null; domestic: boolean | null; groupLabel: string | null } {
  const rule = (peerKey ? findPeerRule(peerKey) : undefined) ?? suggestPeerRule(perf.amfiCategory, perf.schemeName);
  const g = rule ? discoveryGroup(rule.key) : undefined;
  if (g) return { assetClass: g.assetClass === "index" ? "equity" : g.assetClass, domestic: g.assetClass !== "international", groupLabel: rule!.label };
  const c = perf.amfiCategory.toLowerCase();
  if (/overseas|international/.test(c)) return { assetClass: "international", domestic: false, groupLabel: null };
  if (/debt|income|liquid|gilt|bond/.test(c)) return { assetClass: "debt", domestic: true, groupLabel: null };
  if (/hybrid/.test(c)) return { assetClass: "hybrid", domestic: true, groupLabel: null };
  if (/equity|index/.test(c)) return { assetClass: "equity", domestic: true, groupLabel: null };
  return { assetClass: null, domestic: null, groupLabel: null };
}

export function summarisePortfolio(holdings: Holding[], perf: (FundPerformance & { peerKey?: string | null })[]): PortfolioSummary {
  const rows = holdings.map((h) => {
    const p = perf.find((x) => x.schemeCode === h.schemeCode);
    const value = h.units !== null && p?.nav ? h.units * p.nav.value : null;
    const cls = p ? assetClassOf(p, p.peerKey ?? null) : { assetClass: null, domestic: null, groupLabel: null };
    return { schemeCode: h.schemeCode, name: p?.schemeName ?? String(h.schemeCode), value, invested: h.invested, units: h.units, sip: h.sipAmount, ...cls };
  });
  const valued = rows.filter((r) => r.value !== null);
  const both = rows.filter((r) => r.value !== null && r.invested !== null && r.invested > 0);
  const sum = (xs: (number | null)[]) => xs.reduce<number>((a, b) => a + (b ?? 0), 0);
  const gainAmt = sum(both.map((r) => r.value)) - sum(both.map((r) => r.invested));
  const bothInvested = sum(both.map((r) => r.invested));
  const sips = rows.filter((r) => r.sip !== null && r.sip > 0);
  const missing: string[] = [];
  if (rows.length === 0) missing.push("No holdings entered yet.");
  else {
    if (valued.length < rows.length) missing.push(`${rows.length - valued.length} holding(s) have no units, so their current value cannot be calculated.`);
    if (rows.some((r) => r.invested === null)) missing.push("Some holdings have no invested amount, so gain/loss covers only the rest.");
  }
  return {
    holdingsCount: rows.length,
    valuedCount: valued.length,
    currentValue: valued.length ? sum(valued.map((r) => r.value)) : null,
    invested: rows.some((r) => r.invested !== null) ? sum(rows.map((r) => r.invested)) : null,
    gain: both.length ? { amount: gainAmt, pct: (gainAmt / bothInvested) * 100, funds: both.length } : null,
    monthlySip: sips.length ? sum(sips.map((r) => r.sip)) : null,
    sipCount: sips.length,
    latestNavDate: perf.map((p) => p.nav?.date).filter(Boolean).sort().at(-1) ?? null,
    missing,
    rows,
  };
}

export function allocation(rows: PortfolioSummary["rows"], by: "fund" | "assetClass" | "geography"): { label: string; value: number; pct: number }[] {
  const valued = rows.filter((r) => r.value !== null && r.value > 0);
  const total = valued.reduce((a, r) => a + r.value!, 0);
  if (total <= 0) return [];
  const groups = new Map<string, number>();
  for (const r of valued) {
    const key =
      by === "fund"
        ? r.name.replace(/\s*-\s*Direct Plan.*$/i, "")
        : by === "assetClass"
          ? { equity: "Equity", hybrid: "Hybrid", debt: "Debt", international: "International", index: "Equity" }[r.assetClass ?? "equity"] ?? "Other"
          : r.domestic === false
            ? "International"
            : r.domestic === true
              ? "India"
              : "Unknown";
    groups.set(key, (groups.get(key) ?? 0) + r.value!);
  }
  return [...groups.entries()].map(([label, value]) => ({ label, value, pct: (value / total) * 100 })).sort((a, b) => b.value - a.value);
}
