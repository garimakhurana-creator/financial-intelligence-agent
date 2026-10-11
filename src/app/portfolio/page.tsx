import { Wallet } from "lucide-react";
import { Suspense } from "react";
import { PortfolioCards } from "@/components/dashboard";
import { Card, PageHeader } from "@/components/page-header";
import { PerformanceChart, type ChartSeries } from "@/components/performance-chart";
import { FundManager, HoldingsEditor } from "@/components/portfolio-client";
import { PortfolioRace, type RaceRow } from "@/components/portfolio-race";
import { Skeleton } from "@/components/ui/skeleton";
import { VIEWS, type ViewId } from "@/lib/catalog";
import { formatHuman } from "@/lib/dates";
import { FUND_EMOJI } from "@/lib/plain";
import { allocation } from "@/lib/portfolio";
import { metricTriples } from "@/lib/report/input";
import { screenFund } from "@/lib/report/screening";
import { loadPortfolio } from "@/lib/view-data";

export const metadata = { title: "My Portfolio · Meera's Money" };

export default function PortfolioPage({ searchParams }: PageProps<"/portfolio">) {
  return (
    <>
      <PageHeader icon={Wallet} title="My Portfolio" sub="How your funds are racing against their markets and similar funds — this week, this month or this year." crumbs={[{ href: "/", label: "Dashboard" }]} />
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-3xl" />}>
        <Portfolio searchParams={searchParams} />
      </Suspense>
    </>
  );
}

const short = (n: string) =>
  n
    .replace(/\s*-\s*Direct Plan.*$/i, "")
    .replace(/\s*-\s*Growth.*$/i, "")
    .replace(/\s+US Specific Equity Passive FOF$/i, "")
    .replace(/\s+Fund$/i, "");

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

/** A collapsible section in the dashboard style. */
function Fold({ id, emoji, title, sub, children, open = false }: { id?: string; emoji: string; title: string; sub: string; children: React.ReactNode; open?: boolean }) {
  return (
    <details id={id} open={open} className="group scroll-mt-20 rounded-3xl border bg-card shadow-card">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-5 [&::-webkit-details-marker]:hidden">
        <span>
          <span className="font-semibold">
            <span aria-hidden>{emoji}</span> {title}
          </span>
          <span className="block text-sm text-muted-foreground">{sub}</span>
        </span>
        <span className="shrink-0 rounded-full border px-3 py-1 text-xs font-medium group-open:hidden">Open</span>
        <span className="hidden shrink-0 rounded-full border px-3 py-1 text-xs font-medium group-open:inline">Close</span>
      </summary>
      <div className="border-t p-5">{children}</div>
    </details>
  );
}

async function Portfolio({ searchParams }: { searchParams: PageProps<"/portfolio">["searchParams"] }) {
  const [d, sp] = await Promise.all([loadPortfolio(), searchParams]);
  const navDate = d.performance.map((p) => p.nav?.date).filter(Boolean).sort().at(-1) ?? null;
  const rows: RaceRow[] = d.performance.map((p) => {
    const t = metricTriples(p);
    const per = <K extends "fund" | "benchmark" | "peerAverage" | "vsBenchmarkPp" | "vsPeerPp">(k: K) => ({ "1W": t["1W"][k], "1M": t["1M"][k], YTD: t.YTD[k] }) as Record<"1W" | "1M" | "YTD", number | null>;
    const view = p.viewId as ViewId | null;
    const s = screenFund(view, t);
    return {
      schemeCode: p.schemeCode,
      name: short(p.schemeName),
      kind: view ?? "other",
      kindLabel: view ? VIEWS[view].title : p.amfiCategory,
      emoji: view ? FUND_EMOJI[view] : "💼",
      ret: per("fund"),
      bench: per("benchmark"),
      peer: per("peerAverage"),
      vsBench: per("vsBenchmarkPp"),
      vsPeer: per("vsPeerPp"),
      from: { "1W": t["1W"].referenceDate ? formatHuman(t["1W"].referenceDate) : null, "1M": t["1M"].referenceDate ? formatHuman(t["1M"].referenceDate) : null, YTD: t.YTD.referenceDate ? formatHuman(t.YTD.referenceDate) : null },
      benchmark: p.benchmark?.name ?? null,
      flagged: s.flag,
      flagReason: s.flag ? s.reason.charAt(0).toUpperCase() + s.reason.slice(1) : null,
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
    <div className="space-y-6">
      <PortfolioRace rows={rows} />

      <div className="space-y-4 pt-4">
        <Fold emoji="📈" title="See the growth chart" sub="Every line starts at ₹100 on the same day, so you can see which grew more — pick funds, indices and a period.">
          <PerformanceChart series={series} initial={initial} />
        </Fold>

        <Fold
          id="money"
          emoji="💰"
          title="What is my money worth? (optional)"
          sub={hasHoldings ? "Your total in rupees from the units you entered." : "Type the units you own (from your fund app) to see your total in ₹. Everything else works without it."}
          open={hasHoldings || sp.open === "money"}
        >
          {hasHoldings && (
            <div className="mb-5 space-y-4">
              <PortfolioCards portfolio={d.portfolio} admin={d.admin} fundsTracked={d.performance.length} navDate={navDate} />
              {valuedRows.length >= 1 && d.portfolio && (
                <Card>
                  <h3 className="font-semibold">Where your money sits</h3>
                  <div className="mt-4 grid gap-6 md:grid-cols-3">
                    <Bars title="By fund" items={allocation(d.portfolio.rows, "fund")} />
                    <Bars title="Shares, bonds and mixed" items={allocation(d.portfolio.rows, "assetClass")} />
                    <Bars title="India vs abroad" items={allocation(d.portfolio.rows, "geography")} />
                  </div>
                </Card>
              )}
            </div>
          )}
          {d.admin && (
            <div id="holdings">
              <HoldingsEditor
                rows={d.performance.map((p) => {
                  const h = d.holdings.find((x) => x.schemeCode === p.schemeCode);
                  return { schemeCode: p.schemeCode, name: short(p.schemeName), nav: p.nav?.value ?? null, units: h?.units ?? null, invested: h?.invested ?? null, sipAmount: h?.sipAmount ?? null, sipDay: h?.sipDay ?? null };
                })}
              />
            </div>
          )}
        </Fold>

        {d.admin && (
          <Fold id="manage" open={sp.open === "manage"} emoji="➕" title="Add or remove a fund" sub="Start typing a fund name or scheme code — matches appear as you type.">
            <FundManager tracked={d.funds.map((f) => ({ schemeCode: f.schemeCode, name: short(f.schemeName), lastNavDate: f.lastNavDate, lastRefreshedAt: f.lastRefreshedAt }))} />
          </Fold>
        )}
      </div>
    </div>
  );
}
