import { describe, expect, it } from "vitest";
import { addDays } from "@/lib/dates";
import {
  annualisedVolatility,
  computeFundMetrics,
  consistencyVsCategory,
  maxDrawdown,
  periodReturn,
  rollingOneYear,
  weeklyCloses,
} from "@/lib/calc/metrics";
import type { Observation } from "@/lib/calc/returns";

/** Weekday series from start to end, value = f(index). */
function series(start: string, end: string, f: (i: number, date: string) => number): Observation[] {
  const out: Observation[] = [];
  let d = start;
  let i = 0;
  while (d <= end) {
    const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
    if (dow !== 0 && dow !== 6) out.push({ date: d, value: f(i++, d) });
    d = addDays(d, 1);
  }
  return out;
}

describe("periodReturn", () => {
  // Grows exactly 10% per calendar year (continuous compounding by day count).
  const s = series("2020-10-01", "2026-10-09", (_i, d) => 100 * Math.pow(1.1, (Date.parse(d) - Date.parse("2020-10-01")) / (365.25 * 86400000)));

  it("annualises multi-year returns (CAGR)", () => {
    const r3 = periodReturn(s, "2026-10-09", "3Y");
    expect(r3.annualised).toBeCloseTo(10, 0);
    expect(r3.total).toBeCloseTo((1.1 ** 3 - 1) * 100, 0);
    expect(periodReturn(s, "2026-10-09", "5Y").annualised).toBeCloseTo(10, 0);
  });
  it("does not annualise sub-year periods", () => {
    expect(periodReturn(s, "2026-10-09", "6M").annualised).toBeNull();
  });
  it("returns null when history is too short", () => {
    const short = s.filter((o) => o.date >= "2024-01-01");
    expect(periodReturn(short, "2026-10-09", "3Y").total).toBeNull();
    expect(periodReturn(short, "2026-10-09", "5Y").annualised).toBeNull();
  });
});

describe("risk measures", () => {
  it("volatility is zero for a smooth series and positive for a choppy one", () => {
    const smooth = series("2023-01-01", "2026-10-09", (i) => 100 + i * 0.01);
    const choppy = series("2023-01-01", "2026-10-09", (i) => 100 * (i % 10 < 5 ? 1.05 : 0.95));
    expect(annualisedVolatility(smooth, "2026-10-09")!).toBeLessThan(1);
    expect(annualisedVolatility(choppy, "2026-10-09")!).toBeGreaterThan(10);
  });
  it("volatility needs enough weeks of data", () => {
    expect(annualisedVolatility(series("2026-01-01", "2026-10-09", (i) => 100 + i), "2026-10-09")).toBeNull();
  });
  it("max drawdown finds the worst peak-to-trough fall", () => {
    const s = series("2023-09-01", "2026-10-09", (_i, d) => (d < "2025-01-01" ? 100 : d < "2025-06-01" ? 70 : 90));
    const dd = maxDrawdown(s, "2026-10-09")!;
    expect(dd.pct).toBeCloseTo(-30, 5);
    expect(dd.trough >= "2025-01-01").toBe(true);
  });
  it("collapses daily data to one close per week", () => {
    const w = weeklyCloses(series("2026-10-05", "2026-10-16", (i) => i));
    expect(w.map((o) => o.date)).toEqual(["2026-10-09", "2026-10-16"]);
  });
});

describe("consistency vs category", () => {
  const asOf = "2026-10-09";
  const grow = (rate: number) => series("2022-09-01", asOf, (i) => 100 * Math.pow(1 + rate, i / 252));
  it("a fund that always beats the category median scores 100%", () => {
    const fund = rollingOneYear(grow(0.2), asOf);
    const cat = [0.05, 0.08, 0.1, 0.12].map((r) => rollingOneYear(grow(r), asOf));
    const c = consistencyVsCategory(fund, cat)!;
    expect(c.beatPct).toBe(100);
    expect(c.windows).toBeGreaterThanOrEqual(12);
  });
  it("a laggard scores 0% and too few windows return null", () => {
    const cat = [0.05, 0.08, 0.1, 0.12].map((r) => rollingOneYear(grow(r), asOf));
    expect(consistencyVsCategory(rollingOneYear(grow(0.01), asOf), cat)!.beatPct).toBe(0);
    expect(consistencyVsCategory(rollingOneYear(grow(0.2).slice(-200), asOf), cat)).toBeNull();
  });
});

describe("computeFundMetrics", () => {
  it("reports what exists and nulls what does not", () => {
    const m = computeFundMetrics(series("2025-01-01", "2026-10-09", (i) => 100 + i), "2026-10-11");
    expect(m.asOf).toBe("2026-10-09");
    expect(m.returns["1Y"].total).not.toBeNull();
    expect(m.returns["3Y"].total).toBeNull();
    expect(m.volatility3Y).toBeNull();
  });
});
