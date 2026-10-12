import { describe, expect, it } from "vitest";
import { thinSeries } from "@/lib/chart";

const day = (i: number) => new Date(Date.UTC(2025, 9, 1) + i * 86_400_000).toISOString().slice(0, 10);
// A year of weekday points.
const year = Array.from({ length: 366 }, (_, i) => ({ date: day(i), value: 100 + i })).filter((p) => ![0, 6].includes(new Date(`${p.date}T00:00:00Z`).getUTCDay()));

describe("thinSeries", () => {
  it("keeps every recent point, one per week before that, and both ends", () => {
    const t = thinSeries(year);
    expect(t[0]).toEqual(year[0]);
    expect(t.at(-1)).toEqual(year.at(-1));
    expect(t.length).toBeLessThan(year.length * 0.5);
    const cutoff = Date.parse(`${year.at(-1)!.date}T00:00:00Z`) - 92 * 86_400_000;
    const recent = year.filter((p) => Date.parse(`${p.date}T00:00:00Z`) >= cutoff);
    for (const p of recent) expect(t).toContainEqual(p);
  });
  it("leaves short series untouched", () => {
    expect(thinSeries(year.slice(0, 60))).toHaveLength(60);
  });
});
