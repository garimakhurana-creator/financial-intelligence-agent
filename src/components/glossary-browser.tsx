"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { GlossaryEntry } from "@/lib/glossary";
import { cn } from "@/lib/utils";

export function GlossaryBrowser({ entries, groups }: { entries: GlossaryEntry[]; groups: readonly string[] }) {
  const [q, setQ] = useState("");
  const [group, setGroup] = useState<string>("All");
  const view = useMemo(() => {
    const n = q.trim().toLowerCase();
    return entries.filter(
      (e) => (group === "All" || e.group === group) && (!n || [e.term, e.short, e.long, ...(e.aka ?? [])].join(" ").toLowerCase().includes(n)),
    );
  }, [entries, q, group]);

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" aria-hidden />
          <Input aria-label="Search the glossary" className="h-10 pl-9" placeholder="Search a word, e.g. NAV, expense ratio, repo rate" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>
      <div role="tablist" aria-label="Topics" className="no-scrollbar mt-3 flex gap-1.5 overflow-x-auto pb-1">
        {["All", ...groups].map((g) => (
          <button
            key={g}
            role="tab"
            type="button"
            aria-selected={group === g}
            onClick={() => setGroup(g)}
            className={cn("shrink-0 rounded-full border px-3 py-1.5 text-sm", group === g ? "border-brand bg-brand text-white dark:text-[var(--page)]" : "bg-card hover:bg-muted")}
          >
            {g}
          </button>
        ))}
      </div>
      <p role="status" className="mt-3 text-xs text-muted-foreground">
        {view.length} term{view.length === 1 ? "" : "s"}
      </p>
      {view.length === 0 ? (
        <p className="mt-3 rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">No match. Try a shorter word, or ask the assistant.</p>
      ) : (
        <dl className="mt-3 grid gap-3 md:grid-cols-2">
          {view.map((e) => (
            <div key={e.slug} id={e.slug} className="scroll-mt-24 rounded-2xl border bg-card p-5 shadow-card target:ring-2 target:ring-brand">
              <dt className="flex items-baseline justify-between gap-2">
                <span className="font-display text-lg font-semibold">{e.term}</span>
                <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] text-[var(--ink-secondary)]">{e.group}</span>
              </dt>
              <dd className="mt-1.5 space-y-2 text-sm leading-relaxed">
                <p className="font-medium">{e.short}</p>
                <p className="text-[var(--ink-secondary)]">{e.long}</p>
                {e.example && <p className="rounded-lg bg-brand-soft px-3 py-2 text-brand-ink">Example: {e.example}</p>}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
