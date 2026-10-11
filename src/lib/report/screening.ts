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
      return { flag: true, reason: `Index fund drifted ${fmt(m.vsBenchmarkPp)} pp from its index over 1 month (tolerance ±${THRESHOLDS.indexTracking1M} pp).` };
    }
    return { flag: false, reason: "Tracking its index closely." };
  }
  const t = view === "short_debt" ? THRESHOLDS.debt : THRESHOLDS.equity;
  if (m.vsPeerPp === null || y.vsPeerPp === null) {
    return { flag: false, reason: "Not enough comparable peer data to screen." };
  }
  if (m.vsPeerPp <= t.vsPeer1M && y.vsPeerPp <= t.vsPeerYTD) {
    return {
      flag: true,
      reason: `Behind its peer average over both 1 month (${fmt(m.vsPeerPp)} pp) and year-to-date (${fmt(y.vsPeerPp)} pp).`,
    };
  }
  return { flag: false, reason: "No persistent underperformance versus peers." };
}

export function suggestLabel(flagged: { name: string; reason: string }[]): { label: AssessmentLabel; rationale: string } {
  if (flagged.length === 0) {
    return { label: "No action needed", rationale: "No fund shows persistent underperformance versus its peers or index." };
  }
  if (flagged.length === 1) {
    return { label: "One fund worth watching", rationale: `${flagged[0].name}: ${flagged[0].reason}` };
  }
  return {
    label: "Consider reviewing your allocation",
    rationale: `${flagged.length} funds show persistent underperformance: ${flagged.map((f) => f.name).join(", ")}.`,
  };
}
