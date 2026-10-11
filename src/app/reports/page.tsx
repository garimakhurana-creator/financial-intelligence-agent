import Link from "next/link";
import { Suspense } from "react";
import { SectionTitle } from "@/components/blocks";
import { Timestamp } from "@/components/format";
import { Skeleton } from "@/components/ui/skeleton";
import { formatHuman } from "@/lib/dates";
import { loadArchive } from "@/lib/view-data";

export default function ReportsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Report archive</h1>
        <p className="mt-1 text-sm text-[var(--ink-secondary)]">
          Every report is stored with the exact input data it was written from, so past reports stay reproducible even after funds are removed.
        </p>
      </div>
      <Suspense fallback={<Skeleton className="h-64 w-full rounded-xl" />}>
        <Archive />
      </Suspense>
    </div>
  );
}

async function Archive() {
  const reports = await loadArchive();
  if (reports.length === 0) return <p className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">No reports yet.</p>;
  return (
    <section>
      <SectionTitle>{reports.length} report{reports.length === 1 ? "" : "s"}</SectionTitle>
      <ul className="divide-y rounded-xl border bg-card">
        {reports.map((r) => (
          <li key={r.id}>
            <Link href={`/reports/${r.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 p-4 hover:bg-muted/50">
              <span className="font-medium">Week ending {formatHuman(r.weekEnding)}</span>
              <span className="rounded-full border px-2 py-0.5 text-xs">{r.assessment}</span>
              <span className="text-xs text-muted-foreground">
                {r.kind === "scheduled" ? "Saturday scheduled" : "On demand"} · {r.generator === "gemini" ? r.model : "automated fallback"} · <Timestamp iso={r.createdAt} />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
