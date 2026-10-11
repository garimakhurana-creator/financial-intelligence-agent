// Writes the synthetic test factsheet to a path. Usage: npx tsx scripts/write-test-pdf.ts <out.pdf>
import { writeFileSync } from "node:fs";
import { makePdf, SYNTHETIC_FACTSHEET } from "../test/fixtures/make-pdf";
writeFileSync(process.argv[2], makePdf(SYNTHETIC_FACTSHEET));
console.log("written", process.argv[2]);
