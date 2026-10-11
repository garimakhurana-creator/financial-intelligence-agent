import { createHash } from "node:crypto";
import { z } from "zod";
import { generateJson } from "@/lib/ai/gemini";
import { errorMessage } from "@/lib/log";

// Factsheet extraction. Gemini reads the PDF, but every field must come with a short verbatim
// quote; we then check that quote against the PDF's own text layer (extracted with unpdf) and
// that the extracted number appears inside the quote. Unverifiable fields are kept but flagged,
// and never used in calculations.

export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // Vercel request bodies are capped at 4.5 MB.

export class DocumentError extends Error {}

export function validatePdf(bytes: Uint8Array, declaredType: string | null, size: number) {
  if (size > MAX_UPLOAD_BYTES) throw new DocumentError(`File is ${(size / 1048576).toFixed(1)} MB — the limit is 4 MB. Try the single-scheme factsheet rather than the full AMC factsheet.`);
  if (size < 500) throw new DocumentError("That file is too small to be a factsheet.");
  const magic = String.fromCharCode(...bytes.slice(0, 5));
  if (magic !== "%PDF-") throw new DocumentError("Only PDF files are supported (the file does not start with a PDF header).");
  if (declaredType && declaredType !== "application/pdf" && declaredType !== "application/octet-stream") {
    throw new DocumentError(`Expected a PDF, got ${declaredType}.`);
  }
}

export async function pdfText(bytes: Uint8Array): Promise<{ text: string; pages: number }> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { totalPages, text } = await extractText(pdf, { mergePages: true });
  return { text: text as string, pages: totalPages };
}

const Field = z.object({ value: z.string().nullable(), quote: z.string().nullable() });
const NumField = z.object({ value: z.number().nullable(), quote: z.string().nullable() });

export const Extracted = z.object({
  fundName: Field,
  amc: Field,
  schemeCategory: Field,
  benchmark: Field,
  riskometer: Field,
  inceptionDate: Field,
  fundManagers: Field,
  expenseRatioDirect: NumField,
  expenseRatioRegular: NumField,
  aumCrore: NumField,
  minSip: NumField,
  exitLoad: Field,
  portfolioDate: Field,
  returns: z.array(z.object({ period: z.string(), fund: z.number().nullable(), benchmark: z.number().nullable(), quote: z.string().nullable() })).max(10),
  topHoldings: z.array(z.object({ name: z.string(), weightPct: z.number().nullable(), quote: z.string().nullable() })).max(15),
  sectors: z.array(z.object({ name: z.string(), weightPct: z.number().nullable(), quote: z.string().nullable() })).max(15),
});
export type Extracted = z.infer<typeof Extracted>;

const f = { type: "object", properties: { value: { type: ["string", "null"] }, quote: { type: ["string", "null"] } }, required: ["value", "quote"] };
const nf = { type: "object", properties: { value: { type: ["number", "null"] }, quote: { type: ["string", "null"] } }, required: ["value", "quote"] };
const row = (extra: Record<string, unknown>, req: string[]) => ({ type: "array", items: { type: "object", properties: { ...extra, quote: { type: ["string", "null"] } }, required: [...req, "quote"] } });

const EXTRACT_SCHEMA = {
  type: "object",
  properties: {
    fundName: f, amc: f, schemeCategory: f, benchmark: f, riskometer: f, inceptionDate: f, fundManagers: f,
    expenseRatioDirect: nf, expenseRatioRegular: nf, aumCrore: nf, minSip: nf, exitLoad: f, portfolioDate: f,
    returns: row({ period: { type: "string" }, fund: { type: ["number", "null"] }, benchmark: { type: ["number", "null"] } }, ["period", "fund", "benchmark"]),
    topHoldings: row({ name: { type: "string" }, weightPct: { type: ["number", "null"] } }, ["name", "weightPct"]),
    sectors: row({ name: { type: "string" }, weightPct: { type: ["number", "null"] } }, ["name", "weightPct"]),
  },
  required: ["fundName", "amc", "schemeCategory", "benchmark", "riskometer", "inceptionDate", "fundManagers", "expenseRatioDirect", "expenseRatioRegular", "aumCrore", "minSip", "exitLoad", "portfolioDate", "returns", "topHoldings", "sectors"],
};

const EXTRACT_PROMPT = `Extract facts from this mutual fund factsheet for ONE scheme (the main scheme in the document; if it covers many schemes, use the first full scheme page).
Rules:
- Only extract what is printed in the document. If a field is not present, return value null and quote null. Never infer or calculate.
- For every non-null value, "quote" must be a short verbatim snippet (5–20 words) copied exactly from the document that contains the value.
- Percentages as plain numbers (e.g. 0.75 for 0.75%). AUM in crore rupees. minSip in rupees.
- returns: the fund's own performance table rows (e.g. "1 Year", "3 Years", "5 Years", "Since Inception"), Direct plan if both are shown, with the benchmark figure on the same row.
- topHoldings and sectors: up to 10 each, with portfolio weights.`;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9.%]+/g, " ").replace(/\s+/g, " ").trim();
const numsIn = (s: string) => (s.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);

export type Verified<T> = { value: T; quote: string | null; verified: boolean };

/** A quote is verified if it appears in the PDF text and contains the value's number(s). */
export function verifyQuote(quote: string | null, docText: string, value: unknown): boolean {
  if (!quote || !docText) return false;
  const q = norm(quote);
  if (q.length < 6 || !norm(docText).includes(q)) return false;
  if (typeof value === "number") return numsIn(quote).some((n) => Math.abs(n - value) < 1e-9);
  return true;
}

export interface DocumentFacts {
  file: { name: string; size: number; sha256: string; pages: number; textLayer: boolean };
  fields: Record<string, Verified<string | number | null>>;
  returns: Verified<{ period: string; fund: number | null; benchmark: number | null }>[];
  topHoldings: Verified<{ name: string; weightPct: number | null }>[];
  sectors: Verified<{ name: string; weightPct: number | null }>[];
  model: string | null;
  error?: string;
}

export async function extractFactsheet(bytes: Uint8Array, filename: string): Promise<DocumentFacts> {
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  let text = "";
  let pages = 0;
  try {
    const t = await pdfText(bytes);
    text = t.text;
    pages = t.pages;
  } catch {
    // Unreadable text layer — extraction still runs but nothing can be verified.
  }
  const file = { name: filename.slice(0, 120), size: bytes.length, sha256, pages, textLayer: text.replace(/\s/g, "").length > 200 };
  const empty: DocumentFacts = { file, fields: {}, returns: [], topHoldings: [], sectors: [], model: null };
  try {
    const { json, modelVersion } = await generateJson({
      system: "You extract structured data from financial documents exactly as printed. You never guess.",
      prompt: EXTRACT_PROMPT,
      schema: EXTRACT_SCHEMA,
      file: { mimeType: "application/pdf", base64: Buffer.from(bytes).toString("base64") },
      temperature: 0,
      timeoutMs: 120_000,
    });
    const p = Extracted.safeParse(json);
    if (!p.success) return { ...empty, error: "The document could not be read into the expected fields." };
    const e = p.data;
    const fields: DocumentFacts["fields"] = {};
    for (const k of ["fundName", "amc", "schemeCategory", "benchmark", "riskometer", "inceptionDate", "fundManagers", "exitLoad", "portfolioDate"] as const) {
      fields[k] = { value: e[k].value, quote: e[k].quote, verified: e[k].value !== null && verifyQuote(e[k].quote, text, e[k].value) };
    }
    for (const k of ["expenseRatioDirect", "expenseRatioRegular", "aumCrore", "minSip"] as const) {
      fields[k] = { value: e[k].value, quote: e[k].quote, verified: e[k].value !== null && verifyQuote(e[k].quote, text, e[k].value) };
    }
    return {
      file,
      fields,
      returns: e.returns.map((r) => ({ value: { period: r.period, fund: r.fund, benchmark: r.benchmark }, quote: r.quote, verified: r.fund !== null && verifyQuote(r.quote, text, r.fund) })),
      topHoldings: e.topHoldings.map((h) => ({ value: { name: h.name, weightPct: h.weightPct }, quote: h.quote, verified: h.weightPct !== null && verifyQuote(h.quote, text, h.weightPct) })),
      sectors: e.sectors.map((s) => ({ value: { name: s.name, weightPct: s.weightPct }, quote: s.quote, verified: s.weightPct !== null && verifyQuote(s.quote, text, s.weightPct) })),
      model: modelVersion,
    };
  } catch (err) {
    return { ...empty, error: `Document extraction failed: ${errorMessage(err)}` };
  }
}
