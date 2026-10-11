// Prints a saved analysis's outcome and narrative validation errors.
import * as research from "@/lib/db/research";
import type { StoredAnalysisData } from "@/lib/analysis/analyse";
research.getAnalysis<StoredAnalysisData>(process.argv[2]).then((a) => {
  console.log(a?.schemeName, a?.data.generator, a?.data.facts.outcome);
  console.log(a?.data.narrativeErrors.join("\n"));
  process.exit(0);
});
