import { Resend } from "resend";
import { formatHuman } from "@/lib/dates";
import { MissingConfigError, requireEnv } from "@/lib/env";
import type { StoredWeeklyReport } from "@/lib/report/build";
import { maskEmail, maskPhone, renderEmail } from "@/lib/delivery/render";

export interface SendResult {
  providerMessageId: string;
  recipientMasked: string;
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

/**
 * Sends the approved template. Template body (configured in WhatsApp Manager):
 *   Hi {{1}}, your weekly mutual fund report for the week ending {{2}} is ready.
 *   Overall: {{3}}. Read it here: {{4}}
 * Business-initiated messages outside a 24-hour customer-service window must use an approved
 * template — free-form text would be rejected by Meta.
 */
export async function sendWhatsApp(report: StoredWeeklyReport, reportUrl: string, opts: { isTest: boolean }): Promise<SendResult> {
  const env = requireEnv([...WA_KEYS], "WhatsApp");
  if (!whatsappOptedIn()) throw new MissingConfigError("WhatsApp", ["WHATSAPP_RECIPIENT_OPTED_IN=yes (recipient consent)"]);
  const out = report.report.output;
  const params = [
    report.inputSnapshot.investorName,
    formatHuman(report.weekEnding),
    `${opts.isTest ? "[TEST] " : ""}${out.assessment.label} — ${out.assessment.reason}`,
    reportUrl,
  ];
  const body = {
    messaging_product: "whatsapp",
    to: env.WHATSAPP_RECIPIENT_NUMBER.replace(/^\+/, ""),
    type: "template",
    template: {
      name: env.WHATSAPP_TEMPLATE_NAME,
      language: { code: process.env.WHATSAPP_TEMPLATE_LANGUAGE?.trim() || "en" },
      components: [{ type: "body", parameters: params.map((t) => ({ type: "text", text: templateText(t) })) }],
    },
  };
  // No automatic retries here: a timeout after Meta accepted the request would otherwise
  // produce a duplicate message. Retries are explicit, from the delivery log.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20_000);
  let res: Response;
  try {
    res = await fetch(`https://graph.facebook.com/${env.WHATSAPP_GRAPH_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(timer);
  }
  const json = (await res.json().catch(() => ({}))) as {
    messages?: { id: string }[];
    error?: { message?: string; code?: number; error_data?: { details?: string } };
  };
  if (!res.ok) {
    const e = json.error;
    throw new Error(`WhatsApp API ${res.status}${e?.code ? ` (code ${e.code})` : ""}: ${e?.error_data?.details ?? e?.message ?? "request rejected"}`);
  }
  const id = json.messages?.[0]?.id;
  if (!id) throw new Error("WhatsApp API accepted the request but returned no message id");
  return { providerMessageId: id, recipientMasked: maskPhone(env.WHATSAPP_RECIPIENT_NUMBER) };
}
