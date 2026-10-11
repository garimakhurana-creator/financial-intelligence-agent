import type { TopicNewsRow } from "@/lib/db/repo";
import type { FundPerformance, IndexPerformance } from "@/lib/pipeline/data";
import { metricTriples } from "@/lib/report/input";
import { screenFund } from "@/lib/report/screening";

// "What matters this week": at most three observations, chosen by fixed rules in priority order.
// Small daily wiggles never qualify. Every highlight links to the evidence.

export const HIGHLIGHT_RULES = {
  indexWeekMovePct: 2,
  fxWeekMovePct: 1,
  fundLagVsPeers1M: -1.5,
} as const;

export interface Highlight {
  kind: "watch" | "market" | "currency" | "rates" | "lag";
  title: string;
  body: string;
  href: string;
}

const sign = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(2)}%`;
const short = (n: string) => n.replace(/\s*-\s*Direct Plan.*$/i, "").replace(/\s*-\s*Growth.*$/i, "");

export function weeklyHighlights(args: {
  funds: FundPerformance[];
  indices: IndexPerformance[];
  fx: IndexPerformance | null;
  news: TopicNewsRow[];
}): Highlight[] {
  const out: Highlight[] = [];
  // 1. Funds the weekly screen flags (persistent slip vs similar funds, or index-tracking drift).
  for (const f of args.funds) {
    const s = screenFund(f.viewId, metricTriples(f));
    if (s.flag) out.push({ kind: "watch", title: `${short(f.schemeName)} is worth watching`, body: `${capital(s.reason)}`, href: `/funds/${f.schemeCode}` });
  }
  // 2. Big weekly index moves.
  for (const ix of args.indices) {
    const w = ix.windows["1W"].returnPct;
    if (w !== null && Math.abs(w) >= HIGHLIGHT_RULES.indexWeekMovePct) {
      out.push({ kind: "market", title: `${ix.name} ${w > 0 ? "rose" : "fell"} ${sign(w)} this week`, body: `A move of ${HIGHLIGHT_RULES.indexWeekMovePct}% or more in a week is larger than usual; funds in this part of the market likely moved too.`, href: "/market" });
    }
  }
  // 3. Rupee moves that change the value of overseas funds.
  const fw = args.fx?.windows["1W"].returnPct ?? null;
  if (fw !== null && Math.abs(fw) >= HIGHLIGHT_RULES.fxWeekMovePct) {
    out.push({ kind: "currency", title: `The rupee ${fw > 0 ? "weakened" : "strengthened"} ${Math.abs(fw).toFixed(2)}% against the dollar`, body: "A weaker rupee lifts the rupee value of overseas funds; a stronger rupee does the opposite.", href: "/categories/intl_fof" });
  }
  // 4. Interest-rate news (matters for debt funds), most recent explained item only.
  const rates = args.news.find((n) => n.topics.includes("rbi_rates") && n.relevance);
  if (rates?.relevance) out.push({ kind: "rates", title: "Interest-rate news this week", body: rates.relevance.fact, href: "/market?topic=rbi_rates" });
  // 5. Not flagged, but clearly behind similar funds this month.
  for (const f of args.funds) {
    const t = metricTriples(f)["1M"];
    if (t.vsPeerPp !== null && t.vsPeerPp <= HIGHLIGHT_RULES.fundLagVsPeers1M && !out.some((h) => h.href === `/funds/${f.schemeCode}`)) {
      out.push({ kind: "lag", title: `${short(f.schemeName)} lagged similar funds this month`, body: `It was ${Math.abs(t.vsPeerPp).toFixed(2)} points behind the average of similar funds over the past month. One month alone is not a reason to act.`, href: `/funds/${f.schemeCode}` });
    }
  }
  return out.slice(0, 3);
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
