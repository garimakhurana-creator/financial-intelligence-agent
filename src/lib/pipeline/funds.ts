import { findPeerRule, INDICES, SEED_FUNDS, suggestPeerRule, suggestView, VIEWS, type IndexId, type ViewId } from "@/lib/catalog";
import { todayIn } from "@/lib/dates";
import * as repo from "@/lib/db/repo";
import { REPORT_TZ } from "@/lib/env";
import { errorMessage } from "@/lib/log";
import { fetchSchemeHistory, parseSchemeCode, SchemeNotFoundError } from "@/lib/sources/mfapi";
import { refreshFundNav } from "@/lib/pipeline/data";

/** Default benchmark per view when a user adds a fund. Shown as a suggestion the user can change. */
const VIEW_DEFAULT_BENCHMARK: Partial<Record<ViewId, IndexId>> = {
  large_cap_index: "NIFTY50",
  mid_cap: "NIFTY_MIDCAP150",
  small_cap: "NIFTY_SMALLCAP250",
};

export interface FundLookup {
  schemeCode: number;
  schemeName: string;
  fundHouse: string;
  amfiCategory: string;
  latestNav: number | null;
  latestNavDate: string | null;
  suggested: { viewId: ViewId | null; peerKey: string | null; benchmarkId: IndexId | null };
  alreadyTracked: boolean;
  warnings: string[];
}

export class FundInputError extends Error {}

/** Validate a scheme code and resolve it against MFapi without saving anything. */
export async function lookupFund(input: string): Promise<FundLookup> {
  const code = parseSchemeCode(input);
  if (!code) throw new FundInputError("Scheme codes are 3–7 digit numbers, e.g. 120716.");
  let h;
  try {
    h = await fetchSchemeHistory(code, { from: "2000-01-01", to: todayIn(REPORT_TZ()) });
  } catch (e) {
    if (e instanceof SchemeNotFoundError) throw new FundInputError(`No mutual fund scheme found for code ${code}.`);
    throw new FundInputError(`Could not reach the NAV source right now (${errorMessage(e)}). Try again shortly.`);
  }
  const warnings: string[] = [];
  const last = h.series.at(-1) ?? null;
  if (!last) warnings.push("This scheme has no NAV history — it may be closed or merged.");
  if (!/direct/i.test(h.meta.schemeName)) warnings.push("This looks like a Regular plan; peer averages use Direct-Growth plans, so the comparison will be slightly unfavourable.");
  if (/idcw|dividend/i.test(h.meta.schemeName)) warnings.push("This is an IDCW (dividend) option; its NAV drops on payouts, which understates returns.");

  const rule = suggestPeerRule(h.meta.schemeCategory, h.meta.schemeName);
  const viewId = suggestView(rule?.key) ?? null;
  if (!rule) warnings.push(`No peer group configured for AMFI category "${h.meta.schemeCategory}" — the fund will be compared with its benchmark only.`);
  const existing = await repo.getFund(code);
  return {
    schemeCode: h.meta.schemeCode,
    schemeName: h.meta.schemeName,
    fundHouse: h.meta.fundHouse,
    amfiCategory: h.meta.schemeCategory,
    latestNav: last?.value ?? null,
    latestNavDate: last?.date ?? null,
    suggested: { viewId, peerKey: rule?.key ?? null, benchmarkId: viewId ? (VIEW_DEFAULT_BENCHMARK[viewId] ?? null) : null },
    alreadyTracked: Boolean(existing?.active),
    warnings,
  };
}

export interface AddFundInput {
  schemeCode: string;
  viewId?: string | null;
  peerKey?: string | null;
  benchmarkId?: string | null;
  statedBenchmark?: string | null;
  benchmarkSource?: string | null;
}

/** Add (or re-activate) a fund, then backfill its NAV history so it appears in the next report. */
export async function addFund(input: AddFundInput) {
  const info = await lookupFund(input.schemeCode);
  if (info.alreadyTracked) throw new FundInputError(`${info.schemeName} is already being tracked.`);

  const viewId = (input.viewId ?? info.suggested.viewId) || null;
  const peerKey = (input.peerKey ?? info.suggested.peerKey) || null;
  const benchmarkId = (input.benchmarkId === undefined ? info.suggested.benchmarkId : input.benchmarkId) || null;
  if (viewId && !(viewId in VIEWS)) throw new FundInputError("Unknown category view.");
  if (peerKey && !findPeerRule(peerKey)) throw new FundInputError("Unknown peer group.");
  if (benchmarkId && !(benchmarkId in INDICES)) throw new FundInputError("Unknown benchmark index.");

  const existing = await repo.getFund(info.schemeCode);
  await repo.saveFund({
    schemeCode: info.schemeCode,
    schemeName: info.schemeName,
    fundHouse: info.fundHouse,
    amfiCategory: info.amfiCategory,
    viewId,
    peerKey,
    benchmarkId,
    statedBenchmark: input.statedBenchmark ?? (benchmarkId ? `${INDICES[benchmarkId as IndexId].name} (suggested from category — verify in the scheme factsheet)` : null),
    benchmarkSource: input.benchmarkSource ?? (benchmarkId ? "Suggested automatically from the fund's category" : null),
    active: true,
    addedAt: existing?.addedAt ?? undefined,
  });
  const fund = (await repo.getFund(info.schemeCode))!;
  const backfill = await refreshFundNav({ ...fund, lastNavDate: null }, todayIn(REPORT_TZ()));
  return { fund, backfill, warnings: info.warnings };
}

/** Soft delete: the fund leaves future reports, but its history and past reports are kept. */
export async function removeFund(schemeCode: number) {
  const fund = await repo.getFund(schemeCode);
  if (!fund || !fund.active) throw new FundInputError("That fund is not currently tracked.");
  await repo.updateFund(schemeCode, { active: false, removed_at: new Date().toISOString() });
}

export async function updateFundMapping(schemeCode: number, patch: { viewId?: string | null; peerKey?: string | null; benchmarkId?: string | null; statedBenchmark?: string | null }) {
  if (patch.viewId && !(patch.viewId in VIEWS)) throw new FundInputError("Unknown category view.");
  if (patch.peerKey && !findPeerRule(patch.peerKey)) throw new FundInputError("Unknown peer group.");
  if (patch.benchmarkId && !(patch.benchmarkId in INDICES)) throw new FundInputError("Unknown benchmark index.");
  const data: Record<string, unknown> = {};
  if (patch.viewId !== undefined) data.view_id = patch.viewId || null;
  if (patch.peerKey !== undefined) data.peer_key = patch.peerKey || null;
  if (patch.benchmarkId !== undefined) {
    data.benchmark_id = patch.benchmarkId || null;
    data.benchmark_source = "Set manually by the user";
  }
  if (patch.statedBenchmark !== undefined) data.stated_benchmark = patch.statedBenchmark || null;
  await repo.updateFund(schemeCode, data);
}

/** Insert Meera's five default SIPs if the fund list is empty. */
export async function seedDefaultFunds() {
  const existing = await repo.listFunds();
  if (existing.length > 0) return { seeded: 0, skipped: "fund list is not empty" };
  const results = [];
  for (const s of SEED_FUNDS) {
    const r = await addFund({
      schemeCode: String(s.schemeCode),
      viewId: s.view,
      peerKey: s.peerKey,
      benchmarkId: s.benchmarkId,
      statedBenchmark: s.statedBenchmark,
      benchmarkSource: s.benchmarkSource,
    });
    results.push({ schemeCode: s.schemeCode, name: r.fund.schemeName, navRows: r.backfill.rows });
  }
  return { seeded: results.length, results };
}
