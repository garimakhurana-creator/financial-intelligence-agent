import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/auth";
import { json } from "@/lib/api";

export async function POST() {
  (await cookies()).delete(SESSION_COOKIE);
  return json({ ok: true });
}
