import { Resend } from "resend";
import { formatHuman } from "@/lib/dates";
import { MissingConfigError, requireEnv } from "@/lib/env";
import { log } from "@/lib/log";
import type { StoredWeeklyReport } from "@/lib/report/build";
import { maskEmail, maskPhone, renderEmail } from "@/lib/delivery/render";
import { whatsappShareLink, whatsappShareText } from "@/lib/delivery/share";

export interface SendResult {
  providerMessageId: string;
  recipientMasked: string;
  /** Optional note for the run log, e.g. which WhatsApp template was used. */
  detail?: string;
}

// ---------------------------------------------------------------------------------------------
// Email (Resend)

export function emailRecipientMasked(): string | null {
  const to = process.env.REPORT_EMAIL_TO?.trim();
  return to ? maskEmail(to) : null;
}

export async function sendEmail(report: StoredWeeklyReport, reportUrl: string, opts: { isTest: boolean; idempotencyKey: string }): Promise<SendResult> {
  const env = requireEnv(["RESEND_API_KEY", "REPORT_EMAIL_FROM", "REPORT_EMAIL_TO"], "Email");
  const { subject, html, text } = renderEmail(report, reportUrl, opts);
  const resend = new Resend(env.RESEND_API_KEY);
  const { data, error } = await resend.emails.send(
    { from: env.REPORT_EMAIL_FROM, to: env.REPORT_EMAIL_TO.split(",").map((s) => s.trim()), subject, html, text },
    // Resend de-duplicates sends with the same key for 24h — a second guard against double sends.
    { idempotencyKey: opts.idempotencyKey },
  );
  if (error || !data?.id) throw new Error(`Resend rejected the email: ${error?.message ?? "no message id returned"}`);
  return { providerMessageId: data.id, recipientMasked: maskEmail(env.REPORT_EMAIL_TO) };
}

// ---------------------------------------------------------------------------------------------
// WhatsApp Business Cloud API (official Meta Graph API)

const WA_KEYS = [
  "WHATSAPP_ACCESS_TOKEN",
  "WHATSAPP_PHONE_NUMBER_ID",
  "WHATSAPP_RECIPIENT_NUMBER",
  "WHATSAPP_TEMPLATE_NAME",
  "WHATSAPP_GRAPH_VERSION",
] as const;

export function whatsappRecipientMasked(): string | null {
  const to = process.env.WHATSAPP_RECIPIENT_NUMBER?.trim();
  return to ? maskPhone(to) : null;
}

/** The recipient must have opted in to receive WhatsApp messages from this business number. */
export function whatsappOptedIn(): boolean {
  return /^(yes|true)$/i.test(process.env.WHATSAPP_RECIPIENT_OPTED_IN?.trim() ?? "");
}

/** WhatsApp template parameters cannot contain newlines/tabs or more than 4 consecutive spaces. */
export function templateText(s: string, max = 900): string {
  const clean = s.replace(/[\r\n\t]+/g, " ").replace(/ {4,}/g, "   ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

/** Link to the report's PDF (public route), used as the WhatsApp document header. */
export function reportPdfUrl(reportUrl: string): string {
  return `${reportUrl.replace(/\/reports\//, "/api/reports/")}/pdf`;
}

/** Meta errors meaning "this template can't be used (yet)": missing, not approved, or parameter mismatch. */
const TEMPLATE_UNUSABLE = new Set([132000, 132001, 132005, 132007, 132012, 132015, 132016]);

class WhatsAppApiError extends Error {
  constructor(
    message: string,
    readonly code: number | undefined,
  ) {
    super(message);
  }
}

async function postTemplate(env: Record<string, string>, to: string, template: Record<string, unknown>): Promise<string> {
  // No automatic retries: a timeout after Meta accepted the request would otherwise produce a
  // duplicate message. Retries are explicit, from the delivery log.
  const res = await fetch(`https://graph.facebook.com/${env.WHATSAPP_GRAPH_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to, type: "template", template }),
    signal: AbortSignal.timeout(20_000),
  });
  const json = (await res.json().catch(() => ({}))) as {
    messages?: { id: string }[];
    error?: { message?: string; code?: number; error_data?: { details?: string } };
  };
  if (!res.ok) {
    const e = json.error;
    throw new WhatsAppApiError(`WhatsApp API ${res.status}${e?.code ? ` (code ${e.code})` : ""}: ${e?.error_data?.details ?? e?.message ?? "request rejected"}`, e?.code);
  }
  const id = json.messages?.[0]?.id;
  if (!id) throw new Error("WhatsApp API accepted the request but returned no message id");
  return id;
}

/**
 * Sends the weekly report on WhatsApp through an approved template (business-initiated messages
 * must use one). Preferred: WHATSAPP_PDF_TEMPLATE_NAME — the full report attached as a PDF
 * document (three sentences per fund, market, closing assessment), with this body:
 *   Hi {{1}}, your weekly mutual fund report for the week ending {{2}} is attached as a PDF.
 *   Overall: {{3}}. Full report with sources: {{4}} (monitoring summary, not investment advice).
 * If that template is missing or not approved yet, Meta rejects the request (nothing is sent)
 * and we fall back to the text template WHATSAPP_TEMPLATE_NAME (same body, no attachment).
 */
export async function sendWhatsApp(report: StoredWeeklyReport, reportUrl: string, opts: { isTest: boolean }): Promise<SendResult> {
  const env = requireEnv([...WA_KEYS], "WhatsApp");
  if (!whatsappOptedIn()) throw new MissingConfigError("WhatsApp", ["WHATSAPP_RECIPIENT_OPTED_IN=yes (recipient consent)"]);
  const out = report.report.output;
  const to = env.WHATSAPP_RECIPIENT_NUMBER.replace(/^\+/, "");
  const language = { code: process.env.WHATSAPP_TEMPLATE_LANGUAGE?.trim() || "en" };
  const body = {
    type: "body",
    parameters: [
      report.inputSnapshot.investorName,
      formatHuman(report.weekEnding),
      `${opts.isTest ? "[TEST] " : ""}${out.assessment.label} — ${out.assessment.reason}`,
      reportUrl,
    ].map((t) => ({ type: "text", text: templateText(t) })),
  };
  const recipientMasked = maskPhone(env.WHATSAPP_RECIPIENT_NUMBER);

  const pdfTemplate = process.env.WHATSAPP_PDF_TEMPLATE_NAME?.trim();
  if (pdfTemplate) {
    const header = {
      type: "header",
      parameters: [{ type: "document", document: { link: reportPdfUrl(reportUrl), filename: `fund-report-${report.weekEnding}.pdf` } }],
    };
    try {
      const id = await postTemplate(env, to, { name: pdfTemplate, language, components: [header, body] });
      return { providerMessageId: id, recipientMasked, detail: "sent with the PDF report attached" };
    } catch (e) {
      if (!(e instanceof WhatsAppApiError && e.code !== undefined && TEMPLATE_UNUSABLE.has(e.code))) throw e;
      log.warn("whatsapp.pdf_template_unusable", { template: pdfTemplate, error: e.message });
    }
  }
  const id = await postTemplate(env, to, { name: env.WHATSAPP_TEMPLATE_NAME, language, components: [body] });
  return { providerMessageId: id, recipientMasked, detail: pdfTemplate ? "PDF template not approved yet — sent the summary with the report link" : undefined };
}

// ---------------------------------------------------------------------------------------------
// Telegram (Bot API) — interim messaging channel while WhatsApp Business approval is pending.

const TELEGRAM_LIMIT = 4096;

export function telegramRecipientMasked(): string | null {
  const id = process.env.TELEGRAM_CHAT_ID?.trim();
  return id ? `chat ${maskPhone(id)}` : null;
}

/** Plain-text Telegram message(s); split on fund boundaries to stay under the 4096-char limit. */
export function renderTelegram(report: StoredWeeklyReport, reportUrl: string, opts: { isTest: boolean }): string[] {
  const out = report.report.output;
  const head = [
    opts.isTest ? "🧪 TEST — not the scheduled Saturday report\n" : "",
    `📊 Weekly fund report — week ending ${formatHuman(report.weekEnding)}`,
  ].join("\n");
  const funds = out.funds.map((f) => {
    const name = report.report.funds.find((x) => x.schemeCode === f.schemeCode)?.schemeName.replace(/\s*-\s*Direct Plan.*$/i, "") ?? String(f.schemeCode);
    return `▪️ ${name}\n${f.performance}\n${f.comparison}\n${f.marketContext}`;
  });
  // Private chat, so the owner's own number is fine here (never shown on public pages).
  const waNum = process.env.WHATSAPP_SHARE_NUMBER?.trim();
  const wa = waNum ? `\n\nSave to WhatsApp (one tap, then Send): ${whatsappShareLink(whatsappShareText(report, reportUrl), waNum)}` : "";
  const tail = `🌐 Market: ${out.marketSummary.text}\n\n✅ Overall assessment: ${out.assessment.label}\n${out.assessment.reason}\n\nFull report with sources: ${reportUrl}${wa}\n\nNot investment advice. Past performance does not guarantee future returns.`;
  const messages: string[] = [];
  let cur = head;
  for (const block of [...funds, tail]) {
    if ((cur + "\n\n" + block).length > TELEGRAM_LIMIT) {
      messages.push(cur);
      cur = block;
    } else cur += "\n\n" + block;
  }
  messages.push(cur);
  return messages.map((m) => (m.length > TELEGRAM_LIMIT ? `${m.slice(0, TELEGRAM_LIMIT - 1)}…` : m));
}

export async function sendTelegram(report: StoredWeeklyReport, reportUrl: string, opts: { isTest: boolean }): Promise<SendResult> {
  const env = requireEnv(["TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"], "Telegram");
  const ids: string[] = [];
  for (const text of renderTelegram(report, reportUrl, opts)) {
    const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text, disable_web_page_preview: true }),
      signal: AbortSignal.timeout(20_000),
    });
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: { message_id: number }; description?: string };
    if (!res.ok || !j.ok || !j.result) throw new Error(`Telegram API ${res.status}: ${j.description ?? "request rejected"}`);
    ids.push(String(j.result.message_id));
  }
  return { providerMessageId: ids.join(","), recipientMasked: telegramRecipientMasked() ?? "chat" };
}

// ---------------------------------------------------------------------------------------------
// Provider-confirmed email status (Resend). A successful send only means "accepted"; Resend's
// last_event tells us whether the receiving server took it (delivered) or rejected it (bounced).

const RESEND_EVENT_MAP: Record<string, "delivered" | "read" | "failed" | "sent_to_provider"> = {
  sent: "sent_to_provider",
  delivered: "delivered",
  opened: "read",
  clicked: "read",
  bounced: "failed",
  complained: "failed",
  delivery_delayed: "sent_to_provider",
};

export async function fetchEmailStatus(providerMessageId: string): Promise<{ status: "delivered" | "read" | "failed" | "sent_to_provider" | null; event: string | null }> {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) return { status: null, event: null };
  const res = await fetch(`https://api.resend.com/emails/${encodeURIComponent(providerMessageId)}`, {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) return { status: null, event: null };
  const j = (await res.json()) as { last_event?: string };
  return { status: j.last_event ? (RESEND_EVENT_MAP[j.last_event] ?? null) : null, event: j.last_event ?? null };
}
