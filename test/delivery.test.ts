import { describe, expect, it } from "vitest";
import { renderTelegram, templateText } from "@/lib/delivery/channels";
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
    inputSnapshot: { investorName: "Meera <script>" } as never,
    report: {
      output: {
        funds,
        categories: [],
        marketSummary: { text: "Markets were mixed.", evidenceIds: [] },
        assessment: { label: "No action needed", reason: "Nothing persistent <b>.", fundOfConcern: null },
      },
      funds: funds.map((f) => ({ schemeCode: f.schemeCode, schemeName: `Fund ${f.schemeCode} - Direct Plan - Growth`, windows: {} })) as never,
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
  it("splits long reports under the 4096-character limit without losing funds", () => {
    const long = "x".repeat(1200) + ".";
    const msgs = renderTelegram(fakeReport(5, long), "https://x.test", { isTest: false });
    expect(msgs.length).toBeGreaterThan(1);
    for (const m of msgs) expect(m.length).toBeLessThanOrEqual(4096);
    for (let i = 0; i < 5; i++) expect(msgs.join("\n")).toContain(`Fund ${100 + i}`);
  });
  it("labels test sends", () => {
    expect(renderTelegram(fakeReport(1), "u", { isTest: true })[0]).toMatch(/TEST/);
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
