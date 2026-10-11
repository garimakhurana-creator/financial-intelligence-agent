import { describe, expect, it } from "vitest";
import { groupsForPreferences, shortlist, type UniverseRow } from "@/lib/explore";
import { EMPTY_PREFERENCES } from "@/lib/db/research";

const row = (code: number, group: string, score: number, label = "Worth researching", r1 = 10): UniverseRow => ({
  code,
  name: `F${code}`,
  amc: "",
  group,
  groupLabel: group,
  assetClass: "equity",
  riskBand: "Higher",
  horizon: "",
  horizonYears: 5,
  plan: "Direct",
  option: "Growth",
  nav: 1,
  navDate: null,
  historyStart: null,
  r1,
  r3: 12,
  r5: 12,
  vol: 12,
  dd: -10,
  cons: 60,
  score,
  label,
  rank: 1,
  of: 10,
  vsRef3: 1,
  vsCat3: 1,
  strengths: [],
  cautions: [],
});

describe("groupsForPreferences", () => {
  it("drops categories that are too risky or too long for the stated preferences", () => {
    const { keys, notes } = groupsForPreferences({ ...EMPTY_PREFERENCES, riskComfort: "low", horizonYears: 3 });
    expect(keys).toContain("short_duration");
    expect(keys).not.toContain("small_cap");
    expect(keys).not.toContain("mid_cap");
    expect(notes.length).toBeGreaterThan(0);
  });
});

describe("shortlist", () => {
  it("never lets a high recent return beat the ranking label, and caps two per category", () => {
    const rows = [
      row(1, "flexi_cap", 90),
      row(2, "flexi_cap", 85),
      row(3, "flexi_cap", 80),
      row(4, "flexi_cap", 40, "Mixed record", 60), // hot year, mixed record
      row(5, "mid_cap", 75),
    ];
    const s = shortlist(rows, { ...EMPTY_PREFERENCES, preferredGroups: ["flexi_cap", "mid_cap"] });
    expect(s.rows.map((r) => r.code)).toEqual([1, 5, 2]);
    expect(s.rows.some((r) => r.code === 4)).toBe(false);
    expect(s.basis).toBe("preferences");
  });
  it("explains when nothing qualifies", () => {
    const s = shortlist([row(1, "gilt", 30, "Mixed record")], { ...EMPTY_PREFERENCES, preferredGroups: ["gilt"] });
    expect(s.rows).toHaveLength(0);
    expect(s.notes.join(" ")).toMatch(/No fund/);
  });
});
