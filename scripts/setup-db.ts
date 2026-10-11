// Creates the Appwrite database, tables, columns and indexes if they are missing.
// Additive and idempotent: safe to re-run; never deletes or alters existing data.
// Usage: npx tsx --env-file=.env.local scripts/setup-db.ts
import { AppwriteException, Client, TablesDB, type Models } from "node-appwrite";
import { SCHEMA_VERSION, TABLES, type ColumnDef, type TableDef } from "@/lib/db/schema";
import { requireEnv } from "@/lib/env";

const env = requireEnv(["APPWRITE_ENDPOINT", "APPWRITE_PROJECT_ID", "APPWRITE_API_KEY", "APPWRITE_DATABASE_ID"], "setup");
const db = new TablesDB(new Client().setEndpoint(env.APPWRITE_ENDPOINT).setProject(env.APPWRITE_PROJECT_ID).setKey(env.APPWRITE_API_KEY));
const databaseId = env.APPWRITE_DATABASE_ID;

const isNotFound = (e: unknown) => e instanceof AppwriteException && e.code === 404;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function ensureDatabase() {
  try {
    await db.get({ databaseId });
    console.log(`database ${databaseId}: exists`);
  } catch (e) {
    if (!isNotFound(e)) throw e;
    await db.create({ databaseId, name: "Mutual fund tracker" });
    console.log(`database ${databaseId}: created`);
  }
}

async function addColumn(tableId: string, col: ColumnDef) {
  const base = { databaseId, tableId, key: col.key, required: Boolean(col.required), array: col.array };
  switch (col.type) {
    case "varchar":
      return db.createVarcharColumn({ ...base, size: col.size ?? 255 });
    case "text":
      return db.createTextColumn(base);
    case "longtext":
      return db.createLongtextColumn(base);
    case "integer":
      return db.createIntegerColumn(base);
    case "double":
      return db.createFloatColumn(base);
    case "boolean":
      return db.createBooleanColumn(base);
    case "datetime":
      return db.createDatetimeColumn(base);
  }
}

/** Columns are created asynchronously; indexes can only be built once they are "available". */
async function waitForColumns(tableId: string) {
  for (let i = 0; i < 60; i++) {
    const { columns } = await db.listColumns({ databaseId, tableId });
    const states = (columns as unknown as { key: string; status: string; error?: string }[]).map((c) => c);
    const failed = states.filter((c) => c.status === "failed");
    if (failed.length) throw new Error(`${tableId}: columns failed: ${failed.map((c) => `${c.key} (${c.error})`).join(", ")}`);
    if (states.every((c) => c.status === "available")) return;
    await sleep(1000);
  }
  throw new Error(`${tableId}: columns did not become available in time`);
}

async function ensureTable(def: TableDef) {
  let table: Models.Table | null = null;
  try {
    table = await db.getTable({ databaseId, tableId: def.id });
  } catch (e) {
    if (!isNotFound(e)) throw e;
  }
  if (!table) {
    // No client-side permissions: all access goes through the server API key.
    await db.createTable({ databaseId, tableId: def.id, name: def.name, permissions: [], rowSecurity: false });
    console.log(`table ${def.id}: created`);
  }

  const { columns } = await db.listColumns({ databaseId, tableId: def.id });
  const have = new Set((columns as unknown as { key: string }[]).map((c) => c.key));
  for (const col of def.columns) {
    if (have.has(col.key)) continue;
    await addColumn(def.id, col);
    console.log(`  + column ${def.id}.${col.key} (${col.type})`);
  }
  await waitForColumns(def.id);

  const { indexes } = await db.listIndexes({ databaseId, tableId: def.id });
  const haveIdx = new Set(indexes.map((i) => i.key));
  for (const idx of def.indexes) {
    if (haveIdx.has(idx.key)) continue;
    await db.createIndex({
      databaseId,
      tableId: def.id,
      key: idx.key,
      type: idx.type as never,
      columns: idx.columns,
      orders: idx.orders as never,
    });
    console.log(`  + index ${def.id}.${idx.key}`);
  }
}

async function main() {
  console.log(`Appwrite schema v${SCHEMA_VERSION}`);
  await ensureDatabase();
  for (const def of Object.values(TABLES)) await ensureTable(def);
  console.log("done");
}

main().catch((e) => {
  console.error(e instanceof AppwriteException ? `${e.code} ${e.type}: ${e.message}` : e);
  process.exit(1);
});
