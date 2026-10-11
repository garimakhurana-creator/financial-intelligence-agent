import Link from "next/link";
import { Suspense } from "react";
import { AlertTriangle, CheckCircle2, Eye } from "lucide-react";
import { Timestamp } from "@/components/format";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { formatHuman } from "@/lib/dates";
import { loadArchive } from "@/lib/view-data";
import { cn } from "@/lib/utils";

export const metadata = { title: "Weekly Reports · Meera's Fund Intelligence" };

export default function ReportsPage() {
  return (
    <>
      <PageHeader
        title="Weekly Reports"
        sub="Every Saturday report, kept with the exact data it was written from. Opening an old report never refreshes or changes it."
        crumbs={[{ href: "/", label: "Dashboard" }]}
      />
      <Suspense fallback={<Skeleton className="h-64 w-full rounded-2xl" />}>
        <Archive />
      </Suspense>
    </>
  );
}

const ICON = {
  "No action needed": { Icon: CheckCircle2, cls: "text-[var(--status-good)]" },
  "One fund worth watching": { Icon: Eye, cls: "text-[var(--status-warning)]" },
  "Consider reviewing your allocation": { Icon: AlertTriangle, cls: "text-[var(--status-critical)]" },
} as const;

async function Archive() {
  const reports = await loadArchive();
  if (reports.length === 0) return <p className="rounded-2xl border border-dashed p-6 text-sm text-muted-foreground">No reports yet. The first one is written on Saturday morning.</p>;
  const months = new Map<string, typeof reports>();
  for (const r of reports) {
    const key = new Date(`${r.weekEnding}T00:00:00Z`).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
    months.set(key, [...(months.get(key) ?? []), r]);
  }
  const latest = reports[0];
  const li = ICON[latest.assessment as keyof typeof ICON] ?? ICON["No action needed"];
  return (
    <div className="space-y-8">
      <Link href={`/reports/${latest.id}`} className="block rounded-2xl border bg-card p-5 hover:border-foreground/30">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Latest · week ending {formatHuman(latest.weekEnding)}</div>
        <div className="mt-1 flex items-center gap-2 text-xl font-semibold">
          <li.Icon className={cn("size-5", li.cls)} aria-hidden />
          {latest.assessment}
        </div>
        <p className="mt-1 text-[var(--ink-secondary)]">{latest.assessmentReason}</p>
        <span className="mt-3 inline-block text-sm font-medium underline underline-offset-4">Read the report</span>
      </Link>

      {[...months.entries()].map(([month, list]) => (
        <section key={month}>
          <h2 className="mb-2 text-sm font-semibold text-[var(--ink-secondary)]">{month}</h2>
          <ul className="divide-y rounded-2xl border bg-card">
            {list.map((r) => {
              const i = ICON[r.assessment as keyof typeof ICON] ?? ICON["No action needed"];
              return (
                <li key={r.id}>
                  <Link href={`/reports/${r.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-muted/40">
                    <i.Icon className={cn("size-4 shrink-0", i.cls)} aria-hidden />
                    <span className="font-medium">Week ending {formatHuman(r.weekEnding)}</span>
                    <span className="text-sm text-[var(--ink-secondary)]">{r.assessment}</span>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {r.kind === "scheduled" ? "Saturday" : "On demand"} · {r.generator === "gemini" ? "Gemini" : "automated"} · <Timestamp iso={r.createdAt} />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
