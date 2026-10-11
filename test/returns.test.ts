import { describe, expect, it } from "vitest";
import { addDays, fromDDMMYYYY, fromDDMonYYYY, minusMonths, previousYearEnd, todayIn } from "@/lib/dates";
import { computeWindowReturns, excessReturn, observationOnOrBefore, pctChange, type Observation } from "@/lib/calc/returns";

/** Build a weekday-only series from `start` to `end` with value = f(dayIndex). */
function weekdays(start: string, end: string, f: (i: number) => number, skip: string[] = []): Observation[] {
  const out: Observation[] = [];
  let d = start;
  let i = 0;
  while (d <= end) {
    const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
    if (dow !== 0 && dow !== 6 && !skip.includes(d)) out.push({ date: d, value: f(i++) });
    d = addDays(d, 1);
  }
  return out;
}

describe("date helpers", () => {
  it("parses MFapi and AMFI date formats", () => {
    expect(fromDDMMYYYY("09-10-2026")).toBe("2026-10-09");
    expect(fromDDMonYYYY("09-Oct-2026")).toBe("2026-10-09");
    expect(fromDDMMYYYY("31-02-2026")).toBeNull();
    expect(fromDDMonYYYY("09-Foo-2026")).toBeNull();
  });
  it("clamps month subtraction to month end", () => {
    expect(minusMonths("2026-03-31", 1)).toBe("2026-02-28");
    expect(minusMonths("2024-03-31", 1)).toBe("2024-02-29");
    expect(minusMonths("2026-01-15", 1)).toBe("2025-12-15");
  });
  it("uses the previous calendar year end for YTD", () => {
    expect(previousYearEnd("2026-10-09")).toBe("2025-12-31");
  });
  it("computes today in IST, not UTC", () => {
    // 2026-10-10 20:00 UTC is already 2026-10-11 01:30 IST
    expect(todayIn("Asia/Kolkata", new Date("2026-10-10T20:00:00Z"))).toBe("2026-10-11");
  });
});

describe("pctChange", () => {
  it("computes simple point-to-point return", () => {
    expect(pctChange(110, 100)).toBeCloseTo(10, 10);
    expect(pctChange(95, 100)).toBeCloseTo(-5, 10);
  });
  it("refuses zero, negative or non-finite references", () => {
    expect(pctChange(100, 0)).toBeNull();
    expect(pctChange(100, -1)).toBeNull();
    expect(pctChange(Number.NaN, 100)).toBeNull();
  });
});

describe("observationOnOrBefore", () => {
  const s = [
    { date: "2026-10-01", value: 1 },
    { date: "2026-10-05", value: 2 },
  ];
  it("snaps back to the latest earlier observation", () => {
    expect(observationOnOrBefore(s, "2026-10-04", 7)?.date).toBe("2026-10-01");
    expect(observationOnOrBefore(s, "2026-10-05", 7)?.date).toBe("2026-10-05");
  });
  it("rejects observations older than the allowed gap", () => {
    expect(observationOnOrBefore(s, "2026-10-20", 7)).toBeNull();
  });
  it("returns null before the first observation", () => {
    expect(observationOnOrBefore(s, "2026-09-30", 7)).toBeNull();
  });
});

describe("computeWindowReturns", () => {
  const series = weekdays("2025-12-01", "2026-10-09", (i) => 100 + i);

  it("computes WoW, MoM and YTD from actual historical observations", () => {
    const { current, windows } = computeWindowReturns(series, "2026-10-11"); // Sunday
    expect(current?.date).toBe("2026-10-09"); // snaps to Friday
    expect(windows["1W"].targetDate).toBe("2026-10-02");
    expect(windows["1W"].referenceDate).toBe("2026-10-02");
    expect(windows["1M"].targetDate).toBe("2026-09-09");
    expect(windows["YTD"].targetDate).toBe("2025-12-31");
    expect(windows["YTD"].referenceDate).toBe("2025-12-31");
    const cur = current!.value;
    expect(windows["1W"].returnPct).toBeCloseTo((cur / (cur - 5) - 1) * 100, 10);
  });

  it("uses the previous trading day when the target date is a market holiday", () => {
    const withHoliday = weekdays("2025-12-01", "2026-10-09", (i) => 100 + i, ["2026-10-02"]);
    const { windows } = computeWindowReturns(withHoliday, "2026-10-09");
    expect(windows["1W"].referenceDate).toBe("2026-10-01");
  });

  it("reports missing history as unavailable, never as 0%", () => {
    const short = weekdays("2026-09-25", "2026-10-09", (i) => 100 + i);
    const { windows } = computeWindowReturns(short, "2026-10-09");
    expect(windows["1W"].returnPct).not.toBeNull();
    expect(windows["1M"].returnPct).toBeNull();
    expect(windows["1M"].unavailableReason).toBe("insufficient_history");
    expect(windows["YTD"].returnPct).toBeNull();
  });

  it("flags a gap in the data around the reference date", () => {
    const gappy = series.filter((o) => o.date < "2026-09-20" || o.date > "2026-10-03");
    const { windows } = computeWindowReturns(gappy, "2026-10-09");
    // target 2026-10-02; nearest earlier obs is 2026-09-18, 14 days back -> rejected
    expect(windows["1W"].returnPct).toBeNull();
    expect(windows["1W"].unavailableReason).toBe("no_reference_near_target");
  });

  it("does not use a stale latest NAV as current", () => {
    const { current, windows } = computeWindowReturns(series, "2026-10-30");
    expect(current).toBeNull();
    expect(windows["1W"].unavailableReason).toBe("current_too_stale");
  });

  it("drops zero/invalid NAV rows instead of dividing by them", () => {
    const bad = [...series.filter((o) => o.date !== "2026-10-02"), { date: "2026-10-02", value: 0 }];
    const { windows } = computeWindowReturns(bad, "2026-10-09");
    expect(windows["1W"].referenceDate).toBe("2026-10-01");
    expect(windows["1W"].returnPct).not.toBeNull();
  });

  it("anchors a benchmark to the fund's dates when asked", () => {
    const bench = weekdays("2025-12-01", "2026-10-10", (i) => 1000 + i);
    const { windows } = computeWindowReturns(bench, "2026-10-09", { anchorTo: "2026-10-09" });
    expect(windows["1W"].currentDate).toBe("2026-10-09");
    expect(windows["1W"].referenceDate).toBe("2026-10-02");
  });
});

describe("excessReturn", () => {
  it("is fund minus comparator in percentage points", () => {
    expect(excessReturn(2.5, 1)).toBeCloseTo(1.5, 10);
  });
  it("is null when either side is unavailable", () => {
    expect(excessReturn(null, 1)).toBeNull();
    expect(excessReturn(1, null)).toBeNull();
  });
});
