import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

// Single-owner admin auth: a password (ADMIN_PASSWORD) exchanged for an HMAC-signed, httpOnly
// session cookie. Reading pages is public (it is an evaluation demo); every mutating action and
// every outbound send requires this session. Cron endpoints use CRON_SECRET instead.

export const SESSION_COOKIE = "mft_admin";
// 30 days, so the owner is not asked to sign in again every visit.
const SESSION_TTL_S = 30 * 24 * 60 * 60;

function signingKey(): string {
  const pw = process.env.ADMIN_PASSWORD;
  const salt = process.env.CRON_SECRET ?? "";
  if (!pw) throw new Error("ADMIN_PASSWORD is not configured");
  return `${pw}:${salt}`;
}

function sign(payload: string): string {
  return createHmac("sha256", signingKey()).update(payload).digest("base64url");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function createSessionToken(now = Date.now()): string {
  const exp = String(Math.floor(now / 1000) + SESSION_TTL_S);
  return `${exp}.${sign(exp)}`;
}

export function verifySessionToken(token: string | undefined, now = Date.now()): boolean {
  if (!token || !process.env.ADMIN_PASSWORD) return false;
  const [exp, sig] = token.split(".");
  if (!exp || !sig || !/^\d+$/.test(exp)) return false;
  if (Number(exp) * 1000 < now) return false;
  return safeEqual(sig, sign(exp));
}

export function checkPassword(candidate: string): boolean {
  const pw = process.env.ADMIN_PASSWORD;
  return Boolean(pw) && safeEqual(candidate, pw!);
}

export async function isAdmin(): Promise<boolean> {
  const jar = await cookies();
  return verifySessionToken(jar.get(SESSION_COOKIE)?.value);
}

export const SESSION_MAX_AGE = SESSION_TTL_S;

/** Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`. */
export function isCronRequest(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get("authorization") ?? "";
  return Boolean(secret) && safeEqual(header, `Bearer ${secret}`);
}

// Best-effort in-memory rate limiter (per warm instance). Serverless instances are not shared,
// so this slows brute force rather than guaranteeing a global limit — documented as such.
const hits = new Map<string, number[]>();
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const arr = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= limit) {
    hits.set(key, arr);
    return false;
  }
  arr.push(now);
  hits.set(key, arr);
  return true;
}

export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}
