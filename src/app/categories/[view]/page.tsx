import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { FundTable, IndexTile, NewsList, SectionTitle, WINDOW_LABEL } from "@/components/blocks";
import { IndexedLineChart } from "@/components/charts";
import { DateText, Num, Pct, Pp } from "@/components/format";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { VIEW_IDS, type ViewId } from "@/lib/catalog";
import { excessReturn, WINDOWS } from "@/lib/calc/returns";
import type { IndexPerformance, StoredPeerStats } from "@/lib/pipeline/data";
import type { IndexSnapshot } from "@/lib/sources/nse";
import { loadCategory } from "@/lib/view-data";

export function generateStaticParams() {
  return VIEW_IDS.map((view) => ({ view }));
}

export default function CategoryPage({ params }: PageProps<"/categories/[view]">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-xl" />}>
      <Category params={params} />
    </Suspense>
  );
}

async function Category({ params }: { params: PageProps<"/categories/[view]">["params"] }) {
  const { view } = await params;
  if (!(VIEW_IDS as string[]).includes(view)) notFound();
  const d = await loadCategory(view as ViewId);
  const ix = (id: string) => d.indices.find((i) => i.id === id);
  const snap = (name: string) => d.snapshot?.data.find((s) => s.index === name);

  return (
    <div className="space-y-8">
      <div>
        <Link href="/" className="text-sm text-muted-foreground hover:underline">
          ← Dashboard
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{d.view.title}</h1>
        <p className="mt-1 max-w-3xl text-sm text-[var(--ink-secondary)]">What this view focuses on: {d.view.focus}</p>
      </div>

      <section className="rounded-xl border bg-card p-5">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          This week&apos;s read-out {d.report ? `· week ending ${d.report.weekEnding}` : ""} · interpretation by {d.report?.generator === "gemini" ? "Gemini Flash" : "automated template"}
        </div>
        {d.summary ? (
          <>
            <h2 className="mt-1 text-lg font-semibold">{d.summary.headline}</h2>
            <p className="mt-2 max-w-3xl leading-relaxed">{d.summary.summary}</p>
            {d.summary.watchItems.length > 0 && (
              <div className="mt-3">
                <div className="text-sm font-medium">Worth keeping an eye on</div>
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">
                  {d.summary.watchItems.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </div>
            )}
          </>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">No report has been generated yet for this category.</p>
        )}
      </section>

      {/* Category-specific numbers — each view shows the evidence that matters for its risks. */}
      {view === "large_cap_index" && <LargeCapPanel indices={d.indices} funds={d.performance} snapshot={snap("NIFTY 50")} />}
      {view === "mid_cap" && <RelativePanel title="Mid caps versus large caps" a={ix("NIFTY_MIDCAP150")} b={ix("NIFTY50")} snaps={[snap("NIFTY MIDCAP 150"), snap("NIFTY 50")]} />}
      {view === "small_cap" && (
        <>
          <RelativePanel title="Small caps versus large caps" a={ix("NIFTY_SMALLCAP100")} b={ix("NIFTY50")} snaps={[snap("NIFTY SMALLCAP 100"), snap("NIFTY SMALLCAP 250"), snap("NIFTY 50")]} />
          <DrawdownPanel snaps={[snap("NIFTY SMALLCAP 100"), snap("NIFTY SMALLCAP 250"), snap("NIFTY 50")]} />
        </>
      )}
      {view === "short_debt" && <DebtPanel />}
      {view === "intl_fof" && <CurrencyPanel usd={ix("NASDAQ100")} fx={ix("USDINR")} inr={ix("NASDAQ100_INR")} sp={ix("SP500")} />}

      {d.indices.length > 0 && (
        <section>
          <SectionTitle sub="Price indices; the source and last close are under each tile.">Relevant indices</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {d.indices.map((i) => (
              <IndexTile key={i.id} ix={i} />
            ))}
          </div>
        </section>
      )}

      <section>
        <SectionTitle sub="Tracked funds in this category.">Your funds here</SectionTitle>
        <FundTable funds={d.performance} />
      </section>

      {d.peers.length > 0 && <PeerPanel peers={d.peers} />}

      <section>
        <SectionTitle sub="Retrieved news tagged to this category. The publication date is shown; it may differ from when the event happened.">Developments</SectionTitle>
        <NewsList items={d.news} />
      </section>
    </div>
  );
}

function LargeCapPanel({ indices, funds, snapshot }: { indices: IndexPerformance[]; funds: Awaited<ReturnType<typeof loadCategory>>["performance"]; snapshot?: IndexSnapshot }) {
  const nifty = indices.find((i) => i.id === "NIFTY50");
  return (
    <section>
      <SectionTitle sub="An index fund should move almost exactly with its index. The gap (tracking difference) shows costs and execution; a persistent gap is the main thing to watch.">Tracking versus the Nifty 50</SectionTitle>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fund</TableHead>
              {WINDOWS.map((w) => (
                <TableHead key={w} className="text-right">
                  Gap, {WINDOW_LABEL[w]}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {funds.map((f) => (
              <TableRow key={f.schemeCode}>
                <TableCell>{f.schemeName.replace(/\s*-\s*Direct.*$/i, "")}</TableCell>
                {WINDOWS.map((w) => (
                  <TableCell key={w} className="text-right">
                    <Pp value={f.windows[w].vsBenchmarkPp} />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        The fund&apos;s NAV includes dividends while the Nifty 50 price index does not, so a small positive year-to-date gap is expected
        {snapshot?.dividendYield ? ` (index dividend yield ${snapshot.dividendYield}% a year)` : ""}. {nifty?.current ? `Nifty 50 last close ${nifty.current.value.toFixed(2)}.` : ""}
        {snapshot ? ` Breadth: ${snapshot.advances} up / ${snapshot.declines} down; P/E ${snapshot.pe}.` : ""}
      </p>
    </section>
  );
}

function RelativePanel({ title, a, b, snaps }: { title: string; a?: IndexPerformance; b?: IndexPerformance; snaps: (IndexSnapshot | undefined)[] }) {
  if (!a || !b) return null;
  return (
    <section className="grid gap-6 lg:grid-cols-2">
      <div className="rounded-xl border bg-card p-4">
        <SectionTitle sub={`${a.name} versus ${b.name}, both rebased to 100 one year ago.`}>{title}</SectionTitle>
        <IndexedLineChart
          series={[
            { key: "a", name: a.name, color: "var(--series-1)", data: a.chart },
            { key: "b", name: b.name, color: "var(--series-2)", data: b.chart },
          ]}
          height={240}
        />
      </div>
      <div className="space-y-4">
        <div className="overflow-x-auto rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Period</TableHead>
                <TableHead className="text-right">{a.name}</TableHead>
                <TableHead className="text-right">{b.name}</TableHead>
                <TableHead className="text-right">Difference</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {WINDOWS.map((w) => (
                <TableRow key={w}>
                  <TableCell>{WINDOW_LABEL[w]}</TableCell>
                  <TableCell className="text-right">
                    <Pct value={a.windows[w].returnPct} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Pct value={b.windows[w].returnPct} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Pp value={excessReturn(a.windows[w].returnPct, b.windows[w].returnPct)} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <BreadthTable snaps={snaps} />
      </div>
    </section>
  );
}

function BreadthTable({ snaps }: { snaps: (IndexSnapshot | undefined)[] }) {
  const rows = snaps.filter(Boolean) as IndexSnapshot[];
  if (rows.length === 0) return <p className="text-xs text-muted-foreground">Breadth and valuation data not available (NSE snapshot missing).</p>;
  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Index (NSE, <DateText date={rows[0].asOf} />)</TableHead>
            <TableHead className="text-right">P/E</TableHead>
            <TableHead className="text-right">Advances</TableHead>
            <TableHead className="text-right">Declines</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((s) => (
            <TableRow key={s.index}>
              <TableCell>{s.index}</TableCell>
              <TableCell className="text-right">
                <Num value={s.pe} />
              </TableCell>
              <TableCell className="text-right tabular">{s.advances ?? "n/a"}</TableCell>
              <TableCell className="text-right tabular">{s.declines ?? "n/a"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function DrawdownPanel({ snaps }: { snaps: (IndexSnapshot | undefined)[] }) {
  const rows = (snaps.filter(Boolean) as IndexSnapshot[]).filter((s) => s.yearHigh && s.yearLow);
  if (rows.length === 0) return null;
  return (
    <section>
      <SectionTitle sub="How far each index sits below its 52-week high — small caps usually fall further in corrections, which is the volatility to expect.">Distance from 52-week high</SectionTitle>
      <div className="grid gap-3 sm:grid-cols-3">
        {rows.map((s) => {
          const fromHigh = (s.last / s.yearHigh! - 1) * 100;
          const fromLow = (s.last / s.yearLow! - 1) * 100;
          return (
            <div key={s.index} className="rounded-xl border bg-card p-4 text-sm">
              <div className="text-muted-foreground">{s.index}</div>
              <div className="mt-1 text-xl font-semibold">
                <Pct value={fromHigh} />
              </div>
              <div className="text-xs text-muted-foreground">
                from 52-week high · <Pct value={fromLow} plain /> above 52-week low
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function DebtPanel() {
  return (
    <section className="rounded-xl border bg-card p-5 text-sm leading-relaxed">
      <SectionTitle>How to read debt funds</SectionTitle>
      <p>
        Short-duration debt funds hold bonds maturing in roughly one to three years. Their NAV moves mainly with interest rates: when bond yields rise
        (for example after an RBI rate hike or a high inflation print), existing bond prices fall and returns dip; when yields fall, they rise. Credit risk —
        a borrower failing to pay — is the other risk to watch.
      </p>
      <p className="mt-2 text-xs text-muted-foreground">
        Equity indices are deliberately not used here. The funds&apos; stated benchmark (e.g. CRISIL Short Duration Debt A-II Index) has no free data feed, so
        funds are compared with the average of similar short-duration funds, and rate context comes from RBI and bond-market news below.
      </p>
    </section>
  );
}

function CurrencyPanel({ usd, fx, inr, sp }: { usd?: IndexPerformance; fx?: IndexPerformance; inr?: IndexPerformance; sp?: IndexPerformance }) {
  if (!usd || !fx || !inr) return null;
  return (
    <section>
      <SectionTitle sub="An Indian investor in a US fund earns the US market's move plus the rupee's move against the dollar. Rupee-in-INR ≈ (1 + US return) × (1 + USD/INR change) − 1.">Where the rupee return comes from</SectionTitle>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Period</TableHead>
              <TableHead className="text-right">Nasdaq-100 in USD</TableHead>
              <TableHead className="text-right">USD/INR (rupee weaker = +)</TableHead>
              <TableHead className="text-right">Nasdaq-100 in INR</TableHead>
              {sp && <TableHead className="text-right">S&amp;P 500 in USD</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {WINDOWS.map((w) => (
              <TableRow key={w}>
                <TableCell>{WINDOW_LABEL[w]}</TableCell>
                <TableCell className="text-right">
                  <Pct value={usd.windows[w].returnPct} />
                </TableCell>
                <TableCell className="text-right">
                  <Pct value={fx.windows[w].returnPct} plain />
                </TableCell>
                <TableCell className="text-right">
                  <Pct value={inr.windows[w].returnPct} />
                </TableCell>
                {sp && (
                  <TableCell className="text-right">
                    <Pct value={sp.windows[w].returnPct} />
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Overseas fund NAVs and index closes are struck at different times of day, so day-to-day gaps between the fund and the INR index are noisy; compare
        over a month or longer. Concentration risk: a Nasdaq-100 fund is a single-country, technology-heavy bet.
      </p>
    </section>
  );
}

function PeerPanel({ peers }: { peers: StoredPeerStats[] }) {
  return (
    <section>
      <SectionTitle sub="Equal-weighted average of Direct-Growth schemes in the same AMFI category. n = funds with valid data for that period.">Category peer averages</SectionTitle>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Peer group (as of)</TableHead>
              {WINDOWS.map((w) => (
                <TableHead key={w} className="text-right">
                  {WINDOW_LABEL[w]}: mean / median (n)
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {peers.map((p) => (
              <TableRow key={p.peerKey}>
                <TableCell>
                  {p.label} (<DateText date={p.asOf} />)
                  <div className="text-xs text-muted-foreground">
                    {p.fetched} of {p.universeSize} schemes fetched
                  </div>
                </TableCell>
                {WINDOWS.map((w) => (
                  <TableCell key={w} className="text-right text-xs">
                    <Pct value={p.windows[w].mean} plain /> / <Pct value={p.windows[w].median} plain /> ({p.windows[w].n})
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
