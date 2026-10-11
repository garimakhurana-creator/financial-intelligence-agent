import { describe, expect, it } from "vitest";
import { describeGap, signed, toneOf } from "@/lib/plain";

describe("plain-language gaps", () => {
  it("maps percentage-point gaps to fixed words", () => {
    expect(describeGap(0.1).words).toBe("about the same as");
    expect(describeGap(-0.24).words).toBe("about the same as");
    expect(describeGap(0.36).words).toBe("slightly better than");
    expect(describeGap(-0.5).words).toBe("slightly behind");
    expect(describeGap(1.41).words).toBe("better than");
    expect(describeGap(-3.97).words).toBe("behind");
  });
  it("never invents a comparison when data is missing", () => {
    expect(describeGap(null)).toEqual({ words: "no comparison available", tone: "none" });
  });
  it("formats signed percentages and tones", () => {
    expect(signed(0.432)).toBe("+0.43%");
    expect(signed(-13.13)).toBe("-13.13%");
    expect(signed(null)).toBe("n/a");
    expect(toneOf(0.001)).toBe("neutral");
    expect(toneOf(-0.2)).toBe("bad");
  });
});
