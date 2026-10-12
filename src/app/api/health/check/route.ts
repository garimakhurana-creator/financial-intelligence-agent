import { json } from "@/lib/api";
import { sql } from "@/lib/db/client";
import { addDays, todayIn } from "@/lib/dates";
import { REPORT_TZ } from "@/lib/env";
import { errorMessage } from "@/lib/log";
import { weekEndingFor } from "@/lib/report/build";

export const maxDuration = 30;

/**
 * Deep health check for the outside watchdog (GitHub Actions). Bearer HEALTH_TOKEN.
 * Always reads live data. Returns { ok, problems[], checks } — ok is false when something needs
 * the owner: database unreachable (e.g. paused), nightly job missing or failed, prices stale,
 * Saturday's report missing, or a WhatsApp template rejected.
 */
export async function GET(req: Request) {
  const token = process.env.HEALTH_TOKEN?.trim();
  if (!token || req.headers.get("authorization") !== `Bearer ${token}`) return json({ error: "unauthorized" }, 401);

  const problems: string[] = [];
  const checks: Record<string, unknown> = {};
  const now = new Date();
  const today = todayIn(REPORT_TZ());

  // 1. Database (Nhost) reachable.
  try {
    const db = sql();
    const t0 = Date.now();
    await db`select 1`;
    checks.database = { ok: true, ms: Date.now() - t0 };

    // 2. Nightly job ran in the last ~30 hours and did not fail.
    const [daily] = await db`select run_date, status, started_at, finished_at from scheduled_runs where job = 'daily' order by started_at desc limit 1`;
    checks.lastDaily = daily ?? null;
    if (!daily) problems.push("The nightly data refresh has never run.");
    else {
      const hours = (now.getTime() - Date.parse(daily.started_at)) / 3_600_000;
      if (hours > 30) problems.push(`The nightly data refresh last ran ${Math.round(hours)} hours ago (expected every night) — the Vercel cron may be paused.`);
      if (daily.status === "failed") problems.push(`The last nightly refresh (${daily.run_date}) failed.`);
      if (daily.status === "running" && hours > 1) problems.push(`The last nightly refresh (${daily.run_date}) started ${Math.round(hours)} hours ago and never finished.`);
    }

    // 3. Fund prices are fresh (weekends and holidays allowed).
    const [nav] = await db`select max("date") as latest from nav_history`;
    checks.latestNav = nav?.latest ?? null;
    if (!nav?.latest || nav.latest < addDays(today, -5)) problems.push(`Fund prices are stale (latest NAV ${nav?.latest ?? "none"}).`);

    // 4. After Saturday 10:00 IST, that Saturday's report must exist.
    const istNow = new Date(now.getTime() + 5.5 * 3_600_000);
    const daysSinceSat = (istNow.getUTCDay() + 1) % 7; // Sat→0, Sun→1 … Fri→6
    const lastSat = addDays(today, -daysSinceSat);
    const satPassed = daysSinceSat > 0 || istNow.getUTCHours() >= 10;
    const dueWeek = weekEndingFor(satPassed ? lastSat : addDays(lastSat, -7));
    const [weekly] = await db`select run_date, status, finished_at from scheduled_runs where job = 'weekly' and run_date = ${dueWeek} limit 1`;
    checks.weekly = { weekEnding: dueWeek, run: weekly ?? null };
    if (!weekly) problems.push(`No Saturday report run found for the week ending ${dueWeek}.`);
    else if (weekly.status === "failed") problems.push(`The Saturday report for the week ending ${dueWeek} failed.`);
  } catch (e) {
    checks.database = { ok: false, error: errorMessage(e).slice(0, 200) };
    problems.push(`The database is not responding — Nhost may be paused or down (${errorMessage(e).slice(0, 120)}).`);
  }

  // 5. WhatsApp templates: a rejection needs action (pending is expected while Meta reviews).
  try {
    const wt = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
    const waba = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID?.trim();
    if (wt && waba) {
      const names = [process.env.WHATSAPP_PDF_TEMPLATE_NAME, process.env.WHATSAPP_PDF_TEMPLATE_SHORT, process.env.WHATSAPP_TEMPLATE_NAME].map((n) => n?.trim()).filter(Boolean);
      const res = await fetch(`https://graph.facebook.com/${process.env.WHATSAPP_GRAPH_VERSION?.trim() || "v25.0"}/${waba}/message_templates?fields=name,status&limit=100`, {
        headers: { Authorization: `Bearer ${wt}` },
        signal: AbortSignal.timeout(8_000),
      });
      const j = (await res.json()) as { data?: { name: string; status: string }[]; error?: { message?: string } };
      if (!res.ok) problems.push(`WhatsApp: could not read template status (${j.error?.message ?? res.status}) — the access token may have expired.`);
      else {
        const mine = (j.data ?? []).filter((t) => names.includes(t.name));
        checks.whatsappTemplates = Object.fromEntries(mine.map((t) => [t.name, t.status]));
        for (const t of mine) if (["REJECTED", "PAUSED", "DISABLED"].includes(t.status)) problems.push(`WhatsApp template "${t.name}" is ${t.status.toLowerCase()} by Meta.`);
      }
    }
  } catch (e) {
    checks.whatsappTemplates = { error: errorMessage(e).slice(0, 120) };
  }

  return json({ ok: problems.length === 0, problems, checks, at: now.toISOString() });
}
