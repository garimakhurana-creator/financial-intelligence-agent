import { describe, expect, it } from "vitest";
import { allocation, summarisePortfolio } from "@/lib/portfolio";
import { weeklyHighlights } from "@/lib/highlights";
import type { FundPerformance, IndexPerformance } from "@/lib/pipeline/data";

const win = (fund: number | null, vsPeer: number | null = 0) => ({
  fund: { window: "1W", targetDate: "", referenceDate: "", referenceValue: 1, currentDate: "", currentValue: 1, returnPct: fund },
  benchmark: null,
  peer: null,
  vsBenchmarkPp: null,
  vsPeerPp: vsPeer,
});
const perf = (code: number, nav: number, cat: string, name: string, vsPeer1M = 0, vsPeerYTD = 0): FundPerformance =>
  ({
    schemeCode: code,
    schemeName: name,
    fundHouse: "",
    amfiCategory: cat,
    viewId: null,
    nav: { value: nav, date: "2026-10-09", source: "", retrievedAt: null },
    benchmark: null,
    statedBenchmarkOnly: null,
    peer: null,
    windows: { "1W": win(0.1), "1M": win(1, vsPeer1M), YTD: win(5, vsPeerYTD) },
    chart: [],
    flags: [],
    calcVersion: "",
  }) as unknown as FundPerformance;

describe("summarisePortfolio", () => {
  const funds = [perf(1, 100, "Equity Scheme - Mid Cap Fund", "Mid Fund - Direct Plan - Growth"), perf(2, 50, "Debt Scheme - Short Duration Fund", "Debt Fund - Direct Plan - Growth")];

  it("computes value only from units × NAV and gain only where both amounts exist", () => {
    const s = summarisePortfolio(
      [
        { schemeCode: 1, units: 10, invested: 800, sipAmount: 2000, sipDay: 5, startDate: null, updatedAt: "" },
        { schemeCode: 2, units: null, invested: 1000, sipAmount: 1000, sipDay: 5, startDate: null, updatedAt: "" },
      ],
      funds,
    );
    expect(s.currentValue).toBe(1000); // fund 2 has no units → not valued
    expect(s.gain).toEqual({ amount: 200, pct: 25, funds: 1 });
    expect(s.monthlySip).toBe(3000);
    expect(s.missing.join(" ")).toMatch(/no units/);
  });

  it("shows nothing when no holdings were entered — never invents totals", () => {
    const s = summarisePortfolio([], funds);
    expect(s.currentValue).toBeNull();
    expect(s.gain).toBeNull();
    expect(s.monthlySip).toBeNull();
  });

  it("allocates by asset class from valued holdings only", () => {
    const s = summarisePortfolio(
      [
        { schemeCode: 1, units: 10, invested: null, sipAmount: null, sipDay: null, startDate: null, updatedAt: "" },
        { schemeCode: 2, units: 20, invested: null, sipAmount: null, sipDay: null, startDate: null, updatedAt: "" },
      ],
      funds,
    );
    const a = allocation(s.rows, "assetClass");
    expect(a.map((x) => [x.label, Math.round(x.pct)])).toEqual([["Equity", 50], ["Debt", 50]]);
  });
});

describe("weeklyHighlights", () => {
  const ix = (id: string, w: number): IndexPerformance => ({ id, name: id, current: null, windows: { "1W": { returnPct: w }, "1M": { returnPct: 0 }, YTD: { returnPct: 0 } }, source: null, retrievedAt: null, chart: [] }) as unknown as IndexPerformance;

  it("ignores small moves and reports big ones, capped at three", () => {
    const quiet = weeklyHighlights({ funds: [perf(1, 1, "", "A")], indices: [ix("NIFTY50", 0.4)], fx: ix("USDINR", 0.3), news: [] });
    expect(quiet).toEqual([]);
    const busy = weeklyHighlights({
      funds: [perf(1, 1, "", "A", -2, -4), perf(2, 1, "", "B", -2, -4)],
      indices: [ix("NIFTY50", -2.5), ix("SMALL", 3)],
      fx: ix("USDINR", 1.2),
      news: [],
    });
    expect(busy).toHaveLength(3);
    expect(busy[0].kind).toBe("watch");
  });
});
