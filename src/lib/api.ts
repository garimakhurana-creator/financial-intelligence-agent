import { clientIp, isAdmin, rateLimit } from "@/lib/auth";
import { invalidateData } from "@/lib/db/cached";
import { MissingConfigError } from "@/lib/env";
import { errorMessage, log } from "@/lib/log";
import { FundInputError } from "@/lib/pipeline/funds";

export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * Wrap an owner action: 401 without access (only when ACCESS_MODE=password), a per-IP rate limit
 * (stricter for sends and jobs), and known errors as clean 4xx responses.
 */
export function adminRoute<A extends unknown[]>(handler: (...args: A) => Promise<Response>, limit: { name: string; max: number; windowMs: number } = { name: "write", max: 120, windowMs: 60 * 60_000 }) {
  return async (...args: A): Promise<Response> => {
    if (!(await isAdmin())) return json({ error: "Sign in as the owner to do this." }, 401);
    const req = args[0] instanceof Request ? args[0] : null;
    if (req && !rateLimit(`${limit.name}:${clientIp(req)}`, limit.max, limit.windowMs)) {
      return json({ error: "Too many requests — please wait a little and try again." }, 429);
    }
    const res = await handle(() => handler(...args));
    // Owner actions write data (funds, holdings, reports, deliveries), so cached page reads go stale.
    if (req && req.method !== "GET" && res.ok) invalidateData();
    return res;
  };
}

export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof FundInputError) return json({ error: e.message }, 400);
    if (e instanceof MissingConfigError) return json({ error: e.message }, 503);
    log.error("api.error", { error: errorMessage(e) });
    return json({ error: "Something went wrong on the server. Details are in the logs." }, 500);
  }
}

export async function readJson<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new FundInputError("Request body must be JSON.");
  }
}
