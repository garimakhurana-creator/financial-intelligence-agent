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

// ---------------------------------------------------------------------------------------------
// Words-first helpers for the simple views. Thresholds are fixed so the same move always gets the
// same words; the exact numbers stay one tap away ("Show me the numbers").

/** A friendly face for each kind of fund. */
export const FUND_EMOJI: Record<ViewId, string> = {
  large_cap_index: "🏢",
  mid_cap: "🚀",
  small_cap: "🌱",
  short_debt: "🛟",
  intl_fof: "🌎",
};

/** Two-colour gradient per fund kind, used for avatars and story cards. */
export const FUND_GRADIENT: Record<ViewId, [string, string]> = {
  large_cap_index: ["#6366f1", "#8b5cf6"],
  mid_cap: ["#f97316", "#ec4899"],
  small_cap: ["#10b981", "#84cc16"],
  short_debt: ["#0ea5e9", "#14b8a6"],
  intl_fof: ["#8b5cf6", "#06b6d4"],
};

export const MOVE_FLAT = 0.5;
export const MOVE_SMALL = 2;
export const MOVE_BIG = 5;

/** How a return feels, in words: "Grew a little", "Dipped", "Pretty flat"… */
export function describeMove(pct: number | null | undefined): { words: string; emoji: string; tone: Tone } {
  if (pct === null || pct === undefined || !Number.isFinite(pct)) return { words: "No fresh price yet", emoji: "⏳", tone: "none" };
  const a = Math.abs(pct);
  if (a < MOVE_FLAT) return { words: "Pretty flat", emoji: "😌", tone: "neutral" };
  if (pct > 0) return a < MOVE_SMALL ? { words: "Grew a little", emoji: "🌤️", tone: "good" } : a < MOVE_BIG ? { words: "Grew nicely", emoji: "📈", tone: "good" } : { words: "Grew a lot", emoji: "🚀", tone: "good" };
  return a < MOVE_SMALL ? { words: "Dipped a little", emoji: "🌥️", tone: "bad" } : a < MOVE_BIG ? { words: "Dipped", emoji: "📉", tone: "bad" } : { words: "Dropped a lot", emoji: "🌧️", tone: "bad" };
}

/** "₹1,000 would now be ₹1,012" — a return expressed as money, which is easier to feel than a percentage. */
export function thousandBecomes(pct: number | null | undefined): number | null {
  if (pct === null || pct === undefined || !Number.isFinite(pct)) return null;
  return Math.round(1000 * (1 + pct / 100));
}

/** Compared with similar funds, in a few friendly words. */
export function describeVsPeers(pp: number | null | undefined): { words: string; tone: Tone } {
  if (pp === null || pp === undefined || !Number.isFinite(pp)) return { words: "No comparison yet", tone: "none" };
  const a = Math.abs(pp);
  if (a < GAP_CLEAR) return { words: "Keeping pace with similar funds", tone: "neutral" };
  return pp > 0 ? { words: "Ahead of similar funds", tone: "good" } : { words: "Behind similar funds", tone: "bad" };
}

/** The week's assessment as weather. */
export const WEEK_WEATHER: Record<string, { emoji: string; title: string; line: string; from: string; to: string }> = {
  "No action needed": { emoji: "☀️", title: "Calm week", line: "Nothing needs you. Your funds are moving in step with their markets — up or down, that is normal.", from: "#fde68a", to: "#fca5a5" },
  "One fund worth watching": { emoji: "🌤️", title: "One to keep an eye on", line: "Mostly fine — one fund has been behind similar funds for a while. No rush.", from: "#bae6fd", to: "#c4b5fd" },
  "Consider reviewing your allocation": { emoji: "🌧️", title: "Time for a check-in", line: "A few funds have been behind similar funds for a while. Worth a calm look this weekend.", from: "#cbd5e1", to: "#a5b4fc" },
};
