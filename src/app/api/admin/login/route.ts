import { cookies } from "next/headers";
import { checkPassword, clientIp, createSessionToken, rateLimit, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/auth";
import { json, readJson } from "@/lib/api";

export async function POST(req: Request) {
  if (!rateLimit(`login:${clientIp(req)}`, 8, 15 * 60_000)) {
    return json({ error: "Too many attempts. Try again in a few minutes." }, 429);
  }
  if (!process.env.ADMIN_PASSWORD) return json({ error: "Admin access is not configured on this deployment." }, 503);
  const { password } = await readJson<{ password?: string }>(req).catch(() => ({ password: "" }));
  if (typeof password !== "string" || !checkPassword(password)) return json({ error: "Incorrect password." }, 401);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, createSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return json({ ok: true });
}
