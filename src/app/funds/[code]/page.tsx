import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { NewsList, SectionTitle, WINDOW_LABEL } from "@/components/blocks";
import { WindowBars } from "@/components/charts";
import { PerformanceChart } from "@/components/performance-chart";
import { Explain } from "@/components/page-header";
import { metricTriples } from "@/lib/report/input";
import { screenFund } from "@/lib/report/screening";
import { DateText, Freshness, Inr, Pct, Pp, shortFundName, Timestamp } from "@/components/format";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { VIEWS, type ViewId } from "@/lib/catalog";
import { MAX_REFERENCE_GAP_DAYS, WINDOWS } from "@/lib/calc/returns";
import { MIN_PEERS_FOR_AVERAGE, MIN_PEERS_FOR_RELIABLE } from "@/lib/calc/peers";
import { loadFund } from "@/lib/view-data";

const REASON_TEXT: Record<string, string> = {
  no_current_observation: "no NAV stored yet",
  current_too_stale: "latest NAV is too old",
  no_reference_near_target: `no NAV within ${MAX_REFERENCE_GAP_DAYS} days before the start date`,
  invalid_reference_value: "reference NAV invalid",
  insufficient_history: "history does not go back far enough",
};

export default function FundPage({ params }: PageProps<"/funds/[code]">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-xl" />}>
      <FundDetail params={params} />
    </Suspense>
  );
}

async function FundDetail({ params }: { params: PageProps<"/funds/[code]">["params"] }) {
  const { code } = await params;
  const n = Number(code);
  if (!Number.isSafeInteger(n)) notFound();
  const d = await loadFund(n);
  if (!d) notFound();
  const { fund, perf } = d;

  return (
    <div className="space-y-8">
      <div>
        <nav aria-label="Breadcrumb" className="mb-2 flex gap-1 text-xs text-muted-foreground">
          <Link href="/" className="hover:underline">
            Dashboard
          </Link>
          <span aria-hidden>›</span>
          <Link href="/portfolio" className="hover:underline">
            My Portfolio
          </Link>
        </nav>
        <h1 className="text-2xl font-semibold tracking-tight">{shortFundName(perf.schemeName)}</h1>
        <p className="mt-1 text-sm text-[var(--ink-secondary)]">
          {perf.fundHouse} · {perf.amfiCategory} · scheme code {perf.schemeCode}
          {perf.viewId && (
            <>
              {" · "}
              <Link href={`/categories/${perf.viewId}`} className="underline">
                {VIEWS[perf.viewId as ViewId].title}
              </Link>
            </>
          )}
          {!fund.active && <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs">No longer tracked</span>}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <div className="text-3xl font-semibold">
            <Inr value={perf.nav?.value} />
          </div>
          <Freshness date={perf.nav?.date} today={d.asOf} label="NAV" />
        </div>
        {(() => {
          const m = perf.windows["1M"];
          if (m.fund.returnPct === null) return null;
          const parts = [`Over the past month this fund returned ${m.fund.returnPct.toFixed(2)}%`];
          if (m.benchmark?.returnPct != null) parts.push(`compared with ${m.benchmark.returnPct.toFixed(2)}% for ${perf.benchmark?.name}`);
          if (m.peer?.mean != null) parts.push(`and ${m.peer.mean.toFixed(2)}% for the average of ${m.peer.n} similar funds`);
          return <p className="mt-3 max-w-3xl text-[var(--ink-secondary)]">{parts.join(", ")}.</p>;
        })()}
        {perf.flags.length > 0 && (
          <ul className="mt-3 space-y-1 text-sm">
            {perf.flags.map((f) => (
              <li key={f} className="rounded-md bg-[var(--tint-warning)] px-3 py-1.5">
                {f}
              </li>
            ))}
          </ul>
        )}
      </div>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border bg-card p-4">
          <SectionTitle sub="Growth of ₹100 — fund NAV versus its benchmark (price index). The benchmark is stored for about a year; untick it to see the fund's full history.">NAV and return history</SectionTitle>
          <PerformanceChart
            height={260}
            series={[
              { key: "fund", name: "Fund NAV", kind: "fund", data: d.fullSeries },
              ...(perf.benchmark ? [{ key: "bench", name: perf.benchmark.name, kind: "index" as const, data: d.benchSeries }] : []),
            ]}
            initial={perf.benchmark ? ["fund", "bench"] : ["fund"]}
          />
        </div>
        <div className="rounded-xl border bg-card p-4">
          <SectionTitle sub="Same dates for all three. Peer average is equal-weighted across similar Direct-Growth funds.">Returns by period</SectionTitle>
          <WindowBars
            benchmarkName={perf.benchmark?.name ?? null}
            rows={WINDOWS.map((w) => ({
              window: WINDOW_LABEL[w],
              fund: perf.windows[w].fund.returnPct === null ? null : Math.round(perf.windows[w].fund.returnPct! * 100) / 100,
              benchmark: perf.windows[w].benchmark?.returnPct == null ? null : Math.round(perf.windows[w].benchmark!.returnPct! * 100) / 100,
              peer: perf.windows[w].peer?.mean == null ? null : Math.round(perf.windows[w].peer!.mean! * 100) / 100,
            }))}
          />
        </div>
      </section>

      <section>
        <SectionTitle sub="Return = (current NAV ÷ reference NAV − 1) × 100. The reference is the last NAV on or before the start date.">Exact figures and dates used</SectionTitle>
        <div className="overflow-x-auto rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Period</TableHead>
                <TableHead>Start date → NAV used</TableHead>
                <TableHead className="text-right">Fund</TableHead>
                <TableHead className="text-right">Benchmark</TableHead>
                <TableHead className="text-right">vs benchmark</TableHead>
                <TableHead className="text-right">Peer avg (n)</TableHead>
                <TableHead className="text-right">vs peers</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {WINDOWS.map((w) => {
                const c = perf.windows[w];
                return (
                  <TableRow key={w}>
                    <TableCell className="font-medium">{WINDOW_LABEL[w]}</TableCell>
                    <TableCell className="text-xs">
                      <DateText date={c.fund.targetDate} /> →{" "}
                      {c.fund.referenceDate ? (
                        <>
                          <DateText date={c.fund.referenceDate} /> (₹{c.fund.referenceValue?.toFixed(4)})
                        </>
                      ) : (
                        <span className="text-[var(--down)]">{REASON_TEXT[c.fund.unavailableReason ?? ""] ?? "unavailable"}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Pct value={c.fund.returnPct} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Pct value={c.benchmark?.returnPct} plain />
                    </TableCell>
                    <TableCell className="text-right">
                      <Pp value={c.vsBenchmarkPp} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Pct value={c.peer?.mean} plain /> <span className="text-xs text-muted-foreground">({c.peer?.n ?? 0})</span>
                      {c.peer && c.peer.quality !== "ok" && <div className="text-[11px] text-[var(--down)]">{c.peer.quality === "limited_sample" ? "limited sample" : "too few peers"}</div>}
                    </TableCell>
                    <TableCell className="text-right">
                      <Pp value={c.vsPeerPp} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-2 rounded-xl border bg-card p-4 text-sm leading-relaxed">
          <h3 className="font-semibold">Benchmark</h3>
          <p>
            <span className="text-muted-foreground">Stated benchmark:</span> {fund.statedBenchmark ?? "not recorded"}
          </p>
          <p>
            <span className="text-muted-foreground">Compared against:</span> {perf.benchmark ? `${perf.benchmark.name} — ${perf.benchmark.source}` : "no free data feed; peers only"}
          </p>
          {fund.benchmarkSource && <p className="text-xs text-muted-foreground">Mapping source: {fund.benchmarkSource}</p>}
          {perf.benchmark && <p className="text-xs text-muted-foreground">{perf.benchmark.note}</p>}
        </div>
        <div className="space-y-2 rounded-xl border bg-card p-4 text-sm leading-relaxed">
          <h3 className="font-semibold">Peer group</h3>
          {d.peer ? (
            <>
              <p>
                {d.peer.label}: {d.peer.fetched} of {d.peer.universeSize} Direct-Growth schemes in AMFI categories {d.peer.amfiCategories.map((c) => `“${c}”`).join(" + ")}, as of <DateText date={d.peer.asOf} />.
              </p>
              <p className="text-xs text-muted-foreground">
                Equal-weighted mean; a peer is excluded from a period if it lacks a NAV near either date. Fewer than {MIN_PEERS_FOR_AVERAGE} valid peers → no average; fewer than{" "}
                {MIN_PEERS_FOR_RELIABLE} → marked “limited sample”. This is the average of available comparable funds, not an official industry figure.
              </p>
              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground">Show all {d.peer.constituents.length} peers and their 1-week returns</summary>
                <ul className="mt-2 max-h-64 space-y-0.5 overflow-auto">
                  {[...d.peer.constituents]
                    .sort((a, b) => (b.returns["1W"] ?? -999) - (a.returns["1W"] ?? -999))
                    .map((c) => (
                      <li key={c.schemeCode} className={c.schemeCode === fund.schemeCode ? "font-semibold" : ""}>
                        <Pct value={c.returns["1W"]} plain /> · {c.schemeName}
                      </li>
                    ))}
                </ul>
              </details>
            </>
          ) : (
            <p className="text-muted-foreground">No peer average has been computed for this fund&apos;s latest NAV date yet.</p>
          )}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border bg-card p-4">
          <SectionTitle sub="From the fund's full NAV history (MFapi). 3Y and 5Y are average yearly returns.">Long-term record and risk</SectionTitle>
          {d.longTerm ? (
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
              {(["1Y", "3Y", "5Y"] as const).map((h) => (
                <div key={h}>
                  <dt className="text-xs text-muted-foreground">{h === "1Y" ? "1 year" : h === "3Y" ? "3 years, a year" : "5 years, a year"}</dt>
                  <dd>
                    <Pct value={h === "1Y" ? d.longTerm!.returns[h].total : d.longTerm!.returns[h].annualised} />
                  </dd>
                </div>
              ))}
              <div>
                <dt className="text-xs text-muted-foreground">Volatility (3 yrs, a year)</dt>
                <dd className="tabular">{d.longTerm.volatility3Y === null ? "n/a" : `${d.longTerm.volatility3Y.toFixed(2)}%`}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-xs text-muted-foreground">Worst fall (3 yrs)</dt>
                <dd className="tabular">
                  {d.longTerm.maxDrawdown3Y ? `${d.longTerm.maxDrawdown3Y.pct.toFixed(2)}% (${d.longTerm.maxDrawdown3Y.peak} → ${d.longTerm.maxDrawdown3Y.trough})` : "n/a"}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">Full history could not be fetched right now.</p>
          )}
          <div className="mt-3">
            <Explain label="What do volatility and worst fall mean?">
              Volatility measures how much the fund&apos;s value swings week to week, scaled to a year — higher means a bumpier ride. The worst fall is the biggest drop from a
              high point to a later low point; it shows what holding through a bad patch felt like. Neither predicts the future.
            </Explain>
          </div>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <SectionTitle sub="Recent articles tagged to this fund's category (last 30 days).">Relevant news</SectionTitle>
          {d.relevantNews.length ? (
            <NewsList items={d.relevantNews} />
          ) : (
            <p className="text-sm text-muted-foreground">No recent articles for this category.</p>
          )}
          <Link href="/market" className="mt-2 inline-block text-sm font-medium underline">
            All market news
          </Link>
        </div>
      </section>

      {d.history.length > 1 && (
        <section>
          <SectionTitle sub="Stored each time a report is generated, so trends can be followed week by week.">Weekly snapshot history</SectionTitle>
          <div className="overflow-x-auto rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>NAV date</TableHead>
                  <TableHead className="text-right">1W</TableHead>
                  <TableHead className="text-right">vs benchmark</TableHead>
                  <TableHead className="text-right">vs peers</TableHead>
                  <TableHead className="text-right">YTD</TableHead>
                  <TableHead>Weekly check</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...d.history].reverse().map((h) => (
                  <TableRow key={h.asOf}>
                    <TableCell>
                      <DateText date={h.asOf} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Pct value={h.data.windows["1W"].fund.returnPct} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Pp value={h.data.windows["1W"].vsBenchmarkPp} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Pp value={h.data.windows["1W"].vsPeerPp} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Pct value={h.data.windows["YTD"].fund.returnPct} />
                    </TableCell>
                    <TableCell className="text-xs">
                      {(() => {
                        const s = screenFund(h.data.viewId, metricTriples(h.data));
                        return s.flag ? <span className="rounded-full bg-[var(--tint-warning)] px-2 py-0.5">Worth monitoring</span> : <span className="text-muted-foreground">On track</span>;
                      })()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      )}

      <p className="text-xs text-muted-foreground">
        NAV source: {perf.nav?.source ?? "—"} · last retrieved <Timestamp iso={perf.nav?.retrievedAt} /> · calculation {perf.calcVersion}.{" "}
        <Link href="/methodology" className="underline">
          How these numbers are calculated
        </Link>
      </p>
    </div>
  );
}
