import { Wallet } from "lucide-react";
import { Suspense } from "react";
import { PortfolioCards } from "@/components/dashboard";
import { Card, PageHeader } from "@/components/page-header";
import { PerformanceChart, type ChartSeries } from "@/components/performance-chart";
import { ComparisonTable, FundManager, HoldingsEditor, type CompareRow } from "@/components/portfolio-client";
import { Skeleton } from "@/components/ui/skeleton";
import { VIEWS, type ViewId } from "@/lib/catalog";
import { daysBetween, formatHuman } from "@/lib/dates";
import { FUND_EMOJI } from "@/lib/plain";
import { allocation } from "@/lib/portfolio";
import { metricTriples } from "@/lib/report/input";
import { loadPortfolio } from "@/lib/view-data";

export const metadata = { title: "My Portfolio · Meera's Money" };

export default function PortfolioPage() {
  return (
    <>
      <PageHeader icon={Wallet} title="My Portfolio" sub="Each fund next to its market and similar funds — pick a week, a month or the whole year." crumbs={[{ href: "/", label: "Dashboard" }]} />
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
    const per = <K extends keyof (typeof t)["1W"]>(k: K) => ({ "1W": t["1W"][k], "1M": t["1M"][k], YTD: t.YTD[k] });
    const view = p.viewId as ViewId | null;
    return {
      schemeCode: p.schemeCode,
      name: short(p.schemeName),
      kind: view ?? "other",
      kindLabel: view ? VIEWS[view].title : p.amfiCategory,
      emoji: view ? FUND_EMOJI[view] : "💼",
      nav: p.nav?.value ?? null,
      navDate: p.nav ? formatHuman(p.nav.date) : null,
      stale: !p.nav || daysBetween(p.nav.date, d.asOf) > 4,
      ret: per("fund") as CompareRow["ret"],
      bench: per("benchmark") as CompareRow["bench"],
      peer: per("peerAverage") as CompareRow["peer"],
      vsBench: per("vsBenchmarkPp") as CompareRow["vsBench"],
      vsPeer: per("vsPeerPp") as CompareRow["vsPeer"],
      from: { "1W": t["1W"].referenceDate ? formatHuman(t["1W"].referenceDate) : null, "1M": t["1M"].referenceDate ? formatHuman(t["1M"].referenceDate) : null, YTD: t.YTD.referenceDate ? formatHuman(t.YTD.referenceDate) : null },
      benchmark: p.benchmark?.name ?? null,
    };
  });
  const series: ChartSeries[] = [
    ...d.performance.map((p) => ({ key: `f${p.schemeCode}`, name: short(p.schemeName), kind: "fund" as const, data: p.chart })),
    ...d.indices.map((ix) => ({ key: ix.id, name: ix.name, kind: "index" as const, data: ix.chart })),
  ];
  const first = d.performance[0];
  const initial = first ? [`f${first.schemeCode}`, first.benchmark?.id ?? "NIFTY50"] : ["NIFTY50"];
  const valuedRows = d.portfolio?.rows.filter((r) => r.value !== null) ?? [];
  const hasHoldings = (d.portfolio?.holdingsCount ?? 0) > 0;

  return (
    <div className="space-y-10">
      <section>
        <ComparisonTable rows={rows} />
      </section>

      <Card>
        <h2 className="text-lg font-semibold">How they have moved</h2>
        <p className="mb-4 text-sm text-[var(--ink-secondary)]">Pick funds or indices and a period; every line starts at ₹100 on the same day, so you can see which grew more.</p>
        <PerformanceChart series={series} initial={initial} />
      </Card>

      <section id="money" className="scroll-mt-20">
        <h2 className="mb-1 text-lg font-semibold">
          <span aria-hidden>💰</span> What is my money worth? <span className="text-sm font-normal text-muted-foreground">(optional)</span>
        </h2>
        {hasHoldings ? (
          <>
            <PortfolioCards portfolio={d.portfolio} admin={d.admin} fundsTracked={d.performance.length} navDate={navDate} />
            {valuedRows.length >= 1 && d.portfolio && (
              <Card className="mt-4">
                <h3 className="font-semibold">Where your money sits</h3>
                <div className="mt-4 grid gap-6 md:grid-cols-3">
                  <Bars title="By fund" items={allocation(d.portfolio.rows, "fund")} />
                  <Bars title="Shares, bonds and mixed" items={allocation(d.portfolio.rows, "assetClass")} />
                  <Bars title="India vs abroad" items={allocation(d.portfolio.rows, "geography")} />
                </div>
              </Card>
            )}
          </>
        ) : (
          <p className="max-w-2xl text-sm text-[var(--ink-secondary)]">
            Everything above works without this. If you also want to see your total in rupees, open your fund app, note how many <strong>units</strong> you own in each fund,
            and type them below — we multiply by today&apos;s price. We never guess these amounts.
          </p>
        )}
        {d.admin && (
          <div id="holdings" className="mt-4 scroll-mt-20">
            <HoldingsEditor
              rows={d.performance.map((p) => {
                const h = d.holdings.find((x) => x.schemeCode === p.schemeCode);
                return { schemeCode: p.schemeCode, name: short(p.schemeName), nav: p.nav?.value ?? null, units: h?.units ?? null, invested: h?.invested ?? null, sipAmount: h?.sipAmount ?? null, sipDay: h?.sipDay ?? null };
              })}
            />
          </div>
        )}
      </section>

      {d.admin && (
        <section id="manage" className="scroll-mt-20">
          <h2 className="mb-1 text-lg font-semibold">Add or remove a fund</h2>
          <p className="mb-3 text-sm text-[var(--ink-secondary)]">Search by name or enter a scheme code. Removing a fund keeps its history and past reports.</p>
          <FundManager tracked={d.funds.map((f) => ({ schemeCode: f.schemeCode, name: short(f.schemeName), lastNavDate: f.lastNavDate, lastRefreshedAt: f.lastRefreshedAt }))} />
        </section>
      )}
    </div>
  );
}
