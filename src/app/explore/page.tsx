import { Compass } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { Card, Explain, PageHeader } from "@/components/page-header";
import { ExploreWorkspace, PreferencesForm } from "@/components/explore-client";
import { Skeleton } from "@/components/ui/skeleton";
import { DISCOVERY_GROUPS } from "@/lib/catalog";
import { shortlist } from "@/lib/explore";
import { loadExplore } from "@/lib/view-data";

export const metadata = { title: "Explore Funds · Meera's Money" };

export default function ExplorePage() {
  return (
    <>
      <PageHeader
        icon={Compass}
        title="Explore Funds"
        sub="Research funds you might add as a future SIP. This compares track records within each category — it does not predict or guarantee future returns."
        crumbs={[{ href: "/", label: "Dashboard" }]}
        action={
          <Link href="/methodology#ranking" className="text-sm font-medium underline underline-offset-4">
            How the ranking works
          </Link>
        }
      />
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-2xl" />}>
        <Explore />
      </Suspense>
    </>
  );
}

async function Explore() {
  const d = await loadExplore();
  if (d.rows.length === 0) {
    return (
      <Card>
        <p className="font-medium">Fund research data is not available yet.</p>
        <p className="mt-1 text-sm text-[var(--ink-secondary)]">It is computed each night from AMFI and MFapi data. If this persists, check Settings → run history.</p>
      </Card>
    );
  }
  const s = shortlist(d.rows, d.prefs);
  const groups = d.groups
    .map((g) => ({ key: g.groupKey, label: g.data.label }))
    .sort((a, b) => DISCOVERY_GROUPS.findIndex((x) => x.key === a.key) - DISCOVERY_GROUPS.findIndex((x) => x.key === b.key));

  return (
    <div className="space-y-8">
      {d.admin && (
      <Card>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">Your SIP preferences</h2>
          <span className="text-xs text-muted-foreground">Optional · shapes the shortlist below</span>
        </div>
        <div className="mt-3">
          {(
            <PreferencesForm
              initial={d.prefs ?? { goal: null, horizonYears: null, monthlyBudget: null, riskComfort: null, preferredGroups: [] }}
              groups={groups}
            />
          )}
        </div>
        {s.notes.length > 0 && (
          <ul className="mt-3 space-y-0.5 text-xs text-[var(--ink-secondary)]">
            {s.notes.map((n) => (
              <li key={n}>• {n}</li>
            ))}
          </ul>
        )}
      </Card>

      )}

      {d.admin && d.watch.length > 0 && (
        <Card>
          <h2 className="text-lg font-semibold">Your research watchlist</h2>
          <p className="text-sm text-[var(--ink-secondary)]">Saved for later research — these are not investments.</p>
          <ul className="mt-3 divide-y">
            {d.watch.map((w) => (
              <li key={w.schemeCode} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span>{w.schemeName}</span>
                <span className="flex gap-3 text-xs">
                  <Link href={`/analyse?code=${w.schemeCode}`} className="font-medium hover:underline">
                    Analyse
                  </Link>
                  <span className="text-muted-foreground">added {new Date(w.addedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <ExploreWorkspace rows={d.rows} shortlist={s.rows} watched={d.watch.map((w) => w.schemeCode)} admin={d.admin} groups={groups} />

      <Explain label="What do these numbers mean?">
        <ul className="space-y-1">
          <li>
            <b>3 yrs / yr, 5 yrs / yr</b>: average yearly return over 3 or 5 years (compound annual growth).
          </li>
          <li>
            <b>Category median</b>: the middle fund among all similar Direct-Growth funds. &ldquo;+1.20 pts&rdquo; means 1.20 percentage points a year better.
          </li>
          <li>
            <b>Reference index</b>: a market index used as a yardstick for the whole category (price index, without dividends) — not each fund&apos;s official benchmark.
          </li>
          <li>
            <b>Worst fall</b>: the biggest drop from a high point to a low point in 3 years.
          </li>
          <li>
            <b>Typical risk</b>: our plain summary of how much funds in this category usually swing — not the fund&apos;s official SEBI riskometer, which is in its factsheet.
          </li>
        </ul>
        <p className="mt-2">Data computed {d.computedAt ? new Date(d.computedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }) : "—"} from AMFI and MFapi.</p>
      </Explain>
    </div>
  );
}
