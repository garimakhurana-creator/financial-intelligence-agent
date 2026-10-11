import { connection } from "next/server";
import { json } from "@/lib/api";
import { integrationStatus } from "@/lib/env";

// Public: which integrations are configured (booleans only — never values).
export async function GET() {
  await connection();
  return json({ ok: true, integrations: integrationStatus(), at: new Date().toISOString() });
}
