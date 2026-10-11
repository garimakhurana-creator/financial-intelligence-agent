import { z } from "zod";
import { generateJson } from "@/lib/ai/gemini";
import { discoveryGroup, suggestPeerRule } from "@/lib/catalog";
import { computeFundMetrics, consistencyVsCategory, HORIZONS, type FundMetrics, type Horizon } from "@/lib/calc/metrics";
import { round } from "@/lib/calc/returns";
import { addDays, minusMonths, todayIn, type ISODate } from "@/lib/dates";
import * as cached from "@/lib/db/cached";
import * as research from "@/lib/db/research";
import { REPORT_TZ } from "@/lib/env";
import { mapLimit } from "@/lib/http";
import { errorMessage } from "@/lib/log";
import type { DiscoveryFundData, DiscoveryGroupData } from "@/lib/pipeline/discovery";
import { allowedNumbers, hasAdvice, isAllowedNumber, numberTokens } from "@/lib/report/validate";
import { fetchNavAll, isDirectGrowth, selectPeerUniverse } from "@/lib/sources/amfi";
import { fetchSchemeHistory, MFAPI_SOURCE, type SchemeMeta } from "@/lib/sources/mfapi";
import type { DocumentFacts } from "@/lib/analysis/document";

export const ANALYSIS_VERSION = "analysis-v1";

export const OUTCOMES = ["Worth researching further", "Suitable for further comparison", "Several concerns to investigate", "Insufficient data for a reliable assessment"] as const;
export type Outcome = (typeof OUTCOMES)[number];

export interface Finding {
  text: string;
  /** Where the evidence comes from: "nav" (computed), "document" (verified quote), "category" (peer data). */
  basis: "nav" | "document" | "category";
}

export interface AnalysisFacts {
  asOf: ISODate;
  scheme: (SchemeMeta & { plan: "Direct" | "Regular" | "Unknown"; option: "Growth" | "IDCW" | "Unknown" }) | null;
  group: { key: string; label: string; plain: string; horizon: string; riskBand: string } | null;
  metrics: Omit<FundMetrics, "rolling1Y"> | null;
  consistency: { beatPct: number; windows: number } | null;
  category: { medians: DiscoveryGroupData["medians"]; reference: DiscoveryGroupData["reference"]; computedAt: string; peers: number } | null;
  comparison: Record<"1Y" | "3Y" | "5Y", { fund: number | null; categoryMedian: number | null; reference: number | null }>;
  alternatives: { schemeCode: number; schemeName: string; amc: string; score: number | null; label: string | null; r3: number | null; r5: number | null }[];
  document: DocumentFacts | null;
  strengths: Finding[];
  concerns: Finding[];
  outcome: Outcome;
  outcomeReason: string;
  sources: string[];
}

const pp = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(2)}`;

function planOf(name: string): "Direct" | "Regular" | "Unknown" {
  if (/direct/i.test(name)) return "Direct";
  if (/regular/i.test(name)) return "Regular";
  return "Unknown";
}
function optionOf(name: string): "Growth" | "IDCW" | "Unknown" {
  if (/idcw|dividend|payout|reinvest/i.test(name)) return "IDCW";
  if (/growth/i.test(name)) return "Growth";
  return "Unknown";
}

/** Deterministic strengths, concerns and outcome — Gemini never decides these. */
export function assess(f: Omit<AnalysisFacts, "strengths" | "concerns" | "outcome" | "outcomeReason">): Pick<AnalysisFacts, "strengths" | "concerns" | "outcome" | "outcomeReason"> {
  const s: Finding[] = [];
  const c: Finding[] = [];
  const m = f.metrics;
  const med = f.category?.medians;
  const r3 = m?.returns["3Y"].annualised ?? null;
  const r5 = m?.returns["5Y"].annualised ?? null;
  if (r3 !== null && med?.r3 != null) {
    if (r3 - med.r3 >= 1) s.push({ text: `3-year annual return of ${r3.toFixed(2)}% is ${pp(r3 - med.r3)} points above the category median of ${med.r3.toFixed(2)}%.`, basis: "category" });
    if (r3 - med.r3 <= -1) c.push({ text: `3-year annual return of ${r3.toFixed(2)}% is ${pp(r3 - med.r3)} points below the category median of ${med.r3.toFixed(2)}%.`, basis: "category" });
  }
  if (r5 !== null && med?.r5 != null) {
    if (r5 - med.r5 >= 1) s.push({ text: `5-year annual return of ${r5.toFixed(2)}% is ${pp(r5 - med.r5)} points above the category median.`, basis: "category" });
    if (r5 - med.r5 <= -1) c.push({ text: `5-year annual return of ${r5.toFixed(2)}% is ${pp(r5 - med.r5)} points below the category median.`, basis: "category" });
  }
  if (f.consistency) {
    if (f.consistency.beatPct >= 60) s.push({ text: `Beat the category median in ${Math.round(f.consistency.beatPct)}% of ${f.consistency.windows} rolling 1-year periods.`, basis: "category" });
    if (f.consistency.beatPct < 40) c.push({ text: `Beat the category median in only ${Math.round(f.consistency.beatPct)}% of ${f.consistency.windows} rolling 1-year periods.`, basis: "category" });
  }
  const dd = m?.maxDrawdown3Y?.pct ?? null;
  if (dd !== null && med?.dd != null) {
    if (dd - med.dd >= 2) s.push({ text: `Its worst fall in 3 years (${dd.toFixed(2)}%) was milder than the category median (${med.dd.toFixed(2)}%).`, basis: "category" });
    if (dd - med.dd <= -3) c.push({ text: `Its worst fall in 3 years (${dd.toFixed(2)}%) was deeper than the category median (${med.dd.toFixed(2)}%).`, basis: "category" });
  }
  const vol = m?.volatility3Y ?? null;
  if (vol !== null && med?.vol != null) {
    if (med.vol - vol >= 1) s.push({ text: `Weekly ups and downs (${vol.toFixed(2)}% a year) were smaller than the category median (${med.vol.toFixed(2)}%).`, basis: "category" });
    if (vol - med.vol >= 2) c.push({ text: `Weekly ups and downs (${vol.toFixed(2)}% a year) were larger than the category median (${med.vol.toFixed(2)}%).`, basis: "category" });
  }
  if (f.scheme?.plan === "Regular") c.push({ text: "This is a Regular plan; the Direct plan of the same fund has a lower expense ratio because it pays no distributor commission.", basis: "nav" });
  if (f.scheme?.plan === "Direct") s.push({ text: "Direct plan: no distributor commission is built into its costs.", basis: "nav" });
  if (f.scheme?.option === "IDCW") c.push({ text: "IDCW (payout) option: its NAV drops on each payout, so NAV returns understate total returns.", basis: "nav" });
  const ter = f.document?.fields.expenseRatioDirect;
  if (ter?.verified && typeof ter.value === "number") s.push({ text: `Direct-plan expense ratio of ${ter.value}% is stated in the factsheet.`, basis: "document" });
  if (f.scheme && m && m.returns["3Y"].total === null) c.push({ text: "Less than 3 years of NAV history, so its long-term record cannot be judged yet.", basis: "nav" });
  if (f.scheme && !f.group) c.push({ text: "No comparable peer group is configured for this category, so it is not compared with similar funds.", basis: "category" });
  if (f.group?.key === "fof_overseas") c.push({ text: "Overseas funds track different countries and indices, so the category average mixes unlike funds.", basis: "category" });
  const unverified = f.document ? Object.values(f.document.fields).filter((x) => x.value !== null && !x.verified).length : 0;
  if (unverified > 0) c.push({ text: `${unverified} factsheet field(s) could not be verified against the document text and are shown for reference only.`, basis: "document" });

  // Outcome rules (documented on the page):
  const hasLongRecord = r3 !== null && f.category !== null;
  let outcome: Outcome;
  let reason: string;
  const material = c.filter((x) => x.basis !== "document");
  if (!f.scheme || !hasLongRecord) {
    outcome = "Insufficient data for a reliable assessment";
    reason = !f.scheme ? "The fund could not be matched to NAV history, so its record cannot be checked." : "There is not yet 3 years of history and a peer group to compare against.";
  } else if (material.length >= 2) {
    outcome = "Several concerns to investigate";
    reason = `${material.length} evidence-based concerns were found; look into them before going further.`;
  } else if (s.length >= 3 && material.length === 0) {
    outcome = "Worth researching further";
    reason = `${s.length} evidence-based strengths and no material concerns were found.`;
  } else {
    outcome = "Suitable for further comparison";
    reason = "The record is mixed or average for its category; compare it with the alternatives listed.";
  }
  return { strengths: s, concerns: c, outcome, outcomeReason: reason };
}

/** Resolve a scheme and compute everything deterministic about it. */
export async function buildFacts(input: { schemeCode: number | null; document: DocumentFacts | null }): Promise<AnalysisFacts> {
  const asOf = todayIn(REPORT_TZ());
  const sources: string[] = [];
  let scheme: AnalysisFacts["scheme"] = null;
  let metrics: FundMetrics | null = null;
  let group: AnalysisFacts["group"] = null;
  let consistency: AnalysisFacts["consistency"] = null;
  let category: AnalysisFacts["category"] = null;
  let alternatives: AnalysisFacts["alternatives"] = [];

  if (input.schemeCode) {
    const h = await fetchSchemeHistory(input.schemeCode);
    scheme = { ...h.meta, plan: planOf(h.meta.schemeName), option: optionOf(h.meta.schemeName) };
    metrics = computeFundMetrics(h.series, asOf);
    sources.push(`${MFAPI_SOURCE}: NAV history ${metrics.historyStart ?? "?"} to ${metrics.asOf ?? "?"}`);
    const rule = suggestPeerRule(h.meta.schemeCategory, h.meta.schemeName);
    const g = rule ? discoveryGroup(rule.key) : undefined;
    if (rule && g) {
      group = { key: g.key, label: rule.label, plain: g.plain, horizon: g.horizon, riskBand: g.riskBand };
      const stored = (await cached.discoveryGroups<DiscoveryGroupData>()).find((x) => x.groupKey === g.key);
      if (stored) {
        category = { medians: stored.data.medians, reference: stored.data.reference, computedAt: stored.computedAt, peers: stored.data.fetched };
        sources.push(`Category medians: ${stored.data.fetched} Direct-Growth ${rule.label.toLowerCase()} (computed ${stored.computedAt.slice(0, 10)})`);
      }
      // Consistency needs every peer's rolling 1-year returns on the same dates.
      try {
        const amfi = await fetchNavAll();
        const peers = selectPeerUniverse(amfi, rule).members.filter((p) => p.schemeCode !== input.schemeCode && isDirectGrowth(p));
        const from = addDays(minusMonths(asOf, 60), -15);
        const hist = await mapLimit(peers, 8, (p) => fetchSchemeHistory(p.schemeCode, { from, to: asOf }));
        const anchor = metrics.asOf ?? asOf;
        const rolling = hist.flatMap((r) => (r.status === "fulfilled" ? [computeFundMetrics(r.value.series, anchor).rolling1Y] : []));
        consistency = consistencyVsCategory(metrics.rolling1Y, rolling);
      } catch (e) {
        sources.push(`Consistency not computed: ${errorMessage(e)}`);
      }
      const alts = (await cached.fundMetrics<DiscoveryFundData>(g.key))
        .filter((a) => a.schemeCode !== input.schemeCode && a.score !== null)
        .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
        .slice(0, 3);
      alternatives = alts.map((a) => ({
        schemeCode: a.schemeCode,
        schemeName: a.schemeName,
        amc: a.amc,
        score: a.score,
        label: a.label,
        r3: a.data.metrics.returns["3Y"].annualised === null ? null : round(a.data.metrics.returns["3Y"].annualised),
        r5: a.data.metrics.returns["5Y"].annualised === null ? null : round(a.data.metrics.returns["5Y"].annualised),
      }));
    }
  }
  if (input.document) sources.push(`Uploaded document: ${input.document.file.name} (${input.document.file.pages} pages, SHA-256 ${input.document.file.sha256.slice(0, 12)}…)`);

  const r = (h: Horizon) => (metrics ? (h === "1Y" ? metrics.returns[h].total : metrics.returns[h].annualised) : null);
  const comparison = {
    "1Y": { fund: round(r("1Y")), categoryMedian: round(category?.medians.r1 ?? null), reference: round(category?.reference?.r1 ?? null) },
    "3Y": { fund: round(r("3Y")), categoryMedian: round(category?.medians.r3 ?? null), reference: round(category?.reference?.r3 ?? null) },
    "5Y": { fund: round(r("5Y")), categoryMedian: round(category?.medians.r5 ?? null), reference: round(category?.reference?.r5 ?? null) },
  };
  const metricsOut = metrics ? (({ rolling1Y: _r, ...rest }) => rest)(metrics) : null;
  const base = { asOf, scheme, group, metrics: metricsOut, consistency, category, comparison, alternatives, document: input.document, sources };
  return { ...base, ...assess(base) };
}

// ---------------------------------------------------------------------------------------------
// Gemini narrative over the verified facts

export const SECTIONS = ["glance", "performance", "consistency", "risk", "costs", "portfolio", "strengths", "concerns", "alternatives", "assessment"] as const;
export type SectionKey = (typeof SECTIONS)[number];

const Narrative = z.object(Object.fromEntries(SECTIONS.map((k) => [k, z.string().min(20).max(900)])) as Record<SectionKey, z.ZodString>);
export type Narrative = z.infer<typeof Narrative>;

const NARRATIVE_SCHEMA = { type: "object", properties: Object.fromEntries(SECTIONS.map((k) => [k, { type: "string" }])), required: [...SECTIONS] };

function compactFacts(f: AnalysisFacts) {
  const m = f.metrics;
  return {
    fund: f.scheme ? { name: f.scheme.schemeName, amc: f.scheme.fundHouse, category: f.scheme.schemeCategory, plan: f.scheme.plan, option: f.scheme.option } : null,
    group: f.group,
    navDate: m?.asOf,
    nav: m?.nav,
    historyStart: m?.historyStart,
    returns: m ? Object.fromEntries(HORIZONS.map((h) => [h, { total: round(m.returns[h].total), annualised: round(m.returns[h].annualised) }])) : null,
    volatility3Y: round(m?.volatility3Y ?? null),
    maxDrawdown3Y: m?.maxDrawdown3Y ? { pct: round(m.maxDrawdown3Y.pct), peak: m.maxDrawdown3Y.peak, trough: m.maxDrawdown3Y.trough } : null,
    consistency: f.consistency ? { beatPct: Math.round(f.consistency.beatPct), windows: f.consistency.windows } : null,
    comparison: f.comparison,
    categoryMedians: f.category ? { vol: round(f.category.medians.vol), dd: round(f.category.medians.dd) } : null,
    referenceIndex: f.category?.reference?.name ?? null,
    alternatives: f.alternatives,
    documentVerified: f.document
      ? {
          fields: Object.fromEntries(Object.entries(f.document.fields).filter(([, v]) => v.verified).map(([k, v]) => [k, v.value])),
          returns: f.document.returns.filter((x) => x.verified).map((x) => x.value),
          topHoldings: f.document.topHoldings.filter((x) => x.verified).map((x) => x.value),
          sectors: f.document.sectors.filter((x) => x.verified).map((x) => x.value),
        }
      : null,
    strengths: f.strengths.map((s) => s.text),
    concerns: f.concerns.map((c) => c.text),
    outcome: f.outcome,
    outcomeReason: f.outcomeReason,
  };
}

const SYSTEM = `You explain a mutual fund research analysis to Meera, a 28-year-old non-expert. Everyday words, short paragraphs (2–4 sentences each).
HARD RULES: use ONLY numbers present in FACTS (quote them as given). Never invent returns, holdings, costs, ratings or dates. If something is missing, say it is not available.
Terms: "category median" = the middle fund among similar funds; "consistency" = how often the fund beat the category MEDIAN over rolling 1-year periods (never call this a benchmark); "reference index" = the market index used as a yardstick for the whole category, not the fund's own stated benchmark.
The strengths, concerns and outcome are already decided — explain them, do not change them. Never tell her to invest or not invest, buy, sell or switch; this is research, not advice. Past returns do not guarantee future returns.
Sections: glance (what the fund invests in and its role), performance (returns vs category median and reference index over the same periods), consistency, risk (volatility, worst fall, what that means), costs (plan type, expense ratio if available, why costs compound), portfolio (holdings/sectors only if documentVerified has them, else say not available), strengths, concerns, alternatives (funds to compare, from FACTS only), assessment (the given outcome and its reason).`;

export function validateNarrative(raw: unknown, facts: AnalysisFacts): { ok: boolean; errors: string[]; value?: Narrative } {
  const p = Narrative.safeParse(raw);
  if (!p.success) return { ok: false, errors: p.error.issues.slice(0, 6).map((i) => `${i.path.join(".")} ${i.message}`) };
  const allowed = allowedNumbers(compactFacts(facts));
  const errors: string[] = [];
  for (const k of SECTIONS) {
    for (const n of numberTokens(p.data[k])) if (!isAllowedNumber(n, allowed)) errors.push(`${k}: number ${n.value} is not in FACTS`);
    if (hasAdvice(p.data[k])) errors.push(`${k}: contains a buy/sell-style instruction`);
  }
  if (!p.data.assessment.toLowerCase().includes(facts.outcome.toLowerCase())) errors.push(`assessment: must state the outcome "${facts.outcome}" verbatim`);
  return errors.length ? { ok: false, errors } : { ok: true, errors: [], value: p.data };
}

export function templateNarrative(f: AnalysisFacts): Narrative {
  const c = f.comparison;
  const list = (xs: Finding[]) => (xs.length ? xs.map((x) => x.text).join(" ") : "None identified from the available data.");
  return {
    glance: f.group ? `${f.scheme?.schemeName ?? "This fund"} is in the ${f.group.label.toLowerCase()} group. ${f.group.plain} Typical horizon: ${f.group.horizon}.` : `${f.scheme?.schemeName ?? "This fund"} could not be placed in a comparable peer group.`,
    performance: `Annual returns — 1 year: ${c["1Y"].fund ?? "n/a"}% (category median ${c["1Y"].categoryMedian ?? "n/a"}%); 3 years: ${c["3Y"].fund ?? "n/a"}% (median ${c["3Y"].categoryMedian ?? "n/a"}%); 5 years: ${c["5Y"].fund ?? "n/a"}% (median ${c["5Y"].categoryMedian ?? "n/a"}%).`,
    consistency: f.consistency ? `It beat the category median in ${Math.round(f.consistency.beatPct)}% of ${f.consistency.windows} rolling 1-year periods.` : "Consistency could not be measured with the available history.",
    risk: f.metrics?.maxDrawdown3Y ? `Its worst fall over 3 years was ${round(f.metrics.maxDrawdown3Y.pct)}%, and its weekly swings were ${round(f.metrics.volatility3Y)}% a year.` : "Risk measures need 3 years of history, which is not available.",
    costs: f.scheme?.plan === "Direct" ? "This is a Direct plan, which carries no distributor commission. Small cost differences add up over many years." : "Check whether a Direct plan of this fund is available; it costs less than a Regular plan.",
    portfolio: "Holdings and sector data are shown only when an uploaded factsheet provides them and they could be verified.",
    strengths: list(f.strengths),
    concerns: list(f.concerns),
    alternatives: f.alternatives.length ? `Similar funds to compare: ${f.alternatives.map((a) => a.schemeName.replace(/\s*-\s*Direct.*$/i, "")).join(", ")}.` : "No comparable alternatives are available.",
    assessment: `${f.outcome}. ${f.outcomeReason}`,
  };
}

export async function writeNarrative(facts: AnalysisFacts): Promise<{ narrative: Narrative; generator: "gemini" | "template"; model: string | null; errors: string[] }> {
  const errors: string[] = [];
  let feedback = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const { json, modelVersion } = await generateJson({ system: SYSTEM, prompt: `FACTS:\n${JSON.stringify(compactFacts(facts))}${feedback}`, schema: NARRATIVE_SCHEMA });
      const v = validateNarrative(json, facts);
      if (v.ok && v.value) return { narrative: v.value, generator: "gemini", model: modelVersion, errors };
      errors.push(...v.errors.map((e) => `attempt ${attempt}: ${e}`));
      feedback = `\n\nPrevious answer rejected: ${v.errors.slice(0, 8).join("; ")}. Fix these.`;
    } catch (e) {
      errors.push(`attempt ${attempt}: ${errorMessage(e)}`);
    }
  }
  return { narrative: templateNarrative(facts), generator: "template", model: null, errors };
}

/** sourceType is "search" | "code" | "pdf"; a "v-" prefix marks a visitor's analysis (kept out of the owner's history). */
export async function runAnalysis(input: { schemeCode: number | null; document: DocumentFacts | null; sourceType: string }) {
  const facts = await buildFacts(input);
  const n = await writeNarrative(facts);
  const name = facts.scheme?.schemeName ?? (typeof facts.document?.fields.fundName?.value === "string" ? facts.document.fields.fundName.value : "Uploaded document");
  const id = await research.saveAnalysis({
    schemeCode: facts.scheme?.schemeCode ?? null,
    schemeName: name,
    sourceType: input.sourceType,
    outcome: facts.outcome,
    data: { facts, narrative: n.narrative, generator: n.generator, model: n.model, narrativeErrors: n.errors.slice(0, 20), version: ANALYSIS_VERSION },
  });
  return { id, facts, ...n };
}

export interface StoredAnalysisData {
  facts: AnalysisFacts;
  narrative: Narrative;
  generator: "gemini" | "template";
  model: string | null;
  narrativeErrors: string[];
  version: string;
}
