// Environment access. Secrets are read lazily, per feature, so a missing optional integration
// (e.g. WhatsApp) degrades that feature to "awaiting configuration" instead of crashing the app.

export class MissingConfigError extends Error {
  constructor(
    readonly feature: string,
    readonly missing: string[],
  ) {
    super(`${feature} is not configured (missing ${missing.join(", ")})`);
    this.name = "MissingConfigError";
  }
}

export function requireEnv<K extends string>(keys: K[], feature: string): Record<K, string> {
  const out = {} as Record<K, string>;
  const missing: string[] = [];
  for (const k of keys) {
    const v = process.env[k]?.trim();
    if (v) out[k] = v;
    else missing.push(k);
  }
  if (missing.length) throw new MissingConfigError(feature, missing);
  return out;
}

export function optionalEnv(key: string, fallback = ""): string {
  return process.env[key]?.trim() || fallback;
}

/** Which integrations are configured — names only, never values. Safe to show in the UI. */
export function integrationStatus() {
  const has = (...keys: string[]) => keys.every((k) => Boolean(process.env[k]?.trim()));
  return {
    database: has("APPWRITE_ENDPOINT", "APPWRITE_PROJECT_ID", "APPWRITE_API_KEY", "APPWRITE_DATABASE_ID"),
    gemini: has("GEMINI_API_KEY"),
    news: has("TAVILY_API_KEY") || has("GNEWS_API_KEY"),
    email: has("RESEND_API_KEY", "REPORT_EMAIL_FROM", "REPORT_EMAIL_TO"),
    whatsapp: has(
      "WHATSAPP_ACCESS_TOKEN",
      "WHATSAPP_PHONE_NUMBER_ID",
      "WHATSAPP_RECIPIENT_NUMBER",
      "WHATSAPP_TEMPLATE_NAME",
      "WHATSAPP_GRAPH_VERSION",
    ),
    cron: has("CRON_SECRET"),
    admin: has("ADMIN_PASSWORD"),
  };
}

export const REPORT_TZ = () => optionalEnv("REPORT_TIMEZONE", "Asia/Kolkata");
export const APP_BASE_URL = () => optionalEnv("APP_BASE_URL", "http://localhost:3000").replace(/\/$/, "");
