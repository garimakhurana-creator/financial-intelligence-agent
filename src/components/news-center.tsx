"use client";

import { useMemo, useState } from "react";
import { ExternalLink, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export interface NewsCard {
  id: string;
  title: string;
  publisher: string;
  publishedAt: string | null;
  url: string;
  summary: string;
  fact: string | null;
  why: string | null;
  topics: { id: string; label: string }[];
  views: { id: string; label: string }[];
}

const RANGES = [
  { days: 7, label: "7 days" },
  { days: 14, label: "14 days" },
  { days: 30, label: "30 days" },
] as const;

function when(iso: string | null) {
  if (!iso) return "date unknown";
  return new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function NewsCenter({
  items,
  topics,
  trackedViews,
  initialTopic,
  now,
}: {
  items: NewsCard[];
  topics: { id: string; label: string }[];
  trackedViews: string[];
  initialTopic: string | null;
  now: string;
}) {
  const [topic, setTopic] = useState<string>(initialTopic && topics.some((t) => t.id === initialTopic) ? initialTopic : "all");
  const [days, setDays] = useState<number>(7);
  const [source, setSource] = useState("all");
  const [relevantOnly, setRelevantOnly] = useState(false);
  const [q, setQ] = useState("");

  const sources = useMemo(() => [...new Set(items.map((n) => n.publisher))].sort((a, b) => a.localeCompare(b)), [items]);
  const view = useMemo(() => {
    const since = new Date(new Date(now).getTime() - days * 86_400_000).toISOString();
    const needle = q.trim().toLowerCase();
    return items.filter(
      (n) =>
        (topic === "all" || n.topics.some((t) => t.id === topic)) &&
        (!n.publishedAt || n.publishedAt >= since) &&
        (source === "all" || n.publisher === source) &&
        (!relevantOnly || n.views.some((v) => trackedViews.includes(v.id))) &&
        (!needle || `${n.title} ${n.summary}`.toLowerCase().includes(needle)),
    );
  }, [items, topic, days, source, relevantOnly, q, trackedViews, now]);

  return (
    <div>
      <div role="tablist" aria-label="News topics" className="no-scrollbar -mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
        {[{ id: "all", label: "All topics" }, ...topics].map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={topic === t.id}
            onClick={() => setTopic(t.id)}
            className={cn("shrink-0 rounded-full border px-3 py-1.5 text-sm", topic === t.id ? "border-brand bg-brand text-white dark:text-[var(--page)]" : "bg-card text-[var(--ink-secondary)] hover:bg-muted")}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <div className="min-w-48 flex-1 space-y-1">
          <Label htmlFor="news-q" className="text-xs">
            Search headlines
          </Label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" aria-hidden />
            <Input id="news-q" className="pl-8" placeholder="e.g. repo rate, Nasdaq, SIP" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="news-days" className="text-xs">
            Published in
          </Label>
          <select id="news-days" value={days} onChange={(e) => setDays(Number(e.target.value))} className="h-9 rounded-md border bg-background px-2 text-sm">
            {RANGES.map((r) => (
              <option key={r.days} value={r.days}>
                Last {r.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="news-src" className="text-xs">
            Source
          </Label>
          <select id="news-src" value={source} onChange={(e) => setSource(e.target.value)} className="h-9 max-w-52 rounded-md border bg-background px-2 text-sm">
            <option value="all">All sources</option>
            {sources.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
        <label className="flex h-9 items-center gap-2 rounded-md border bg-background px-3 text-sm">
          <input type="checkbox" checked={relevantOnly} onChange={(e) => setRelevantOnly(e.target.checked)} />
          Relevant to my funds
        </label>
      </div>

      <p className="mt-3 text-xs text-muted-foreground" role="status">
        {view.length} article{view.length === 1 ? "" : "s"} · newest first · publication time shown, which may differ from when the event happened
      </p>

      {view.length === 0 ? (
        <div className="mt-3 rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">No articles match these filters. Try a longer date range or another topic.</div>
      ) : (
        <ul className="mt-3 grid gap-3 md:grid-cols-2">
          {view.map((n) => (
            <li key={n.id} className="flex flex-col rounded-xl border bg-card p-4">
              <div className="flex flex-wrap gap-1">
                {n.topics.map((t) => (
                  <span key={t.id} className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-[var(--ink-secondary)]">
                    {t.label}
                  </span>
                ))}
              </div>
              <a href={n.url} target="_blank" rel="noopener noreferrer nofollow" className="group mt-2 font-medium leading-snug hover:underline">
                {n.title}
                <ExternalLink className="ml-1 inline size-3 opacity-50 group-hover:opacity-100" aria-hidden />
              </a>
              <div className="mt-1 text-xs text-muted-foreground">
                {n.publisher} · {when(n.publishedAt)}
              </div>
              <p className="mt-2 text-sm leading-relaxed text-[var(--ink-secondary)]">{n.fact ?? n.summary.slice(0, 260)}</p>
              {n.why && (
                <p className="mt-2 rounded-lg bg-muted/60 px-3 py-2 text-sm leading-relaxed">
                  <span className="mr-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-secondary)]">Why it may matter · interpretation</span>
                  <br />
                  {n.why}
                </p>
              )}
              <div className="mt-auto pt-3 text-xs text-muted-foreground">Related: {n.views.map((v) => v.label).join(", ") || "general market"}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
