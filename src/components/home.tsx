import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { Carousel } from "@/components/carousel";
import { formatHuman } from "@/lib/dates";
import { cleanTitle, topicArt } from "@/lib/news/art";
import type { FundPerformance, IndexPerformance } from "@/lib/pipeline/data";
import { describeMove, describeVsPeers, FUND_EMOJI, FUND_GRADIENT, FUND_KIND, INDEX_WORDS, thousandBecomes, WEEK_WEATHER } from "@/lib/plain";
import { metricTriples } from "@/lib/report/input";
import { screenFund, type LagCheck } from "@/lib/report/screening";
import type { ViewId } from "@/lib/catalog";
import { cn } from "@/lib/utils";

// Words-first building blocks for the home page. Every word comes from fixed thresholds in
// lib/plain.ts; the exact numbers live behind "Show me the numbers".

export const shortName = (n: string) => n.replace(/\s*-\s*Direct Plan.*$/i, "").replace(/\s*-\s*Growth.*$/i, "").replace(/\s+Fund$/i, "");
const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;
const gradientOf = (view: string | null) => FUND_GRADIENT[(view ?? "") as ViewId] ?? ["#64748b", "#0f766e"];
const emojiOf = (view: string | null) => FUND_EMOJI[(view ?? "") as ViewId] ?? "💼";

/** A tiny SVG trend line — no chart library, so the dashboard stays light. */
export function MiniTrend({ data, height = 36 }: { data: { value: number }[]; height?: number }) {
  if (data.length < 2) return null;
  const vals = data.map((d) => d.value);
  const min = Math.min(...vals);
  const span = Math.max(...vals) - min || 1;
  const w = 100;
  const pts = vals.map((v, i) => `${((i / (vals.length - 1)) * w).toFixed(1)},${(height - 3 - ((v - min) / span) * (height - 6)).toFixed(1)}`).join(" ");
  const up = vals.at(-1)! >= vals[0];
  return (
    <svg aria-hidden viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className="h-9 w-full overflow-visible">
      <polyline points={pts} fill="none" stroke={up ? "var(--up)" : "var(--down)"} strokeWidth={1.75} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function fundStatus(f: FundPerformance): { emoji: string; text: string; cls: string } {
  if (!f.nav) return { emoji: "⏳", text: "Waiting for price", cls: "bg-muted text-[var(--ink-secondary)]" };
  if (screenFund(f.viewId, metricTriples(f)).flag) return { emoji: "👀", text: "Keep an eye", cls: "bg-[var(--tint-warning)] text-foreground" };
  return { emoji: "👍", text: "On track", cls: "bg-[var(--tint-good)] text-foreground" };
}

// ---------------------------------------------------------------------------------------------

function CheckPill({ label, gap, behind }: { label: string; gap: number | null; behind: boolean }) {
  const text = gap === null ? "no data" : Math.abs(gap) < 0.005 ? "level" : gap > 0 ? `ahead ${gap.toFixed(2)}` : `behind ${Math.abs(gap).toFixed(2)}`;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium", behind ? "bg-[#fecaca] text-[#7f1d1d]" : "bg-[#bbf7d0] text-[#14532d]")}>
      <span aria-hidden>{behind ? "✗" : "✓"}</span> {label}: {text}
      {gap !== null && Math.abs(gap) >= 0.005 && " pts"}
    </span>
  );
}

/** "How we decided": each lagging fund's two checks, so it is clear why one is flagged and another not. */
function DecisionPanel({ checks }: { checks: LagCheck[] }) {
  return (
    <div className="mt-5 rounded-2xl bg-white/55 p-4 backdrop-blur-sm">
      <div className="text-sm font-semibold">How we decided</div>
      <p className="mt-0.5 text-xs opacity-80">A fund is flagged only when it is behind similar funds both this month and this year — one bad stretch is not enough.</p>
      <ul className="mt-3 space-y-2.5">
        {checks.map((c) => (
          <li key={c.name} className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-sm font-semibold">{c.name}</span>
            <span className="flex flex-wrap items-center gap-1.5">
              <CheckPill label="This month" gap={c.month} behind={c.monthBehind} />
              <CheckPill label="This year" gap={c.year} behind={c.yearBehind} />
              <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", c.flagged ? "bg-[#16181d] text-white" : "bg-white/80")}>
                {c.flagged ? "👀 Worth watching" : "🙂 Not flagged — needs both"}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function WeatherHero({ label, reason, weekEnding, reportId, checks = [] }: { label: string | null; reason: string | null; weekEnding: string | null; reportId: string | null; checks?: LagCheck[] }) {
  const w = label ? WEEK_WEATHER[label] : null;
  if (!w) {
    return (
      <section className="rounded-3xl border bg-card p-6 shadow-card sm:p-8">
        <div className="text-6xl" aria-hidden>
          🌱
        </div>
        <h2 className="font-display mt-3 text-3xl font-semibold">Your first weekly check-in is on its way</h2>
        <p className="mt-2 text-[var(--ink-secondary)]">It arrives on Saturday morning.</p>
      </section>
    );
  }
  return (
    <section className="relative overflow-hidden rounded-3xl p-6 text-[#16181d] shadow-card sm:p-8" style={{ background: `linear-gradient(135deg, ${w.from}, ${w.to})` }}>
      <span aria-hidden className="float-slow pointer-events-none absolute -right-4 -top-6 text-[9rem] leading-none sm:right-6 sm:top-2 sm:text-[10rem]">
        {w.emoji}
      </span>
      <div className="relative max-w-2xl">
        <p className="text-sm font-medium opacity-70">This week{weekEnding ? ` · up to ${formatHuman(weekEnding)}` : ""}</p>
        <h2 className="font-display mt-1 text-3xl font-bold tracking-tight sm:text-4xl">{w.title}</h2>
        {reason && <p className="mt-3 text-[17px] font-medium leading-relaxed">{reason}</p>}
        {checks.length > 0 && <DecisionPanel checks={checks} />}
        <div className="mt-5 flex flex-wrap items-center gap-3">
          {reportId && (
            <Link href={`/reports/${reportId}`} className="inline-flex items-center gap-1.5 rounded-full bg-[#16181d] px-4 py-2 text-sm font-medium text-white hover:bg-black">
              Read this week&apos;s story <ArrowRight className="size-4" aria-hidden />
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------

export function StoryStrip({ funds, indices, news }: { funds: FundPerformance[]; indices: IndexPerformance[]; news: { id: string; title: string; topics: string[] }[] }) {
  return (
    <Carousel label="Your week in 30 seconds">
      {funds.map((f) => {
        const m = f.windows["1M"];
        const week = describeMove(f.windows["1W"].fund.returnPct);
        const move = describeMove(m.fund.returnPct);
        const k = thousandBecomes(m.fund.returnPct);
        const [a, b] = gradientOf(f.viewId);
        return (
          <Link
            key={f.schemeCode}
            href={`/funds/${f.schemeCode}`}
            className="story-card lift relative flex h-[18rem] w-[15rem] shrink-0 snap-start flex-col overflow-hidden rounded-3xl p-5 text-white shadow-card"
            style={{ background: `linear-gradient(160deg, ${a}, ${b})` }}
          >
            <span aria-hidden className="absolute -bottom-4 -right-3 text-[6.5rem] leading-none opacity-25">
              {emojiOf(f.viewId)}
            </span>
            <span className="text-3xl" aria-hidden>
              {emojiOf(f.viewId)}
            </span>
            <div className="mt-2 text-sm font-medium leading-snug opacity-90">{shortName(f.schemeName)}</div>
            <div className="mt-auto">
              <div className="text-xs font-medium uppercase tracking-wider opacity-75">This week</div>
              <div className="font-display mt-1 text-2xl font-bold leading-tight">
                {week.words} <span aria-hidden>{week.emoji}</span>
              </div>
              <div className="mt-2 text-xs opacity-90">
                This month: {move.words.toLowerCase()}
                {k !== null && <> · ₹1,000 → {inr(k)}</>}
              </div>
              <div className="mt-1 text-xs opacity-85">{describeVsPeers(f.windows["1W"].vsPeerPp).words}</div>
            </div>
          </Link>
        );
      })}

      <Link href="/market" className="story-card lift relative flex h-[18rem] w-[15rem] shrink-0 snap-start flex-col overflow-hidden rounded-3xl bg-[#16181d] p-5 text-white shadow-card">
        <span className="text-3xl" aria-hidden>
          🌡️
        </span>
        <div className="mt-2 text-sm font-medium opacity-80">The market this week</div>
        <ul className="mt-auto space-y-3">
          {indices.map((ix) => {
            const mv = describeMove(ix.windows["1W"].returnPct);
            return (
              <li key={ix.id}>
                <div className="text-xs opacity-70">{INDEX_WORDS[ix.id] ?? ix.name}</div>
                <div className="font-medium">
                  {mv.words} <span aria-hidden>{mv.emoji}</span>
                </div>
              </li>
            );
          })}
        </ul>
      </Link>

      {news.slice(0, 3).map((n) => {
        const art = topicArt(n.topics);
        return (
          <Link
            key={n.id}
            href="/market"
            className="story-card lift relative flex h-[18rem] w-[15rem] shrink-0 snap-start flex-col overflow-hidden rounded-3xl p-5 text-white shadow-card"
            style={{ background: `linear-gradient(160deg, ${art.from}, ${art.to})` }}
          >
            <span aria-hidden className="absolute -bottom-4 -right-3 text-[6.5rem] leading-none opacity-25">
              {art.emoji}
            </span>
            <span className="w-fit rounded-full bg-black/20 px-2.5 py-1 text-xs font-medium">📰 Heard this week</span>
            <div className="font-display mt-3 line-clamp-5 text-lg font-semibold leading-snug">{cleanTitle(n.title)}</div>
            <div className="mt-auto inline-flex items-center gap-1 text-xs font-medium opacity-90">
              Swipe the news <ArrowUpRight className="size-3.5" aria-hidden />
            </div>
          </Link>
        );
      })}
    </Carousel>
  );
}

// ---------------------------------------------------------------------------------------------

export function FundCards({ funds }: { funds: FundPerformance[] }) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {funds.map((f) => {
        const m = f.windows["1M"];
        const week = describeMove(f.windows["1W"].fund.returnPct);
        const move = describeMove(m.fund.returnPct);
        const k = thousandBecomes(m.fund.returnPct);
        const vs = describeVsPeers(f.windows["1W"].vsPeerPp);
        const s = fundStatus(f);
        const [a, b] = gradientOf(f.viewId);
        return (
          <li key={f.schemeCode}>
            <Link href={`/funds/${f.schemeCode}`} className="lift group flex h-full flex-col rounded-3xl border bg-card p-5 shadow-card">
              <div className="flex items-start gap-3">
                <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-2xl text-2xl" style={{ background: `linear-gradient(135deg, ${a}, ${b})` }}>
                  {emojiOf(f.viewId)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold leading-snug group-hover:underline">{shortName(f.schemeName)}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">{f.viewId ? FUND_KIND[f.viewId as ViewId] : f.amfiCategory}</div>
                </div>
              </div>
              <div className="mt-4 flex items-end justify-between gap-3">
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { label: "This week", mv: week },
                    { label: "This month", mv: move },
                  ].map(({ label, mv }) => (
                    <div key={label}>
                      <div className="text-xs text-muted-foreground">{label}</div>
                      <div className={cn("font-display text-lg font-bold leading-tight", mv.tone === "good" && "text-[var(--up)]", mv.tone === "bad" && "text-[var(--down)]")}>
                        {mv.words} <span aria-hidden>{mv.emoji}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="w-24 shrink-0">
                  <MiniTrend data={f.chart.slice(-23)} />
                </div>
              </div>
              {k !== null && (
                <p className="mt-2 text-sm text-[var(--ink-secondary)]">
                  ₹1,000 a month ago is about <span className="font-semibold text-foreground">{inr(k)}</span> now
                </p>
              )}
              <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
                <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium", s.cls)}>
                  <span aria-hidden>{s.emoji}</span> {s.text}
                </span>
                <span className="text-xs text-muted-foreground">{vs.words}</span>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

// ---------------------------------------------------------------------------------------------

/** Three headline indices as moods, for the market page header. */
export function MarketMood({ indices }: { indices: IndexPerformance[] }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-3">
      {indices.map((ix) => {
        const mv = describeMove(ix.windows["1W"].returnPct);
        return (
          <li key={ix.id} className="flex items-center gap-3 rounded-2xl border bg-card p-4 shadow-card">
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-muted text-2xl" aria-hidden>
              {mv.emoji}
            </span>
            <div className="min-w-0">
              <div className="text-xs text-muted-foreground">{INDEX_WORDS[ix.id] ?? ix.name} · this week</div>
              <div className={cn("font-display text-lg font-semibold", mv.tone === "good" && "text-[var(--up)]", mv.tone === "bad" && "text-[var(--down)]")}>{mv.words}</div>
              <div className="truncate text-[11px] text-muted-foreground">{ix.name}</div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
