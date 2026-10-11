import { VIEW_IDS } from "@/lib/catalog";
import { ReportOutput, type ReportInput } from "@/lib/report/types";

/** Plain-language guard: the prompt asks for ≤ 40 words; we allow a little slack. */
export const MAX_SENTENCE_WORDS = 50;

/** Analyst words kept out of the headline reason Meera reads first. */
export const JARGON_RE = /\b(benchmarks?|peers?|peer group|underperform\w*|outperform\w*|YTD|basis points|allocation|volatility)\b/i;
export const MAX_REASON_WORDS = 45;

/** Phrases that would turn a monitoring report into a trade instruction. */
const ADVICE_RE = /\b(buy|sell|redeem|exit (?:the|this) fund|switch (?:out|to)|book profits?|stop (?:your|the) sip|increase (?:your|the) sip|invest more|guarantee[ds]?)\b/i;

/**
 * Count sentences. Decimal points ("0.43%") and common abbreviations are protected so they do not
 * end a sentence. A sentence ends with . ! or ? followed by whitespace or end of text.
 */
export function countSentences(text: string): number {
  const t = text
    .trim()
    .replace(/\b(e\.g|i\.e|vs|approx|etc|Rs|No|St|Mr|Ms|Dr|U\.S|U\.K|pp)\./gi, (m) => m.replace(/\./g, "§"))
    .replace(/(\d)\.(\d)/g, "$1§$2");
  if (!t) return 0;
  const parts = t.split(/[.!?]+(?:["')\]]*)(?:\s+|$)/).filter((p) => p.trim().length > 0);
  return parts.length;
}

/** All numeric tokens in a piece of text (commas removed, sign dropped) with their written precision. */
export function numberTokens(text: string): { value: number; decimals: number }[] {
  return (text.match(/\d[\d,]*(?:\.\d+)?/g) ?? [])
    .map((s) => {
      const clean = s.replace(/,/g, "");
      return { value: Number(clean), decimals: clean.includes(".") ? clean.split(".")[1].length : 0 };
    })
    .filter((t) => Number.isFinite(t.value));
}

export function numbersIn(text: string): number[] {
  return numberTokens(text).map((t) => t.value);
}

/** Every number the model is allowed to state: anything in the input snapshot, plus 1-dp roundings. */
export function allowedNumbers(input: ReportInput): Set<string> {
  const allowed = new Set<string>();
  const add = (n: number) => {
    const a = Math.abs(n);
    allowed.add(a.toFixed(2));
    allowed.add(a.toFixed(1));
    allowed.add(a.toFixed(0));
  };
  const walk = (v: unknown) => {
    if (typeof v === "number") add(v);
    else if (typeof v === "string") numbersIn(v).forEach(add);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(input);
  return allowed;
}

/**
 * A stated number is allowed if it equals an input number at the precision it was written:
 * "0.43" must match an input value that rounds to 0.43; "0.4" may be a 1-dp rounding of one.
 */
function isAllowedNumber(t: { value: number; decimals: number }, allowed: Set<string>): boolean {
  // Small integers (counts, days, "1 month") and calendar years are always fine.
  if (t.decimals === 0 && (t.value <= 31 || (t.value >= 1990 && t.value <= 2100))) return true;
  if (t.decimals > 2) return allowed.has(t.value.toFixed(2)) && Number(t.value.toFixed(2)) === t.value;
  return allowed.has(t.value.toFixed(t.decimals));
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  value?: ReportOutput;
}

export function validateReport(raw: unknown, input: ReportInput): ValidationResult {
  const parsed = ReportOutput.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.slice(0, 8).map((i) => `schema: ${i.path.join(".")} ${i.message}`) };
  }
  const out = parsed.data;
  const errors: string[] = [];
  const allowed = allowedNumbers(input);
  const evidence = new Set(input.news.map((n) => n.id));
  const fundCodes = input.funds.map((f) => f.schemeCode);

  // Exactly one summary per tracked fund, no extras.
  const got = out.funds.map((f) => f.schemeCode);
  for (const c of fundCodes) if (!got.includes(c)) errors.push(`missing summary for fund ${c}`);
  for (const c of got) if (!fundCodes.includes(c)) errors.push(`summary for unknown fund ${c}`);
  if (new Set(got).size !== got.length) errors.push("duplicate fund summaries");

  const checkText = (where: string, text: string) => {
    for (const n of numberTokens(text)) if (!isAllowedNumber(n, allowed)) errors.push(`${where}: number ${n.value} is not in the verified input`);
    if (ADVICE_RE.test(text)) errors.push(`${where}: contains a buy/sell-style instruction`);
  };
  const checkEvidence = (where: string, ids: string[]) => {
    for (const id of ids) if (!evidence.has(id)) errors.push(`${where}: unknown evidence id ${id}`);
  };

  for (const f of out.funds) {
    for (const k of ["performance", "comparison", "marketContext"] as const) {
      const n = countSentences(f[k]);
      if (n !== 1) errors.push(`fund ${f.schemeCode}.${k}: must be exactly one sentence (got ${n})`);
      const words = f[k].trim().split(/\s+/).length;
      if (words > MAX_SENTENCE_WORDS) errors.push(`fund ${f.schemeCode}.${k}: ${words} words — keep it under ${MAX_SENTENCE_WORDS} for a non-expert reader`);
      checkText(`fund ${f.schemeCode}.${k}`, f[k]);
      const j = JARGON_RE.exec(f[k]);
      if (j) errors.push(`fund ${f.schemeCode}.${k}: replace the jargon word "${j[0]}" with everyday words`);
    }
    checkEvidence(`fund ${f.schemeCode}`, f.evidenceIds);
  }

  const views = out.categories.map((c) => c.viewId);
  for (const v of VIEW_IDS) if (!views.includes(v)) errors.push(`missing category view ${v}`);
  if (new Set(views).size !== views.length) errors.push("duplicate category views");
  for (const c of out.categories) {
    checkText(`category ${c.viewId}`, [c.headline, c.summary, ...c.watchItems].join(" "));
    checkEvidence(`category ${c.viewId}`, c.evidenceIds);
  }
  checkText("marketSummary", out.marketSummary.text);
  checkEvidence("marketSummary", out.marketSummary.evidenceIds);

  const a = out.assessment;
  checkText("assessment", a.reason);
  const jargon = JARGON_RE.exec(a.reason);
  if (jargon) errors.push(`assessment.reason: replace the jargon word "${jargon[0]}" with everyday words`);
  const reasonWords = a.reason.trim().split(/\s+/).length;
  if (reasonWords > MAX_REASON_WORDS) errors.push(`assessment.reason: ${reasonWords} words — keep it under ${MAX_REASON_WORDS}`);
  if (a.label === "One fund worth watching") {
    if (a.fundOfConcern === null || !fundCodes.includes(a.fundOfConcern)) errors.push("assessment: 'One fund worth watching' must name a tracked fund in fundOfConcern");
  } else if (a.fundOfConcern !== null && !fundCodes.includes(a.fundOfConcern)) {
    errors.push("assessment: fundOfConcern is not a tracked fund");
  }

  return errors.length ? { ok: false, errors } : { ok: true, errors: [], value: out };
}
