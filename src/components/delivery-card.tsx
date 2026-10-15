"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronRight, Loader2, Send, X } from "lucide-react";
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
  /** Set up, but the provider is refusing our connection right now. */
  paused?: boolean;
}

const META: Record<ChannelInfo["id"], { emoji: string; name: string; what: string }> = {
  email: { emoji: "✉️", name: "Email", what: "The full report, nicely formatted" },
  telegram: { emoji: "✈️", name: "Telegram", what: "Key insights, news and the PDF" },
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

export function DeliveryCard({ reportId, channels, nextSend, inDrawer = false }: { reportId: string | null; channels: ChannelInfo[]; nextSend: string; inDrawer?: boolean }) {
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
    <section id="delivery" className={cn("scroll-mt-20", !inDrawer && "rounded-3xl border bg-card p-5 shadow-card sm:p-6")}>
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

      <ul className={cn("mt-5 grid gap-3", !inDrawer && "md:grid-cols-3")}>
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
                  {!c.configured ? "Not set up" : c.paused ? "Paused" : c.note ? "Almost ready" : "Ready"}
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

/**
 * A small bar for the dashboard header: "📬 Saturday delivery ✉️ ✈️ 💬 · Next …". Clicking it
 * slides the full delivery card in from the right.
 */
export function DeliveryLauncher({ reportId, channels, nextSend, nextShort, defaultOpen = false }: { reportId: string | null; channels: ChannelInfo[]; nextSend: string; nextShort: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  const ready = channels.filter((c) => c.configured && !c.note).length;

  return (
    <>
      {/* A slim tab on the right edge, low on the screen: clear of the header buttons, above the Ask button. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Saturday delivery: ${ready} of ${channels.length} channels ready, next ${nextShort}`}
        title={`Next delivery ${nextShort}`}
        className="fixed bottom-28 right-0 z-40 flex flex-col items-center gap-2 rounded-l-2xl border border-r-0 bg-card px-2 py-3 text-sm shadow-card transition-[padding] hover:bg-muted hover:pr-3 print:hidden"
      >
        <span aria-hidden>📬</span>
        <span className="font-semibold [writing-mode:vertical-rl] rotate-180">Delivery</span>
        <span aria-hidden className="flex flex-col gap-1 text-xs leading-none">
          {channels.map((c) => (
            <span key={c.id} className={cn(!c.configured || c.note ? "opacity-50" : "")}>
              {META[c.id].emoji}
            </span>
          ))}
        </span>
        <ChevronRight className="size-3.5 rotate-180 text-muted-foreground" aria-hidden />
      </button>

      {open && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Your Saturday delivery">
          <button type="button" aria-label="Close" className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col overflow-y-auto border-l bg-[var(--page)] p-5 shadow-2xl sm:p-6">
            <div className="mb-2 flex justify-end">
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="rounded-full p-2 hover:bg-muted">
                <X className="size-5" aria-hidden />
              </button>
            </div>
            <DeliveryCard reportId={reportId} channels={channels} nextSend={nextSend} inDrawer />
          </div>
        </div>
      )}
    </>
  );
}
