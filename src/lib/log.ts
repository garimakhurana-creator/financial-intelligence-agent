// Structured JSON logs (one line each) so they are searchable in Vercel's log viewer.
// Callers must never pass secrets; values whose keys look secret are masked as a safety net.

type Level = "info" | "warn" | "error";
const SECRET_KEY = /key|token|secret|password|authorization/i;

function scrub(meta: Record<string, unknown> = {}): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (SECRET_KEY.test(k)) out[k] = "[redacted]";
    else if (v instanceof Error) out[k] = v.message;
    else out[k] = v;
  }
  return out;
}

function emit(level: Level, event: string, meta?: Record<string, unknown>) {
  if (process.env.NODE_ENV === "test" || process.env.VITEST) return;
  const line = JSON.stringify({ level, event, at: new Date().toISOString(), ...scrub(meta) });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const log = {
  info: (event: string, meta?: Record<string, unknown>) => emit("info", event, meta),
  warn: (event: string, meta?: Record<string, unknown>) => emit("warn", event, meta),
  error: (event: string, meta?: Record<string, unknown>) => emit("error", event, meta),
};

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
