import { VIEWS } from "@/lib/catalog";
import { WINDOWS, type WindowKey } from "@/lib/calc/returns";
import { formatHuman } from "@/lib/dates";
import type { StoredWeeklyReport } from "@/lib/report/build";

// Email rendering: table-based HTML with inline styles (email clients ignore <style> blocks and
// external CSS), plus a plain-text alternative. All dynamic text is HTML-escaped.

export function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const pct = (n: number | null | undefined) => (n === null || n === undefined ? "—" : `${n > 0 ? "+" : ""}${n.toFixed(2)}%`);
const WINDOW_LABEL: Record<WindowKey, string> = { "1W": "Week", "1M": "Month", YTD: "Year to date" };
const LABEL_COLOR: Record<string, string> = {
  "No action needed": "#1f7a4d",
  "One fund worth watching": "#a15c00",
  "Consider reviewing your allocation": "#b42318",
};

const shortName = (n: string) => n.replace(/\s*-\s*Direct Plan.*$/i, "").trim();

export function renderEmail(report: StoredWeeklyReport, reportUrl: string, opts: { isTest: boolean }) {
  const p = report.report;
  const out = p.output;
  const week = formatHuman(report.weekEnding);
  const subject = `${opts.isTest ? "[TEST] " : ""}Your fund report — week ending ${week}: ${out.assessment.label}`;
  const color = LABEL_COLOR[out.assessment.label] ?? "#1a1a1a";

  const fundBlocks = out.funds
    .map((f) => {
      const perf = p.funds.find((x) => x.schemeCode === f.schemeCode);
      const rows = WINDOWS.map((w) => {
        const c = perf?.windows[w];
        return `<tr>
          <td style="padding:4px 8px;color:#555">${WINDOW_LABEL[w]}</td>
          <td style="padding:4px 8px;text-align:right;font-weight:600">${pct(c?.fund.returnPct)}</td>
          <td style="padding:4px 8px;text-align:right;color:#555">${pct(c?.benchmark?.returnPct)}</td>
          <td style="padding:4px 8px;text-align:right;color:#555">${pct(c?.peer?.mean)}</td>
        </tr>`;
      }).join("");
      return `<div style="border:1px solid #e6e2da;border-radius:10px;padding:16px;margin:0 0 14px">
        <div style="font-size:16px;font-weight:700;color:#1a1a1a">${esc(shortName(perf?.schemeName ?? String(f.schemeCode)))}</div>
        <div style="font-size:12px;color:#777;margin:2px 0 10px">NAV ₹${perf?.nav?.value.toFixed(4) ?? "—"} on ${perf?.nav ? formatHuman(perf.nav.date) : "—"}</div>
        <p style="margin:0 0 6px;line-height:1.5">${esc(f.performance)}</p>
        <p style="margin:0 0 6px;line-height:1.5">${esc(f.comparison)}</p>
        <p style="margin:0 0 10px;line-height:1.5">${esc(f.marketContext)}</p>
        <table style="border-collapse:collapse;font-size:13px;width:100%">
          <tr style="color:#777;font-size:11px;text-transform:uppercase">
            <td style="padding:4px 8px"></td><td style="padding:4px 8px;text-align:right">Fund</td>
            <td style="padding:4px 8px;text-align:right">${esc(perf?.benchmark?.name ?? "Benchmark")}</td>
            <td style="padding:4px 8px;text-align:right">Peer avg</td>
          </tr>${rows}
        </table>
      </div>`;
    })
    .join("");

  const categories = out.categories
    .map((c) => `<li style="margin:0 0 8px"><strong>${esc(VIEWS[c.viewId].title)}:</strong> ${esc(c.headline)}</li>`)
    .join("");

  const html = `<!doctype html><html><body style="margin:0;background:#f7f5f0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a">
  <div style="max-width:640px;margin:0 auto;padding:24px 16px">
    ${opts.isTest ? `<div style="background:#fff4d6;border:1px solid #f0d58a;padding:8px 12px;border-radius:8px;font-size:13px;margin-bottom:12px">Test send — not the scheduled Saturday report.</div>` : ""}
    <div style="font-size:13px;color:#777">Weekly fund report · week ending ${week}</div>
    <h1 style="font-size:22px;margin:6px 0 16px">Hi ${esc(report.inputSnapshot.investorName)}, here is your week.</h1>
    <div style="background:#fff;border-left:4px solid ${color};border-radius:8px;padding:14px 16px;margin-bottom:18px">
      <div style="font-size:18px;font-weight:700;color:${color}">${esc(out.assessment.label)}</div>
      <p style="margin:6px 0 0;line-height:1.5">${esc(out.assessment.reason)}</p>
    </div>
    <h2 style="font-size:16px;margin:0 0 10px">Your funds</h2>
    ${fundBlocks}
    <h2 style="font-size:16px;margin:18px 0 8px">The market this week</h2>
    <p style="line-height:1.5;margin:0 0 12px">${esc(out.marketSummary.text)}</p>
    <ul style="padding-left:18px;margin:0 0 18px;line-height:1.5">${categories}</ul>
    <a href="${esc(reportUrl)}" style="display:inline-block;background:#1a1a1a;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:600">Read the full report with sources</a>
    <p style="font-size:11px;color:#888;line-height:1.5;margin-top:22px">
      Returns are point-to-point from published NAVs (${esc(p.meta.generator === "gemini" ? `summary written by ${p.meta.model}` : "automated summary")}).
      Benchmarks are price indices; funds' stated benchmarks are total-return indices. Peer averages are equal-weighted across Direct-Growth plans in the same AMFI category.
      Past performance does not guarantee future returns. This is a monitoring summary, not investment advice.
    </p>
  </div></body></html>`;

  const text = [
    opts.isTest ? "[TEST SEND — not the scheduled report]\n" : "",
    `Weekly fund report — week ending ${week}`,
    "",
    `OVERALL: ${out.assessment.label}`,
    out.assessment.reason,
    "",
    ...out.funds.flatMap((f) => {
      const perf = p.funds.find((x) => x.schemeCode === f.schemeCode);
      return [
        shortName(perf?.schemeName ?? String(f.schemeCode)).toUpperCase(),
        f.performance,
        f.comparison,
        f.marketContext,
        WINDOWS.map((w) => `${WINDOW_LABEL[w]}: fund ${pct(perf?.windows[w].fund.returnPct)}, benchmark ${pct(perf?.windows[w].benchmark?.returnPct)}, peers ${pct(perf?.windows[w].peer?.mean)}`).join(" | "),
        "",
      ];
    }),
    "MARKET",
    out.marketSummary.text,
    "",
    `Full report with sources: ${reportUrl}`,
    "",
    "Past performance does not guarantee future returns. Monitoring summary, not investment advice.",
  ].join("\n");

  return { subject, html, text };
}

export function maskEmail(e: string): string {
  const [u, d] = e.split("@");
  return d ? `${u.slice(0, 2)}***@${d}` : "***";
}

export function maskPhone(p: string): string {
  return p.length > 4 ? `${"*".repeat(Math.max(0, p.length - 4))}${p.slice(-4)}` : "****";
}
