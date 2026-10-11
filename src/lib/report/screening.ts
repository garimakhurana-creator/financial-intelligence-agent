import type { ViewId } from "@/lib/catalog";
import type { MetricTriple } from "@/lib/report/types";
import type { AssessmentLabel } from "@/lib/report/types";
import type { WindowKey } from "@/lib/calc/returns";

// Deterministic "worth watching" screen. It deliberately needs persistence across two windows,
// so one bad week never flags a fund on its own (the brief: don't react to a single number).

export const SCREEN_VERSION = "screen-v2";

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

/** A fund that fell this much over a month is called out in the reason, even when nothing is flagged. */
export const NOTABLE_MONTH_DROP = -2;

export interface PortfolioNotes {
  /** Unflagged funds that fell notably this month while their market (index or similar funds) fell too. */
  marketDip: { name: string; fund: number; market: number }[];
  /** Unflagged funds behind similar funds this year by the flag threshold, but not this month. */
  yearLag: { name: string; vsPeers: number }[];
}

type ScreenedFund = { name: string; view: ViewId | null; returns: Record<WindowKey, MetricTriple>; screening: ScreenResult };

/**
 * Context for the assessment reason. The label answers "is anything wrong with a fund?" (relative
 * to its market and similar funds, as the brief asks); these notes make sure the reason also says
 * plainly when money went down with the market, and when a fund has a longer-term lag that is not
 * (yet) a flag — so "No action needed" never reads as "nothing happened".
 */
export function portfolioNotes(funds: ScreenedFund[]): PortfolioNotes {
  const marketDip: PortfolioNotes["marketDip"] = [];
  const yearLag: PortfolioNotes["yearLag"] = [];
  for (const f of funds) {
    if (f.screening.flag) continue;
    const m = f.returns["1M"];
    const market = m.benchmark ?? m.peerAverage;
    if (m.fund !== null && m.fund <= NOTABLE_MONTH_DROP && market !== null && market < 0) marketDip.push({ name: f.name, fund: m.fund, market });
    const y = f.returns["YTD"].vsPeerPp;
    const t = f.view === "short_debt" ? THRESHOLDS.debt : THRESHOLDS.equity;
    if (f.view !== "large_cap_index" && y !== null && y <= t.vsPeerYTD) yearLag.push({ name: f.name, vsPeers: y });
  }
  return { marketDip, yearLag };
}

const pct = (n: number) => `${Math.abs(n).toFixed(2)}%`;
const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

/** "2.10%" or "3.66%–5.36%": one figure, or the range across several funds. */
function range(xs: number[]): string {
  const a = xs.map((x) => Math.abs(x)).sort((p, q) => p - q);
  return a[0] === a.at(-1) ? pct(a[0]) : `${pct(a[0])}–${pct(a.at(-1)!)}`;
}

const short = (name: string) => name.replace(/\s+Fund$/i, "");

function notesText(n: PortfolioNotes): string {
  const parts: string[] = [];
  if (n.marketDip.length === 1) {
    const d = n.marketDip[0];
    parts.push(`${short(d.name)} fell ${pct(d.fund)} this month, but its market fell too (${pct(d.market)}): a market-wide dip, not a fund problem.`);
  } else if (n.marketDip.length > 1) {
    parts.push(
      `${n.marketDip.length} funds fell ${range(n.marketDip.map((d) => d.fund))} this month, but their markets fell about as much (${range(n.marketDip.map((d) => d.market))}): a market-wide dip, not a fund problem.`,
    );
  }
  if (n.yearLag.length) {
    parts.push(
      `${list(n.yearLag.map((l) => short(l.name)))} ${n.yearLag.length === 1 ? "is" : "are"} still behind similar funds this year (by ${list(n.yearLag.map((l) => Math.abs(l.vsPeers).toFixed(2)))} points).`,
    );
  }
  return parts.join(" ");
}

export function suggestLabel(flagged: { name: string; reason: string }[], notes: PortfolioNotes = { marketDip: [], yearLag: [] }): { label: AssessmentLabel; rationale: string } {
  const extra = notesText(notes);
  if (flagged.length === 0) {
    const base = "No fund has a problem of its own this week.";
    return { label: "No action needed", rationale: extra ? `${base} ${extra}` : `${base} Nothing to do.` };
  }
  if (flagged.length === 1) {
    return { label: "One fund worth watching", rationale: `Keep an eye on ${flagged[0].name}: ${flagged[0].reason} Nothing to do yet; check again next Saturday.` };
  }
  return {
    label: "Consider reviewing your allocation",
    rationale: `${flagged.length} funds have been lagging similar funds for a while (${flagged.map((f) => f.name).join(", ")}), so it may be worth a closer look at the mix.`,
  };
}
