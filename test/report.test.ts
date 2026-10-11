import { describe, expect, it } from "vitest";
import { VIEW_IDS } from "@/lib/catalog";
import { fallbackReport } from "@/lib/report/fallback";
import { generateNarrative } from "@/lib/report/generate";
import { portfolioNotes, screenFund, suggestLabel } from "@/lib/report/screening";
import type { MetricTriple, ReportInput, ReportOutput } from "@/lib/report/types";
import { countSentences, validateReport } from "@/lib/report/validate";

const triple = (fund: number, peer: number, bench: number | null = null): MetricTriple => ({
  fund,
  benchmark: bench,
  peerAverage: peer,
  vsBenchmarkPp: bench === null ? null : Math.round((fund - bench) * 100) / 100,
  vsPeerPp: Math.round((fund - peer) * 100) / 100,
  referenceDate: "2026-10-01",
  peerCount: 33,
});

function makeInput(): ReportInput {
  return {
    schemaVersion: "report-v1",
    weekEnding: "2026-10-09",
    investorName: "Meera",
    funds: [
      {
        schemeCode: 118989,
        name: "HDFC Mid Cap Fund",
        view: "mid_cap",
        navDate: "2026-10-09",
        nav: 219.816,
        benchmarkName: "Nifty Midcap 150 (price index)",
        statedBenchmark: "Nifty Midcap 150 TRI",
        peerGroup: "Mid-cap funds",
        returns: { "1W": triple(0.17, -0.07, -0.19), "1M": triple(-5.36, -5.42, -6.04), YTD: triple(-2.19, 1.78, -3.02) },
        dataNotes: [],
        screening: { flag: false, reason: "No persistent underperformance versus peers." },
      },
    ],
    indices: [{ id: "NIFTY_MIDCAP150", name: "Nifty Midcap 150", date: "2026-10-09", level: 21603.25, returns: { "1W": -0.19, "1M": -6.04, YTD: -3.02 } }],
    breadth: [],
    breadthDate: null,
    news: [{ id: "N1", title: "RBI hikes repo rate by 25 basis points to 5.5%", publisher: "NDTV", publishedAt: "2026-10-07T04:39:16Z", url: "https://example.com/a", summary: "", views: ["short_debt"] }],
    views: VIEW_IDS.map((id) => ({ id, title: id, focus: "", fundCodes: id === "mid_cap" ? [118989] : [], indexIds: id === "mid_cap" ? ["NIFTY_MIDCAP150"] : [] })),
    screening: { suggestedLabel: "No action needed", rationale: "All your funds moved in line with their markets, so there is nothing to do this week." },
  };
}

function goodOutput(): ReportOutput {
  return {
    funds: [
      {
        schemeCode: 118989,
        performance: "HDFC Mid Cap Fund rose 0.17% this week, fell 5.36% over the month and is down 2.19% this year.",
        comparison: "It was 0.36 points ahead of the Nifty Midcap 150 and 0.24 points ahead of similar mid-cap funds this week.",
        marketContext: "The week coincided with the RBI raising its main interest rate to 5.5%, which may have weighed on rate-sensitive stocks.",
        evidenceIds: ["N1"],
      },
    ],
    categories: VIEW_IDS.map((viewId) => ({
      viewId,
      headline: "A quiet week for this category",
      summary: "Category figures were broadly in line with the wider market this week and nothing unusual stood out.",
      watchItems: [],
      evidenceIds: [],
    })),
    marketSummary: { text: "Markets were mixed this week, with mid caps slipping 0.19% while rates moved higher.", evidenceIds: ["N1"] },
    assessment: { label: "No action needed", reason: "None of the funds has been lagging similar funds for long, so there is nothing to act on.", fundOfConcern: null },
  };
}

describe("countSentences", () => {
  it("does not split on decimals or common abbreviations", () => {
    expect(countSentences("It rose 0.43% vs. the index, e.g. a small gain.")).toBe(1);
    expect(countSentences("One. Two.")).toBe(2);
    expect(countSentences("No terminal punctuation")).toBe(1);
  });
});

describe("validateReport", () => {
  it("accepts a grounded, well-formed report", () => {
    const v = validateReport(goodOutput(), makeInput());
    expect(v.errors).toEqual([]);
    expect(v.ok).toBe(true);
  });

  it("rejects numbers that are not in the verified input", () => {
    const o = goodOutput();
    o.funds[0].performance = "HDFC Mid Cap Fund rose 3.75% this week.";
    const v = validateReport(o, makeInput());
    expect(v.ok).toBe(false);
    expect(v.errors.join()).toMatch(/3.75/);
  });

  it("rejects multi-sentence fund fields", () => {
    const o = goodOutput();
    o.funds[0].comparison = "It beat the index. It also beat peers.";
    expect(validateReport(o, makeInput()).errors.join()).toMatch(/exactly one sentence/);
  });

  it("rejects buy/sell instructions", () => {
    const o = goodOutput();
    o.assessment.reason = "You should sell the mid-cap fund because it fell this month.";
    expect(validateReport(o, makeInput()).errors.join()).toMatch(/buy\/sell/);
  });

  it("rejects invented evidence ids and missing views", () => {
    const o = goodOutput();
    o.funds[0].evidenceIds = ["N9"];
    o.categories = o.categories.slice(1);
    const errs = validateReport(o, makeInput()).errors.join();
    expect(errs).toMatch(/unknown evidence id N9/);
    expect(errs).toMatch(/missing category view/);
  });

  it("requires a fund of concern for 'One fund worth watching'", () => {
    const o = goodOutput();
    o.assessment = { label: "One fund worth watching", reason: "The mid-cap fund is behind its peer average this year.", fundOfConcern: null };
    expect(validateReport(o, makeInput()).errors.join()).toMatch(/fundOfConcern/);
  });

  it("rejects labels outside the three allowed", () => {
    const o = goodOutput() as unknown as { assessment: { label: string } };
    o.assessment.label = "Panic";
    expect(validateReport(o, makeInput()).ok).toBe(false);
  });
});

describe("fallback report", () => {
  it("always passes validation", () => {
    const v = validateReport(fallbackReport(makeInput()), makeInput());
    expect(v.errors).toEqual([]);
  });
});

describe("generateNarrative", () => {
  it("retries with validator feedback, then succeeds", async () => {
    const calls: (string[] | undefined)[] = [];
    const bad = goodOutput();
    bad.funds[0].performance = "It rose 9.99% this week.";
    const r = await generateNarrative(makeInput(), async (_input, feedback) => {
      calls.push(feedback);
      return { json: calls.length === 1 ? bad : goodOutput(), modelVersion: "test-model" };
    });
    expect(r.generator).toBe("gemini");
    expect(r.attempts).toBe(2);
    expect(calls[1]?.join()).toMatch(/9.99/);
  });

  it("falls back to the deterministic template when the model keeps failing", async () => {
    const r = await generateNarrative(makeInput(), async () => {
      throw new Error("503 overloaded");
    });
    expect(r.generator).toBe("fallback");
    expect(r.output.assessment.label).toBe("No action needed");
  });
});

describe("screening", () => {
  it("flags only persistent underperformance across 1M and YTD", () => {
    const r = { "1W": triple(-3, 0), "1M": triple(-3, 0), YTD: triple(-1, 0) };
    expect(screenFund("mid_cap", r).flag).toBe(false); // YTD gap too small
    const r2 = { "1W": triple(0, 0), "1M": triple(-2, 0), YTD: triple(-4, 0) };
    expect(screenFund("mid_cap", r2).flag).toBe(true);
  });
  it("uses tracking difference for index funds", () => {
    const r = { "1W": triple(0, 0, 0), "1M": triple(-1, -1, 0), YTD: triple(0, 0, 0) };
    expect(screenFund("large_cap_index", r).flag).toBe(true);
  });
  it("uses tighter thresholds for debt", () => {
    const r = { "1W": triple(0, 0), "1M": triple(-0.3, 0), YTD: triple(-0.8, 0) };
    expect(screenFund("short_debt", r).flag).toBe(true);
  });
  it("maps the number of flagged funds to the three labels", () => {
    expect(suggestLabel([]).label).toBe("No action needed");
    expect(suggestLabel([{ name: "A", reason: "x" }]).label).toBe("One fund worth watching");
    expect(suggestLabel([{ name: "A", reason: "x" }, { name: "B", reason: "y" }]).label).toBe("Consider reviewing your allocation");
  });
});

describe("plain-language headline", () => {
  it("rejects jargon in the assessment reason", () => {
    const o = goodOutput();
    o.assessment.reason = "No fund shows persistent underperformance versus its peers this week.";
    expect(validateReport(o, makeInput()).errors.join()).toMatch(/jargon/);
  });
  it("screen rationales are themselves jargon-free, so the fallback always passes", () => {
    for (const r of [suggestLabel([]), suggestLabel([{ name: "A", reason: "it has been behind similar funds." }]), suggestLabel([{ name: "A", reason: "x" }, { name: "B", reason: "y" }])]) {
      expect(r.rationale).not.toMatch(/benchmark|peer|underperform|YTD/i);
    }
  });
});

describe("advice guard", () => {
  it("blocks instructions and asserted guarantees but allows disclaimers", async () => {
    const { ADVICE_RE } = await import("@/lib/report/validate");
    expect(ADVICE_RE.test("You should sell this fund.")).toBe(true);
    expect(ADVICE_RE.test("Returns are guaranteed.")).toBe(true);
    expect(ADVICE_RE.test("Past returns do not guarantee future returns.")).toBe(false);
    expect(ADVICE_RE.test("Returns are not guaranteed.")).toBe(false);
    expect(ADVICE_RE.test("Domestic institutional buying offset foreign selling.")).toBe(false);
  });
});

describe("hasAdvice", () => {
  it("ignores disclaimers but still catches instructions in the same text", async () => {
    const { hasAdvice } = await import("@/lib/report/validate");
    expect(hasAdvice("This is a research signal, not a recommendation to buy or sell.")).toBe(false);
    expect(hasAdvice("This is not advice. You should sell the fund now.")).toBe(true);
  });
  it("accepts a figure quoted at the input's full precision", async () => {
    const { allowedNumbers, isAllowedNumber } = await import("@/lib/report/validate");
    const allowed = allowedNumbers({ nav: 88.9258 });
    expect(isAllowedNumber({ value: 88.9258, decimals: 4 }, allowed)).toBe(true);
    expect(isAllowedNumber({ value: 88.9259, decimals: 4 }, allowed)).toBe(false);
  });
});

describe("assessment reason never hides a fall (screen-v2)", () => {
  const fund = (name: string, view: "mid_cap" | "small_cap" | "large_cap_index", m: [number, number, number | null], y: [number, number]) => {
    const returns = { "1W": triple(0.2, 0.1), "1M": triple(m[0], m[1], m[2]), YTD: triple(y[0], y[1]) };
    return { name, view, returns, screening: screenFund(view, returns) };
  };

  it("keeps 'No action needed' when funds fall with their market, but says so with the numbers", () => {
    const funds = [fund("HDFC Mid Cap Fund", "mid_cap", [-5.36, -5.42, -6.04], [-2.19, 1.78]), fund("Nippon India Small Cap Fund", "small_cap", [-3.66, -3.94, -4.65], [8.17, 11.76])];
    const notes = portfolioNotes(funds);
    expect(notes.marketDip.map((d) => d.name)).toEqual(["HDFC Mid Cap Fund", "Nippon India Small Cap Fund"]);
    expect(notes.yearLag.map((l) => l.name)).toEqual(["HDFC Mid Cap Fund", "Nippon India Small Cap Fund"]);
    const s = suggestLabel([], notes);
    expect(s.label).toBe("No action needed");
    expect(s.rationale).toMatch(/fell 3\.66%–5\.36% this month/);
    expect(s.rationale).toMatch(/market-wide dip/);
    expect(s.rationale).toMatch(/behind similar funds this year/);
  });

  it("does not call a fall market-wide when the market rose", () => {
    const notes = portfolioNotes([fund("A Fund", "mid_cap", [-3, 1, 1], [0, 0])]);
    expect(notes.marketDip).toEqual([]);
  });

  it("says 'Nothing to do' only when there is nothing to report", () => {
    expect(suggestLabel([], { marketDip: [], yearLag: [] }).rationale).toMatch(/Nothing to do\.$/);
  });

  it("keeps the fallback reason jargon-free and within the word limit", async () => {
    const { JARGON_RE, MAX_REASON_WORDS } = await import("@/lib/report/validate");
    const s = suggestLabel([], {
      marketDip: [
        { name: "A Fund", fund: -5.36, market: -6.04 },
        { name: "B Fund", fund: -3.66, market: -4.65 },
        { name: "C Fund", fund: -3.91, market: -3.89 },
      ],
      yearLag: [
        { name: "A Fund", vsPeers: -3.97 },
        { name: "B Fund", vsPeers: -3.59 },
      ],
    });
    expect(JARGON_RE.test(s.rationale)).toBe(false);
    expect(s.rationale.split(/\s+/).length).toBeLessThanOrEqual(MAX_REASON_WORDS);
  });
});
