import Link from "next/link";
import { Suspense } from "react";
import {
  AssessmentPanel,
  FundSummary,
  Highlights,
  PortfolioCards,
  QuickActions,
} from "@/components/dashboard";
import { Timestamp } from "@/components/format";
import { FundCards, StoryStrip, WeatherHero } from "@/components/home";
import { Term } from "@/components/term";
import {
  PerformanceChart,
  type ChartSeries,
} from "@/components/performance-chart";
import { Skeleton } from "@/components/ui/skeleton";
import { optionalEnv } from "@/lib/env";
import { loadDashboard } from "@/lib/view-data";

export default function Dashboard() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardContent />
    </Suspense>
  );
}

function greeting(now: Date) {
  const h = Number(
    new Intl.DateTimeFormat("en-IN", {
      hour: "numeric",
      hour12: false,
      timeZone: "Asia/Kolkata",
    }).format(now),
  );
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

async function DashboardContent() {
  let d;
  try {
    d = await loadDashboard();
  } catch {
    return (
      <div
        role="alert"
        className="rounded-2xl border bg-[var(--tint-critical)] p-6"
      >
        <p className="font-medium">
          We couldn&apos;t load your funds right now.
        </p>
        <p className="mt-1 text-sm text-[var(--ink-secondary)]">
          Please try again in a minute. If it keeps happening, check Settings.
        </p>
      </div>
    );
  }
  const now = new Date();
  const name = optionalEnv("INVESTOR_NAME", "Meera");
  const navDate =
    d.performance
      .map((p) => p.nav?.date)
      .filter(Boolean)
      .sort()
      .at(-1) ?? null;
  const short = (n: string) =>
    n.replace(/\s*-\s*Direct Plan.*$/i, "").replace(/\s*-\s*Growth.*$/i, "");
  const series: ChartSeries[] = [
    ...d.performance.map((p) => ({
      key: `f${p.schemeCode}`,
      name: short(p.schemeName),
      kind: "fund" as const,
      data: p.chart,
    })),
    ...d.headline.map((ix) => ({
      key: ix.id,
      name: ix.name,
      kind: "index" as const,
      data: ix.chart,
    })),
  ];
  const first = d.performance[0];
  const initial = first
    ? [`f${first.schemeCode}`, first.benchmark?.id ?? "NIFTY50"]
    : ["NIFTY50"];

  return (
    <div className="space-y-10">
      <header className="fade-up">
        <p className="text-sm font-medium text-brand">
          {now.toLocaleDateString("en-IN", {
            weekday: "long",
            day: "numeric",
            month: "long",
            timeZone: "Asia/Kolkata",
          })}
        </p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">
          {greeting(now)}, {name}{" "}
          <span className="wave inline-block" aria-hidden>
            👋
          </span>
        </h1>
      </header>

      <div className="fade-up [animation-delay:60ms]">
        <WeatherHero
          label={d.latestReport?.assessment ?? null}
          reason={d.latestReport?.assessmentReason ?? null}
          weekEnding={d.latestReport?.weekEnding ?? null}
          reportId={d.latestReport?.id ?? null}
        />
      </div>

      <section className="fade-up [animation-delay:120ms]">
        <h2 className="text-xl font-bold">Your week in 30 seconds</h2>
        <p className="mb-4 text-sm text-muted-foreground">Swipe through →</p>
        <StoryStrip
          funds={d.performance}
          indices={d.headline}
          news={d.storyNews}
        />
      </section>

      <section>
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-xl font-bold">Your funds</h2>
          <Link
            href="/portfolio"
            className="text-sm font-medium text-brand hover:underline"
          >
            See all details →
          </Link>
        </div>
        <FundCards funds={d.performance} />
      </section>

      {d.highlights.length > 0 && (
        <section>
          <h2 className="mb-4 text-xl font-bold">
            Heads up <span aria-hidden>🔔</span>
          </h2>
          <Highlights items={d.highlights} />
        </section>
      )}

      <PortfolioCards
        portfolio={d.portfolio}
        admin={d.admin}
        fundsTracked={d.performance.length}
        navDate={navDate}
      />

      <details className="group rounded-3xl border bg-card shadow-card">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-5 [&::-webkit-details-marker]:hidden">
          <span>
            <span className="font-semibold">
              <span aria-hidden>🔢</span> Show me the numbers
            </span>
            <span className="block text-sm text-muted-foreground">
              Exact returns, comparisons with each fund&apos;s index and similar
              funds, and a chart.
            </span>
          </span>
          <span className="shrink-0 rounded-full border px-3 py-1 text-xs font-medium group-open:hidden">
            Open
          </span>
          <span className="hidden shrink-0 rounded-full border px-3 py-1 text-xs font-medium group-open:inline">
            Close
          </span>
        </summary>
        <div className="space-y-6 border-t p-5">
          <div>
            <p className="mb-3 text-xs text-muted-foreground">
              Returns from published <Term slug="nav">NAVs</Term>.{" "}
              <Term slug="similar-funds">&ldquo;Similar funds&rdquo;</Term> =
              average of comparable Direct-Growth funds; differences are in{" "}
              <Term slug="percentage-points">points</Term>.
              {d.lastRefresh && (
                <>
                  {" "}
                  Data last refreshed{" "}
                  <Timestamp iso={d.lastRefresh.finishedAt} />.
                </>
              )}
            </p>
            <FundSummary funds={d.performance} />
          </div>
          <div>
            <h3 className="font-semibold">How they have moved</h3>
            <p className="mb-4 text-sm text-[var(--ink-secondary)]">
              Pick funds or indices and a period; all lines start at ₹100 on the
              same day.
            </p>
            <PerformanceChart series={series} initial={initial} />
          </div>
          {d.latestReport && (
            <AssessmentPanel
              label={d.latestReport.assessment}
              reason={d.latestReport.assessmentReason}
              weekEnding={d.latestReport.weekEnding}
              reportId={d.latestReport.id}
              funds={d.performance}
            />
          )}
        </div>
      </details>

      <section>
        <h2 className="mb-4 text-xl font-bold">Explore more</h2>
        <QuickActions reportId={d.latestReport?.id ?? null} />
      </section>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div
      className="space-y-6"
      aria-busy="true"
      aria-label="Loading your dashboard"
    >
      <Skeleton className="h-16 w-72" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-44 w-full rounded-2xl" />
      <Skeleton className="h-72 w-full rounded-2xl" />
    </div>
  );
}
