import { FileSearch } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { AnalyseForm } from "@/components/analyse-form";
import { Card, PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { isAdmin } from "@/lib/auth";
import * as research from "@/lib/db/research";

export const metadata = { title: "Analyse a Fund · Meera's Money" };

export default function AnalysePage({ searchParams }: PageProps<"/analyse">) {
  return (
    <>
      <PageHeader
        icon={FileSearch}
        title="Analyse a Fund"
        sub="Thinking about a fund? Get an evidence-based research report: returns against similar funds, consistency, risk, costs, strengths, concerns and alternatives."
        crumbs={[{ href: "/", label: "Dashboard" }]}
      />
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-2xl" />}>
        <Analyse searchParams={searchParams} />
      </Suspense>
    </>
  );
}

const OUTCOME_TINT: Record<string, string> = {
  "Worth researching further": "bg-[var(--tint-good)]",
  "Suitable for further comparison": "bg-muted",
  "Several concerns to investigate": "bg-[var(--tint-warning)]",
  "Insufficient data for a reliable assessment": "bg-[var(--tint-warning)]",
};

async function Analyse({ searchParams }: { searchParams: PageProps<"/analyse">["searchParams"] }) {
  await connection();
  const sp = await searchParams;
  const code = typeof sp.code === "string" && /^\d{3,7}$/.test(sp.code) ? sp.code : null;
  const admin = await isAdmin();
  const history = admin ? await research.listAnalyses(30).catch(() => []) : [];
  return (
    <div className="space-y-8">
      <Card>
        <AnalyseForm initialCode={code} />
      </Card>
      {admin ? (
      <section>
        <h2 className="mb-3 text-lg font-semibold">Your saved analyses</h2>
        {history.length === 0 ? (
          <p className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">No analyses yet. Run one above; it is saved here automatically.</p>
        ) : (
          <ul className="divide-y rounded-2xl border bg-card">
            {history.map((a) => (
              <li key={a.id}>
                <Link href={`/analyse/${a.id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-muted/40">
                  <span className="font-medium">{a.schemeName.replace(/\s*-\s*Direct Plan.*$/i, "")}</span>
                  <span className="flex items-center gap-2 text-xs">
                    {a.outcome && <span className={`rounded-full px-2 py-0.5 ${OUTCOME_TINT[a.outcome] ?? "bg-muted"}`}>{a.outcome}</span>}
                    <span className="text-muted-foreground">
                      {a.sourceType === "pdf" ? "factsheet" : a.sourceType} · {new Date(a.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      ) : (
        <p className="text-sm text-[var(--ink-secondary)]">
          Each analysis gets its own private link that you can bookmark or share. Up to 5 analyses an hour.
        </p>
      )}
    </div>
  );
}
