// Sends a clearly-labelled TEST delivery of the latest report.
// Usage: npx tsx --env-file=.env.local scripts/send-test.ts <email|telegram|whatsapp>
import * as repo from "@/lib/db/repo";
import { deliver, type Channel } from "@/lib/delivery/deliver";
import type { ReportPayload } from "@/lib/report/build";
import type { ReportInput } from "@/lib/report/types";

async function main() {
  const channel = process.argv[2] as Channel;
  const report = await repo.getLatestReport<ReportPayload, ReportInput>();
  if (!report) throw new Error("no report");
  const r = await deliver(report, channel, { isTest: true });
  console.log(JSON.stringify(r));
  const log = await repo.getDelivery(r.logId);
  console.log("log:", log?.status, log?.providerMessageId ? "provider id recorded" : "no provider id", log?.error ?? "");
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
