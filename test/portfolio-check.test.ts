import { describe, expect, it } from "vitest";
import { matchScheme } from "@/lib/analysis/portfolio";
import type { AmfiScheme } from "@/lib/sources/amfi";

const s = (schemeCode: number, schemeName: string, plan: string, option: string, category = "Equity Scheme - Large Cap Fund", amc = "ICICI Prudential Mutual Fund"): AmfiScheme => ({
  schemeCode,
  schemeName,
  plan,
  option,
  nav: 10,
  date: "2026-10-09",
  category,
  structure: "Open Ended Schemes",
  amc,
});

const LIST: AmfiScheme[] = [
  s(108466, "ICICI Prudential Large Cap Fund (erstwhile Bluechip Fund)", "Regular Plan", "Growth"),
  s(120586, "ICICI Prudential Large Cap Fund (erstwhile Bluechip Fund)", "Direct Plan", "Growth"),
  s(120186, "ICICI Prudential US Bluechip Equity Fund", "Direct Plan", "Growth", "Other Scheme - FoF Overseas"),
  s(120596, "ICICI Prudential Large & Mid Cap Fund", "Direct Plan", "Growth", "Equity Scheme - Large & Mid Cap Fund"),
  s(153447, "Kotak Energy Opportunities Fund", "Direct Plan", "Growth", "Equity Scheme - Sectoral/ Thematic", "Kotak Mahindra Mutual Fund"),
];

describe("matching statement names to schemes", () => {
  it("finds a renamed fund by its former name and picks the plan the statement shows", () => {
    const m = matchScheme("ICICI Prudential Bluechip Fund - Regular Plan - Growth", LIST);
    expect(m?.scheme.schemeCode).toBe(108466);
    expect(m?.compare.schemeCode).toBe(120586); // compared on the Direct-Growth plan
  });
  it("never settles for a near miss", () => {
    expect(matchScheme("ICICI Prudential Large Cap Fund Direct Growth", LIST)?.scheme.schemeCode).toBe(120586); // not Large & Mid Cap
    expect(matchScheme("Kotak Equity Opportunities Fund", LIST)).toBeNull(); // not "Energy Opportunities"
    expect(matchScheme("Some Made Up Fund", LIST)).toBeNull();
  });
});
