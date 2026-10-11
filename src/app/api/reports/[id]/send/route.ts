import { adminRoute, json, readJson } from "@/lib/api";
import * as repo from "@/lib/db/repo";
import { deliver, type Channel } from "@/lib/delivery/deliver";
import { FundInputError } from "@/lib/pipeline/funds";
import type { ReportPayload } from "@/lib/report/build";
import type { ReportInput } from "@/lib/report/types";

export const maxDuration = 60;

/**
 * Manual delivery. { test: true } (default) sends a clearly-labelled test message with a fresh
 * log entry. { test: false, retry: true } retries a failed production send for this report.
 */
export const POST = adminRoute(async (req: Request, ctx: RouteContext<"/api/reports/[id]/send">) => {
  const { id } = await ctx.params;
  const body = await readJson<{ channel?: string; test?: boolean; retry?: boolean }>(req);
  if (body.channel !== "email" && body.channel !== "whatsapp") throw new FundInputError("channel must be email or whatsapp");
  const report = await repo.getReport<ReportPayload, ReportInput>(id);
  if (!report) return json({ error: "Report not found" }, 404);
  const outcome = await deliver(report, body.channel as Channel, { isTest: body.test !== false, retry: Boolean(body.retry) });
  return json(outcome, outcome.status === "failed" ? 502 : 200);
});
