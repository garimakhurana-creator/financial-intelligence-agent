import { isCronRequest } from "@/lib/auth";
import { handle, json } from "@/lib/api";
import { runWeekly } from "@/lib/jobs";

export const maxDuration = 300;

// Vercel Cron: Saturdays ~08:00–08:59 IST (see vercel.json). Protected by CRON_SECRET.
// Idempotent per week — a duplicate invocation returns { skipped }.
export async function GET(req: Request) {
  if (!isCronRequest(req)) return json({ error: "unauthorized" }, 401);
  return handle(async () => json(await runWeekly("cron")));
}
