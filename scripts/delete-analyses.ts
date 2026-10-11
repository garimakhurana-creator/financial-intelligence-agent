// Deletes saved analyses by id (test clean-up). Usage: npx tsx --env-file=.env.local scripts/delete-analyses.ts <id> [...]
import { sql } from "@/lib/db/client";
import { deleteAnalyses } from "@/lib/db/research";

async function main() {
  const removed = await deleteAnalyses(process.argv.slice(2));
  console.log(`deleted ${removed}`);
  await sql().end();
}
main();
