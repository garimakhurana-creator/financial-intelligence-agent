import { adminRoute, json, readJson } from "@/lib/api";
import { DISCOVERY_GROUPS } from "@/lib/catalog";
import * as research from "@/lib/db/research";
import { FundInputError } from "@/lib/pipeline/funds";

const GOALS = ["wealth", "retirement", "house", "education", "emergency", "other"];

// Optional SIP questionnaire answers, used only to filter and explain Explore Funds.
export const PUT = adminRoute(async (req: Request) => {
  const b = await readJson<Record<string, unknown>>(req);
  const num = (v: unknown, max: number) => (v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) <= max ? Number(v) : NaN);
  const horizon = num(b.horizonYears, 50);
  const budget = num(b.monthlyBudget, 1e7);
  if (Number.isNaN(horizon) || Number.isNaN(budget)) throw new FundInputError("Horizon and budget must be sensible positive numbers.");
  const risk = b.riskComfort === "low" || b.riskComfort === "medium" || b.riskComfort === "high" ? b.riskComfort : null;
  const goal = typeof b.goal === "string" && GOALS.includes(b.goal) ? b.goal : null;
  const groups = Array.isArray(b.preferredGroups) ? b.preferredGroups.filter((g): g is string => typeof g === "string" && DISCOVERY_GROUPS.some((x) => x.key === g)) : [];
  await research.savePreferences({ goal, horizonYears: horizon, monthlyBudget: budget, riskComfort: risk, preferredGroups: groups });
  return json({ ok: true });
});
