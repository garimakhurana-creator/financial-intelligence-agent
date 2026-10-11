import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AssessmentBanner, NewsList, SectionTitle, WINDOW_LABEL } from "@/components/blocks";
import { DateText, Pct, Pp, shortFundName, Timestamp } from "@/components/format";
import { SendControls } from "@/components/send-controls";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { isAdmin } from "@/lib/auth";
import { VIEWS } from "@/lib/catalog";
import { WINDOWS } from "@/lib/calc/returns";
import { loadReport } from "@/lib/view-data";

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  sent_to_provider: "Accepted by provider (delivery not yet confirmed)",
  delivered: "Delivered (confirmed by provider)",
  read: "Read (confirmed by provider)",
  failed: "Failed",
  awaiting_configuration: "Awaiting configuration",
};

export default function ReportPage({ params }: PageProps<"/reports/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-xl" />}>
      <Report params={params} />
    </Suspense>
  );
}

async function Report({ params }: { params: PageProps<"/reports/[id]">["params"] }) {
  const { id } = await params;
  if (!/^[a-zA-Z0-9._-]{1,36}$/.test(id)) notFound();
  const data = await loadReport(id);
  if (!data) notFound();
  const { report, deliveries } = data;
  const p = report.report;
  const admin = await isAdmin();
  const evidence = new Map(p.news.map((n) => [n.evidenceId, n]));
  const cite = (ids: string[]) =>
    ids.length > 0 && (
      <span className="ml-1 inline-flex flex-wrap gap-1 align-middle">
        {ids.map((eid) => {
          const n = evidence.get(eid);
          return n ? (
            <a key={eid} href={n.url} target="_blank" rel="noopener noreferrer nofollow" title={`${n.title} — ${n.publisher}`} className="rounded bg-muted px-1 text-[10px] font-semibold text-muted-foreground hover:text-foreground">
              {eid}
            </a>
          ) : null;
        })}
      </span>
    );

  return (
    <div className="space-y-8">
      <div>
        <Link href="/reports" className="text-sm text-muted-foreground hover:underline">
          ← All reports
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Weekly report · week ending <DateText date={report.weekEnding} /></h1>
        <p className="mt-1 text-xs text-muted-foreground">
          {report.kind === "scheduled" ? "Saturday scheduled run" : "Generated on demand"} · generated <Timestamp iso={report.createdAt} /> ·{" "}
          {report.generator === "gemini" ? `written by ${report.model} (attempt ${p.meta.attempts}), validated against the input data` : "Gemini was unavailable — automated template from verified figures"}
        </p>
      </div>

      <AssessmentBanner label={report.assessment} reason={report.assessmentReason} weekEnding={report.weekEnding} />

      <section>
        <SectionTitle sub="Three sentences per fund: performance, comparison, and what may explain it. Figures in the tables are the verified numbers.">Your funds</SectionTitle>
        <div className="space-y-4">
          {p.output.funds.map((f) => {
            const perf = p.funds.find((x) => x.schemeCode === f.schemeCode);
            return (
              <article key={f.schemeCode} className="rounded-xl border bg-card p-5">
                <h3 className="font-semibold">
                  <Link href={`/funds/${f.schemeCode}`} className="hover:underline">
                    {shortFundName(perf?.schemeName ?? String(f.schemeCode))}
                  </Link>
                </h3>
                <p className="text-xs text-muted-foreground">
                  NAV ₹{perf?.nav?.value.toFixed(4) ?? "n/a"} on <DateText date={perf?.nav?.date} /> · benchmark {perf?.benchmark?.name ?? perf?.statedBenchmarkOnly ?? "none"} · peers{" "}
                  {perf?.peer?.label ?? "none"}
                </p>
                <ol className="mt-3 space-y-1.5 leading-relaxed">
                  <li>{f.performance}</li>
                  <li>{f.comparison}</li>
                  <li>
                    {f.marketContext}
                    {cite(f.evidenceIds)}
                  </li>
                </ol>
                {perf && (
                  <div className="mt-3 overflow-x-auto">
                    <Table className="text-xs">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Period (from)</TableHead>
                          <TableHead className="text-right">Fund</TableHead>
                          <TableHead className="text-right">Benchmark</TableHead>
                          <TableHead className="text-right">Peer avg (n)</TableHead>
                          <TableHead className="text-right">vs bench</TableHead>
                          <TableHead className="text-right">vs peers</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {WINDOWS.map((w) => {
                          const c = perf.windows[w];
                          return (
                            <TableRow key={w}>
                              <TableCell>
                                {WINDOW_LABEL[w]} ({c.fund.referenceDate ? <DateText date={c.fund.referenceDate} /> : "n/a"})
                              </TableCell>
                              <TableCell className="text-right">
                                <Pct value={c.fund.returnPct} />
                              </TableCell>
                              <TableCell className="text-right">
                                <Pct value={c.benchmark?.returnPct} plain />
                              </TableCell>
                              <TableCell className="text-right">
                                <Pct value={c.peer?.mean} plain /> ({c.peer?.n ?? 0})
                              </TableCell>
                              <TableCell className="text-right">
                                <Pp value={c.vsBenchmarkPp} />
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
                )}
              </article>
            );
          })}
        </div>
      </section>

      <section>
        <SectionTitle>The market this week</SectionTitle>
        <p className="max-w-3xl leading-relaxed">
          {p.output.marketSummary.text}
          {cite(p.output.marketSummary.evidenceIds)}
        </p>
      </section>

      <section>
        <SectionTitle sub="One summary per category view.">Category intelligence</SectionTitle>
        <div className="grid gap-4 md:grid-cols-2">
          {p.output.categories.map((c) => (
            <div key={c.viewId} className="rounded-xl border bg-card p-4">
              <Link href={`/categories/${c.viewId}`} className="text-xs font-medium uppercase tracking-wide text-muted-foreground hover:underline">
                {VIEWS[c.viewId].title}
              </Link>
              <h3 className="mt-1 font-semibold">{c.headline}</h3>
              <p className="mt-1 text-sm leading-relaxed">
                {c.summary}
                {cite(c.evidenceIds)}
              </p>
              {c.watchItems.length > 0 && (
                <ul className="mt-2 list-disc pl-5 text-sm text-[var(--ink-secondary)]">
                  {c.watchItems.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </section>

      <section>
        <SectionTitle sub="Evidence ids (N1, N2…) above link to these articles.">Sources</SectionTitle>
        <NewsList items={p.news} showViews />
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border bg-card p-4 text-sm">
          <h3 className="font-semibold">Data freshness and limitations</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-[var(--ink-secondary)]">
            <li>
              Data as of <DateText date={p.meta.dataAsOf} />; latest NAV dates:{" "}
              {[...new Set(p.funds.map((f) => f.nav?.date).filter(Boolean))].join(", ") || "n/a"}.
            </li>
            {p.breadth && (
              <li>
                Market breadth/valuation from NSE as of <DateText date={p.breadth.date} />.
              </li>
            )}
            <li>Benchmarks are price indices; funds&apos; stated benchmarks are total-return indices (which include dividends).</li>
            <li>Peer averages are equal-weighted over available Direct-Growth schemes, not official category figures.</li>
            {p.funds.flatMap((f) => f.flags).map((f) => (
              <li key={f}>{f}</li>
            ))}
            {p.meta.newsErrors.length > 0 && <li>Some news queries failed ({p.meta.newsErrors.length}); coverage may be incomplete.</li>}
          </ul>
        </div>
        <div className="rounded-xl border bg-card p-4 text-sm">
          <h3 className="font-semibold">Delivery status</h3>
          {deliveries.length === 0 ? (
            <p className="mt-2 text-muted-foreground">{report.kind === "scheduled" ? "No delivery attempts recorded." : "On-demand reports are not sent automatically."}</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {deliveries.map((d) => (
                <li key={d.id} className="rounded-md border p-2">
                  <div className="font-medium capitalize">
                    {d.channel} {d.isTest && <span className="ml-1 rounded bg-[var(--tint-warning)] px-1 text-[10px] uppercase">test</span>}
                  </div>
                  <div className="text-xs">{STATUS_LABEL[d.status] ?? d.status}</div>
                  <div className="text-xs text-muted-foreground">
                    to {d.recipientMasked ?? "—"} · <Timestamp iso={d.updatedAt ?? d.createdAt} /> · attempts {d.attempts}
                  </div>
                  {d.error && <div className="mt-1 text-xs text-[var(--down)]">{d.error}</div>}
                </li>
              ))}
            </ul>
          )}
          {admin && <SendControls reportId={report.id} />}
        </div>
      </section>

      <p className="text-xs text-muted-foreground">Past performance does not guarantee future returns. This report supports monitoring and is not investment advice.</p>
    </div>
  );
}
