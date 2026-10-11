"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/** Filter chips over server-rendered panels: "All" shows every panel, a chip shows just one kind. */
export function KindTabs({ items, label }: { items: { id: string; label: string; emoji: string; content: React.ReactNode }[]; label: string }) {
  const [kind, setKind] = useState("all");
  const shown = kind === "all" ? items : items.filter((i) => i.id === kind);
  return (
    <div>
      <div role="tablist" aria-label={label} className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {[{ id: "all", label: "All", emoji: "✨" }, ...items].map((k) => (
          <button
            key={k.id}
            type="button"
            role="tab"
            aria-selected={kind === k.id}
            onClick={() => setKind(k.id)}
            className={cn("shrink-0 rounded-full border px-3.5 py-1.5 text-sm", kind === k.id ? "border-transparent bg-foreground text-background" : "bg-card text-[var(--ink-secondary)] hover:bg-muted")}
          >
            <span aria-hidden>{k.emoji}</span> {k.label}
          </button>
        ))}
      </div>
      <div className={cn("mt-4 grid gap-4", shown.length > 1 && "md:grid-cols-2")}>
        {shown.map((i) => (
          <div key={i.id}>{i.content}</div>
        ))}
      </div>
    </div>
  );
}
