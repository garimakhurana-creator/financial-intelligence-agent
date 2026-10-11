import { createHmac } from "node:crypto";
import { safeEqual } from "@/lib/auth";
import * as repo from "@/lib/db/repo";
import { log } from "@/lib/log";

// Meta WhatsApp Cloud API webhook: confirms delivery/read/failure for messages we sent.
// GET = subscription verification; POST = status events, signature-checked with the app secret.

export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const expected = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  if (p.get("hub.mode") === "subscribe" && expected && safeEqual(p.get("hub.verify_token") ?? "", expected)) {
    return new Response(p.get("hub.challenge") ?? "", { status: 200 });
  }
  return new Response("forbidden", { status: 403 });
}

const STATUS_MAP: Record<string, repo.DeliveryStatus> = {
  sent: "sent_to_provider",
  delivered: "delivered",
  read: "read",
  failed: "failed",
};
const RANK: Record<string, number> = { pending: 0, sent_to_provider: 1, delivered: 2, read: 3, failed: 4 };

export async function POST(req: Request) {
  const raw = await req.text();
  const secret = process.env.WHATSAPP_APP_SECRET;
  const sig = req.headers.get("x-hub-signature-256") ?? "";
  if (!secret || !safeEqual(sig, `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`)) {
    return new Response("invalid signature", { status: 401 });
  }
  let body: { entry?: { changes?: { value?: { statuses?: { id: string; status: string; errors?: { title?: string; message?: string; code?: number }[] }[] } }[] }[] };
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response("bad json", { status: 400 });
  }
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const s of change.value?.statuses ?? []) {
        const mapped = STATUS_MAP[s.status];
        if (!mapped || typeof s.id !== "string") continue;
        const d = await repo.findDeliveryByProviderId(s.id);
        if (!d) continue;
        // Events can arrive out of order; never downgrade (e.g. "read" back to "delivered").
        if (mapped !== "failed" && (RANK[d.status] ?? 0) >= RANK[mapped]) continue;
        const err = s.errors?.[0];
        await repo.updateDelivery(d.id, { status: mapped, ...(err ? { error: `${err.code ?? ""} ${err.title ?? err.message ?? ""}`.trim() } : {}) });
        log.info("whatsapp.status", { logId: d.id, status: mapped });
      }
    }
  }
  // Always 200 quickly so Meta does not retry valid deliveries.
  return new Response("ok", { status: 200 });
}
