"use client";

import { useId, useRef, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FundHit {
  schemeCode: number;
  schemeName: string;
}

type State = { status: "idle" } | { status: "loading" } | { status: "done"; hits: FundHit[] } | { status: "error"; message: string };

/** Direct-Growth plans first (what Meera would normally pick), then the rest. */
function rank(hits: FundHit[]): FundHit[] {
  const score = (n: string) => (/direct/i.test(n) ? 0 : 2) + (/growth/i.test(n) && !/idcw|dividend/i.test(n) ? 0 : 1);
  return [...hits].sort((a, b) => score(a.schemeName) - score(b.schemeName));
}

/**
 * Type-ahead fund search: matches appear in a dropdown as you type a name (3+ letters), and a
 * scheme code (3–7 digits) is looked up directly. Arrow keys + Enter choose; Escape closes.
 */
export function FundSearch({ onPick, placeholder = "Type a fund name or scheme code", label = "Find a fund", disabled = false }: { onPick: (hit: FundHit) => void; placeholder?: string; label?: string; disabled?: boolean }) {
  const id = useId();
  const [q, setQ] = useState("");
  const [state, setState] = useState<State>({ status: "idle" });
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);

  function query(text: string) {
    if (timer.current) clearTimeout(timer.current);
    const t = text.trim();
    const isCode = /^\d{3,7}$/.test(t);
    if (!isCode && t.length < 3) {
      setState({ status: "idle" });
      return;
    }
    setState({ status: "loading" });
    setOpen(true);
    const mine = ++seq.current;
    timer.current = setTimeout(async () => {
      try {
        let hits: FundHit[];
        if (isCode) {
          const res = await fetch(`/api/funds/lookup?code=${t}`);
          const j = await res.json().catch(() => ({}));
          hits = res.ok && j.schemeCode ? [{ schemeCode: j.schemeCode, schemeName: j.schemeName }] : [];
        } else {
          const res = await fetch(`/api/funds/search?q=${encodeURIComponent(t)}`);
          const j = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(j.error ?? "Search failed");
          hits = rank(j.results ?? []).slice(0, 10);
        }
        if (mine === seq.current) {
          setState({ status: "done", hits });
          setActive(0);
        }
      } catch (e) {
        if (mine === seq.current) setState({ status: "error", message: e instanceof Error ? e.message : "Search failed" });
      }
    }, 250);
  }

  function pick(h: FundHit) {
    setOpen(false);
    setQ(h.schemeName);
    onPick(h);
  }

  const hits = state.status === "done" ? state.hits : [];
  const listId = `${id}-list`;

  return (
    <div className="relative">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" aria-hidden />
      <input
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && hits[active] ? `${id}-opt-${active}` : undefined}
        autoComplete="off"
        disabled={disabled}
        value={q}
        placeholder={placeholder}
        onChange={(e) => {
          setQ(e.target.value);
          query(e.target.value);
        }}
        onFocus={() => state.status !== "idle" && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setActive((a) => Math.min(a + 1, Math.max(0, hits.length - 1)));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (open && hits[active]) pick(hits[active]);
          } else if (e.key === "Escape") setOpen(false);
        }}
        className="h-11 w-full rounded-full border bg-background pl-9 pr-10 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand/40 disabled:opacity-60"
      />
      {state.status === "loading" && <Loader2 className="absolute right-3 top-3 size-4 animate-spin text-muted-foreground" aria-hidden />}

      {open && state.status !== "idle" && (
        <ul id={listId} role="listbox" aria-label="Matching funds" className="absolute inset-x-0 top-12 z-40 max-h-80 overflow-y-auto rounded-2xl border bg-card p-1 shadow-xl">
          {state.status === "loading" && <li className="px-3 py-2.5 text-sm text-muted-foreground">Searching…</li>}
          {state.status === "error" && <li className="px-3 py-2.5 text-sm text-[var(--down)]">{state.message}</li>}
          {state.status === "done" && hits.length === 0 && (
            <li className="px-3 py-2.5 text-sm text-muted-foreground">{/^\d+$/.test(q.trim()) ? "No fund has that scheme code." : "No funds matched — try fewer words, e.g. the fund house and category."}</li>
          )}
          {hits.map((h, i) => (
            <li
              key={h.schemeCode}
              id={`${id}-opt-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(h);
              }}
              onMouseEnter={() => setActive(i)}
              className={cn("flex cursor-pointer items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm", i === active && "bg-muted")}
            >
              <span className="leading-snug">{h.schemeName}</span>
              <span className="tabular shrink-0 text-xs text-muted-foreground">{h.schemeCode}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
