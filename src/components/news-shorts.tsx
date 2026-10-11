"use client";

import { useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ExternalLink, RotateCcw } from "lucide-react";
import { ago, cleanTitle, topicArt, TOPIC_ART } from "@/lib/news/art";
import { cn } from "@/lib/utils";

export interface ShortItem {
  id: string;
  title: string;
  publisher: string;
  publishedAt: string | null;
  url: string;
  short: string;
  why: string | null;
  topics: string[];
  forYou: boolean;
}

const SWIPE_AT = 90;

/**
 * Inshorts-style news deck: one short card at a time. Swipe left (or →) for the next story, right
 * (or ←) to go back. Links stay clickable because a drag only starts after the pointer moves.
 */
export function NewsShorts({ items, now }: { items: ShortItem[]; now: number }) {
  const hasForYou = items.some((n) => n.forYou);
  const [filter, setFilter] = useState<string>(hasForYou ? "for-you" : "all");
  const [index, setIndex] = useState(0);
  const [dx, setDx] = useState(0);
  const [leaving, setLeaving] = useState<0 | 1 | -1>(0);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ x: number; id: number; moved: boolean } | null>(null);

  const topics = useMemo(() => (Object.keys(TOPIC_ART) as (keyof typeof TOPIC_ART)[]).filter((t) => items.some((n) => n.topics.includes(t))), [items]);
  const deck = useMemo(
    () => items.filter((n) => filter === "all" || (filter === "for-you" ? n.forYou : n.topics.includes(filter))),
    [items, filter],
  );
  const done = index >= deck.length;

  function go(dir: 1 | -1) {
    if (leaving) return;
    if (dir === -1 && index === 0) return;
    if (dir === 1 && done) return;
    setLeaving(dir);
    window.setTimeout(() => {
      setIndex((i) => Math.max(0, i + dir));
      setLeaving(0);
      setDx(0);
    }, 220);
  }

  function pick(f: string) {
    setFilter(f);
    setIndex(0);
    setDx(0);
  }

  const onDown = (e: React.PointerEvent) => {
    drag.current = { x: e.clientX, id: e.pointerId, moved: false };
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const delta = e.clientX - d.x;
    if (!d.moved && Math.abs(delta) > 8) {
      d.moved = true;
      setDragging(true);
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
    if (d.moved) setDx(delta);
  };
  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d?.moved) return;
    setDragging(false);
    if (dx < -SWIPE_AT) go(1);
    else if (dx > SWIPE_AT && index > 0) go(-1);
    else setDx(0);
  };

  const chips = [
    ...(hasForYou ? [{ id: "for-you", label: "✨ For you" }] : []),
    { id: "all", label: "🗞️ Everything" },
    ...topics.map((t) => ({ id: t, label: `${TOPIC_ART[t].emoji} ${TOPIC_ART[t].label}` })),
  ];

  return (
    <div
      tabIndex={0}
      aria-label="News shorts. Use the left and right arrow keys to move between stories."
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") go(1);
        if (e.key === "ArrowLeft") go(-1);
      }}
      className="rounded-3xl outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
    >
      <div role="tablist" aria-label="News topics" className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {chips.map((c) => (
          <button
            key={c.id}
            type="button"
            role="tab"
            aria-selected={filter === c.id}
            onClick={() => pick(c.id)}
            className={cn(
              "shrink-0 rounded-full border px-3.5 py-1.5 text-sm transition-colors",
              filter === c.id ? "border-transparent bg-foreground text-background" : "bg-card text-[var(--ink-secondary)] hover:bg-muted",
            )}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="relative mx-auto mt-4 h-[33rem] max-w-md sm:h-[31rem]">
        {done ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center rounded-3xl border bg-card p-8 text-center shadow-card">
            <div className="text-6xl" aria-hidden>
              🎉
            </div>
            <p className="font-display mt-4 text-2xl font-semibold">You&apos;re all caught up</p>
            <p className="mt-2 text-sm text-[var(--ink-secondary)]">That&apos;s {deck.length === 1 ? "the one story" : `all ${deck.length} stories`} here. New ones arrive every night.</p>
            <button type="button" onClick={() => pick(filter)} className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-sm font-medium text-white dark:text-[var(--page)]">
              <RotateCcw className="size-4" aria-hidden /> Start over
            </button>
          </div>
        ) : (
          deck
            .slice(index, index + 3)
            .reverse()
            .map((n) => {
              const depth = deck.indexOf(n) - index;
              const top = depth === 0;
              const art = topicArt(n.topics);
              const x = top ? (leaving === 1 ? -520 : leaving === -1 ? 520 : dx) : 0;
              const style: React.CSSProperties = top
                ? { transform: `translateX(${x}px) rotate(${x / 22}deg)`, transition: dragging ? "none" : "transform 220ms ease" }
                : { transform: `translateY(${depth * 14}px) scale(${1 - depth * 0.05})`, transition: "transform 220ms ease" };
              return (
                <article
                  key={n.id}
                  aria-hidden={!top}
                  onPointerDown={top ? onDown : undefined}
                  onPointerMove={top ? onMove : undefined}
                  onPointerUp={top ? onUp : undefined}
                  onPointerCancel={top ? onUp : undefined}
                  style={{ ...style, touchAction: "pan-y" }}
                  className={cn("absolute inset-0 flex select-none flex-col overflow-hidden rounded-3xl border bg-card shadow-card motion-reduce:transition-none", top ? "cursor-grab active:cursor-grabbing" : "pointer-events-none")}
                >
                  <div className="relative h-32 shrink-0" style={{ background: `linear-gradient(135deg, ${art.from}, ${art.to})` }}>
                    <span aria-hidden className="absolute -right-2 -top-3 text-[7rem] leading-none opacity-30">
                      {art.emoji}
                    </span>
                    <div className="absolute inset-x-4 bottom-3 flex items-end justify-between text-white">
                      <span className="rounded-full bg-black/25 px-2.5 py-1 text-xs font-medium backdrop-blur-sm">
                        {art.emoji} {art.label}
                      </span>
                      <span className="text-xs font-medium opacity-90">{ago(n.publishedAt, now)}</span>
                    </div>
                  </div>
                  <div className="flex min-h-0 flex-1 flex-col p-5">
                    <h3 className="font-display text-xl font-semibold leading-snug">{cleanTitle(n.title)}</h3>
                    <p className="mt-2 line-clamp-5 text-[15px] leading-relaxed text-[var(--ink-secondary)]">{n.short}</p>
                    {n.why && (
                      <div className="mt-3 rounded-2xl bg-brand-soft px-4 py-3">
                        <div className="text-xs font-semibold text-brand-ink">💡 Why it matters to you</div>
                        <p className="mt-1 line-clamp-3 text-sm leading-relaxed">{n.why}</p>
                      </div>
                    )}
                    <div className="mt-auto flex items-center justify-between gap-2 pt-3 text-xs text-muted-foreground">
                      <span className="truncate">{n.publisher}</span>
                      <a
                        href={n.url}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                        tabIndex={top ? 0 : -1}
                        className="inline-flex shrink-0 items-center gap-1 rounded-full border px-3 py-1 font-medium text-foreground hover:bg-muted"
                      >
                        Full story <ExternalLink className="size-3" aria-hidden />
                      </a>
                    </div>
                  </div>
                </article>
              );
            })
        )}
      </div>

      <div className="mx-auto mt-5 flex max-w-md items-center gap-3">
        <button type="button" onClick={() => go(-1)} disabled={index === 0} aria-label="Previous story" className="grid size-11 shrink-0 place-items-center rounded-full border bg-card shadow-card disabled:opacity-40">
          <ArrowLeft className="size-5" aria-hidden />
        </button>
        <div className="flex-1">
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${deck.length ? (Math.min(index + 1, deck.length) / deck.length) * 100 : 0}%` }} />
          </div>
          <p className="mt-1.5 text-center text-xs text-muted-foreground" aria-live="polite">
            {done ? "All done" : `Story ${index + 1} of ${deck.length}`} · swipe or use ← →
          </p>
        </div>
        <button type="button" onClick={() => go(1)} disabled={done} aria-label="Next story" className="grid size-11 shrink-0 place-items-center rounded-full bg-brand text-white shadow-card disabled:opacity-40 dark:text-[var(--page)]">
          <ArrowRight className="size-5" aria-hidden />
        </button>
      </div>
    </div>
  );
}
