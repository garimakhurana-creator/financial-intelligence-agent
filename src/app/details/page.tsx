import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight } from "lucide-react";
import { AssessmentBanner, FundTable, IndexTile, NewsList, SectionTitle } from "@/components/blocks";
import { Freshness, Timestamp } from "@/components/format";
import { Skeleton } from "@/components/ui/skeleton";
import { VIEWS, VIEW_IDS } from "@/lib/catalog";
import { loadDashboard } from "@/lib/view-data";

export const metadata = { title: "Detailed numbers · Meera's Fund Tracker" };

export default function Details() {
  return (
    <div className="space-y-8">
      <div>
        <Link href="/" className="text-sm text-muted-foreground hover:underline">
          ← Back to the simple view
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Detailed numbers</h1>
        <p className="mt-1 max-w-2xl text-[var(--ink-secondary)]">
          The full comparison behind the simple view: returns against each fund&apos;s benchmark (in percentage points, pp) and against the average of
          similar funds (n = number of funds), market breadth and valuation, and the week&apos;s sources.
        </p>
      </div>
      <Suspense fallback={<DashboardSkeleton />}>
        <Dashboard />
      </Suspense>
    </div>
  );
}

async function Dashboard() {
  let d;
  try {
    d = await loadDashboard();
  } catch (e) {
    return (
      <div role="alert" className="rounded-xl border bg-[var(--tint-critical)] p-5">
        <p className="font-medium">The dashboard could not load data from the database.</p>
        <p className="mt-1 text-sm text-[var(--ink-secondary)]">{e instanceof Error ? e.message : "Unknown error"}. Check the database configuration on the Manage page.</p>
      </div>
    );
  }
  const latestNav = d.performance.map((p) => p.nav?.date).filter(Boolean).sort().at(-1) ?? null;
  const breadth = (name: string) => d.snapshot?.data.find((s) => s.index === name);
  const NSE_NAME: Record<string, string> = { NIFTY50: "NIFTY 50", NIFTY_MIDCAP150: "NIFTY MIDCAP 150", NIFTY_SMALLCAP100: "NIFTY SMALLCAP 100" };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Freshness date={latestNav} today={d.asOf} label="NAVs" />
        {d.snapshot && <Freshness date={d.snapshot.date} today={d.asOf} label="Market breadth" />}
        {d.runs[0] && (
          <span className="text-xs text-muted-foreground">
            Last scheduled job: {d.runs[0].job} · {d.runs[0].status} · <Timestamp iso={d.runs[0].finishedAt ?? d.runs[0].startedAt} />
          </span>
        )}
      </div>

      {d.latestReport ? (
        <AssessmentBanner
          label={d.latestReport.assessment}
          reason={d.latestReport.assessmentReason}
          weekEnding={d.latestReport.weekEnding}
          href={`/reports/${d.latestReport.id}`}
          generator={d.latestReport.generator}
        />
      ) : (
        <div className="rounded-xl border border-dashed p-5 text-sm">No weekly report has been generated yet. The first one is produced on Saturday morning, or on demand from the Manage page.</div>
      )}

      <section>
        <SectionTitle sub="Returns are point-to-point from published NAVs. Click a fund for its chart, the exact dates used and the methodology.">Your funds</SectionTitle>
        <FundTable funds={d.performance} />
      </section>

      <section>
        <SectionTitle sub="Price indices (not total-return). Breadth and valuation come from NSE's latest session.">Market this week</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-3">
          {d.headline.map((ix) => {
            const b = breadth(NSE_NAME[ix.id]);
            return <IndexTile key={ix.id} ix={ix} note={b ? `P/E ${b.pe ?? "n/a"} · ${b.advances ?? "?"} up / ${b.declines ?? "?"} down` : undefined} />;
          })}
        </div>
      </section>

      <section>
        <SectionTitle sub="Five separate views, each with its own benchmark, peers and market context.">Category intelligence</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {VIEW_IDS.map((id) => {
            const summary = d.latestReport?.report.output.categories.find((c) => c.viewId === id);
            return (
              <Link key={id} href={`/categories/${id}`} className="group flex flex-col rounded-xl border bg-card p-4 hover:border-foreground/30">
                <span className="text-sm font-semibold">{VIEWS[id].title}</span>
                <span className="mt-1 line-clamp-3 flex-1 text-xs leading-relaxed text-muted-foreground">{summary?.headline ?? "No summary yet"}</span>
                <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium">
                  Open view <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" aria-hidden />
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div>
          <SectionTitle sub={d.latestReport ? `Retrieved for the week ending ${d.latestReport.weekEnding}; publication dates shown.` : undefined}>Important developments</SectionTitle>
          <NewsList items={d.news} showViews />
        </div>
        <div>
          <SectionTitle>Reports</SectionTitle>
          <div className="space-y-2 rounded-xl border bg-card p-4 text-sm">
            {d.latestReport ? (
              <Link href={`/reports/${d.latestReport.id}`} className="block font-medium hover:underline">
                Latest: week ending {d.latestReport.weekEnding}
              </Link>
            ) : (
              <p className="text-muted-foreground">No reports yet.</p>
            )}
            <Link href="/reports" className="block text-muted-foreground hover:underline">
              Browse the archive →
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading dashboard">
      <Skeleton className="h-28 w-full rounded-xl" />
      <Skeleton className="h-64 w-full rounded-xl" />
      <div className="grid gap-3 sm:grid-cols-3">
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
    </div>
  );
}
