import { log } from "@/lib/log";

export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly url: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export interface FetchOptions extends RequestInit {
  timeoutMs?: number;
  retries?: number;
  /** Label for logs — never include secrets in it. */
  label?: string;
}

const RETRYABLE = new Set([408, 425, 429, 500, 502, 503, 504]);

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Strip query strings from URLs before logging so API keys in params never reach logs. */
export function redactUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`;
  } catch {
    return "<invalid-url>";
  }
}

/**
 * fetch with a timeout and bounded retries (exponential backoff with jitter) for transient
 * failures: network errors, timeouts, 429 and 5xx. 4xx other than 408/425/429 fail immediately.
 */
export async function fetchWithRetry(url: string, opts: FetchOptions = {}): Promise<Response> {
  const { timeoutMs = 15_000, retries = 2, label = redactUrl(url), ...init } = opts;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: ctrl.signal, cache: "no-store" });
      if (res.ok) return res;
      if (!RETRYABLE.has(res.status) || attempt === retries) {
        throw new HttpError(`${label} responded ${res.status}`, res.status, redactUrl(url));
      }
      lastErr = new HttpError(`${label} responded ${res.status}`, res.status, redactUrl(url));
    } catch (e) {
      if (e instanceof HttpError && !RETRYABLE.has(e.status ?? 0)) throw e;
      lastErr = e;
      if (attempt === retries) break;
    } finally {
      clearTimeout(timer);
    }
    const wait = 400 * 2 ** attempt + Math.random() * 200;
    log.warn("http.retry", { label, attempt: attempt + 1, waitMs: Math.round(wait) });
    await sleep(wait);
  }
  if (lastErr instanceof HttpError) throw lastErr;
  const msg = lastErr instanceof Error ? (lastErr.name === "AbortError" ? "timed out" : lastErr.message) : String(lastErr);
  throw new HttpError(`${label} failed: ${msg}`, null, redactUrl(url));
}

export async function fetchJson<T>(url: string, opts: FetchOptions = {}): Promise<T> {
  const res = await fetchWithRetry(url, opts);
  try {
    return (await res.json()) as T;
  } catch {
    throw new HttpError(`${opts.label ?? redactUrl(url)} returned invalid JSON`, res.status, redactUrl(url));
  }
}

/** Run async tasks with a concurrency limit, preserving order; failures are returned, not thrown. */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, i: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      try {
        results[i] = { status: "fulfilled", value: await fn(items[i], i) };
      } catch (reason) {
        results[i] = { status: "rejected", reason };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
