"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";

// My Portfolio as a "fund race": one period at a time (week / month / this year). Each fund runs
// on its own track; ◆ marks its index and ┃ the average of similar funds, so being to the right of
// the markers means it is doing better than them. Everything is computed from the stored returns.

export type Period = "1W" | "1M" | "YTD";

export interface RaceRow {
  schemeCode: number;
  name: string;
  kind: string;
  kindLabel: string;
  emoji: string;
  ret: Record<Period, number | null>;
  bench: Record<Period, number | null>;
  peer: Record<Period, number | null>;
  vsBench: Record<Period, number | null>;
  vsPeer: Record<Period, number | null>;
  from: Record<Period, string | null>;
  benchmark: string | null;
  flagged: boolean;
  flagReason: string | null;
}

const PERIODS: { id: Period; label: string; noun: string; since: string }[] = [
  { id: "1W", label: "This week", noun: "this week", since: "over the last week" },
  { id: "1M", label: "This month", noun: "this month", since: "over the last month" },
  { id: "YTD", label: "This year", noun: "this year", since: "since 1 January" },
];

const pct = (n: number | null) => {
  if (n === null) return "—";
  const r = Math.round(n * 100) / 100;
  return `${r > 0 ? "+" : ""}${(r === 0 ? 0 : r).toFixed(2)}%`;
};
const toneCls = (n: number | null) => (n === null ? "text-muted-foreground" : n > 0.004 ? "text-[var(--up)]" : n < -0.004 ? "text-[var(--down)]" : "");

/** Same thresholds as the rest of the app: within 0.25 pts is "level". */
function standing(gap: number | null): { text: string; emoji: string; tone: "good" | "bad" | "neutral" | "none" } {
  if (gap === null) return { text: "No comparison", emoji: "·", tone: "none" };
  if (Math.abs(gap) < 0.25) return { text: "Keeping pace", emoji: "🤝", tone: "neutral" };
  if (gap > 0) return gap >= 1 ? { text: "Racing ahead", emoji: "🏆", tone: "good" } : { text: "Slightly ahead", emoji: "👍", tone: "good" };
  return gap <= -1 ? { text: "Falling behind", emoji: "🐢", tone: "bad" } : { text: "Slightly behind", emoji: "👀", tone: "bad" };
}

function insights(rows: RaceRow[], p: Period) {
  const valid = rows.filter((r) => r.ret[p] !== null);
  const sorted = [...valid].sort((a, b) => (b.ret[p] as number) - (a.ret[p] as number));
  const keeping = rows.filter((r) => r.vsPeer[p] !== null && (r.vsPeer[p] as number) > -0.25).length;
  const compared = rows.filter((r) => r.vsPeer[p] !== null).length;
  const avg = valid.length ? valid.reduce((s, r) => s + (r.ret[p] as number), 0) / valid.length : null;
  return { best: sorted[0] ?? null, worst: sorted.at(-1) ?? null, keeping, compared, avg };
}

export function PortfolioRace({ rows }: { rows: RaceRow[] }) {
  const [period, setPeriod] = useState<Period>("1W");
  const p = PERIODS.find((x) => x.id === period)!;
  const ins = useMemo(() => insights(rows, period), [rows, period]);
  const flagged = rows.filter((r) => r.flagged);
  const from = rows.find((r) => r.from[period])?.from[period] ?? null;

  // One shared scale for every track in the chosen period, always including 0.
  const scale = useMemo(() => {
    const vals = rows.flatMap((r) => [r.ret[period], r.bench[period], r.peer[period]]).filter((v): v is number => v !== null);
    const lo = Math.min(0, ...vals);
    const hi = Math.max(0, ...vals);
    const pad = Math.max(0.2, (hi - lo) * 0.08);
    return { lo: lo - pad, hi: hi + pad };
  }, [rows, period]);
  const at = (v: number) => `${((v - scale.lo) / (scale.hi - scale.lo)) * 100}%`;

  const headline =
    ins.compared === 0
      ? `Here is how your funds did ${p.noun}.`
      : ins.keeping === ins.compared
        ? `All ${ins.compared} funds kept up with similar funds ${p.noun}.`
        : `${ins.keeping} of ${ins.compared} funds kept up with similar funds ${p.noun}.`;

  return (
    <div className="space-y-8">
      {/* Hero: period switch + the story in one line */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0f766e] via-[#0e7490] to-[#4338ca] p-6 text-white shadow-card sm:p-8">
        <span aria-hidden className="float-slow pointer-events-none absolute -right-4 -top-6 text-[8rem] leading-none opacity-25 sm:right-6">
          🏁
        </span>
        <div role="tablist" aria-label="Period" className="relative inline-flex rounded-full bg-white/15 p-1 backdrop-blur-sm">
          {PERIODS.map((x) => (
            <button
              key={x.id}
              type="button"
              role="tab"
              aria-selected={period === x.id}
              onClick={() => setPeriod(x.id)}
              className={cn("rounded-full px-4 py-1.5 text-sm font-semibold transition-colors", period === x.id ? "bg-white text-[#0f3f46]" : "text-white/85 hover:bg-white/10")}
            >
              {x.label}
            </button>
          ))}
        </div>
        <h2 className="font-display relative mt-5 max-w-2xl text-3xl font-bold leading-tight sm:text-4xl">{headline}</h2>
        <p className="relative mt-2 text-sm opacity-80">
          Returns {p.since}
          {from ? ` (from ${from})` : ""}, each fund next to its own market index and similar funds.
        </p>
        <div className="relative mt-5 flex flex-wrap gap-2 text-sm">
          {ins.best && (
            <span className="rounded-full bg-white/15 px-3 py-1.5 backdrop-blur-sm">
              🏆 Best: {ins.best.name} <strong>{pct(ins.best.ret[period])}</strong>
            </span>
          )}
          {ins.worst && ins.worst !== ins.best && (
            <span className="rounded-full bg-white/15 px-3 py-1.5 backdrop-blur-sm">
              🐢 Slowest: {ins.worst.name} <strong>{pct(ins.worst.ret[period])}</strong>
            </span>
          )}
          {ins.avg !== null && (
            <span className="rounded-full bg-white/15 px-3 py-1.5 backdrop-blur-sm">
              ⚖️ Average fund: <strong>{pct(ins.avg)}</strong>
            </span>
          )}
          {flagged.map((f) => (
            <span key={f.schemeCode} className="rounded-full bg-[#fde68a] px-3 py-1.5 font-medium text-[#3b2a00]">
              👀 Keep an eye on {f.name}
            </span>
          ))}
        </div>
      </section>

      {/* The race */}
      <section>
        <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-xl font-bold">
            The race <span aria-hidden>🏃</span>
          </h2>
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span>
              <span className="text-foreground">◆</span> its index
            </span>
            <span>
              <span className="font-bold text-foreground">┃</span> similar funds
            </span>
            <span>emoji = your fund</span>
          </div>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">Further right = grew more. Ahead of the markers means doing better than them.</p>
        <ul className="space-y-3">
          {rows.map((r) => {
            const v = r.ret[period];
            const s = standing(r.vsPeer[period]);
            return (
              <li key={r.schemeCode}>
                <Link href={`/funds/${r.schemeCode}`} className="lift block rounded-3xl border bg-card p-4 shadow-card sm:p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-semibold">{r.name}</div>
                      <div className="text-xs text-muted-foreground">{r.kindLabel}</div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className={cn("font-display text-xl font-bold tabular", toneCls(v))}>{pct(v)}</div>
                      <div className={cn("text-xs font-medium", s.tone === "good" && "text-[var(--up)]", s.tone === "bad" && "text-[var(--down)]", s.tone === "none" && "text-muted-foreground")}>
                        <span aria-hidden>{s.emoji}</span> {s.text}
                      </div>
                    </div>
                  </div>
                  <div
                    className="relative mt-4 h-9"
                    role="img"
                    aria-label={`${r.name}: ${pct(v)}; ${r.benchmark ? `its index ${pct(r.bench[period])}; ` : ""}similar funds ${pct(r.peer[period])}.`}
                  >
                    <div className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-muted" />
                    <div className="absolute top-1 bottom-1 w-px bg-[var(--axis)]" style={{ left: at(0) }} title="0%" />
                    {r.bench[period] !== null && r.benchmark && (
                      <span className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 text-sm text-foreground" style={{ left: at(r.bench[period] as number) }} title={`Its index: ${pct(r.bench[period])}`}>
                        ◆
                      </span>
                    )}
                    {r.peer[period] !== null && (
                      <span className="absolute top-1/2 h-6 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground/70" style={{ left: at(r.peer[period] as number) }} title={`Similar funds: ${pct(r.peer[period])}`} />
                    )}
                    {v !== null && (
                      <span
                        className="absolute top-1/2 grid size-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-card bg-brand-soft text-lg shadow-card transition-[left] duration-500 ease-out motion-reduce:transition-none"
                        style={{ left: at(v) }}
                        aria-hidden
                      >
                        {r.emoji}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
                    <span>{pct(scale.lo)}</span>
                    <span>{pct(scale.hi)}</span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Report card: week, month and year together */}
      <section>
        <h2 className="text-xl font-bold">
          Report card <span aria-hidden>🧾</span>
        </h2>
        <p className="mb-4 text-sm text-muted-foreground">Week, month and year side by side. The arrow shows whether each fund did better (▲) or worse (▼) than similar funds.</p>
        <div className="overflow-hidden rounded-3xl border bg-card shadow-card">
          <div className="grid grid-cols-[minmax(0,1fr)_repeat(3,minmax(4.5rem,6.5rem))] gap-x-2 border-b px-4 py-2.5 text-xs font-medium text-muted-foreground sm:px-5">
            <span>Fund</span>
            <span className="text-center">Week</span>
            <span className="text-center">Month</span>
            <span className="text-center">Year</span>
          </div>
          <ul className="divide-y">
            {rows.map((r) => (
              <li key={r.schemeCode} className="grid grid-cols-[minmax(0,1fr)_repeat(3,minmax(4.5rem,6.5rem))] items-center gap-x-2 px-4 py-3 sm:px-5">
                <span className="flex min-w-0 items-center gap-2">
                  <span aria-hidden className="text-lg">
                    {r.emoji}
                  </span>
                  <span className="truncate text-sm font-medium">{r.name}</span>
                </span>
                {(["1W", "1M", "YTD"] as const).map((k) => {
                  const g = r.vsPeer[k];
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setPeriod(k)}
                      title={`vs similar funds: ${g === null ? "n/a" : `${g > 0 ? "+" : ""}${g.toFixed(2)} pts`}`}
                      className={cn(
                        "rounded-full px-2 py-1 text-center text-xs font-semibold tabular",
                        r.ret[k] === null ? "bg-muted text-muted-foreground" : (r.ret[k] as number) >= 0 ? "bg-[var(--tint-good)] text-[var(--up)]" : "bg-[var(--tint-critical)] text-[var(--down)]",
                        period === k && "ring-2 ring-brand",
                      )}
                    >
                      {pct(r.ret[k])}
                      {g !== null && Math.abs(g) >= 0.25 && <span className="ml-0.5">{g > 0 ? "▲" : "▼"}</span>}
                    </button>
                  );
                })}
              </li>
            ))}
          </ul>
        </div>
        {flagged.length > 0 && (
          <div className="mt-4 space-y-2">
            {flagged.map((f) => (
              <p key={f.schemeCode} className="rounded-2xl bg-[var(--tint-warning)] px-4 py-3 text-sm">
                <span aria-hidden>👀</span> <strong>{f.name}</strong>: {f.flagReason}
              </p>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
