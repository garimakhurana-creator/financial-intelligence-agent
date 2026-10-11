import Link from "next/link";
import { Suspense } from "react";
import { FundCard, MarketStrip, VerdictHero } from "@/components/simple";
import { Skeleton } from "@/components/ui/skeleton";
import { VIEWS, VIEW_IDS, type ViewId } from "@/lib/catalog";
import { formatHuman } from "@/lib/dates";
import { optionalEnv } from "@/lib/env";
import { FUND_KIND } from "@/lib/plain";
import { metricTriples } from "@/lib/report/input";
import { screenFund } from "@/lib/report/screening";
import { loadDashboard } from "@/lib/view-data";

export default function Home() {
  return (
    <Suspense fallback={<HomeSkeleton />}>
      <SimpleHome />
    </Suspense>
  );
}

async function SimpleHome() {
  let d;
  try {
    d = await loadDashboard();
  } catch {
    return (
      <div role="alert" className="rounded-2xl border bg-[var(--tint-critical)] p-6">
        <p className="font-medium">We couldn&apos;t load your funds right now.</p>
        <p className="mt-1 text-sm text-[var(--ink-secondary)]">Please try again in a minute. If it keeps happening, check the Manage page.</p>
      </div>
    );
  }
  const name = optionalEnv("INVESTOR_NAME", "Meera");
  const report = d.latestReport;
  const navDate = d.performance.map((p) => p.nav?.date).filter(Boolean).sort().at(-1) ?? null;

  return (
    <div className="space-y-8">
      {report ? (
        <VerdictHero name={name} label={report.assessment} reason={report.assessmentReason} weekEnding={report.weekEnding} reportId={report.id} />
      ) : (
        <section className="rounded-2xl border bg-card p-6">
          <p className="text-sm text-[var(--ink-secondary)]">Hi {name}</p>
          <h1 className="mt-2 text-2xl font-semibold">Your first weekly report arrives on Saturday morning.</h1>
        </section>
      )}

      <section>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">Your {d.performance.length} funds</h2>
          {navDate && <p className="text-sm text-muted-foreground">Latest prices from {formatHuman(navDate)}</p>}
        </div>
        {d.performance.length === 0 ? (
          <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            No funds yet. <Link href="/manage" className="underline">Add one using its scheme code</Link>.
          </p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {d.performance.map((p) => {
              const status = !p.nav ? "delayed" : screenFund(p.viewId, metricTriples(p)).flag ? "watch" : "ok";
              const why = report?.report.output.funds.find((f) => f.schemeCode === p.schemeCode);
              return <FundCard key={p.schemeCode} perf={p} status={status} why={why} />;
            })}
          </div>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          &ldquo;On track&rdquo; means no lasting slip against similar funds; one bad week alone never changes it. Comparisons are for this week.{" "}
          <Link href="/methodology" className="underline">How we decide</Link>
        </p>
      </section>

      <MarketStrip indices={d.headline} summary={report?.report.output.marketSummary.text} />

      <section>
        <h2 className="mb-3 text-lg font-semibold">Explore by fund type</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {VIEW_IDS.map((id: ViewId) => {
            const c = report?.report.output.categories.find((x) => x.viewId === id);
            return (
              <Link key={id} href={`/categories/${id}`} className="rounded-xl border bg-card p-4 hover:border-foreground/30">
                <div className="text-sm font-semibold">{VIEWS[id].title}</div>
                <div className="mt-1 text-xs leading-relaxed text-muted-foreground">{c?.headline ?? FUND_KIND[id]}</div>
              </Link>
            );
          })}
        </div>
      </section>

      <nav aria-label="More" className="flex flex-wrap gap-x-6 gap-y-2 border-t pt-5 text-sm">
        <Link href="/details" className="font-medium hover:underline">
          Detailed numbers →
        </Link>
        <Link href="/reports" className="hover:underline">
          Past weekly reports
        </Link>
        <Link href="/methodology" className="hover:underline">
          How we calculate
        </Link>
      </nav>
    </div>
  );
}

function HomeSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-44 w-full rounded-2xl" />
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-56 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
