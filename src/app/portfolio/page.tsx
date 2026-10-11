import { Suspense } from "react";
import { PortfolioCards } from "@/components/dashboard";
import { Card, PageHeader, SignInPrompt } from "@/components/page-header";
import { ComparisonTable, FundManager, HoldingsEditor, type CompareRow } from "@/components/portfolio-client";
import { Skeleton } from "@/components/ui/skeleton";
import { VIEWS, type ViewId } from "@/lib/catalog";
import { daysBetween } from "@/lib/dates";
import { allocation } from "@/lib/portfolio";
import { metricTriples } from "@/lib/report/input";
import { loadPortfolio } from "@/lib/view-data";

export const metadata = { title: "My Portfolio · Meera's Fund Intelligence" };

export default function PortfolioPage() {
  return (
    <>
      <PageHeader
        title="My Portfolio"
        sub="Your tracked funds side by side, what you actually hold, and where your money sits. Rupee amounts appear only for holdings you enter."
        crumbs={[{ href: "/", label: "Dashboard" }]}
      />
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-2xl" />}>
        <Portfolio />
      </Suspense>
    </>
  );
}

const short = (n: string) => n.replace(/\s*-\s*Direct Plan.*$/i, "").replace(/\s*-\s*Growth.*$/i, "");

function Bars({ title, items }: { title: string; items: { label: string; pct: number; value: number }[] }) {
  return (
    <div>
      <h3 className="text-sm font-medium">{title}</h3>
      <ul className="mt-2 space-y-2">
        {items.map((i) => (
          <li key={i.label} className="text-sm">
            <div className="flex justify-between gap-2">
              <span className="truncate">{i.label}</span>
              <span className="tabular shrink-0 text-muted-foreground">
                {i.pct.toFixed(1)}% · ₹{Math.round(i.value).toLocaleString("en-IN")}
              </span>
            </div>
            <div className="mt-1 h-2 rounded-full bg-muted">
              <div className="h-2 rounded-full bg-[var(--series-1)]" style={{ width: `${Math.max(2, i.pct)}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

async function Portfolio() {
  const d = await loadPortfolio();
  const navDate = d.performance.map((p) => p.nav?.date).filter(Boolean).sort().at(-1) ?? null;
  const rows: CompareRow[] = d.performance.map((p) => {
    const t = metricTriples(p);
    return {
      schemeCode: p.schemeCode,
      name: short(p.schemeName),
      category: p.viewId ? VIEWS[p.viewId as ViewId].title : p.amfiCategory,
      nav: p.nav?.value ?? null,
      navDate: p.nav?.date ?? null,
      stale: !p.nav || daysBetween(p.nav.date, d.asOf) > 4,
      ret: { "1W": t["1W"].fund, "1M": t["1M"].fund, YTD: t.YTD.fund },
      vsBench: { "1W": t["1W"].vsBenchmarkPp, "1M": t["1M"].vsBenchmarkPp, YTD: t.YTD.vsBenchmarkPp },
      vsPeer: { "1W": t["1W"].vsPeerPp, "1M": t["1M"].vsPeerPp, YTD: t.YTD.vsPeerPp },
      benchmark: p.benchmark?.name ?? null,
    };
  });
  const valuedRows = d.portfolio?.rows.filter((r) => r.value !== null) ?? [];

  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-3 text-lg font-semibold">Summary</h2>
        <PortfolioCards portfolio={d.portfolio} admin={d.admin} fundsTracked={d.performance.length} navDate={navDate} />
        {d.portfolio && d.portfolio.missing.length > 0 && d.portfolio.holdingsCount > 0 && (
          <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
            {d.portfolio.missing.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-1 text-lg font-semibold">Compare your funds</h2>
        <p className="mb-3 text-sm text-[var(--ink-secondary)]">Sort by any column, filter by category, and switch the comparison period.</p>
        <ComparisonTable rows={rows} />
      </section>

      <Card>
        <h2 className="text-lg font-semibold">Where your money sits</h2>
        {valuedRows.length >= 1 && d.portfolio ? (
          <div className="mt-4 grid gap-6 md:grid-cols-3">
            <Bars title="By fund" items={allocation(d.portfolio.rows, "fund")} />
            <Bars title="Equity, debt and hybrid" items={allocation(d.portfolio.rows, "assetClass")} />
            <Bars title="India vs international" items={allocation(d.portfolio.rows, "geography")} />
          </div>
        ) : (
          <p className="mt-2 text-sm text-[var(--ink-secondary)]">
            Allocation needs the number of units you hold in each fund, so it can be valued at today&apos;s NAV. Tracked funds alone are not treated as investments.
          </p>
        )}
      </Card>

      <section id="holdings" className="scroll-mt-20">
        <h2 className="mb-1 text-lg font-semibold">Your holdings and SIPs</h2>
        <p className="mb-3 text-sm text-[var(--ink-secondary)]">
          From your account statement (CAS) or fund app. Units × latest NAV gives the current value; gain/loss needs the amount you invested.
        </p>
        {d.admin ? (
          <HoldingsEditor
            rows={d.performance.map((p) => {
              const h = d.holdings.find((x) => x.schemeCode === p.schemeCode);
              return { schemeCode: p.schemeCode, name: short(p.schemeName), nav: p.nav?.value ?? null, units: h?.units ?? null, invested: h?.invested ?? null, sipAmount: h?.sipAmount ?? null, sipDay: h?.sipDay ?? null };
            })}
          />
        ) : (
          <SignInPrompt what="add or view your holdings and SIPs" />
        )}
      </section>

      <section id="manage" className="scroll-mt-20">
        <h2 className="mb-1 text-lg font-semibold">Manage tracked funds</h2>
        <p className="mb-3 text-sm text-[var(--ink-secondary)]">Search by name or enter a scheme code. Removing a fund keeps its history and past reports.</p>
        {d.admin ? (
          <FundManager tracked={d.funds.map((f) => ({ schemeCode: f.schemeCode, name: short(f.schemeName), lastNavDate: f.lastNavDate, lastRefreshedAt: f.lastRefreshedAt }))} />
        ) : (
          <SignInPrompt what="add or remove tracked funds" />
        )}
      </section>
    </div>
  );
}
