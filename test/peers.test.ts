import { describe, expect, it } from "vitest";
import { computePeerAverage, MIN_PEERS_FOR_AVERAGE } from "@/lib/calc/peers";
import type { Observation } from "@/lib/calc/returns";

const flat = (start: number, end: number): Observation[] => [
  { date: "2025-12-31", value: start },
  { date: "2026-09-09", value: start },
  { date: "2026-10-02", value: start },
  { date: "2026-10-09", value: end },
];

describe("computePeerAverage", () => {
  it("is the equal-weighted mean of valid peer returns", () => {
    const r = computePeerAverage(
      [
        { schemeCode: 1, schemeName: "A", series: flat(100, 101) }, // +1%
        { schemeCode: 2, schemeName: "B", series: flat(100, 103) }, // +3%
        { schemeCode: 3, schemeName: "C", series: flat(100, 105) }, // +5%
      ],
      "2026-10-09",
    );
    expect(r.windows["1W"].mean).toBeCloseTo(3, 10);
    expect(r.windows["1W"].median).toBeCloseTo(3, 10);
    expect(r.windows["1W"].n).toBe(3);
    expect(r.windows["1W"].quality).toBe("limited_sample");
  });

  it("excludes peers with missing data instead of counting them as 0%", () => {
    const r = computePeerAverage(
      [
        { schemeCode: 1, schemeName: "A", series: flat(100, 102) },
        { schemeCode: 2, schemeName: "B", series: flat(100, 102) },
        { schemeCode: 3, schemeName: "C", series: flat(100, 102) },
        { schemeCode: 4, schemeName: "stale", series: [{ date: "2026-08-01", value: 50 }] },
      ],
      "2026-10-09",
    );
    expect(r.windows["1W"].mean).toBeCloseTo(2, 10);
    expect(r.windows["1W"].n).toBe(3);
    expect(r.windows["1W"].excluded).toBe(1);
  });

  it("publishes no average below the minimum sample", () => {
    const peers = Array.from({ length: MIN_PEERS_FOR_AVERAGE - 1 }, (_, i) => ({
      schemeCode: i,
      schemeName: `P${i}`,
      series: flat(100, 101),
    }));
    const r = computePeerAverage(peers, "2026-10-09");
    expect(r.windows["1W"].mean).toBeNull();
    expect(r.windows["1W"].quality).toBe("unavailable");
  });
});
