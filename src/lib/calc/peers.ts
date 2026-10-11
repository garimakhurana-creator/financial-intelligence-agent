import { computeWindowReturns, WINDOWS, type Observation, type WindowKey } from "@/lib/calc/returns";
import type { ISODate } from "@/lib/dates";

export const PEER_METHOD_VERSION = "peers-v1";

/**
 * Minimum number of valid peer observations before we publish an average for a window.
 * Below this we still show the figure but flag it as a limited sample.
 */
export const MIN_PEERS_FOR_AVERAGE = 3;
export const MIN_PEERS_FOR_RELIABLE = 8;

export interface PeerInput {
  schemeCode: number;
  schemeName: string;
  series: Observation[];
}

export interface PeerWindowStat {
  window: WindowKey;
  /** Arithmetic (equal-weighted) mean of peer returns, in %. */
  mean: number | null;
  median: number | null;
  n: number;
  excluded: number;
  quality: "ok" | "limited_sample" | "unavailable";
}

export interface PeerAverageResult {
  asOf: ISODate;
  universeSize: number;
  windows: Record<WindowKey, PeerWindowStat>;
  /** Per-peer returns, kept so the calculation can be audited. */
  constituents: { schemeCode: number; schemeName: string; returns: Record<WindowKey, number | null> }[];
  methodVersion: string;
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Equal-weighted average of point-to-point returns across a peer universe.
 *
 * Every peer is anchored to the same `asOf` date and the same window target dates as the
 * tracked fund, so the comparison is like-for-like. A peer is excluded from a window when its
 * current or reference NAV is missing/stale (same rules as the tracked fund) — it is never
 * counted as a 0 % return.
 */
export function computePeerAverage(peers: PeerInput[], asOf: ISODate): PeerAverageResult {
  const constituents = peers.map((p) => {
    const { windows } = computeWindowReturns(p.series, asOf, { anchorTo: asOf });
    const returns = {} as Record<WindowKey, number | null>;
    for (const w of WINDOWS) returns[w] = windows[w].returnPct;
    return { schemeCode: p.schemeCode, schemeName: p.schemeName, returns };
  });

  const windows = {} as Record<WindowKey, PeerWindowStat>;
  for (const w of WINDOWS) {
    const valid = constituents.map((c) => c.returns[w]).filter((r): r is number => r !== null && Number.isFinite(r));
    const n = valid.length;
    const mean = n >= MIN_PEERS_FOR_AVERAGE ? valid.reduce((a, b) => a + b, 0) / n : null;
    windows[w] = {
      window: w,
      mean,
      median: n >= MIN_PEERS_FOR_AVERAGE ? median(valid) : null,
      n,
      excluded: constituents.length - n,
      quality: n < MIN_PEERS_FOR_AVERAGE ? "unavailable" : n < MIN_PEERS_FOR_RELIABLE ? "limited_sample" : "ok",
    };
  }

  return { asOf, universeSize: peers.length, windows, constituents, methodVersion: PEER_METHOD_VERSION };
}
