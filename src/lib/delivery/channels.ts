import { Resend } from "resend";
import { formatHuman } from "@/lib/dates";
import { MissingConfigError, requireEnv } from "@/lib/env";
import { log } from "@/lib/log";
import { cleanTitle } from "@/lib/news/art";
import { reportChecks } from "@/lib/report/checks";
import type { StoredWeeklyReport } from "@/lib/report/build";
import { maskEmail, maskPhone, renderEmail } from "@/lib/delivery/render";

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

/**
 * Body of the PDF template (WHATSAPP_PDF_TEMPLATE_NAME), exactly as submitted to Meta. The PDF holds
 * the full report; the message itself carries the key insights: the overall assessment with its
 * reason, one line per fund for the week, and the market in a sentence or two.
 */
export const WHATSAPP_PDF_BODY =
  "Hi {{1}}, here is your weekly mutual fund report for the week ending {{2}}.\n\n*Overall:* {{3}}\n\n*Your funds this week:* {{4}}\n\n*The market:* {{5}}\n\nThe full report is attached as a PDF. Sources and charts: {{6}}\n\nThis is a monitoring summary, not investment advice.";

/** WhatsApp caps a template body at 1,024 characters once the parameters are filled in. */
export const WHATSAPP_BODY_LIMIT = 1024;

const FUND_EMOJI_BY_VIEW: Record<string, string> = { large_cap_index: "🏢", mid_cap: "🚀", small_cap: "🌱", short_debt: "🛟", intl_fof: "🌎" };
const waName = (n: string) =>
  n
    .replace(/\s*-\s*Direct Plan.*$/i, "")
    .replace(/\s+US Specific Equity Passive FOF$/i, "")
    .replace(/\s+Fund$/i, "")
    .trim();
const signedPct = (n: number | null | undefined) => {
  if (n === null || n === undefined) return "n/a";
  const r = Math.round(n * 100) / 100;
  return `${r > 0 ? "+" : ""}${(r === 0 ? 0 : r).toFixed(2)}%`;
};

/** "🚀 HDFC Mid Cap +0.17% (ahead of similar funds)" — one per fund, joined on one line. */
export function fundsLine(report: StoredWeeklyReport): string {
  return report.report.funds
    .map((f) => {
      const w = f.windows["1W"];
      const gap = w.vsPeerPp;
      const words = gap === null ? "" : Math.abs(gap) < 0.1 ? " (in line)" : Math.abs(gap) < 1 ? (gap > 0 ? " (slightly ahead)" : " (slightly behind)") : gap > 0 ? " (ahead)" : " (behind)";
      return `${FUND_EMOJI_BY_VIEW[f.viewId ?? ""] ?? "•"} ${waName(f.schemeName)} ${signedPct(w.fund.returnPct)}${words}`;
    })
    .join(" · ")
    .replace(/^/, "vs similar funds — ");
}

/** Whole sentences from the start of `text` that fit in `max` characters (at least the first, trimmed). */
function sentencesWithin(text: string, max: number): string {
  const parts = text.replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s+/);
  let out = "";
  for (const s of parts) {
    const next = out ? `${out} ${s}` : s;
    if (next.length > max) break;
    out = next;
  }
  return out || templateText(parts[0], max);
}

/** Parameters for WHATSAPP_PDF_BODY, sized so the rendered message stays within WhatsApp's limit. */
export function whatsappPdfParams(report: StoredWeeklyReport, reportUrl: string, opts: { isTest: boolean }): string[] {
  const out = report.report.output;
  const name = report.inputSnapshot.investorName;
  const week = formatHuman(report.weekEnding);
  const [firstSentence, ...rest] = out.assessment.reason.trim().split(/(?<=[.!?])\s+/);
  const labelStart = out.assessment.label.toLowerCase().split(" ").slice(0, 2).join(" ");
  const reason = rest.length && firstSentence.toLowerCase().includes(labelStart) ? rest.join(" ") : out.assessment.reason;
  let overall = templateText(`${opts.isTest ? "[TEST] " : ""}${out.assessment.label}. ${reason}`, 420);
  const funds = templateText(fundsLine(report), 360);
  let market = templateText(out.marketSummary.text, 400);

  // Meta's limit covers the template text WITH its {{n}} placeholders plus every parameter, and
  // counts emoji and symbols like "·" and "—" as more than one character. Budget in UTF-8 bytes
  // (never fewer than Meta's count), keep a margin, and trim the market line, then the verdict.
  const budget = WHATSAPP_BODY_LIMIT - WHATSAPP_MARGIN;
  const size = () => whatsappMetaSize([name, week, overall, funds, market, reportUrl]);
  const shorten = (s: string, min: number) => {
    const cut = s.lastIndexOf(" ", s.length - 12);
    return cut > min ? `${s.slice(0, cut).replace(/[,.;:—–-]+$/, "")}…` : s;
  };
  if (size() > budget) market = sentencesWithin(out.marketSummary.text, Math.max(60, market.length - (size() - budget)));
  for (let guard = 0; size() > budget && guard < 200; guard++) {
    const next = market.length > 60 ? shorten(market, 40) : shorten(overall, 80);
    if (next === market || next === overall) break;
    if (market.length > 60) market = next;
    else overall = next;
  }
  return [name, week, overall, funds, market, reportUrl];
}

/** Size as WhatsApp may count it: UTF-8 bytes (always ≥ the character count Meta enforces). */
export const whatsappMetaSize = (params: string[]) => whatsappSize(WHATSAPP_PDF_BODY) + params.reduce((s, x) => s + whatsappSize(x), 0);
export const whatsappSize = (s: string) => new TextEncoder().encode(s).length;
const WHATSAPP_MARGIN = 24;

/** The message as WhatsApp will show it (for previews and tests). */
export function renderWhatsAppBody(params: string[]): string {
  return WHATSAPP_PDF_BODY.replace(/\{\{(\d)\}\}/g, (_, i) => params[Number(i) - 1] ?? "");
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

  // Try templates from richest to simplest; Meta rejects one that isn't approved (nothing is sent),
  // so the first usable one wins. Any other error stops here, so a message is never sent twice.
  const header = {
    type: "header",
    parameters: [{ type: "document", document: { link: reportPdfUrl(reportUrl), filename: `fund-report-${report.weekEnding}.pdf` } }],
  };
  const richBody = { type: "body", parameters: whatsappPdfParams(report, reportUrl, opts).map((t) => ({ type: "text", text: t })) };
  const attempts = [
    { name: process.env.WHATSAPP_PDF_TEMPLATE_NAME?.trim(), components: [header, richBody], detail: "sent with key insights and the PDF report attached" },
    { name: process.env.WHATSAPP_PDF_TEMPLATE_SHORT?.trim(), components: [header, body], detail: "sent with the PDF report attached (short message — the richer template could not be used)" },
    { name: env.WHATSAPP_TEMPLATE_NAME, components: [body], detail: "PDF templates could not be used — sent the summary with the report link" },
  ].filter((a): a is { name: string; components: typeof a.components; detail: string } => Boolean(a.name));

  for (const [i, a] of attempts.entries()) {
    try {
      const id = await postTemplate(env, to, { name: a.name, language, components: a.components });
      return { providerMessageId: id, recipientMasked, detail: i === attempts.length - 1 && attempts.length === 1 ? undefined : a.detail };
    } catch (e) {
      const last = i === attempts.length - 1;
      if (last || !(e instanceof WhatsAppApiError && e.code !== undefined && TEMPLATE_UNUSABLE.has(e.code))) throw e;
      log.warn("whatsapp.template_unusable", { template: a.name, error: e.message });
    }
  }
  throw new Error("No WhatsApp template configured");
}

// ---------------------------------------------------------------------------------------------
// Telegram (Bot API) — interim messaging channel while WhatsApp Business approval is pending.

export function telegramRecipientMasked(): string | null {
  const id = process.env.TELEGRAM_CHAT_ID?.trim();
  return id ? `chat ${maskPhone(id)}` : null;
}

const escHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const shortFund = (n: string) => waName(n).replace(/\s+Index$/i, "");
const range = (xs: number[]) => {
  const a = xs.map((x) => Math.abs(x)).sort((p, q) => p - q);
  return a[0] === a.at(-1) ? `${a[0].toFixed(2)}%` : `${a[0].toFixed(2)}%–${a.at(-1)!.toFixed(2)}%`;
};
const joinNames = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

/** Key insights, all computed from the report's numbers so they always agree with the verdict. */
export function reportInsights(report: StoredWeeklyReport): string[] {
  const out: string[] = [];
  const checks = reportChecks(report);
  for (const c of checks.filter((x) => x.flagged)) {
    out.push(
      c.month !== null && c.year !== null
        ? `👀 <b>${escHtml(c.name)}</b> is behind similar funds this month (${Math.abs(c.month).toFixed(2)} pts) and this year (${Math.abs(c.year).toFixed(2)} pts) — worth watching.`
        : `👀 <b>${escHtml(c.name)}</b> is worth watching.`,
    );
  }
  if (!checks.some((x) => x.flagged)) out.push("✅ No fund has a problem of its own this week.");
  const notes = report.inputSnapshot.screening.notes;
  if (notes?.marketDip.length) {
    out.push(`📉 ${escHtml(joinNames(notes.marketDip.map((d) => shortFund(d.name))))} fell ${range(notes.marketDip.map((d) => d.fund))} this month, but so did ${notes.marketDip.length === 1 ? "its market" : "their markets"} — a market-wide dip, not a fund problem.`);
  }
  for (const c of checks.filter((x) => !x.flagged && x.yearBehind && !x.monthBehind)) {
    out.push(`🔎 ${escHtml(c.name)} trails similar funds this year (${Math.abs(c.year ?? 0).toFixed(2)} pts) but kept pace this month, so it isn't flagged.`);
  }
  const week = report.report.funds.filter((f) => f.windows["1W"].fund.returnPct !== null).sort((a, b) => (b.windows["1W"].fund.returnPct as number) - (a.windows["1W"].fund.returnPct as number));
  if (week.length >= 2) {
    out.push(`🏆 Best this week: ${escHtml(shortFund(week[0].schemeName))} <b>${signedPct(week[0].windows["1W"].fund.returnPct)}</b> · slowest: ${escHtml(shortFund(week.at(-1)!.schemeName))} <b>${signedPct(week.at(-1)!.windows["1W"].fund.returnPct)}</b>`);
  }
  return out;
}

/** Up to three headlines the report actually relied on (its evidence), linked to the articles. */
export function reportNews(report: StoredWeeklyReport, max = 3): { title: string; url: string; publisher: string }[] {
  const out = report.report.output;
  const cited = [...out.funds.flatMap((f) => f.evidenceIds), ...out.marketSummary.evidenceIds, ...out.categories.flatMap((c) => c.evidenceIds)];
  const seen = new Set<string>();
  const picked: { title: string; url: string; publisher: string }[] = [];
  for (const id of cited) {
    const n = report.report.news.find((x) => x.evidenceId === id);
    if (!n || seen.has(n.url)) continue;
    seen.add(n.url);
    picked.push({ title: cleanTitle(n.title, n.publisher), url: n.url, publisher: n.publisher });
    if (picked.length >= max) break;
  }
  return picked;
}

/**
 * The Telegram message (HTML, under Telegram's 4,096-character limit): the verdict, key insights,
 * a few relevant headlines and a link to the detailed report. The full report follows as a PDF.
 */
export function renderTelegram(report: StoredWeeklyReport, reportUrl: string, opts: { isTest: boolean }): string {
  const out = report.report.output;
  const news = reportNews(report);
  const lines = [
    ...(opts.isTest ? ["🧪 <i>TEST — not the Saturday report</i>", ""] : []),
    `📊 <b>Weekly fund report</b> · week ending ${formatHuman(report.weekEnding)}`,
    `✅ <b>${escHtml(out.assessment.label)}</b>`,
    "",
    "💡 <b>Key insights</b>",
    ...reportInsights(report).map((l) => `• ${l}`),
    ...(news.length
      ? ["", "📰 <b>In the news</b>", ...news.map((n) => `• <a href="${escHtml(n.url)}">${escHtml(n.title)}</a> <i>(${escHtml(n.publisher)})</i>`)]
      : []),
    "",
    `🔗 <a href="${escHtml(reportUrl)}"><b>Read the detailed report</b></a> · 📎 PDF below`,
    "<i>Monitoring summary, not investment advice.</i>",
  ];
  const text = lines.join("\n");
  return text.length <= TELEGRAM_TEXT_LIMIT ? text : `${text.slice(0, TELEGRAM_TEXT_LIMIT - 1)}…`;
}

const TELEGRAM_TEXT_LIMIT = 4096;

async function telegramCall(token: string, method: string, body: Record<string, unknown>): Promise<string> {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const j = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: { message_id: number }; description?: string };
  if (!res.ok || !j.ok || !j.result) throw new Error(`Telegram API ${res.status}: ${j.description ?? "request rejected"}`);
  return String(j.result.message_id);
}

/** Sends the insights message, then the full report as a PDF. A failed PDF never undoes the message. */
export async function sendTelegram(report: StoredWeeklyReport, reportUrl: string, opts: { isTest: boolean }): Promise<SendResult> {
  const env = requireEnv(["TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"], "Telegram");
  const recipientMasked = telegramRecipientMasked() ?? "chat";
  const id = await telegramCall(env.TELEGRAM_BOT_TOKEN, "sendMessage", {
    chat_id: env.TELEGRAM_CHAT_ID,
    text: renderTelegram(report, reportUrl, opts),
    parse_mode: "HTML",
    disable_web_page_preview: true,
  });
  try {
    await telegramCall(env.TELEGRAM_BOT_TOKEN, "sendDocument", {
      chat_id: env.TELEGRAM_CHAT_ID,
      document: reportPdfUrl(reportUrl),
      caption: `📎 Full report${opts.isTest ? " (TEST)" : ""} · week ending ${formatHuman(report.weekEnding)}`,
    });
    return { providerMessageId: id, recipientMasked, detail: "insights message and PDF report sent" };
  } catch (e) {
    log.warn("telegram.document_failed", { error: e instanceof Error ? e.message : String(e) });
    return { providerMessageId: id, recipientMasked, detail: "insights message sent; the PDF could not be attached" };
  }
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
