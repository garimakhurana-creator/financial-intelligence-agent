import { adminRoute, json, readJson } from "@/lib/api";
import { runDaily, runWeekly } from "@/lib/jobs";
import { FundInputError } from "@/lib/pipeline/funds";

export const maxDuration = 300;

// Owner-triggered run of a scheduled job. The weekly job sends real (non-test) messages, so the
// UI asks for confirmation; "force" re-runs a job that already completed for this period.
export const POST = adminRoute(async (req: Request) => {
  const { job, force = false, deliver = true } = await readJson<{ job?: string; force?: boolean; deliver?: boolean }>(req);
  if (job === "daily") return json(await runDaily("manual", { force }));
  if (job === "weekly") return json(await runWeekly("manual", { force, deliver }));
  throw new FundInputError("job must be daily or weekly");
});
