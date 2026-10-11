// Generates a manual report from the data already in Appwrite and prints it.
// Usage: npx tsx --env-file=.env.local scripts/generate-report.ts [--reuse-news]
import { createWeeklyReport } from "@/lib/report/build";

async function main() {
  const t = Date.now();
  const { id, report } = await createWeeklyReport({ kind: "manual", reuseNews: process.argv.includes("--reuse-news") });
  const p = report.report;
  console.log(`report ${id} for week ending ${report.weekEnding} in ${Date.now() - t} ms`);
  console.log(`generator=${p.meta.generator} model=${p.meta.model} attempts=${p.meta.attempts} news=${p.news.length}`);
  if (p.meta.validationErrors.length) console.log("validation errors:\n  " + p.meta.validationErrors.join("\n  "));
  if (p.meta.newsErrors.length) console.log("news errors:\n  " + p.meta.newsErrors.join("\n  "));
  console.log(`\nASSESSMENT: ${p.output.assessment.label} — ${p.output.assessment.reason}\n`);
  for (const f of p.output.funds) {
    const name = p.funds.find((x) => x.schemeCode === f.schemeCode)?.schemeName;
    console.log(`${name}\n  1) ${f.performance}\n  2) ${f.comparison}\n  3) ${f.marketContext}  [${f.evidenceIds.join(",")}]\n`);
  }
  for (const c of p.output.categories) console.log(`[${c.viewId}] ${c.headline}\n  ${c.summary}\n  watch: ${c.watchItems.join(" | ")}\n`);
  console.log(`MARKET: ${p.output.marketSummary.text}`);
  console.log(`\nNEWS:\n` + p.news.map((n) => `  ${n.evidenceId} ${n.publishedAt?.slice(0, 10)} ${n.publisher}: ${n.title} [${n.views.join(",")}]`).join("\n"));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
