"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Send } from "lucide-react";
import { cn } from "@/lib/utils";

// "Your Saturday delivery": shows that the weekly report goes out on three channels, the state of
// each, and lets Meera send this week's report to herself now (clearly labelled TEST).

export interface ChannelInfo {
  id: "email" | "telegram" | "whatsapp";
  configured: boolean;
  recipient: string | null;
  /** Latest real (Saturday) delivery of the current report, if any. */
  last: { status: string; at: string; isTest: boolean } | null;
  note: string | null;
}

const META: Record<ChannelInfo["id"], { emoji: string; name: string; what: string }> = {
  email: { emoji: "✉️", name: "Email", what: "The full report, nicely formatted" },
  telegram: { emoji: "✈️", name: "Telegram", what: "Every fund's summary in a chat message" },
  whatsapp: { emoji: "💬", name: "WhatsApp", what: "Key insights with the PDF attached" },
};

const STATUS_WORDS: Record<string, string> = {
  sent_to_provider: "sent",
  delivered: "delivered",
  read: "read",
  failed: "failed",
  awaiting_configuration: "needs setup",
  pending: "sending",
};

type Result = { ok: boolean; text: string };

export function DeliveryCard({ reportId, channels, nextSend }: { reportId: string | null; channels: ChannelInfo[]; nextSend: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Partial<Record<ChannelInfo["id"], Result>>>({});

  async function sendAll() {
    if (!reportId) return;
    setBusy(true);
    setResults({});
    for (const c of channels.filter((x) => x.configured)) {
      try {
        const res = await fetch(`/api/reports/${encodeURIComponent(reportId)}/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ channel: c.id, test: true }),
        });
        const j = await res.json().catch(() => ({}));
        const ok = res.ok && j.status === "sent_to_provider";
        const pendingTemplate = /132001|does not exist/i.test(String(j.detail ?? j.error ?? ""));
        setResults((r) => ({
          ...r,
          [c.id]: ok
            ? { ok: true, text: "Sent ✓ — check it" }
            : { ok: false, text: pendingTemplate ? "Waiting for Meta to approve the message template" : String(j.detail ?? j.error ?? "Could not send") },
        }));
      } catch {
        setResults((r) => ({ ...r, [c.id]: { ok: false, text: "Network error — try again" } }));
      }
    }
    setBusy(false);
    router.refresh();
  }

  return (
    <section className="rounded-3xl border bg-card p-5 shadow-card sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold">
            Your Saturday delivery <span aria-hidden>📬</span>
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Every Saturday at 8 AM the weekly report goes out on all three channels. Next one: <strong className="text-foreground">{nextSend}</strong>.
          </p>
        </div>
        {reportId && (
          <button
            type="button"
            onClick={sendAll}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white shadow-card disabled:opacity-60 dark:text-[var(--page)]"
          >
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />}
            {busy ? "Sending…" : "Send this week's report to me now"}
          </button>
        )}
      </div>

      <ul className="mt-5 grid gap-3 md:grid-cols-3">
        {channels.map((c) => {
          const m = META[c.id];
          const r = results[c.id];
          return (
            <li key={c.id} className="rounded-2xl border bg-background p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 font-semibold">
                  <span aria-hidden className="text-xl">
                    {m.emoji}
                  </span>
                  {m.name}
                </span>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[11px] font-medium",
                    !c.configured ? "bg-muted text-muted-foreground" : c.note ? "bg-[var(--tint-warning)]" : "bg-[var(--tint-good)]",
                  )}
                >
                  {!c.configured ? "Not set up" : c.note ? "Almost ready" : "Ready"}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{m.what}</p>
              {c.recipient && <p className="mt-2 text-xs">To {c.recipient}</p>}
              {c.last && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Last {c.last.isTest ? "test" : "Saturday send"}: {STATUS_WORDS[c.last.status] ?? c.last.status} ·{" "}
                  {new Date(c.last.at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </p>
              )}
              {c.note && <p className="mt-2 text-xs text-[var(--ink-secondary)]">{c.note}</p>}
              {r && (
                <p role="status" className={cn("mt-2 rounded-xl px-2.5 py-1.5 text-xs font-medium", r.ok ? "bg-[var(--tint-good)]" : "bg-[var(--tint-warning)]")}>
                  {r.text}
                </p>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-xs text-muted-foreground">&ldquo;Send now&rdquo; messages are labelled TEST so they never get mixed up with the Saturday report.</p>
    </section>
  );
}
