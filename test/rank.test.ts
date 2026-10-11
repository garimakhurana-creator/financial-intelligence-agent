import { describe, expect, it } from "vitest";
import { percentile, rankCategory, type RankInput } from "@/lib/calc/rank";

const fund = (schemeCode: number, o: Partial<RankInput>): RankInput => ({
  schemeCode,
  r1: 10,
  r3: 12,
  r5: 13,
  consistency: 50,
  drawdown: -15,
  volatility: 14,
  ...o,
});

describe("percentile", () => {
  it("ranks within the list, respecting direction", () => {
    expect(percentile(3, [1, 2, 3], true)).toBe(100);
    expect(percentile(1, [1, 2, 3], true)).toBe(0);
    expect(percentile(1, [1, 2, 3], false)).toBe(100);
    expect(percentile(2, [2, 2, 2], true)).toBe(50);
  });
});

describe("rankCategory", () => {
  it("a consistent, steadier fund outranks one with only a hot recent year", () => {
    const res = rankCategory([
      fund(1, { r1: 40, r3: 13, consistency: 30, drawdown: -25, volatility: 20 }), // hot year, erratic
      fund(2, { r1: 12, r3: 16, r5: 15, consistency: 85, drawdown: -10, volatility: 11 }), // steady
      fund(3, { r1: 9, r3: 11, consistency: 45, drawdown: -16, volatility: 15 }),
      fund(4, { r1: 8, r3: 10, consistency: 40, drawdown: -18, volatility: 16 }),
      fund(5, { r1: 11, r3: 12, consistency: 55, drawdown: -14, volatility: 13 }),
    ]);
    const byCode = Object.fromEntries(res.map((r) => [r.schemeCode, r]));
    expect(byCode[2].rank).toBe(1);
    expect(byCode[1].rank).not.toBe(1);
    expect(byCode[1].cautions.join(" ")).toMatch(/Strong last year/);
    expect(byCode[2].label).toBe("Strong historical consistency");
  });

  it("funds without 3 years of history are listed but never ranked", () => {
    const res = rankCategory([fund(1, {}), fund(2, {}), fund(3, {}), fund(4, {}), fund(9, { r3: null, r5: null, consistency: null, drawdown: null })]);
    const young = res.find((r) => r.schemeCode === 9)!;
    expect(young.eligible).toBe(false);
    expect(young.label).toBe("Insufficient history");
    expect(young.rank).toBeNull();
  });

  it("does not rank categories with too few comparable funds", () => {
    const res = rankCategory([fund(1, {}), fund(2, {})]);
    expect(res.every((r) => r.rank === null)).toBe(true);
  });

  it("re-weights when the 5-year factor is missing", () => {
    const res = rankCategory([1, 2, 3, 4].map((c) => fund(c, { r5: null, r3: 10 + c })));
    expect(res.every((r) => r.score !== null && r.factors.excess5Y === undefined)).toBe(true);
  });
});
