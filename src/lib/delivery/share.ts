import { formatHuman } from "@/lib/dates";
import type { StoredWeeklyReport } from "@/lib/report/build";

// WhatsApp click-to-chat ("wa.me") links. This is a one-tap manual share, not automated delivery:
// it opens WhatsApp with the summary pre-filled and the user presses Send. Automated WhatsApp
// delivery uses the official Business Cloud API (channels.ts) once Meta approves the template.

const fmt = (n: number | null | undefined) => (n === null || n === undefined ? "n/a" : `${n > 0 ? "+" : ""}${n.toFixed(2)}%`);

export function whatsappShareText(report: StoredWeeklyReport, reportUrl: string): string {
  const out = report.report.output;
  const lines = report.report.funds.map((f) => {
    const name = f.schemeName.replace(/\s*-\s*Direct Plan.*$/i, "");
    return `• ${name}: ${fmt(f.windows["1W"]?.fund.returnPct)} this week, ${fmt(f.windows["YTD"]?.fund.returnPct)} YTD`;
  });
  return [
    `*Weekly fund report — week ending ${formatHuman(report.weekEnding)}*`,
    `Overall: *${out.assessment.label}*`,
    out.assessment.reason,
    "",
    ...lines,
    "",
    `Full report with sources: ${reportUrl}`,
  ].join("\n");
}

/** Normalise "+91 70157 57859", "<+917015757859>" etc. to digits only (wa.me format). */
export function waNumber(raw: string | undefined | null): string | null {
  const digits = (raw ?? "").replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15 ? digits : null;
}

/**
 * wa.me link. With a number it opens that chat directly; without one, WhatsApp asks which chat to
 * share into — used on public pages so the owner's phone number is never exposed.
 */
export function whatsappShareLink(text: string, number?: string | null): string {
  const n = waNumber(number);
  return `https://wa.me/${n ?? ""}?text=${encodeURIComponent(text)}`;
}
