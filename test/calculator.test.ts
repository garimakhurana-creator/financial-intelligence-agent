import { describe, expect, it } from "vitest";
import { lumpValue, sipForGoal, sipValue } from "@/components/calculator";
import { pdfSafe } from "@/lib/delivery/pdf";

describe("calculator", () => {
  it("SIP future value (start-of-month, monthly compounding) matches the standard formula", () => {
    // ₹5,000 a month for 10 years at 12%: the widely published figure is about ₹11.6 lakh.
    expect(Math.round(sipValue(5000, 12, 10))).toBe(1161695);
  });
  it("with 0% growth you get back exactly what you put in", () => {
    expect(sipValue(1000, 0, 2)).toBe(24000);
    expect(lumpValue(50000, 0, 7)).toBe(50000);
  });
  it("lump sum compounds yearly", () => {
    expect(lumpValue(100000, 10, 2)).toBeCloseTo(121000, 6);
  });
  it("goal SIP is the inverse of the SIP value", () => {
    const m = sipForGoal(1000000, 12, 10);
    expect(sipValue(m, 12, 10)).toBeCloseTo(1000000, 4);
  });
});

describe("PDF text", () => {
  it("replaces characters the standard PDF fonts cannot draw", () => {
    expect(pdfSafe("₹1,000 → ₹961 🌱")).toBe("Rs 1,000 -> Rs 961 ");
    expect(pdfSafe("3.66%–5.36% “quoted”")).toBe("3.66%–5.36% “quoted”");
  });
});
