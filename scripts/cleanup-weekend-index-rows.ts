// One-off: remove weekend observations stored before the Yahoo weekend filter existed.
// Usage: npx tsx --env-file=.env.local scripts/cleanup-weekend-index-rows.ts
import { Query } from "node-appwrite";
import { appwrite } from "@/lib/db/client";

async function main() {
  const { db, databaseId } = appwrite();
  let removed = 0;
  let cursor: string | undefined;
  for (;;) {
    const page = await db.listRows({ databaseId, tableId: "index_history", queries: [Query.limit(500), ...(cursor ? [Query.cursorAfter(cursor)] : [])], total: false });
    for (const r of page.rows) {
      const dow = new Date(`${r.date}T00:00:00Z`).getUTCDay();
      if (dow === 0 || dow === 6) {
        await db.deleteRow({ databaseId, tableId: "index_history", rowId: r.$id });
        removed++;
        console.log(`removed ${r.index_id} ${r.date}`);
      }
    }
    if (page.rows.length < 500) break;
    cursor = page.rows.at(-1)!.$id;
  }
  console.log(`done, removed ${removed}`);
}
main();
