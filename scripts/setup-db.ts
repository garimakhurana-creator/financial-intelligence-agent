// Creates the Postgres tables, columns and indexes if they are missing.
// Additive and idempotent: safe to re-run; never deletes or alters existing data.
// Usage: npx tsx --env-file=.env.local scripts/setup-db.ts
import { sql } from "@/lib/db/client";
import { SCHEMA_VERSION, schemaStatements, TABLES } from "@/lib/db/schema";

async function main() {
  console.log(`Postgres schema v${SCHEMA_VERSION}`);
  const db = sql();
  for (const statement of schemaStatements()) await db.unsafe(statement);
  const rows = await db`select table_name from information_schema.tables where table_schema = 'public'`;
  const present = new Set(rows.map((r) => r.table_name as string));
  for (const id of Object.keys(TABLES)) console.log(`  ${present.has(id) ? "ok" : "MISSING"} ${id}`);
  await db.end();
  console.log("done");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
