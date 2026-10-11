import type { ViewId } from "@/lib/catalog";

// Plain-language wording for Meera. Deterministic: the same numbers always produce the same words,
// and every word maps to a documented threshold (shown on the methodology page).

export type Tone = "good" | "neutral" | "bad" | "none";

/** Gap thresholds in percentage points. Below SAME, two returns are "about the same". */
export const GAP_SAME = 0.25;
export const GAP_CLEAR = 1;

export function describeGap(pp: number | null | undefined): { words: string; tone: Tone } {
  if (pp === null || pp === undefined || !Number.isFinite(pp)) return { words: "no comparison available", tone: "none" };
  const a = Math.abs(pp);
  if (a < GAP_SAME) return { words: "about the same as", tone: "neutral" };
  if (a < GAP_CLEAR) return pp > 0 ? { words: "slightly better than", tone: "good" } : { words: "slightly behind", tone: "bad" };
  return pp > 0 ? { words: "better than", tone: "good" } : { words: "behind", tone: "bad" };
}

/** What each kind of fund invests in, in everyday words. */
export const FUND_KIND: Record<ViewId, string> = {
  large_cap_index: "Copies India's 50 biggest companies",
  mid_cap: "Invests in mid-sized Indian companies",
  small_cap: "Invests in smaller Indian companies",
  short_debt: "Lends money short-term (bonds) — the steady part",
  intl_fof: "Invests in big US tech companies",
};

/** How we refer to the yardstick each fund is compared with. */
export const MARKET_WORDS: Record<ViewId, string> = {
  large_cap_index: "the Nifty 50 it copies",
  mid_cap: "the mid-size market",
  small_cap: "the small-company market",
  short_debt: "the market",
  intl_fof: "the US tech market (in rupees)",
};

export const INDEX_WORDS: Record<string, string> = {
  NIFTY50: "Big companies",
  NIFTY_MIDCAP150: "Mid-size companies",
  NIFTY_SMALLCAP100: "Small companies",
};

export function signed(n: number | null | undefined, dp = 2): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "n/a";
  const r = Math.round(n * 10 ** dp) / 10 ** dp;
  return `${r > 0 ? "+" : ""}${r.toFixed(dp)}%`;
}

export function toneOf(n: number | null | undefined): Tone {
  if (n === null || n === undefined || !Number.isFinite(n)) return "none";
  const r = Math.round(n * 100) / 100;
  return r > 0 ? "good" : r < 0 ? "bad" : "neutral";
}
