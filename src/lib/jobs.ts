import { todayIn } from "@/lib/dates";
import { invalidateData } from "@/lib/db/cached";
import * as repo from "@/lib/db/repo";
import { REPORT_TZ } from "@/lib/env";
import { errorMessage, log } from "@/lib/log";
import { deliverAll, syncEmailStatuses } from "@/lib/delivery/deliver";
import { refreshAllFundNavs, refreshIndices, refreshMarketSnapshot, refreshPeers } from "@/lib/pipeline/data";
import { createWeeklyReport, weekEndingFor } from "@/lib/report/build";
import { refreshDiscovery } from "@/lib/pipeline/discovery";
import { refreshMarketNews } from "@/lib/pipeline/news";

type Step = repo.RunRecord["steps"][number];

async function runStep(steps: Step[], step: string, fn: () => Promise<unknown>, summarise: (r: never) => string = () => "ok"): Promise<boolean> {
  const t = performance.now();
  try {
    const r = await fn();
    steps.push({ step, ok: true, detail: summarise(r as never), ms: Math.round(performance.now() - t) });
    return true;
  } catch (e) {
    steps.push({ step, ok: false, detail: errorMessage(e).slice(0, 500), ms: Math.round(performance.now() - t) });
    log.error("job.step_failed", { step, error: errorMessage(e) });
    return false;
  }
}

const countOk = (rs: { ok: boolean }[]) => `${rs.filter((r) => r.ok).length}/${rs.length} ok`;
const allOk = (rs: { ok: boolean }[]) => rs.every((r) => r.ok);

/** Daily: refresh NAVs, index history and breadth so history accumulates every trading day. */
export async function runDaily(trigger: "cron" | "manual", opts: { force?: boolean } = {}) {
  const today = todayIn(REPORT_TZ());
  const claim = await repo.claimRun("daily", today, trigger, opts);
  if ("skipped" in claim) return { skipped: claim.skipped, run: claim.run };
  const steps: Step[] = [];
  let partial = false;
  await runStep(steps, "fund_navs", async () => {
    const r = await refreshAllFundNavs(today);
    if (!allOk(r)) partial = true;
    return r;
  }, countOk);
  await runStep(steps, "indices", async () => {
    const r = await refreshIndices(today);
    if (!allOk(r)) partial = true;
    return r;
  }, countOk);
  if (!(await runStep(steps, "market_snapshot", refreshMarketSnapshot, (r: { date: string }) => `as of ${r.date}`))) partial = true;
  await runStep(steps, "email_status_sync", async () => syncEmailStatuses((await repo.listReports(4)).map((r) => r.id)), (n: number) => `${n} updated`);
  // Explore Funds metrics/rankings (~20 s) and Market & News with the Gemini brief (~90 s).
  await runStep(steps, "explore_funds", async () => {
    const r = await refreshDiscovery(today);
    if (!allOk(r)) partial = true;
    return r;
  }, countOk);
  await runStep(steps, "market_news", async () => refreshMarketNews(today), (r: { news: number; explained: number; brief: string }) => `${r.news} items, ${r.explained} explained, brief ${r.brief}`);
  const failed = steps.filter((s) => !s.ok).length;
  const status: repo.RunStatus = failed === steps.length ? "failed" : failed || partial ? "partial" : "succeeded";
  await repo.finishRun(claim.run.id, status, steps);
  invalidateData();
  return { status, steps, runId: claim.run.id };
}

/**
 * Saturday: refresh data → peer averages → news + Gemini report → persist → email + WhatsApp.
 * Idempotent per week: the run row and the report id are both keyed by the week-ending date,
 * and each delivery is keyed by report + channel.
 */
export async function runWeekly(trigger: "cron" | "manual", opts: { force?: boolean; deliver?: boolean } = {}) {
  const today = todayIn(REPORT_TZ());
  const weekEnding = weekEndingFor(today);
  const claim = await repo.claimRun("weekly", weekEnding, trigger, opts);
  if ("skipped" in claim) return { skipped: claim.skipped, run: claim.run };
  const steps: Step[] = [];
  let partial = false;

  await runStep(steps, "fund_navs", async () => {
    const r = await refreshAllFundNavs(today);
    if (!allOk(r)) partial = true;
    return r;
  }, countOk);
  await runStep(steps, "indices", async () => {
    const r = await refreshIndices(today);
    if (!allOk(r)) partial = true;
    return r;
  }, countOk);
  if (!(await runStep(steps, "market_snapshot", refreshMarketSnapshot, (r: { date: string }) => `as of ${r.date}`))) partial = true;
  await runStep(steps, "peer_averages", async () => {
    const r = await refreshPeers(today);
    if (!allOk(r)) partial = true;
    return r;
  }, countOk);

  // Re-use this week's scheduled report if a previous attempt already created it.
  let report = await repo.getReport<never, never>(repo.rowId("wk", weekEnding)).catch(() => null);
  if (!report) {
    const ok = await runStep(steps, "report", async () => {
      const r = await createWeeklyReport({ kind: "scheduled", asOf: today });
      report = r.report as never;
      return r;
    }, (r: Awaited<ReturnType<typeof createWeeklyReport>>) => `${r.id} via ${r.report.generator}${r.report.generator === "fallback" ? " (Gemini unavailable)" : ""}`);
    if (!ok) {
      await repo.finishRun(claim.run.id, "failed", steps, "Report generation failed");
      return { status: "failed" as const, steps, runId: claim.run.id };
    }
  } else {
    steps.push({ step: "report", ok: true, detail: `re-used existing ${report.id}` });
  }

  if (opts.deliver !== false && report) {
    await runStep(steps, "delivery", async () => {
      const outcomes = await deliverAll(report as never, { isTest: false });
      // A channel that is not configured yet is reported, but only an actual failure makes the run partial.
      if (outcomes.some((o) => o.status === "failed")) partial = true;
      return outcomes;
    }, (o: { channel: string; status: string; detail?: string }[]) => o.map((x) => `${x.channel}: ${x.status}${x.detail ? ` (${x.detail.slice(0, 120)})` : ""}`).join("; "));
  }

  const status: repo.RunStatus = steps.some((s) => !s.ok) || partial ? "partial" : "succeeded";
  await repo.finishRun(claim.run.id, status, steps);
  invalidateData();
  return { status, steps, runId: claim.run.id, reportId: (report as { id: string } | null)?.id };
}
