import { APP_BASE_URL, MissingConfigError } from "@/lib/env";
import * as repo from "@/lib/db/repo";
import { errorMessage, log } from "@/lib/log";
import type { StoredWeeklyReport } from "@/lib/report/build";
import { emailRecipientMasked, sendEmail, sendWhatsApp, whatsappRecipientMasked } from "@/lib/delivery/channels";

export type Channel = "email" | "whatsapp";

export interface DeliveryOutcome {
  channel: Channel;
  logId: string;
  status: repo.DeliveryStatus | "skipped_duplicate";
  detail?: string;
}

export function reportUrl(reportId: string): string {
  return `${APP_BASE_URL()}/reports/${encodeURIComponent(reportId)}`;
}

/**
 * Deliver one report on one channel.
 *
 * Production sends use a deterministic log id (report + channel), created with a conditional
 * insert: if the row already exists the send is skipped, so re-run cron jobs never double-send.
 * A failed production send may be retried explicitly with { retry: true }.
 * Test sends always get a fresh id and are labelled as tests in the message and the log.
 */
export async function deliver(report: StoredWeeklyReport, channel: Channel, opts: { isTest: boolean; retry?: boolean }): Promise<DeliveryOutcome> {
  const logId = opts.isTest ? repo.rowId("t", Date.now().toString(36), channel) : repo.rowId(report.id, channel);
  const recipientMasked = channel === "email" ? emailRecipientMasked() : whatsappRecipientMasked();

  let entry = await repo.claimDelivery(logId, { reportId: report.id, channel, isTest: opts.isTest, recipientMasked });
  if (!entry) {
    const existing = await repo.getDelivery(logId);
    const retryable = existing && (existing.status === "failed" || existing.status === "awaiting_configuration");
    if (!opts.retry || !retryable) {
      return { channel, logId, status: "skipped_duplicate", detail: `already ${existing?.status ?? "recorded"}` };
    }
    entry = existing;
  }

  const attempts = (entry?.attempts ?? 0) + 1;
  try {
    const url = reportUrl(report.id);
    const r = channel === "email" ? await sendEmail(report, url, { isTest: opts.isTest, idempotencyKey: logId }) : await sendWhatsApp(report, url, opts);
    // "sent_to_provider" — the API accepted it. Delivery is only confirmed later by a webhook.
    await repo.updateDelivery(logId, { status: "sent_to_provider", providerMessageId: r.providerMessageId, error: null, attempts });
    log.info("delivery.sent", { channel, logId, isTest: opts.isTest });
    return { channel, logId, status: "sent_to_provider" };
  } catch (e) {
    const status: repo.DeliveryStatus = e instanceof MissingConfigError ? "awaiting_configuration" : "failed";
    await repo.updateDelivery(logId, { status, error: errorMessage(e), attempts });
    log.error("delivery.failed", { channel, logId, status, error: errorMessage(e) });
    return { channel, logId, status, detail: errorMessage(e) };
  }
}

export async function deliverAll(report: StoredWeeklyReport, opts: { isTest: boolean }): Promise<DeliveryOutcome[]> {
  // Channels are independent: a WhatsApp failure must not block email, and vice versa.
  const results = await Promise.allSettled((["email", "whatsapp"] as Channel[]).map((c) => deliver(report, c, opts)));
  return results.map((r, i) =>
    r.status === "fulfilled" ? r.value : { channel: (["email", "whatsapp"] as Channel[])[i], logId: "", status: "failed", detail: errorMessage(r.reason) },
  );
}
