import { describe, expect, it } from "vitest";
import { DocumentError, pdfText, validatePdf, verifyQuote } from "@/lib/analysis/document";
import { assess } from "@/lib/analysis/analyse";
import { makePdf, SYNTHETIC_FACTSHEET } from "./fixtures/make-pdf";

describe("upload validation", () => {
  it("accepts a real PDF header and rejects other files", () => {
    const pdf = makePdf(SYNTHETIC_FACTSHEET);
    expect(() => validatePdf(pdf, "application/pdf", pdf.length)).not.toThrow();
    const notPdf = new Uint8Array(Buffer.from("PK\u0003\u0004" + "x".repeat(2000)));
    expect(() => validatePdf(notPdf, "application/pdf", notPdf.length)).toThrow(DocumentError);
    expect(() => validatePdf(pdf, "image/png", pdf.length)).toThrow(/Expected a PDF/);
    expect(() => validatePdf(pdf, "application/pdf", 5 * 1024 * 1024)).toThrow(/4 MB/);
  });
});

describe("text extraction and quote verification", () => {
  it("reads the PDF text layer", async () => {
    const { text, pages } = await pdfText(makePdf(SYNTHETIC_FACTSHEET));
    expect(pages).toBe(1);
    expect(text).toContain("Total Expense Ratio (Direct): 0.62%");
  });
  it("verifies a value only when its quote is in the document and contains it", async () => {
    const { text } = await pdfText(makePdf(SYNTHETIC_FACTSHEET));
    expect(verifyQuote("Total Expense Ratio (Direct): 0.62%", text, 0.62)).toBe(true);
    expect(verifyQuote("Total Expense Ratio (Direct): 0.62%", text, 0.65)).toBe(false); // wrong number
    expect(verifyQuote("Total Expense Ratio (Direct): 0.45%", text, 0.45)).toBe(false); // quote not in doc
    expect(verifyQuote("Benchmark: Nifty 100 TRI", text, "Nifty 100 TRI")).toBe(true);
    expect(verifyQuote(null, text, 1)).toBe(false);
  });
});

describe("assess (deterministic outcome)", () => {
  const base = {
    asOf: "2026-10-11",
    scheme: { schemeCode: 1, schemeName: "X - Direct Plan - Growth", fundHouse: "", schemeType: "", schemeCategory: "", isinGrowth: null, plan: "Direct" as const, option: "Growth" as const },
    group: { key: "flexi_cap", label: "Flexi-cap funds", plain: "", horizon: "", riskBand: "Higher" },
    consistency: { beatPct: 75, windows: 25 },
    category: { medians: { r1: 5, r3: 12, r5: 11, vol: 14, dd: -18 }, reference: null, computedAt: "", peers: 30 },
    comparison: { "1Y": { fund: 6, categoryMedian: 5, reference: null }, "3Y": { fund: 15, categoryMedian: 12, reference: null }, "5Y": { fund: 13, categoryMedian: 11, reference: null } },
    alternatives: [],
    document: null,
    sources: [],
  };
  const metrics = (r3: number | null, vol: number, dd: number) =>
    ({
      asOf: "2026-10-09",
      nav: 10,
      historyStart: "2018-01-01",
      returns: {
        "1M": { total: 1, annualised: null, fromDate: null },
        "3M": { total: 1, annualised: null, fromDate: null },
        "6M": { total: 1, annualised: null, fromDate: null },
        "1Y": { total: 6, annualised: 6, fromDate: null },
        "3Y": { total: r3 === null ? null : 50, annualised: r3, fromDate: null },
        "5Y": { total: 80, annualised: 13, fromDate: null },
      },
      volatility3Y: vol,
      maxDrawdown3Y: { pct: dd, peak: "2025-01-01", trough: "2025-03-01" },
      metricsVersion: "t",
    }) as never;

  it("strong, consistent, steadier fund → Worth researching further", () => {
    expect(assess({ ...base, metrics: metrics(15, 12, -14) }).outcome).toBe("Worth researching further");
  });
  it("lagging, inconsistent, deeper falls → Several concerns", () => {
    const r = assess({ ...base, consistency: { beatPct: 20, windows: 25 }, metrics: metrics(9, 17, -25) });
    expect(r.outcome).toBe("Several concerns to investigate");
    expect(r.concerns.length).toBeGreaterThanOrEqual(2);
  });
  it("under 3 years of history is judged on its 1-year record, with the short history noted", () => {
    const r = assess({ ...base, metrics: metrics(null, 12, -14) });
    expect(r.outcome).toBe("Suitable for further comparison");
    expect(r.outcomeReason).toMatch(/less than 3 years/);
    expect(r.concerns.find((c) => /Less than 3 years/.test(c.text))?.limitation).toBe(true);
  });
  it("no 1-year record either → Insufficient data", () => {
    const m = metrics(null, 12, -14) as unknown as { returns: Record<string, unknown> };
    const r = assess({ ...base, metrics: { ...m, returns: { ...m.returns, "1Y": { total: null, annualised: null, fromDate: null } } } as never });
    expect(r.outcome).toBe("Insufficient data for a reliable assessment");
  });
  it("no comparable category → Insufficient data", () => {
    expect(assess({ ...base, category: null } as never).outcome).toBe("Insufficient data for a reliable assessment");
  });
  it("Regular plan is called out as a cost concern", () => {
    const r = assess({ ...base, scheme: { ...base.scheme, plan: "Regular" }, metrics: metrics(15, 12, -14) });
    expect(r.concerns.map((c) => c.text).join(" ")).toMatch(/Regular plan/);
  });
});

describe("number formats in quotes", () => {
  it("treats thousands separators as part of the number", async () => {
    const { text } = await pdfText(makePdf(SYNTHETIC_FACTSHEET));
    expect(verifyQuote("Fund size (AUM): Rs 12,345 crore", text, 12345)).toBe(true);
    expect(verifyQuote("Fund size (AUM): Rs 12,345 crore", text, 345)).toBe(false);
  });
});
