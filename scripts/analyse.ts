// Run a saved fund analysis. Usage:
//   npx tsx --env-file=.env.local scripts/analyse.ts <schemeCode> [path/to/factsheet.pdf]
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { extractFactsheet, validatePdf } from "@/lib/analysis/document";
import { runAnalysis } from "@/lib/analysis/analyse";

async function main() {
  const code = process.argv[2] && process.argv[2] !== "-" ? Number(process.argv[2]) : null;
  const pdfPath = process.argv[3];
  let document = null;
  if (pdfPath) {
    const bytes = new Uint8Array(readFileSync(pdfPath));
    validatePdf(bytes, "application/pdf", bytes.length);
    document = await extractFactsheet(bytes, basename(pdfPath));
    console.log("document:", document.file, "error:", document.error ?? "none");
    for (const [k, v] of Object.entries(document.fields)) if (v.value !== null) console.log(`  ${v.verified ? "✓" : "✗"} ${k}: ${v.value}`);
    console.log(`  returns ${document.returns.filter((r) => r.verified).length}/${document.returns.length} verified, holdings ${document.topHoldings.filter((r) => r.verified).length}/${document.topHoldings.length}, sectors ${document.sectors.filter((r) => r.verified).length}/${document.sectors.length}`);
  }
  const t = Date.now();
  const r = await runAnalysis({ schemeCode: code, document, sourceType: pdfPath ? "pdf" : "code" });
  console.log(`\nanalysis ${r.id} in ${((Date.now() - t) / 1000).toFixed(1)} s · ${r.generator} ${r.model ?? ""}`);
  console.log(`OUTCOME: ${r.facts.outcome} — ${r.facts.outcomeReason}`);
  console.log("strengths:", r.facts.strengths.map((s) => s.text));
  console.log("concerns:", r.facts.concerns.map((s) => s.text));
  console.log("comparison:", JSON.stringify(r.facts.comparison));
  console.log("consistency:", r.facts.consistency, "alternatives:", r.facts.alternatives.map((a) => a.schemeName.slice(0, 35)));
  for (const [k, v] of Object.entries(r.narrative)) console.log(`\n[${k}] ${v}`);
  if (r.errors.length) console.log("\nnarrative errors:", r.errors);
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
