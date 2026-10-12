import { isCronRequest } from "@/lib/auth";
import { handle, json } from "@/lib/api";
import { warmPages } from "@/lib/db/cached";
import { APP_BASE_URL } from "@/lib/env";
import { runDaily } from "@/lib/jobs";
import { alertOnRun, sendAlert } from "@/lib/alerts";
import { errorMessage } from "@/lib/log";

export const maxDuration = 300;

// Vercel Cron: every day ~00:00–00:59 IST (see vercel.json). Protected by CRON_SECRET.
export async function GET(req: Request) {
  if (!isCronRequest(req)) return json({ error: "unauthorized" }, 401);
  return handle(async () => {
    let result;
    try {
      result = await runDaily("cron");
    } catch (e) {
      // The job crashed before it could record anything: tell the owner, then fail as before.
      await sendAlert("Nightly data refresh crashed", [errorMessage(e)]);
      throw e;
    }
    await alertOnRun("daily", result);
    await warmPages(APP_BASE_URL());
    return json(result);
  });
}
