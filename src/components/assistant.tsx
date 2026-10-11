"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { ArrowUp, Loader2, MessageCircleQuestion, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Msg {
  role: "user" | "assistant";
  content: string;
  links?: { label: string; href: string }[];
  followUps?: string[];
  grounded?: boolean;
}

const STARTERS = [
  "How did my funds do this week?",
  "Why is my international fund up so much this year?",
  "What does 'percentage points' mean?",
  "Is it normal for a small-cap fund to fall this much?",
  "What should I look at before starting a new SIP?",
  "What happened with the RBI this week?",
];

/** Renders the model's plain text: paragraphs and "- " bullets only (no HTML). */
function Prose({ text }: { text: string }) {
  const blocks = text.replace(/\*\*/g, "").split(/\n{2,}/);
  return (
    <div className="space-y-2">
      {blocks.map((b, i) => {
        const lines = b.split("\n").filter(Boolean);
        if (lines.length && lines.every((l) => /^\s*([-•*]|\d+\.)\s+/.test(l))) {
          return (
            <ul key={i} className="list-disc space-y-1 pl-5">
              {lines.map((l, j) => (
                <li key={j}>{l.replace(/^\s*([-•*]|\d+\.)\s+/, "")}</li>
              ))}
            </ul>
          );
        }
        return <p key={i}>{b}</p>;
      })}
    </div>
  );
}

export function AssistantChat({ compact = false, onNavigate }: { compact?: boolean; onNavigate?: () => void }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (msgs.length) endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs, busy]);

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    const next: Msg[] = [...msgs, { role: "user", content: q }];
    setMsgs(next);
    setInput("");
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next.map(({ role, content }) => ({ role, content })) }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? "The assistant is unavailable right now.");
      setMsgs([...next, { role: "assistant", content: j.answer, links: j.links, followUps: j.followUps, grounded: j.grounded }]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className={cn("min-h-0 flex-1 space-y-4 overflow-y-auto", compact ? "px-4 py-4" : "py-2")}>
        {msgs.length === 0 && (
          <div className="space-y-3">
            <div className="rounded-2xl bg-brand-soft p-4 text-sm text-brand-ink">
              <p className="font-medium">Hi Meera — ask me anything about your funds, the market, or a money word you&apos;re unsure of.</p>
              <p className="mt-1 opacity-80">I answer from your real fund data and this week&apos;s report. I can explain and point you to the right page, but I don&apos;t give buy or sell advice.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {STARTERS.slice(0, compact ? 4 : 6).map((s) => (
                <button key={s} type="button" onClick={() => send(s)} className="rounded-full border bg-card px-3 py-1.5 text-left text-xs hover:border-brand hover:text-brand">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {msgs.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl rounded-br-md bg-brand px-3.5 py-2 text-sm text-white dark:text-[var(--page)]">{m.content}</div>
            </div>
          ) : (
            <div key={i} className="flex gap-2">
              <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-brand-soft text-brand">
                <Sparkles className="size-3.5" aria-hidden />
              </span>
              <div className="min-w-0 max-w-[90%] space-y-2">
                <div className="rounded-2xl rounded-tl-md border bg-card px-3.5 py-2.5 text-sm leading-relaxed">
                  <Prose text={m.content} />
                </div>
                {m.links && m.links.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {m.links.map((l) =>
                      l.href.startsWith("/") ? (
                        <Link key={l.href} href={l.href} onClick={onNavigate} className="rounded-full border bg-card px-2.5 py-1 text-xs font-medium hover:border-brand hover:text-brand">
                          {l.label} →
                        </Link>
                      ) : (
                        <a key={l.href} href={l.href} target="_blank" rel="noopener noreferrer nofollow" className="rounded-full border bg-card px-2.5 py-1 text-xs font-medium hover:border-brand hover:text-brand">
                          {l.label} ↗
                        </a>
                      ),
                    )}
                  </div>
                )}
                {i === msgs.length - 1 && m.followUps && m.followUps.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {m.followUps.map((f) => (
                      <button key={f} type="button" onClick={() => send(f)} className="rounded-full bg-muted px-2.5 py-1 text-left text-xs text-[var(--ink-secondary)] hover:text-foreground">
                        {f}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ),
        )}
        {busy && (
          <div className="flex items-center gap-2 text-sm text-[var(--ink-secondary)]" role="status">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Checking your data…
          </div>
        )}
        {err && (
          <p role="alert" className="rounded-lg bg-[var(--tint-critical)] px-3 py-2 text-sm">
            {err}
          </p>
        )}
        <div ref={endRef} />
      </div>
      <form
        className={cn("flex items-end gap-2 border-t pt-3", compact && "px-4 pb-4")}
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <label htmlFor={compact ? "ask-compact" : "ask-full"} className="sr-only">
          Your question
        </label>
        <textarea
          id={compact ? "ask-compact" : "ask-full"}
          rows={1}
          maxLength={500}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send(input);
            }
          }}
          placeholder="Ask about your funds, a term, or the market…"
          className="max-h-32 min-h-10 flex-1 resize-none rounded-xl border bg-background px-3 py-2 text-sm outline-none focus:border-brand"
        />
        <button type="submit" disabled={busy || !input.trim()} aria-label="Send" className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand text-white disabled:opacity-40 dark:text-[var(--page)]">
          <ArrowUp className="size-4" aria-hidden />
        </button>
      </form>
      <p className={cn("mt-2 text-[11px] text-[var(--ink-muted)]", compact && "px-4 pb-3")}>Answers use your app data and Gemini Flash. Not investment advice.</p>
    </div>
  );
}

function Launcher() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  if (pathname === "/assistant") return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Ask the assistant"
        className="fixed bottom-5 right-5 z-30 inline-flex items-center gap-2 rounded-full bg-brand px-4 py-3 text-sm font-medium text-white shadow-lg transition-transform hover:scale-[1.03] dark:text-[var(--page)] print:hidden"
      >
        <MessageCircleQuestion className="size-5" aria-hidden />
        <span className="hidden sm:inline">Ask</span>
      </button>
      {open && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Assistant">
          <button type="button" aria-label="Close assistant" className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col bg-[var(--page)] shadow-2xl">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="grid size-8 place-items-center rounded-full bg-brand-soft text-brand">
                  <Sparkles className="size-4" aria-hidden />
                </span>
                <div>
                  <div className="font-display font-semibold">Money assistant</div>
                  <div className="text-[11px] text-[var(--ink-muted)]">Plain answers from your data</div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Link href="/assistant" onClick={() => setOpen(false)} className="rounded-md px-2 py-1 text-xs hover:bg-muted">
                  Full screen
                </Link>
                <button type="button" onClick={() => setOpen(false)} aria-label="Close assistant" className="rounded-md p-1.5 hover:bg-muted">
                  <X className="size-5" aria-hidden />
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1">
              <AssistantChat compact onNavigate={() => setOpen(false)} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function AssistantLauncher() {
  return (
    <Suspense fallback={null}>
      <Launcher />
    </Suspense>
  );
}
