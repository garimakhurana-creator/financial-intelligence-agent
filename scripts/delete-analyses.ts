// Deletes saved analyses by id (test clean-up). Usage: npx tsx --env-file=.env.local scripts/delete-analyses.ts <id> [...]
import { appwrite } from "@/lib/db/client";
async function main() {
  const { db, databaseId } = appwrite();
  for (const id of process.argv.slice(2)) {
    await db.deleteRow({ databaseId, tableId: "fund_analyses", rowId: id }).then(() => console.log("deleted", id), (e) => console.log("skip", id, e.message));
  }
}
main().then(() => process.exit(0));
