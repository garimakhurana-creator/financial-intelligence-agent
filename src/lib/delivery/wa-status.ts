import { cacheLife } from "next/cache";

/**
 * Which of the configured WhatsApp templates Meta has approved (checked at most about once an
 * hour). Used only to label the WhatsApp channel on the dashboard; sending never depends on it.
 */
export async function whatsappTemplateState(): Promise<{ approved: string | null; pending: string[]; error: string | null }> {
  "use cache: remote";
  cacheLife("hours");
  const token = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  const waba = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID?.trim();
  const names = [process.env.WHATSAPP_PDF_TEMPLATE_NAME, process.env.WHATSAPP_PDF_TEMPLATE_SHORT, process.env.WHATSAPP_TEMPLATE_NAME].map((n) => n?.trim()).filter((n): n is string => Boolean(n));
  if (!token || !waba || names.length === 0) return { approved: null, pending: [], error: "not configured" };
  try {
    const v = process.env.WHATSAPP_GRAPH_VERSION?.trim() || "v25.0";
    const res = await fetch(`https://graph.facebook.com/${v}/${waba}/message_templates?fields=name,status&limit=100`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8_000) });
    const j = (await res.json()) as { data?: { name: string; status: string }[]; error?: { message?: string } };
    if (!res.ok || !j.data) return { approved: null, pending: [], error: j.error?.message ?? `HTTP ${res.status}` };
    const status = new Map(j.data.map((t) => [t.name, t.status]));
    return { approved: names.find((n) => status.get(n) === "APPROVED") ?? null, pending: names.filter((n) => status.get(n) === "PENDING"), error: null };
  } catch (e) {
    return { approved: null, pending: [], error: e instanceof Error ? e.message : "lookup failed" };
  }
}
