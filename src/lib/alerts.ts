import { Resend } from "resend";
import { APP_BASE_URL } from "@/lib/env";
import { errorMessage, log } from "@/lib/log";

// Owner alerts: when a scheduled job fails or only partly works, or a delivery fails, tell the
// owner on Telegram and by email. An alert must never break the job that raised it, so every
// failure here is logged and swallowed.

const escHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function sendAlert(title: string, lines: string[]): Promise<void> {
  const link = `${APP_BASE_URL()}/manage`;
  const tasks: Promise<unknown>[] = [];

  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chat = process.env.TELEGRAM_CHAT_ID?.trim();
  if (token && chat) {
    const text = [`⚠️ <b>${escHtml(title)}</b>`, "", ...lines.map((l) => `• ${escHtml(l)}`), "", `<a href="${escHtml(link)}">Open Settings &amp; run history</a>`].join("\n");
    tasks.push(
      fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chat, text, parse_mode: "HTML", disable_web_page_preview: true }),
        signal: AbortSignal.timeout(15_000),
      }),
    );
  }

  const key = process.env.RESEND_API_KEY?.trim();
  const from = process.env.REPORT_EMAIL_FROM?.trim();
  const to = process.env.REPORT_EMAIL_TO?.trim();
  if (key && from && to) {
    tasks.push(
      new Resend(key).emails.send({
        from,
        to: to.split(",").map((s) => s.trim()),
        subject: `⚠️ Meera's Money: ${title}`,
        text: [title, "", ...lines.map((l) => `- ${l}`), "", `Settings & run history: ${link}`].join("\n"),
      }),
    );
  }

  const results = await Promise.allSettled(tasks);
  for (const r of results) if (r.status === "rejected") log.error("alert.failed", { error: errorMessage(r.reason) });
  log.warn("alert.sent", { title, channels: tasks.length });
}

type Step = { step: string; ok: boolean; detail?: string };

/** Alert when a scheduled run did not fully succeed (failed or partial steps, or failed deliveries). */
export async function alertOnRun(job: "daily" | "weekly", result: { status?: string; steps?: Step[]; skipped?: string }): Promise<void> {
  if (result.skipped || result.status === "succeeded") return;
  const steps = result.steps ?? [];
  const problems = steps.filter((s) => !s.ok).map((s) => `${s.step} failed: ${(s.detail ?? "").slice(0, 200)}`);
  // A step can be "ok" yet partial (e.g. one fund's NAV failed, or a delivery channel failed).
  for (const s of steps) if (s.ok && /failed/i.test(s.detail ?? "")) problems.push(`${s.step}: ${(s.detail ?? "").slice(0, 200)}`);
  if (problems.length === 0) problems.push(`The run finished with status "${result.status ?? "unknown"}".`);
  await sendAlert(`${job === "daily" ? "Nightly data refresh" : "Saturday report"} needs attention`, problems);
}
