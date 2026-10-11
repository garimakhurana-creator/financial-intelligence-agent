import { isAdmin } from "@/lib/auth";
import { MissingConfigError } from "@/lib/env";
import { errorMessage, log } from "@/lib/log";
import { FundInputError } from "@/lib/pipeline/funds";

export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

/** Wrap an admin-only route handler: 401 without a session; known errors become clean 4xx. */
export function adminRoute<A extends unknown[]>(handler: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    if (!(await isAdmin())) return json({ error: "Sign in as the owner to do this." }, 401);
    return handle(() => handler(...args));
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
