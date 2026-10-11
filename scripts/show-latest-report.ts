// Prints the latest stored report's narrative and generation metadata.
import * as repo from "@/lib/db/repo";
import type { ReportPayload } from "@/lib/report/build";
async function main() {
  const r = await repo.getLatestReport<ReportPayload, unknown>();
  if (!r) return console.log("no report");
  const p = r.report;
  console.log(`${r.id} created ${r.createdAt} generator=${p.meta.generator} model=${p.meta.model} attempts=${p.meta.attempts}`);
  if (p.meta.validationErrors.length) console.log("validation errors:\n  " + p.meta.validationErrors.join("\n  "));
  console.log(`\nASSESSMENT: ${r.assessment} — ${r.assessmentReason}\n`);
  for (const f of p.output.funds) console.log(`${f.schemeCode}\n  ${f.performance}\n  ${f.comparison}\n  ${f.marketContext}`);
  console.log(`\nMARKET: ${p.output.marketSummary.text}`);
}
main().then(() => process.exit(0));
