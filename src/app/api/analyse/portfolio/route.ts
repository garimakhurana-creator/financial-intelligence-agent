import { clientIp, rateLimit } from "@/lib/auth";
import { handle, json } from "@/lib/api";
import { pdfText } from "@/lib/analysis/document";
import { analysePortfolio, readHoldings } from "@/lib/analysis/portfolio";
import { FundInputError } from "@/lib/pipeline/funds";

export const maxDuration = 120;

const MAX_BYTES = 4 * 1024 * 1024;
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];

/**
 * Analyse someone else's portfolio. multipart/form-data with either
 *   file — a statement as PDF, a screenshot (PNG/JPEG/WebP) or a CSV/TXT list (≤ 4 MB), or
 *   text — a pasted list of fund names.
 * Nothing is stored: the file is read in memory and only the analysis is returned.
 */
export async function POST(req: Request) {
  if (!rateLimit(`portfolio:${clientIp(req)}`, 10, 60 * 60_000)) return json({ error: "That's 10 portfolios this hour — please try again later." }, 429);
  return handle(async () => {
    if (Number(req.headers.get("content-length") ?? 0) > MAX_BYTES + 64 * 1024) return json({ error: "That file is larger than 4 MB." }, 413);
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      throw new FundInputError("Send a file or a pasted list of funds.");
    }
    const file = form.get("file");
    const pasted = String(form.get("text") ?? "").trim();
    let text: string | null = null;
    let image: { mimeType: string; base64: string } | null = null;

    if (file instanceof File && file.size > 0) {
      if (file.size > MAX_BYTES) throw new FundInputError("That file is larger than 4 MB.");
      const bytes = new Uint8Array(await file.arrayBuffer());
      const type = file.type || "";
      const isPdf = String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-";
      if (isPdf) {
        try {
          text = (await pdfText(bytes)).text;
        } catch {
          throw new FundInputError("This PDF could not be read — it may be password-protected. Download an unlocked copy, or upload a screenshot instead.");
        }
        if (text.replace(/\s+/g, "").length < 30) throw new FundInputError("This PDF has no readable text (it may be a scan). Upload a screenshot of the holdings instead.");
      } else if (IMAGE_TYPES.includes(type)) {
        image = { mimeType: type, base64: Buffer.from(bytes).toString("base64") };
      } else if (/text\/|csv/.test(type) || /\.(csv|txt)$/i.test(file.name)) {
        text = new TextDecoder().decode(bytes);
      } else {
        throw new FundInputError("Upload a PDF statement, a screenshot (PNG or JPG), or a CSV/text list.");
      }
    } else if (pasted.length >= 5) {
      text = pasted.slice(0, 20_000);
    } else {
      throw new FundInputError("Upload a statement or paste the fund names.");
    }

    const read = await readHoldings({ text, image });
    if (read.holdings.length === 0) {
      throw new FundInputError(
        read.dropped > 0 ? "No fund names could be confirmed in that document." : "No mutual funds were found in that document. Try a clearer screenshot, or paste the fund names.",
      );
    }
    return json(await analysePortfolio(read.holdings, read.source, read.dropped));
  });
}
