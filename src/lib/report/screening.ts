import type { ViewId } from "@/lib/catalog";
import type { MetricTriple } from "@/lib/report/types";
import type { AssessmentLabel } from "@/lib/report/types";
import type { WindowKey } from "@/lib/calc/returns";

// Deterministic "worth watching" screen. It deliberately needs persistence across two windows,
// so one bad week never flags a fund on its own (the brief: don't react to a single number).

export const SCREEN_VERSION = "screen-v1";

export const THRESHOLDS = {
  equity: { vsPeer1M: -1.5, vsPeerYTD: -3 },
  debt: { vsPeer1M: -0.25, vsPeerYTD: -0.75 },
  /** Index funds should track their index; a large 1M gap signals a tracking problem. */
  indexTracking1M: 0.5,
} as const;

export interface ScreenResult {
  flag: boolean;
  reason: string;
}

const fmt = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(2)}`;

export function screenFund(view: ViewId | null, returns: Record<WindowKey, MetricTriple>): ScreenResult {
  const m = returns["1M"];
  const y = returns["YTD"];
  if (view === "large_cap_index") {
    if (m.vsBenchmarkPp !== null && Math.abs(m.vsBenchmarkPp) > THRESHOLDS.indexTracking1M) {
      return { flag: true, reason: `it has drifted ${fmt(m.vsBenchmarkPp)} points away from the index it copies this month (normal is within ${THRESHOLDS.indexTracking1M}).` };
    }
    return { flag: false, reason: "It is moving closely with the index it copies." };
  }
  const t = view === "short_debt" ? THRESHOLDS.debt : THRESHOLDS.equity;
  if (m.vsPeerPp === null || y.vsPeerPp === null) {
    return { flag: false, reason: "There are not enough similar funds with data to compare." };
  }
  if (m.vsPeerPp <= t.vsPeer1M && y.vsPeerPp <= t.vsPeerYTD) {
    return {
      flag: true,
      reason: `it has been behind similar funds both this month (${fmt(m.vsPeerPp)} points) and this year (${fmt(y.vsPeerPp)} points).`,
    };
  }
  return { flag: false, reason: "No lasting slip against similar funds." };
}

export function suggestLabel(flagged: { name: string; reason: string }[]): { label: AssessmentLabel; rationale: string } {
  if (flagged.length === 0) {
    return { label: "No action needed", rationale: "All your funds moved in line with their markets and with similar funds, so there is nothing to do this week." };
  }
  if (flagged.length === 1) {
    return { label: "One fund worth watching", rationale: `Keep an eye on ${flagged[0].name}: ${flagged[0].reason} Nothing to do yet; check again next Saturday.` };
  }
  return {
    label: "Consider reviewing your allocation",
    rationale: `${flagged.length} funds have been lagging similar funds for a while (${flagged.map((f) => f.name).join(", ")}), so it may be worth a closer look at the mix.`,
  };
}
