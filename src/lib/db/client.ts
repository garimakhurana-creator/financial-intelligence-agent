import postgres from "postgres";
import { requireEnv } from "@/lib/env";

export type Row = postgres.Row;

let client: postgres.Sql | null = null;

/**
 * Server-side Postgres client (Nhost-hosted). Never import this from client components.
 * Small pool: serverless functions are short-lived and the free database has few connections.
 */
export function sql(): postgres.Sql {
  if (client) return client;
  const { DATABASE_URL } = requireEnv(["DATABASE_URL"], "database");
  client = postgres(DATABASE_URL, {
    ssl: process.env.DATABASE_SSL === "disable" ? false : "require",
    max: 3,
    idle_timeout: 20,
    connect_timeout: 15,
    // Works behind a transaction-mode pooler as well as a direct connection.
    prepare: false,
    onnotice: () => {},
  });
  return client;
}

const nullify = (v: unknown) => (v === undefined ? null : v);

/**
 * Insert rows, or update the given columns when the id already exists. Columns not present in
 * the rows are left untouched on update (same semantics as the previous Appwrite upsert).
 */
export async function upsertRows(table: string, rows: Record<string, unknown>[], chunk = 500) {
  if (rows.length === 0) return;
  const cols = Object.keys(rows[0]);
  const set = cols
    .filter((c) => c !== "id")
    .map((c) => `"${c}" = excluded."${c}"`)
    .join(", ");
  const db = sql();
  for (let i = 0; i < rows.length; i += chunk) {
    const part = rows.slice(i, i + chunk).map((r) => Object.fromEntries(cols.map((c) => [c, nullify(r[c])])) as Row);
    await db`insert into ${db(table)} ${db(part, cols)} on conflict (id) do ${set ? db.unsafe(`update set ${set}`) : db.unsafe("nothing")}`;
  }
}

export async function upsertRow(table: string, id: string, data: Record<string, unknown>) {
  await upsertRows(table, [{ id, ...data }]);
}

/** Insert a row only if the id is new. Returns the row, or null when it already existed. */
export async function insertIfNew(table: string, id: string, data: Record<string, unknown>): Promise<Row | null> {
  const db = sql();
  const row = { id, ...Object.fromEntries(Object.entries(data).map(([k, v]) => [k, nullify(v)])) };
  const out = await db`insert into ${db(table)} ${db(row)} on conflict (id) do nothing returning *`;
  return out[0] ?? null;
}

export async function updateRow(table: string, id: string, data: Record<string, unknown>): Promise<Row | null> {
  const db = sql();
  const patch = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, nullify(v)]));
  const out = await db`update ${db(table)} set ${db(patch)} where id = ${id} returning *`;
  return out[0] ?? null;
}

export async function getRow(table: string, id: string): Promise<Row | null> {
  const db = sql();
  const out = await db`select * from ${db(table)} where id = ${id}`;
  return out[0] ?? null;
}

export async function deleteRow(table: string, id: string) {
  const db = sql();
  await db`delete from ${db(table)} where id = ${id}`;
}
