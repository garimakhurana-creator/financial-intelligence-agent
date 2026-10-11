import Link from "next/link";
import { AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight, CheckCircle2, ChevronDown, Clock, Eye, Minus } from "lucide-react";
import type { ViewId } from "@/lib/catalog";
import { formatHuman } from "@/lib/dates";
import type { FundPerformance, IndexPerformance } from "@/lib/pipeline/data";
import { describeGap, FUND_KIND, INDEX_WORDS, MARKET_WORDS, signed, toneOf, type Tone } from "@/lib/plain";
import type { ReportOutput } from "@/lib/report/types";
import { cn } from "@/lib/utils";

const TONE_TEXT: Record<Tone, string> = {
  good: "text-[var(--up)]",
  bad: "text-[var(--down)]",
  neutral: "text-foreground",
  none: "text-[var(--ink-muted)]",
};
const TONE_DOT: Record<Tone, string> = {
  good: "bg-[var(--status-good)]",
  bad: "bg-[var(--status-critical)]",
  neutral: "bg-[var(--axis)]",
  none: "bg-[var(--grid)]",
};

function Move({ value, className }: { value: number | null | undefined; className?: string }) {
  const tone = toneOf(value);
  const Icon = tone === "good" ? ArrowUpRight : tone === "bad" ? ArrowDownRight : Minus;
  return (
    <span className={cn("tabular inline-flex items-center gap-0.5", TONE_TEXT[tone], className)}>
      {tone !== "none" && <Icon aria-hidden className="size-[0.8em] shrink-0" />}
      {signed(value)}
    </span>
  );
}

const VERDICT = {
  "No action needed": { Icon: CheckCircle2, tint: "bg-[var(--tint-good)]", ring: "ring-[var(--status-good)]/30", say: "All good this week" },
  "One fund worth watching": { Icon: Eye, tint: "bg-[var(--tint-warning)]", ring: "ring-[var(--status-warning)]/40", say: "One fund to keep an eye on" },
  "Consider reviewing your allocation": { Icon: AlertTriangle, tint: "bg-[var(--tint-critical)]", ring: "ring-[var(--status-critical)]/30", say: "Worth a closer look" },
} as const;

export function VerdictHero({ name, label, reason, weekEnding, reportId }: { name: string; label: string; reason: string; weekEnding: string; reportId: string }) {
  const v = VERDICT[label as keyof typeof VERDICT] ?? VERDICT["No action needed"];
  return (
    <section className={cn("rounded-2xl p-6 ring-1 sm:p-8", v.tint, v.ring)}>
      <p className="text-sm text-[var(--ink-secondary)]">
        Hi {name}, here&apos;s your week · up to {formatHuman(weekEnding)}
      </p>
      <h1 className="mt-3 flex items-center gap-3 text-3xl font-semibold tracking-tight sm:text-4xl">
        <v.Icon className="size-8 shrink-0 sm:size-9" aria-hidden />
        {label}
      </h1>
      <p className="mt-3 max-w-2xl text-lg leading-relaxed">{reason}</p>
      <Link href={`/reports/${reportId}`} className="mt-5 inline-flex items-center gap-1 text-sm font-medium underline underline-offset-4">
        Read this week&apos;s full report <ArrowRight className="size-4" aria-hidden />
      </Link>
    </section>
  );
}

function StatusPill({ status }: { status: "ok" | "watch" | "delayed" }) {
  const s = {
    ok: { Icon: CheckCircle2, text: "On track", cls: "bg-[var(--tint-good)]" },
    watch: { Icon: Eye, text: "Keep an eye", cls: "bg-[var(--tint-warning)]" },
    delayed: { Icon: Clock, text: "Data delayed", cls: "bg-muted" },
  }[status];
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium", s.cls)}>
      <s.Icon className="size-3.5" aria-hidden />
      {s.text}
    </span>
  );
}

function CompareRow({ label, pp }: { label: string; pp: number | null }) {
  const g = describeGap(pp);
  return (
    <li className="flex items-start gap-2 text-sm leading-snug">
      <span aria-hidden className={cn("mt-1.5 size-2 shrink-0 rounded-full", TONE_DOT[g.tone])} />
      <span>
        <span className={cn("font-medium", g.tone === "bad" && "text-[var(--down)]", g.tone === "good" && "text-[var(--up)]")}>{capitalise(g.words)}</span>{" "}
        <span className="text-[var(--ink-secondary)]">{label}</span>
      </span>
    </li>
  );
}

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function FundCard({
  perf,
  status,
  why,
}: {
  perf: FundPerformance;
  status: "ok" | "watch" | "delayed";
  why?: ReportOutput["funds"][number];
}) {
  const view = perf.viewId as ViewId | null;
  const w = perf.windows["1W"];
  const name = perf.schemeName.replace(/\s*-\s*Direct Plan.*$/i, "").replace(/\s*-\s*Growth.*$/i, "");
  return (
    <article className="flex flex-col rounded-2xl border bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold leading-snug">{name}</h3>
          <p className="mt-0.5 text-sm text-[var(--ink-secondary)]">{view ? FUND_KIND[view] : perf.amfiCategory}</p>
        </div>
        <StatusPill status={status} />
      </div>

      <div className="mt-4 flex items-end gap-6">
        <div>
          <div className="text-xs text-muted-foreground">This week</div>
          <Move value={w.fund.returnPct} className="text-3xl font-semibold" />
        </div>
        <div>
          <div className="text-xs text-muted-foreground">This year</div>
          <Move value={perf.windows["YTD"].fund.returnPct} className="text-lg font-medium" />
        </div>
      </div>

      <ul className="mt-4 space-y-1.5">
        {perf.benchmark ? <CompareRow label={view ? MARKET_WORDS[view] : "its market"} pp={w.vsBenchmarkPp} /> : null}
        <CompareRow label="similar funds" pp={w.vsPeerPp} />
      </ul>
      {!perf.benchmark && view === "short_debt" && (
        <p className="mt-1.5 text-xs text-muted-foreground">Bond funds have no free market index, so we compare with similar funds only.</p>
      )}

      {why && (
        <details className="group mt-4 rounded-lg bg-muted/50 px-3 py-2 text-sm">
          <summary className="flex cursor-pointer list-none items-center gap-1 font-medium [&::-webkit-details-marker]:hidden">
            Why did it move?
            <ChevronDown aria-hidden className="size-4 transition-transform group-open:rotate-180" />
          </summary>
          <div className="mt-2 space-y-1.5 leading-relaxed text-[var(--ink-secondary)]">
            <p>{why.performance}</p>
            <p>{why.comparison}</p>
            <p>{why.marketContext}</p>
          </div>
        </details>
      )}

      <Link href={`/funds/${perf.schemeCode}`} className="mt-auto pt-4 text-sm text-muted-foreground hover:text-foreground hover:underline">
        See the numbers →
      </Link>
    </article>
  );
}

export function MarketStrip({ indices, summary }: { indices: IndexPerformance[]; summary?: string }) {
  return (
    <section className="rounded-2xl border bg-card p-5 sm:p-6">
      <h2 className="text-lg font-semibold">The market this week</h2>
      <ul className="mt-3 flex flex-wrap gap-2">
        {indices.map((ix) => (
          <li key={ix.id} className="rounded-full border px-3 py-1.5 text-sm">
            <span className="text-[var(--ink-secondary)]">{INDEX_WORDS[ix.id] ?? ix.name}</span> <Move value={ix.windows["1W"].returnPct} className="font-medium" />
          </li>
        ))}
      </ul>
      {summary && <p className="mt-4 max-w-3xl leading-relaxed text-[var(--ink-secondary)]">{summary}</p>}
    </section>
  );
}
