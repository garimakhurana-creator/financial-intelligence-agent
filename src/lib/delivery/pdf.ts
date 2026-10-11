import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import { VIEWS } from "@/lib/catalog";
import { WINDOWS, type WindowKey } from "@/lib/calc/returns";
import { formatHuman } from "@/lib/dates";
import type { StoredWeeklyReport } from "@/lib/report/build";

// The weekly report as a downloadable PDF, in the brief's order: three sentences per fund, the
// market, then the closing overall assessment. Uses the PDF standard fonts (no font files), so
// text is limited to the Windows-1252 character set; anything outside it is substituted.

const PAGE = { w: 595.28, h: 841.89, margin: 50 };
const INK = rgb(0.09, 0.09, 0.11);
const MUTED = rgb(0.42, 0.42, 0.46);
const BRAND = rgb(0.06, 0.46, 0.43);
const LABEL_COLOR: Record<string, ReturnType<typeof rgb>> = {
  "No action needed": rgb(0.12, 0.48, 0.3),
  "One fund worth watching": rgb(0.63, 0.36, 0),
  "Consider reviewing your allocation": rgb(0.71, 0.14, 0.09),
};

const CP1252_EXTRA = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";
const SUBSTITUTE: Record<string, string> = { "₹": "Rs ", "→": "->", "←": "<-", "−": "-", "≈": "~", "≥": ">=", "≤": "<=", "×": "x" };

/** Make text safe for the standard PDF fonts. */
export function pdfSafe(s: string): string {
  let out = "";
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (c === 10 || (c >= 32 && c < 127) || (c >= 160 && c <= 255) || CP1252_EXTRA.includes(ch)) out += ch;
    else if (SUBSTITUTE[ch]) out += SUBSTITUTE[ch];
  }
  return out.replace(/ {2,}/g, " ");
}

const shortName = (n: string) => n.replace(/\s*-\s*Direct Plan.*$/i, "").trim();
const pct = (n: number | null | undefined) => (n === null || n === undefined ? "n/a" : `${n > 0 ? "+" : ""}${n.toFixed(2)}%`);
const WINDOW_LABEL: Record<WindowKey, string> = { "1W": "Week", "1M": "Month", YTD: "This year" };

class Writer {
  page: PDFPage;
  y: number;
  constructor(
    private doc: PDFDocument,
    private regular: PDFFont,
    private bold: PDFFont,
  ) {
    this.page = doc.addPage([PAGE.w, PAGE.h]);
    this.y = PAGE.h - PAGE.margin;
  }
  private ensure(h: number) {
    if (this.y - h < PAGE.margin) {
      this.page = this.doc.addPage([PAGE.w, PAGE.h]);
      this.y = PAGE.h - PAGE.margin;
    }
  }
  private wrap(text: string, font: PDFFont, size: number, width: number): string[] {
    const lines: string[] = [];
    for (const para of pdfSafe(text).split("\n")) {
      let line = "";
      for (const word of para.split(" ")) {
        const next = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(next, size) > width && line) {
          lines.push(line);
          line = word;
        } else line = next;
      }
      lines.push(line);
    }
    return lines;
  }
  text(text: string, opts: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; gap?: number; indent?: number } = {}) {
    const size = opts.size ?? 10.5;
    const font = opts.bold ? this.bold : this.regular;
    const indent = opts.indent ?? 0;
    const lineH = size * 1.4;
    for (const line of this.wrap(text, font, size, PAGE.w - PAGE.margin * 2 - indent)) {
      this.ensure(lineH);
      this.page.drawText(line, { x: PAGE.margin + indent, y: this.y - size, size, font, color: opts.color ?? INK });
      this.y -= lineH;
    }
    this.y -= opts.gap ?? 4;
  }
  rule() {
    this.ensure(14);
    this.page.drawLine({ start: { x: PAGE.margin, y: this.y - 4 }, end: { x: PAGE.w - PAGE.margin, y: this.y - 4 }, thickness: 0.6, color: rgb(0.85, 0.84, 0.8) });
    this.y -= 14;
  }
  space(h: number) {
    this.y -= h;
  }
}

export async function renderReportPdf(report: StoredWeeklyReport, reportUrl: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const p = report.report;
  const out = p.output;
  const name = report.inputSnapshot.investorName;
  doc.setTitle(`Weekly fund report - week ending ${formatHuman(report.weekEnding)}`);
  doc.setAuthor(`${name}'s Money`);

  const w = new Writer(doc, regular, bold);
  w.text(`${name}'s weekly fund report`, { size: 20, bold: true, color: BRAND, gap: 2 });
  w.text(`Week ending ${formatHuman(report.weekEnding)}`, { size: 11, color: MUTED, gap: 10 });
  w.rule();

  w.text("How each fund did", { size: 14, bold: true, gap: 8 });
  for (const f of out.funds) {
    const perf = p.funds.find((x) => x.schemeCode === f.schemeCode);
    w.text(shortName(perf?.schemeName ?? String(f.schemeCode)), { size: 12, bold: true, gap: 3 });
    w.text(f.performance, { gap: 2 });
    w.text(f.comparison, { gap: 2 });
    w.text(f.marketContext, { gap: 4 });
    if (perf) {
      const nums = WINDOWS.map((k) => {
        const c = perf.windows[k];
        return `${WINDOW_LABEL[k]}: fund ${pct(c.fund.returnPct)}, ${perf.benchmark ? `index ${pct(c.benchmark?.returnPct)}, ` : ""}similar funds ${pct(c.peer?.mean)}`;
      }).join("  |  ");
      w.text(nums, { size: 8.5, color: MUTED, gap: 12 });
    }
  }

  w.rule();
  w.text("The market this week", { size: 14, bold: true, gap: 6 });
  w.text(out.marketSummary.text, { gap: 10 });

  w.text("By kind of fund", { size: 14, bold: true, gap: 6 });
  for (const c of out.categories) {
    const title = VIEWS[c.viewId].title;
    w.text(c.headline.trim().toLowerCase() === title.toLowerCase() ? title : `${title}: ${c.headline}`, { bold: true, size: 10.5, gap: 2 });
    w.text(c.summary, { gap: 8 });
  }

  w.rule();
  w.text("Overall assessment", { size: 14, bold: true, gap: 6 });
  w.text(out.assessment.label, { size: 16, bold: true, color: LABEL_COLOR[out.assessment.label] ?? INK, gap: 4 });
  w.text(out.assessment.reason, { size: 11.5, gap: 14 });

  w.space(6);
  w.text(`Full report with sources: ${reportUrl}`, { size: 9, color: MUTED, gap: 2 });
  w.text(
    "Returns are point-to-point from published NAVs. Index comparisons use price indices; similar funds = equal-weighted average of comparable Direct-Growth funds. Past performance does not guarantee future returns. This is a monitoring summary, not investment advice.",
    { size: 8.5, color: MUTED },
  );
  return doc.save();
}
