import { z } from "zod";
import { generateJson } from "@/lib/ai/gemini";
import { discoveryGroup, suggestPeerRule, suggestView, type AssetClass } from "@/lib/catalog";
import { computeFundMetrics } from "@/lib/calc/metrics";
import { todayIn } from "@/lib/dates";
import * as cached from "@/lib/db/cached";
import { REPORT_TZ } from "@/lib/env";
import { groupLabelMap, toUniverseRow, type UniverseRow } from "@/lib/explore";
import { mapLimit } from "@/lib/http";
import type { DiscoveryFundData, DiscoveryGroupData } from "@/lib/pipeline/discovery";
import { fetchNavAll, isDirectGrowth, type AmfiScheme } from "@/lib/sources/amfi";
import { fetchSchemeHistory } from "@/lib/sources/mfapi";

// "Someone else's portfolio": read the funds from an uploaded statement (or a pasted list), match
// each to a real scheme, describe how it is doing in plain words, and say whether it is relevant
// for Meera. Everything except reading the document is deterministic; nothing is stored.

export const MAX_PORTFOLIO_FUNDS = 15;

// ---------------------------------------------------------------------------------------------
// 1. Reading the holdings

const Holdings = z.object({
  holdings: z.array(z.object({ name: z.string().min(3).max(200), value: z.number().nullable() })).max(40),
});

const HOLDINGS_SCHEMA = {
  type: "object",
  properties: {
    holdings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "The mutual fund scheme name exactly as written in the document." },
          value: { type: ["number", "null"], description: "Current value or amount in rupees for this fund if the document shows it, else null." },
        },
        required: ["name", "value"],
      },
    },
  },
  required: ["holdings"],
};

const SYSTEM = `You read a person's mutual fund statement or holdings list. List every mutual fund scheme it shows, with the name copied exactly as written, and its current value (or invested amount) in rupees if shown. Ignore stocks, bonds, ETFs bought on an exchange, totals and headings. Never invent a fund or an amount; if nothing is shown, return an empty list.`;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export interface ReadHolding {
  name: string;
  value: number | null;
}

/**
 * Text documents (PDF text, CSV, pasted lists): every name Gemini returns must appear in the text,
 * so nothing is made up. Images cannot be checked that way and are labelled as read from an image.
 */
export async function readHoldings(input: { text: string | null; image: { mimeType: string; base64: string } | null }): Promise<{ holdings: ReadHolding[]; dropped: number; source: "text" | "image" }> {
  const { json } = await generateJson({
    system: SYSTEM,
    prompt: input.text ? `DOCUMENT:\n${input.text.slice(0, 60_000)}` : "The holdings are in the attached image.",
    schema: HOLDINGS_SCHEMA,
    file: input.image ?? undefined,
    temperature: 0,
  });
  const parsed = Holdings.safeParse(json);
  if (!parsed.success) return { holdings: [], dropped: 0, source: input.text ? "text" : "image" };
  const doc = input.text ? norm(input.text) : null;
  const seen = new Set<string>();
  const holdings: ReadHolding[] = [];
  let dropped = 0;
  for (const h of parsed.data.holdings) {
    const key = norm(h.name);
    if (seen.has(key)) continue;
    seen.add(key);
    if (doc && !doc.includes(key)) {
      dropped++;
      continue;
    }
    holdings.push({ name: h.name.trim(), value: h.value !== null && h.value > 0 ? h.value : null });
  }
  return { holdings: holdings.slice(0, MAX_PORTFOLIO_FUNDS), dropped, source: input.text ? "text" : "image" };
}

// ---------------------------------------------------------------------------------------------
// 2. Matching names to schemes (AMFI's master list)

const STOP = new Set(["fund", "plan", "option", "scheme", "direct", "regular", "growth", "idcw", "dividend", "payout", "reinvestment", "the", "of", "and", "mutual", "mf", "g", "gr", "dir", "reg"]);
const tokens = (s: string) =>
  new Set(
    norm(s.replace(/&/g, " and "))
      .replace(/\b(large|mid|small|multi|flexi)cap\b/g, "$1 cap")
      .split(" ")
      .filter((t) => t && !STOP.has(t)),
  );

/** A scheme's names to match against: its current name, and any "(erstwhile …)" former name. */
function nameVariants(s: AmfiScheme): Set<string>[] {
  const current = s.schemeName.replace(/\s*\(erstwhile[^)]*\)/i, "");
  const former = /\(erstwhile\s+([^)]*)\)/i.exec(s.schemeName)?.[1];
  const amc = current.split(/\s+/).slice(0, 2).join(" ");
  return [tokens(current), ...(former ? [tokens(former.toLowerCase().startsWith(amc.split(" ")[0].toLowerCase()) ? former : `${amc} ${former}`)] : [])];
}

/**
 * Two-way word overlap: the share of the statement's words found in the scheme name AND the share
 * of the scheme name's words found in the statement. Taking the smaller of the two means an extra
 * word on either side ("US Bluechip" vs "Bluechip", "Energy" vs "Equity") costs the match.
 */
function similarity(a: Set<string>, b: Set<string>): number {
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return Math.min(inter / Math.max(1, a.size), inter / Math.max(1, b.size));
}

/** Accept only near-exact name matches; an unrecognised fund is listed rather than guessed. */
const MIN_MATCH = 0.85;

export interface Match {
  scheme: AmfiScheme;
  /** Direct-Growth version used for comparisons (may be the same scheme). */
  compare: AmfiScheme;
  confidence: number;
  plan: "Direct" | "Regular" | "Unknown";
}

export function matchScheme(name: string, all: AmfiScheme[]): Match | null {
  const want = tokens(name);
  if (want.size === 0) return null;
  let best: { s: AmfiScheme; score: number } | null = null;
  for (const s of all) {
    if (s.structure !== "Open Ended Schemes") continue;
    const score = Math.max(...nameVariants(s).map((v) => similarity(want, v)));
    if (!best || score > best.score) best = { s, score };
  }
  if (!best || best.score < MIN_MATCH) return null;
  // All plans/options of that fund share the base name; pick the one the statement describes, and
  // its Direct-Growth plan for comparisons (that is what the category data covers).
  const base = nameVariants(best.s)[0];
  const siblings = all.filter((s) => s.amc === best!.s.amc && s.category === best!.s.category && similarity(base, nameVariants(s)[0]) >= 0.99);
  const text = name.toLowerCase();
  const wantPlan = /regular/.test(text) ? "regular" : /direct/.test(text) ? "direct" : null;
  const wantOption = /idcw|dividend|payout/.test(text) ? "idcw" : /growth|\(g\)/.test(text) ? "growth" : null;
  const fits = (s: AmfiScheme) => {
    const label = `${s.schemeName} ${s.plan} ${s.option}`.toLowerCase();
    return (!wantPlan || label.includes(wantPlan)) && (!wantOption || (wantOption === "idcw" ? /idcw|dividend/.test(label) : label.includes("growth")));
  };
  const held = siblings.find(fits) ?? best.s;
  const direct = siblings.find((s) => isDirectGrowth(s));
  const planText = `${name} ${held.schemeName} ${held.plan}`.toLowerCase();
  return {
    scheme: held,
    compare: direct ?? best.s,
    confidence: Math.round(best.score * 100) / 100,
    plan: /regular/.test(name.toLowerCase()) ? "Regular" : /direct/.test(planText) ? "Direct" : "Unknown",
  };
}

// ---------------------------------------------------------------------------------------------
// 3. Plain-language verdicts

export type Standing = "strong" | "good" | "mixed" | "new" | "unknown";

export interface FundVerdict {
  name: string;
  value: number | null;
  matched: { schemeCode: number; schemeName: string; amc: string; category: string; plan: Match["plan"] } | null;
  group: string | null;
  groupLabel: string | null;
  assetClass: AssetClass | "other";
  r1: number | null;
  r3: number | null;
  categoryR3: number | null;
  standing: Standing;
  words: string;
  forMeera: { kind: "owned" | "stronger" | "similar" | "adds" | "skip" | "unknown"; text: string };
}

const STANDING_WORDS: Record<Standing, string> = {
  strong: "🌟 Strong long-term record",
  good: "👍 Good record",
  mixed: "😐 Mixed record",
  new: "⏳ Too new to judge",
  unknown: "❔ Not enough data",
};

function standingOf(row: UniverseRow | null, r3: number | null, catR3: number | null): Standing {
  if (row?.label === "Strong historical consistency") return "strong";
  if (row?.label === "Worth researching") return "good";
  if (row?.label === "Mixed record") return "mixed";
  if (row?.label === "Insufficient history" || (r3 === null && row)) return "new";
  if (r3 === null) return "new";
  if (catR3 === null) return "unknown";
  return r3 - catR3 >= 1 ? "good" : r3 - catR3 <= -1 ? "mixed" : "good";
}

function assetOf(category: string): AssetClass | "other" {
  const c = category.toLowerCase();
  if (/overseas|international/.test(c)) return "international";
  if (/index|etf/.test(c)) return "index";
  if (/hybrid|balanced|asset allocation|arbitrage|equity savings/.test(c)) return "hybrid";
  if (/debt|income|liquid|gilt|bond|duration|money market|overnight|credit|floater/.test(c)) return "debt";
  if (/equity|elss|cap|value|focused|sectoral|thematic/.test(c)) return "equity";
  return "other";
}

const ASSET_WORDS: Record<string, string> = { equity: "shares", index: "index (shares)", hybrid: "mixed", debt: "bonds", international: "abroad", other: "other" };

export interface PortfolioAnalysis {
  read: { found: number; matched: number; dropped: number; source: "text" | "image" };
  funds: FundVerdict[];
  unmatched: string[];
  summary: string[];
  mix: { label: string; share: number }[];
  worthALook: string[];
}

export async function analysePortfolio(holdings: ReadHolding[], source: "text" | "image", dropped: number): Promise<PortfolioAnalysis> {
  const asOf = todayIn(REPORT_TZ());
  const [amfi, groups, meera] = await Promise.all([fetchNavAll(), cached.discoveryGroups<DiscoveryGroupData>(), cached.funds()]);
  const labels = groupLabelMap(groups);
  const matches = holdings.map((h) => ({ h, m: matchScheme(h.name, amfi) }));
  const codes = [...new Set(matches.flatMap((x) => (x.m ? [x.m.compare.schemeCode] : [])).concat(meera.map((f) => f.schemeCode)))];
  const metrics = await cached.fundMetricsMany<DiscoveryFundData>(codes);
  const rowOf = (code: number) => {
    const m = metrics.find((x) => x.schemeCode === code);
    return m ? toUniverseRow(m, labels[m.groupKey] ?? m.groupKey) : null;
  };
  const meeraByGroup = new Map<string, { name: string; row: UniverseRow | null }>();
  const meeraByView = new Map<string, { name: string; row: UniverseRow | null }>();
  for (const f of meera) {
    const row = rowOf(f.schemeCode);
    const group = row?.group ?? f.peerKey;
    const entry = { name: f.schemeName.replace(/\s*-\s*Direct.*$/i, "").replace(/\s+Fund$/i, ""), row };
    if (group) meeraByGroup.set(group, entry);
    if (f.viewId) meeraByView.set(f.viewId, entry);
  }

  // Funds outside the nightly Explore data: compute returns live from their NAV history.
  const live = await mapLimit(
    matches.filter((x) => x.m && !rowOf(x.m.compare.schemeCode)),
    6,
    async (x) => ({ code: x.m!.compare.schemeCode, metrics: computeFundMetrics((await fetchSchemeHistory(x.m!.compare.schemeCode)).series, asOf) }),
  );
  const liveOf = (code: number) => live.flatMap((r) => (r.status === "fulfilled" && r.value.code === code ? [r.value.metrics] : []))[0] ?? null;

  const funds: FundVerdict[] = [];
  const unmatched: string[] = [];
  for (const { h, m } of matches) {
    if (!m) {
      unmatched.push(h.name);
      continue;
    }
    const row = rowOf(m.compare.schemeCode);
    const lm = row ? null : liveOf(m.compare.schemeCode);
    const ruleGroup = row?.group ?? suggestPeerRule(m.compare.category, m.compare.schemeName)?.key ?? null;
    const g = ruleGroup ? groups.find((x) => x.groupKey === ruleGroup) : undefined;
    const r1 = row?.r1 ?? (lm?.returns["1Y"].total != null ? Math.round(lm.returns["1Y"].total * 100) / 100 : null);
    const r3 = row?.r3 ?? (lm?.returns["3Y"].annualised != null ? Math.round(lm.returns["3Y"].annualised * 100) / 100 : null);
    const catR3 = g?.data.medians.r3 != null ? Math.round(g.data.medians.r3 * 100) / 100 : null;
    const standing = standingOf(row, r3, catR3);
    const groupLabel = ruleGroup ? (labels[ruleGroup] ?? discoveryGroup(ruleGroup)?.plain ?? null) : null;
    const asset = row?.assetClass ?? (ruleGroup ? (discoveryGroup(ruleGroup)?.assetClass ?? assetOf(m.compare.category)) : assetOf(m.compare.category));

    let words = STANDING_WORDS[standing];
    if (r3 !== null && catR3 !== null) {
      words += ` — ${r3.toFixed(2)}% a year over 3 years vs ${catR3.toFixed(2)}% for the middle similar fund`;
      // The label also weighs consistency, falls and swings, so say so when return alone points the other way.
      if (standing === "mixed" && r3 >= catR3) words += ", but less steady than most (consistency, falls or swings)";
      if ((standing === "strong" || standing === "good") && r3 < catR3) words += ", with steadier results than most";
      words += ".";
    }
    else if (r3 !== null) words += ` — ${r3.toFixed(2)}% a year over 3 years.`;
    else if (r1 !== null) words += ` — ${r1.toFixed(2)}% over the last year.`;

    let forMeera: FundVerdict["forMeera"];
    const sameGroup = ruleGroup ? meeraByGroup.get(ruleGroup) : undefined;
    const view = ruleGroup ? suggestView(ruleGroup) : undefined;
    const mine = sameGroup ?? (view ? meeraByView.get(view) : undefined);
    const owned = meera.find((f) => f.schemeCode === m.compare.schemeCode || f.schemeCode === m.scheme.schemeCode);
    if (owned) {
      forMeera = { kind: "owned", text: "✅ Meera already holds this exact fund." };
    } else if (standing === "new" || standing === "unknown") {
      forMeera = { kind: "unknown", text: "⏳ Too little history to compare yet." };
    } else if (mine) {
      const theirs = row?.score ?? null;
      const hers = mine.row?.score ?? null;
      forMeera =
        sameGroup && theirs !== null && hers !== null && theirs - hers >= 10 && (standing === "strong" || standing === "good")
          ? { kind: "stronger", text: `🔁 Same kind as Meera's ${mine.name}, with a stronger record — worth researching as an alternative.` }
          : { kind: "similar", text: `🟰 Meera already has a fund of this kind (${mine.name}) — no need to add it.` };
    } else {
      forMeera =
        standing === "strong" || standing === "good"
          ? { kind: "adds", text: `➕ Adds something Meera doesn't have${groupLabel ? `: ${groupLabel.replace(/\s*\(.*?\)/g, "").toLowerCase()}` : ""} — worth researching.` }
          : { kind: "skip", text: "➖ Not a standout in its category — probably not needed." };
    }

    funds.push({
      name: h.name,
      value: h.value,
      matched: { schemeCode: m.scheme.schemeCode, schemeName: m.scheme.schemeName, amc: m.scheme.amc, category: m.scheme.category.split(" - ").slice(1).join(" - ") || m.scheme.category, plan: m.plan },
      group: ruleGroup,
      groupLabel,
      assetClass: asset,
      r1,
      r3,
      categoryR3: catR3,
      standing,
      words,
      forMeera,
    });
  }

  // Mix: by value when every matched fund has an amount, otherwise by number of funds.
  const byValue = funds.length > 0 && funds.every((f) => f.value !== null);
  const total = byValue ? funds.reduce((s, f) => s + (f.value ?? 0), 0) : funds.length;
  const mixMap = new Map<string, number>();
  for (const f of funds) mixMap.set(ASSET_WORDS[f.assetClass], (mixMap.get(ASSET_WORDS[f.assetClass]) ?? 0) + (byValue ? (f.value ?? 0) : 1));
  const mix = [...mixMap.entries()].map(([label, v]) => ({ label, share: total ? Math.round((v / total) * 100) : 0 })).sort((a, b) => b.share - a.share);

  const count = (s: Standing[]) => funds.filter((f) => s.includes(f.standing)).length;
  const summary: string[] = [];
  if (funds.length) {
    summary.push(`${funds.length} fund${funds.length === 1 ? "" : "s"} found${mix[0] ? `, mostly in ${mix[0].label} (${mix[0].share}% ${byValue ? "of the money" : "of the funds"})` : ""}.`);
    summary.push(`${count(["strong", "good"])} with strong or good long-term records, ${count(["mixed"])} mixed, ${count(["new", "unknown"])} too new or without enough data.`);
    const overlap = funds.filter((f) => f.forMeera.kind === "similar" || f.forMeera.kind === "stronger" || f.forMeera.kind === "owned").length;
    if (overlap) summary.push(`${overlap} overlap${overlap === 1 ? "s" : ""} with the kinds of funds Meera already holds.`);
  }
  const worthALook = funds.filter((f) => f.forMeera.kind === "adds" || f.forMeera.kind === "stronger").map((f) => f.matched!.schemeName.replace(/\s*-\s*(Direct|Regular).*$/i, ""));

  return {
    read: { found: holdings.length, matched: funds.length, dropped, source },
    funds,
    unmatched,
    summary,
    mix,
    worthALook: [...new Set(worthALook)].slice(0, 4),
  };
}

