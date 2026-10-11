// Explainable "research score" for Explore Funds. Funds are only ever ranked against others in
// the SAME category, on long-horizon evidence, so one strong recent year cannot top the list.
// Expense ratio is NOT a factor because no verified free data source for it was found (see
// docs/RANKING_METHODOLOGY.md); funds compared are all Direct plans, which removes most cost gaps.

export const RANK_VERSION = "rank-v1";

export type FactorKey = "excess3Y" | "excess5Y" | "consistency" | "drawdown" | "volatility" | "excess1Y";

export const FACTORS: Record<FactorKey, { weight: number; label: string; higherIsBetter: boolean; explain: string }> = {
  excess3Y: { weight: 0.25, label: "3-year return vs category", higherIsBetter: true, explain: "Annualised 3-year return minus the category median." },
  excess5Y: { weight: 0.15, label: "5-year return vs category", higherIsBetter: true, explain: "Annualised 5-year return minus the category median (skipped if under 5 years old)." },
  consistency: { weight: 0.25, label: "Consistency", higherIsBetter: true, explain: "Share of rolling 1-year windows over 3 years in which the fund beat the category median." },
  drawdown: { weight: 0.15, label: "Worst fall (3 years)", higherIsBetter: true, explain: "Largest peak-to-trough fall in 3 years; a smaller fall ranks higher." },
  volatility: { weight: 0.1, label: "Volatility (3 years)", higherIsBetter: false, explain: "How much weekly returns swing, annualised; lower ranks higher." },
  excess1Y: { weight: 0.1, label: "1-year return vs category", higherIsBetter: true, explain: "Recent 1-year return minus the category median. Deliberately a small weight." },
};

export interface RankInput {
  schemeCode: number;
  r1: number | null; // 1Y return %
  r3: number | null; // 3Y annualised %
  r5: number | null; // 5Y annualised %
  consistency: number | null; // % of windows beating median
  drawdown: number | null; // max drawdown %, negative
  volatility: number | null; // annualised %
}

export type RankLabel = "Strong historical consistency" | "Worth researching" | "Mixed record" | "Insufficient history";

export interface RankResult {
  schemeCode: number;
  eligible: boolean;
  score: number | null; // 0–100
  rank: number | null; // 1 = highest in category
  of: number; // eligible funds in category
  label: RankLabel;
  factors: Partial<Record<FactorKey, { value: number; percentile: number }>>;
  strengths: string[];
  cautions: string[];
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Percentile rank in [0,100] of v among values (ties share the average rank). */
export function percentile(v: number, values: number[], higherIsBetter: boolean): number {
  if (values.length <= 1) return 50;
  const below = values.filter((x) => (higherIsBetter ? x < v : x > v)).length;
  const equal = values.filter((x) => x === v).length;
  return ((below + (equal - 1) / 2) / (values.length - 1)) * 100;
}

const MIN_CATEGORY_FOR_RANK = 4;

export function rankCategory(funds: RankInput[]): RankResult[] {
  // Eligibility: 3 years of history with consistency and drawdown measurable.
  const eligible = funds.filter((f) => f.r3 !== null && f.consistency !== null && f.drawdown !== null);
  const med = (k: "r1" | "r3" | "r5") => median(eligible.map((f) => f[k]).filter((x): x is number => x !== null));
  const m1 = med("r1");
  const m3 = med("r3");
  const m5 = med("r5");
  const raw = (f: RankInput): Partial<Record<FactorKey, number>> => ({
    ...(f.r3 !== null && m3 !== null ? { excess3Y: f.r3 - m3 } : {}),
    ...(f.r5 !== null && m5 !== null ? { excess5Y: f.r5 - m5 } : {}),
    ...(f.consistency !== null ? { consistency: f.consistency } : {}),
    ...(f.drawdown !== null ? { drawdown: f.drawdown } : {}),
    ...(f.volatility !== null ? { volatility: f.volatility } : {}),
    ...(f.r1 !== null && m1 !== null ? { excess1Y: f.r1 - m1 } : {}),
  });
  const rawAll = eligible.map(raw);
  const columns = Object.fromEntries(
    (Object.keys(FACTORS) as FactorKey[]).map((k) => [k, rawAll.map((r) => r[k]).filter((x): x is number => x !== undefined)]),
  ) as Record<FactorKey, number[]>;

  const scored = funds.map((f): RankResult => {
    const isEligible = eligible.includes(f) && eligible.length >= MIN_CATEGORY_FOR_RANK;
    if (!isEligible) {
      return {
        schemeCode: f.schemeCode,
        eligible: false,
        score: null,
        rank: null,
        of: 0,
        label: "Insufficient history",
        factors: {},
        strengths: [],
        cautions: [eligible.includes(f) ? "Too few comparable funds in this category to rank fairly." : "Less than 3 years of NAV history, so long-term consistency cannot be judged yet."],
      };
    }
    const r = raw(f);
    const factors: RankResult["factors"] = {};
    let wSum = 0;
    let total = 0;
    for (const k of Object.keys(FACTORS) as FactorKey[]) {
      const v = r[k];
      if (v === undefined || columns[k].length < MIN_CATEGORY_FOR_RANK) continue;
      const p = percentile(v, columns[k], FACTORS[k].higherIsBetter);
      factors[k] = { value: v, percentile: p };
      wSum += FACTORS[k].weight;
      total += FACTORS[k].weight * p;
    }
    const score = wSum > 0 ? total / wSum : null;
    const strengths: string[] = [];
    const cautions: string[] = [];
    const p = (k: FactorKey) => factors[k]?.percentile;
    if ((p("consistency") ?? 0) >= 70) strengths.push(`Beat the category median in ${Math.round(f.consistency!)}% of rolling 1-year periods`);
    if ((p("excess3Y") ?? 0) >= 70) strengths.push("3-year return in the top third of its category");
    if ((p("drawdown") ?? 0) >= 70) strengths.push("Fell less than most similar funds in its worst stretch");
    if ((p("volatility") ?? 0) >= 70) strengths.push("Smoother ride than most similar funds");
    if ((p("excess3Y") ?? 100) < 30) cautions.push("3-year return in the bottom third of its category");
    if ((p("consistency") ?? 100) < 30) cautions.push("Rarely beat the category median over rolling 1-year periods");
    if ((p("drawdown") ?? 100) < 30) cautions.push("Fell more than most similar funds in its worst stretch");
    if ((p("volatility") ?? 100) < 30) cautions.push("Bumpier than most similar funds");
    if ((p("excess1Y") ?? 0) >= 80 && (p("consistency") ?? 100) < 50) cautions.push("Strong last year, but a less consistent longer record");
    const label: RankLabel =
      score !== null && score >= 70 && (f.consistency ?? 0) >= 60 ? "Strong historical consistency" : score !== null && score >= 60 ? "Worth researching" : "Mixed record";
    return { schemeCode: f.schemeCode, eligible: true, score, rank: null, of: 0, label, factors, strengths, cautions };
  });

  const ranked = scored.filter((s) => s.eligible).sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  ranked.forEach((s, i) => {
    s.rank = i + 1;
    s.of = ranked.length;
  });
  return scored;
}
