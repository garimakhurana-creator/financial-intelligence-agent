import { adminRoute, json } from "@/lib/api";
import { DocumentError, extractFactsheet, MAX_UPLOAD_BYTES, validatePdf } from "@/lib/analysis/document";
import { runAnalysis } from "@/lib/analysis/analyse";
import { FundInputError } from "@/lib/pipeline/funds";
import { parseSchemeCode, SchemeNotFoundError } from "@/lib/sources/mfapi";

export const maxDuration = 300;

/**
 * Run and save a fund analysis. multipart/form-data with:
 *   schemeCode (optional) — resolved against MFapi
 *   file (optional)       — PDF factsheet ≤ 4 MB; never stored, only its extracted facts + hash
 *   source                — "search" | "code" | "pdf"
 */
export const POST = adminRoute(async (req: Request) => {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_UPLOAD_BYTES + 64 * 1024) return json({ error: "That file is larger than 4 MB." }, 413);
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new FundInputError("Send the request as a form with a scheme code and/or a PDF file.");
  }
  const rawCode = String(form.get("schemeCode") ?? "").trim();
  const schemeCode = rawCode ? parseSchemeCode(rawCode) : null;
  if (rawCode && !schemeCode) throw new FundInputError("Scheme codes are 3–7 digit numbers.");
  const file = form.get("file");
  const source = String(form.get("source") ?? (file ? "pdf" : "code"));
  if (!schemeCode && !(file instanceof File)) throw new FundInputError("Choose a fund or upload a factsheet PDF.");

  let document = null;
  if (file instanceof File) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    try {
      validatePdf(bytes, file.type || null, file.size);
    } catch (e) {
      if (e instanceof DocumentError) throw new FundInputError(e.message);
      throw e;
    }
    document = await extractFactsheet(bytes, file.name || "factsheet.pdf");
  }
  try {
    const r = await runAnalysis({ schemeCode, document, sourceType: source === "search" ? "search" : source === "pdf" ? "pdf" : "code" });
    return json({ id: r.id, outcome: r.facts.outcome, generator: r.generator }, 201);
  } catch (e) {
    if (e instanceof SchemeNotFoundError) throw new FundInputError(`No mutual fund scheme found for code ${schemeCode}.`);
    throw e;
  }
});
