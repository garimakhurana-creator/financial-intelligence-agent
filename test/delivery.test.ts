import { describe, expect, it } from "vitest";
import { renderTelegram, templateText } from "@/lib/delivery/channels";
import { cleanTitle } from "@/lib/news/art";
import { esc, maskEmail, maskPhone, renderEmail } from "@/lib/delivery/render";
import { parseYahooChart } from "@/lib/sources/yahoo";
import type { StoredWeeklyReport } from "@/lib/report/build";

function fakeReport(n = 5, sentence = "A plain sentence about the fund."): StoredWeeklyReport {
  const funds = Array.from({ length: n }, (_, i) => ({ schemeCode: 100 + i, performance: sentence, comparison: sentence, marketContext: sentence, evidenceIds: [] }));
  return {
    id: "r1",
    weekEnding: "2026-10-09",
    kind: "manual",
    assessment: "No action needed",
    assessmentReason: "Nothing persistent.",
    generator: "gemini",
    model: "m",
    createdAt: "2026-10-11T00:00:00Z",
    inputSnapshot: {
      investorName: "Meera <script>",
      funds: funds.map((f, i) => ({ schemeCode: f.schemeCode, screening: { flag: i === 0, reason: "x" } })),
      screening: { suggestedLabel: "No action needed", rationale: "", notes: { marketDip: [], yearLag: [] } },
    } as never,
    report: {
      output: {
        funds,
        categories: [],
        marketSummary: { text: "Markets were mixed.", evidenceIds: [] },
        assessment: { label: "No action needed", reason: "Nothing persistent <b>.", fundOfConcern: null },
      },
      funds: funds.map((f, i) => ({
        schemeCode: f.schemeCode,
        schemeName: `Fund ${f.schemeCode} - Direct Plan - Growth`,
        viewId: "mid_cap",
        windows: Object.fromEntries(["1W", "1M", "YTD"].map((w) => [w, { fund: { returnPct: i - 1 }, benchmark: null, peer: { mean: 0 }, vsBenchmarkPp: null, vsPeerPp: i - 1 }])),
      })) as never,
      indices: [],
      breadth: null,
      news: [],
      meta: { generator: "gemini", model: "m", attempts: 1, validationErrors: [], newsErrors: [], generatedAt: "", dataAsOf: "2026-10-11" },
    },
  };
}

describe("email rendering", () => {
  it("escapes model and user text in HTML", () => {
    const { html, subject, text } = renderEmail(fakeReport(1), "https://x.test/reports/r1", { isTest: true });
    expect(html).toContain("Meera &lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).toContain("Nothing persistent &lt;b&gt;.");
    expect(subject.startsWith("[TEST]")).toBe(true);
    expect(text).toContain("https://x.test/reports/r1");
  });
  it("escapes all HTML-significant characters", () => {
    expect(esc(`<a href="x">'&`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;");
  });
});

describe("telegram rendering", () => {
  it("leads with insights and headlines, not the long per-fund sentences, and stays under the limit", () => {
    const long = "x".repeat(1200) + ".";
    const r = fakeReport(5, long);
    (r.report.news as unknown[]).push({ evidenceId: "N1", title: "RBI raises repo rate to 5.50% - The Economic Times", url: "https://e.test/a", publisher: "economictimes.com" });
    r.report.output.funds[0].evidenceIds = ["N1"];
    const w0 = (r.report.funds[0] as unknown as { windows: Record<string, { vsPeerPp: number; fund: { returnPct: number } }> }).windows;
    w0["1M"] = { ...w0["1M"], vsPeerPp: -2 };
    w0.YTD = { ...w0.YTD, vsPeerPp: -4 };
    const msg = renderTelegram(r, "https://x.test/reports/r1", { isTest: false });
    expect(msg.length).toBeLessThanOrEqual(4096);
    expect(msg).toMatch(/Key insights/);
    expect(msg).toMatch(/👀 <b>Fund 100<\/b> is behind similar funds/); // flagged fund named in the insights
    expect(msg).toMatch(/In the news/);
    expect(msg).toContain('<a href="https://e.test/a">RBI raises repo rate to 5.50%</a>');
    expect(msg).toContain('href="https://x.test/reports/r1"');
    expect(msg).not.toContain("x".repeat(50)); // the long per-fund sentences live in the PDF
  });
  it("escapes HTML and labels test sends", () => {
    const msg = renderTelegram(fakeReport(1), "u", { isTest: true });
    expect(msg).toMatch(/TEST/);
    expect(msg).not.toMatch(/<script>/);
  });
  it("drops a publisher suffix from headlines", () => {
    expect(cleanTitle("Nifty Smallcap 100 Slips as Lower Circuits Signal Weak Breadth | Kalkine India", "kalkine.co.in")).toBe("Nifty Smallcap 100 Slips as Lower Circuits Signal Weak Breadth");
    expect(cleanTitle("Why is stock market up today? Good Friday for Sensex — TradingView News", "tradingview.com")).toBe("Why is stock market up today? Good Friday for Sensex");
    expect(cleanTitle("Markets slide - What it means for you", "example.com")).toBe("Markets slide - What it means for you");
  });
});

describe("masking and template params", () => {
  it("masks recipients for logs", () => {
    expect(maskEmail("garima@example.com")).toBe("ga***@example.com");
    expect(maskPhone("919876543210")).toBe("********3210");
  });
  it("strips newlines from WhatsApp template parameters", () => {
    expect(templateText("a\nb\tc     d")).toBe("a b c   d");
  });
});

describe("yahoo parsing", () => {
  const raw = {
    chart: {
      result: [
        {
          meta: { symbol: "INR=X", gmtoffset: 0 },
          // Fri 9 Oct, Sat 10 Oct, Sun 11 Oct 2026 (12:00 UTC)
          timestamp: [1791547200, 1791633600, 1791720000],
          indicators: { quote: [{ close: [96.1, null, 96.7] }] },
        },
      ],
    },
  };
  it("drops null closes", () => {
    expect(parseYahooChart(raw).map((o) => o.date)).toEqual(["2026-10-09", "2026-10-11"]);
  });
  it("drops weekend prints only when asked (FX), keeping exchange weekend sessions", () => {
    expect(parseYahooChart(raw, { dropWeekends: true }).map((o) => o.date)).toEqual(["2026-10-09"]);
  });
});

describe("whatsapp share link", () => {
  it("normalises messy numbers to wa.me digits", async () => {
    const { waNumber } = await import("@/lib/delivery/share");
    expect(waNumber("<+91 70157 57859>")).toBe("917015757859");
    expect(waNumber("abc")).toBeNull();
  });
  it("omits the number when none is given, so public pages never expose it", async () => {
    const { whatsappShareLink } = await import("@/lib/delivery/share");
    expect(whatsappShareLink("hi & bye")).toBe("https://wa.me/?text=hi%20%26%20bye");
    expect(whatsappShareLink("hi", "+91 70157 57859")).toBe("https://wa.me/917015757859?text=hi");
  });
});
