import { clientIp, isAdmin, rateLimit } from "@/lib/auth";
import { handle, json, readJson } from "@/lib/api";
import { askAssistant, buildAssistantContext, type ChatMessage } from "@/lib/assistant";
import { log } from "@/lib/log";

export const maxDuration = 60;

// Public (rate-limited). Holdings are included in the context only for the signed-in owner.
export async function POST(req: Request) {
  if (!rateLimit(`assistant:${clientIp(req)}`, 20, 10 * 60_000)) return json({ error: "You're asking a lot quickly — please wait a few minutes." }, 429);
  return handle(async () => {
    const body = await readJson<{ messages?: ChatMessage[] }>(req);
    const messages = (Array.isArray(body.messages) ? body.messages : [])
      .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .slice(-8)
      .map((m) => ({ role: m.role, content: m.content.slice(0, 600) }));
    if (!messages.length || messages.at(-1)!.role !== "user" || messages.at(-1)!.content.trim().length < 2) return json({ error: "Type a question first." }, 400);
    const ctx = await buildAssistantContext(await isAdmin());
    const r = await askAssistant(messages, ctx);
    if (!r.grounded) log.warn("assistant.fallback", { errors: r.errors.slice(0, 4) });
    return json({ ...r.answer, grounded: r.grounded, model: r.model });
  });
}
