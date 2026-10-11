import { Suspense } from "react";
import { AssessmentPanel, FundSummary, Highlights, PortfolioCards, QuickActions } from "@/components/dashboard";
import { Timestamp } from "@/components/format";
import { Card } from "@/components/page-header";
import { PerformanceChart, type ChartSeries } from "@/components/performance-chart";
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
  const h = Number(new Intl.DateTimeFormat("en-IN", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }).format(now));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

async function DashboardContent() {
  let d;
  try {
    d = await loadDashboard();
  } catch {
    return (
      <div role="alert" className="rounded-2xl border bg-[var(--tint-critical)] p-6">
        <p className="font-medium">We couldn&apos;t load your funds right now.</p>
        <p className="mt-1 text-sm text-[var(--ink-secondary)]">Please try again in a minute. If it keeps happening, check Settings.</p>
      </div>
    );
  }
  const now = new Date();
  const name = optionalEnv("INVESTOR_NAME", "Meera");
  const navDate = d.performance.map((p) => p.nav?.date).filter(Boolean).sort().at(-1) ?? null;
  const short = (n: string) => n.replace(/\s*-\s*Direct Plan.*$/i, "").replace(/\s*-\s*Growth.*$/i, "");
  const series: ChartSeries[] = [
    ...d.performance.map((p) => ({ key: `f${p.schemeCode}`, name: short(p.schemeName), kind: "fund" as const, data: p.chart })),
    ...d.headline.map((ix) => ({ key: ix.id, name: ix.name, kind: "index" as const, data: ix.chart })),
  ];
  const first = d.performance[0];
  const initial = first ? [`f${first.schemeCode}`, first.benchmark?.id ?? "NIFTY50"] : ["NIFTY50"];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {greeting(now)}, {name}.
        </h1>
        <p className="mt-1 text-[var(--ink-secondary)]">Here is how your investments are doing this week.</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {now.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" })}
          {d.lastRefresh && (
            <>
              {" "}
              · data last refreshed <Timestamp iso={d.lastRefresh.finishedAt} />
            </>
          )}
        </p>
      </div>

      <PortfolioCards portfolio={d.portfolio} admin={d.admin} fundsTracked={d.performance.length} navDate={navDate} />

      {d.latestReport ? (
        <AssessmentPanel label={d.latestReport.assessment} reason={d.latestReport.assessmentReason} weekEnding={d.latestReport.weekEnding} reportId={d.latestReport.id} funds={d.performance} />
      ) : (
        <Card>
          <p className="font-medium">Your first weekly assessment arrives on Saturday morning.</p>
        </Card>
      )}

      <section>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">Your funds at a glance</h2>
          <p className="text-xs text-muted-foreground">Returns from published NAVs. &ldquo;Similar funds&rdquo; = average of comparable Direct-Growth funds.</p>
        </div>
        <FundSummary funds={d.performance} />
      </section>

      <Card>
        <h2 className="text-lg font-semibold">How they have moved</h2>
        <p className="mb-4 text-sm text-[var(--ink-secondary)]">Pick funds or indices and a period; all lines start at ₹100 on the same day.</p>
        <PerformanceChart series={series} initial={initial} />
      </Card>

      <section>
        <h2 className="mb-3 text-lg font-semibold">What matters this week</h2>
        <Highlights items={d.highlights} />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Quick actions</h2>
        <QuickActions reportId={d.latestReport?.id ?? null} />
      </section>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading your dashboard">
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
