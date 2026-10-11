import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { NewsList, SectionTitle, WINDOW_LABEL } from "@/components/blocks";
import { WeatherHero } from "@/components/home";
import { KindTabs } from "@/components/kind-tabs";
import {
  DateText,
  Pct,
  Pp,
  shortFundName,
  Timestamp,
} from "@/components/format";
import { PrintButton } from "@/components/print-button";
import { SendControls } from "@/components/send-controls";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { isAdmin } from "@/lib/auth";
import { reportUrl } from "@/lib/delivery/deliver";
import { whatsappShareLink, whatsappShareText } from "@/lib/delivery/share";
import { VIEWS, type ViewId } from "@/lib/catalog";
import {
  describeMove,
  FUND_EMOJI,
  FUND_GRADIENT,
  INDEX_WORDS,
} from "@/lib/plain";
import { cn } from "@/lib/utils";
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

const pctText = (n: number | null | undefined) => {
  if (n === null || n === undefined) return "—";
  const r = Math.round(n * 100) / 100;
  return `${r > 0 ? "+" : ""}${(r === 0 ? 0 : r).toFixed(2)}%`;
};
const toneCls = (n: number | null | undefined) =>
  n == null
    ? "text-muted-foreground"
    : n > 0.004
      ? "text-[var(--up)]"
      : n < -0.004
        ? "text-[var(--down)]"
        : "";

function GlanceTile({
  emoji,
  label,
  value,
  sub,
}: {
  emoji: string;
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
}) {
  return (
    <div className="rounded-3xl border bg-card p-4 shadow-card">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <span aria-hidden className="text-lg">
          {emoji}
        </span>
        {label}
      </div>
      <div className="font-display mt-2 text-xl font-bold leading-tight">
        {value}
      </div>
      {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

/** One horizontal bar per series around a shared zero line, so "who grew more" is visible at a glance. */
function WeekBars({
  items,
}: {
  items: { label: string; value: number | null; color: string }[];
}) {
  const max = Math.max(0.5, ...items.map((i) => Math.abs(i.value ?? 0)));
  return (
    <div className="space-y-1.5">
      {items.map((i) => {
        const w = i.value === null ? 0 : (Math.abs(i.value) / max) * 50;
        return (
          <div key={i.label} className="flex items-center gap-2 text-[11px]">
            <span className="w-20 shrink-0 text-muted-foreground">
              {i.label}
            </span>
            <div className="relative h-2.5 flex-1 rounded-full bg-muted">
              <span
                aria-hidden
                className="absolute inset-y-0 left-1/2 w-px bg-[var(--axis)]"
              />
              {i.value !== null && (
                <span
                  className="absolute inset-y-0 rounded-full"
                  style={{
                    background: i.color,
                    width: `${w}%`,
                    left: i.value >= 0 ? "50%" : `${50 - w}%`,
                  }}
                />
              )}
            </div>
            <span
              className={cn(
                "tabular w-14 shrink-0 text-right font-medium",
                toneCls(i.value),
              )}
            >
              {pctText(i.value)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function ReportPage({ params }: PageProps<"/reports/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-xl" />}>
      <Report params={params} />
    </Suspense>
  );
}

async function Report({
  params,
}: {
  params: PageProps<"/reports/[id]">["params"];
}) {
  const { id } = await params;
  if (!/^[a-zA-Z0-9._-]{1,36}$/.test(id)) notFound();
  const data = await loadReport(id);
  if (!data) notFound();
  const { report, deliveries } = data;
  const p = report.report;
  const admin = await isAdmin();
  const evidence = new Map(p.news.map((n) => [n.evidenceId, n]));
  const shareText = whatsappShareText(report, reportUrl(report.id));
  const weekly = p.funds.filter((f) => f.windows["1W"].fund.returnPct !== null);
  const upCount = weekly.filter(
    (f) => (f.windows["1W"].fund.returnPct as number) > 0.004,
  ).length;
  const compared = p.funds.filter(
    (f) => f.windows["1W"].vsPeerPp !== null,
  ).length;
  const keptUp = p.funds.filter(
    (f) =>
      f.windows["1W"].vsPeerPp !== null &&
      (f.windows["1W"].vsPeerPp as number) > -0.25,
  ).length;
  const best =
    [...weekly].sort(
      (a, b) =>
        (b.windows["1W"].fund.returnPct as number) -
        (a.windows["1W"].fund.returnPct as number),
    )[0] ?? null;
  const nifty = p.indices.find((i) => i.id === "NIFTY50") ?? null;
  const moodIndices = ["NIFTY50", "NIFTY_MIDCAP150", "NIFTY_SMALLCAP100"]
    .map((id) => p.indices.find((i) => i.id === id))
    .filter((i): i is NonNullable<typeof i> => Boolean(i));
  const screening = new Map(
    report.inputSnapshot.funds.map((f) => [f.schemeCode, f.screening]),
  );
  // The owner's number is only used for the signed-in owner; public visitors get a number-less link.
  const ownerNumber = admin ? process.env.WHATSAPP_SHARE_NUMBER?.trim() : null;
  const cite = (ids: string[]) =>
    ids.length > 0 && (
      <span className="ml-1 inline-flex flex-wrap gap-1 align-middle">
        {ids.map((eid) => {
          const n = evidence.get(eid);
          return n ? (
            <a
              key={eid}
              href={n.url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              title={`${n.title} — ${n.publisher}`}
              className="rounded bg-muted px-1 text-[10px] font-semibold text-muted-foreground hover:text-foreground"
            >
              {eid}
            </a>
          ) : null;
        })}
      </span>
    );

  return (
    <div className="space-y-8">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
          <nav
            aria-label="Breadcrumb"
            className="flex gap-1 text-xs text-muted-foreground"
          >
            <Link href="/" className="hover:underline">
              Dashboard
            </Link>
            <span aria-hidden>›</span>
            <Link href="/reports" className="hover:underline">
              Weekly Reports
            </Link>
          </nav>
          <PrintButton />
        </div>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">
          Your week, up to <DateText date={report.weekEnding} />{" "}
          <span aria-hidden>📬</span>
        </h1>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm print:hidden">
        <a
          href={whatsappShareLink(shareText)}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-full bg-[#25D366] px-4 py-2 font-semibold text-[#073b1f] shadow-card hover:brightness-95"
        >
          💬 Share on WhatsApp
        </a>
        <a
          href={`/api/reports/${report.id}/pdf`}
          download
          className="rounded-full border bg-card px-4 py-2 font-semibold shadow-card hover:bg-muted"
        >
          ⬇️ Download PDF
        </a>
        {ownerNumber && (
          <a
            href={whatsappShareLink(shareText, ownerNumber)}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full border bg-card px-4 py-2 font-medium shadow-card hover:bg-muted"
          >
            Send to my WhatsApp
          </a>
        )}
      </div>

      <section
        aria-label="This week at a glance"
        className="grid grid-cols-2 gap-3 lg:grid-cols-4"
      >
        <GlanceTile
          emoji="📈"
          label="Funds up this week"
          value={`${upCount} of ${weekly.length}`}
          sub={
            upCount === weekly.length
              ? "every fund grew"
              : upCount === 0
                ? "a down week across the board"
                : "the rest were flat or down"
          }
        />
        <GlanceTile
          emoji="🤝"
          label="Kept up with similar funds"
          value={`${keptUp} of ${compared}`}
          sub="within 0.25 points or better"
        />
        {best && (
          <GlanceTile
            emoji="🏆"
            label="Best this week"
            value={
              <span className={toneCls(best.windows["1W"].fund.returnPct)}>
                {pctText(best.windows["1W"].fund.returnPct)}
              </span>
            }
            sub={shortFundName(best.schemeName)}
          />
        )}
        {nifty && (
          <GlanceTile
            emoji={describeMove(nifty.windows["1W"].returnPct).emoji}
            label="Big companies (Nifty 50)"
            value={describeMove(nifty.windows["1W"].returnPct).words}
            sub={`${pctText(nifty.windows["1W"].returnPct)} this week`}
          />
        )}
      </section>

      <section>
        <h2 className="mb-4 text-xl font-bold">
          How each fund did <span aria-hidden>🏃</span>
        </h2>
        <div className="grid gap-4 lg:grid-cols-2">
          {p.output.funds.map((f) => {
            const perf = p.funds.find((x) => x.schemeCode === f.schemeCode);
            return (
              <article
                key={f.schemeCode}
                className="rounded-3xl border bg-card p-5 shadow-card"
              >
                <div className="flex items-center gap-3">
                  <span
                    aria-hidden
                    className="grid size-11 shrink-0 place-items-center rounded-2xl text-xl"
                    style={{
                      background: `linear-gradient(135deg, ${(FUND_GRADIENT[perf?.viewId as ViewId] ?? ["#64748b", "#0f766e"]).join(", ")})`,
                    }}
                  >
                    {FUND_EMOJI[perf?.viewId as ViewId] ?? "💼"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold leading-snug">
                      <Link
                        href={`/funds/${f.schemeCode}`}
                        className="hover:underline"
                      >
                        {shortFundName(
                          perf?.schemeName ?? String(f.schemeCode),
                        )}
                      </Link>
                    </h3>
                    {screening.get(f.schemeCode)?.flag ? (
                      <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-[var(--tint-warning)] px-2 py-0.5 text-[11px] font-medium">
                        👀 Worth watching
                      </span>
                    ) : (
                      <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-[var(--tint-good)] px-2 py-0.5 text-[11px] font-medium">
                        👍 On track
                      </span>
                    )}
                  </div>
                  <div className="text-right">
                    <div
                      className={cn(
                        "font-display text-2xl font-bold tabular",
                        toneCls(perf?.windows["1W"].fund.returnPct),
                      )}
                    >
                      {pctText(perf?.windows["1W"].fund.returnPct)}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      this week
                    </div>
                  </div>
                </div>

                {perf && (
                  <>
                    <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
                      {(
                        [
                          ["📅", "Week", perf.windows["1W"].fund.returnPct],
                          ["🗓️", "Month", perf.windows["1M"].fund.returnPct],
                          ["📆", "This year", perf.windows.YTD.fund.returnPct],
                        ] as const
                      ).map(([emoji, label, v]) => (
                        <div
                          key={label}
                          className="rounded-2xl bg-muted/60 px-2 py-2"
                        >
                          <div className="text-muted-foreground">
                            <span aria-hidden>{emoji}</span> {label}
                          </div>
                          <div
                            className={cn(
                              "mt-0.5 font-semibold tabular",
                              toneCls(v),
                            )}
                          >
                            {pctText(v)}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-4">
                      <WeekBars
                        items={[
                          {
                            label: "This fund",
                            value: perf.windows["1W"].fund.returnPct,
                            color: "var(--brand)",
                          },
                          ...(perf.benchmark
                            ? [
                                {
                                  label: "Its index",
                                  value:
                                    perf.windows["1W"].benchmark?.returnPct ??
                                    null,
                                  color: "var(--series-2)",
                                },
                              ]
                            : []),
                          {
                            label: "Similar funds",
                            value: perf.windows["1W"].peer?.mean ?? null,
                            color: "var(--series-3)",
                          },
                        ]}
                      />
                    </div>
                  </>
                )}

                <ul className="mt-4 space-y-3 text-[15px] leading-relaxed">
                  {(
                    [
                      ["📊", "How it did", f.performance, null],
                      ["⚖️", "Compared with others", f.comparison, null],
                      [
                        "🌍",
                        "What was going on",
                        f.marketContext,
                        f.evidenceIds,
                      ],
                    ] as const
                  ).map(([emoji, label, text, ev]) => (
                    <li key={label} className="flex gap-3">
                      <span
                        aria-hidden
                        className="grid size-8 shrink-0 place-items-center rounded-xl bg-muted text-base"
                      >
                        {emoji}
                      </span>
                      <span>
                        <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {label}
                        </span>
                        {text}
                        {ev && cite([...ev])}
                      </span>
                    </li>
                  ))}
                </ul>
                {perf && (
                  <details className="group mt-3">
                    <summary className="cursor-pointer list-none text-xs font-medium text-[var(--ink-secondary)] underline decoration-dotted underline-offset-4 [&::-webkit-details-marker]:hidden">
                      Show the numbers behind this
                    </summary>
                    <p className="mt-2 text-xs text-muted-foreground">
                      NAV ₹{perf.nav?.value.toFixed(4) ?? "n/a"} on{" "}
                      <DateText date={perf.nav?.date} /> · benchmark{" "}
                      {perf.benchmark?.name ??
                        perf.statedBenchmarkOnly ??
                        "none"}{" "}
                      · peers {perf.peer?.label ?? "none"}
                    </p>
                    <div className="mt-2 overflow-x-auto">
                      <Table className="text-xs">
                        <TableHeader>
                          <TableRow>
                            <TableHead>Period (from)</TableHead>
                            <TableHead className="text-right">Fund</TableHead>
                            <TableHead className="text-right">
                              Benchmark
                            </TableHead>
                            <TableHead className="text-right">
                              Peer avg (n)
                            </TableHead>
                            <TableHead className="text-right">
                              vs bench
                            </TableHead>
                            <TableHead className="text-right">
                              vs peers
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {WINDOWS.map((w) => {
                            const c = perf.windows[w];
                            return (
                              <TableRow key={w}>
                                <TableCell>
                                  {WINDOW_LABEL[w]} (
                                  {c.fund.referenceDate ? (
                                    <DateText date={c.fund.referenceDate} />
                                  ) : (
                                    "n/a"
                                  )}
                                  )
                                </TableCell>
                                <TableCell className="text-right">
                                  <Pct value={c.fund.returnPct} />
                                </TableCell>
                                <TableCell className="text-right">
                                  <Pct value={c.benchmark?.returnPct} plain />
                                </TableCell>
                                <TableCell className="text-right">
                                  <Pct value={c.peer?.mean} plain /> (
                                  {c.peer?.n ?? 0})
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
                  </details>
                )}
              </article>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-bold">
          The market this week <span aria-hidden>🌡️</span>
        </h2>
        {moodIndices.length > 0 && (
          <div className="mb-3 grid gap-3 sm:grid-cols-3">
            {moodIndices.map((ix) => {
              const mv = describeMove(ix.windows["1W"].returnPct);
              return (
                <div
                  key={ix.id}
                  className="flex items-center gap-3 rounded-3xl border bg-card p-4 shadow-card"
                >
                  <span
                    className="grid size-11 shrink-0 place-items-center rounded-2xl bg-muted text-xl"
                    aria-hidden
                  >
                    {mv.emoji}
                  </span>
                  <div className="min-w-0">
                    <div className="text-xs text-muted-foreground">
                      {INDEX_WORDS[ix.id] ?? ix.name}
                    </div>
                    <div
                      className={cn(
                        "font-semibold",
                        mv.tone === "good" && "text-[var(--up)]",
                        mv.tone === "bad" && "text-[var(--down)]",
                      )}
                    >
                      {mv.words}{" "}
                      <span className="tabular text-xs font-normal text-muted-foreground">
                        {pctText(ix.windows["1W"].returnPct)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <p className="rounded-3xl bg-[#16181d] p-6 text-lg leading-relaxed text-white shadow-card">
          <span aria-hidden className="mr-2">
            🗞️
          </span>
          {p.output.marketSummary.text}
          {cite(p.output.marketSummary.evidenceIds)}
        </p>
      </section>

      <section>
        <h2 className="mb-4 text-xl font-bold">
          By kind of fund <span aria-hidden>🧭</span>
        </h2>
        <KindTabs
          label="Kind of fund"
          items={p.output.categories.map((c) => ({
            id: c.viewId,
            label: VIEWS[c.viewId].short,
            emoji: FUND_EMOJI[c.viewId],
            content: (
              <div className="h-full rounded-3xl border bg-card p-5 shadow-card">
                <Link
                  href={`/categories/${c.viewId}`}
                  className="text-xs font-medium uppercase tracking-wide text-muted-foreground hover:underline"
                >
                  <span aria-hidden>{FUND_EMOJI[c.viewId]}</span>{" "}
                  {VIEWS[c.viewId].title}
                </Link>
                {c.headline.trim().toLowerCase() !==
                  VIEWS[c.viewId].title.toLowerCase() && (
                  <h3 className="mt-1 font-semibold">{c.headline}</h3>
                )}
                <p className="mt-1 text-sm leading-relaxed">
                  {c.summary}
                  {cite(c.evidenceIds)}
                </p>
                {c.watchItems.length > 0 && (
                  <ul className="mt-3 space-y-1.5 text-sm text-[var(--ink-secondary)]">
                    {c.watchItems.map((w) => (
                      <li
                        key={w}
                        className="flex gap-2 rounded-2xl bg-muted/60 px-3 py-2"
                      >
                        <span aria-hidden>👀</span>
                        <span>{w}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ),
          }))}
        />
      </section>

      <section>
        <h2 className="mb-4 text-xl font-bold">
          Overall assessment <span aria-hidden>✅</span>
        </h2>
        <WeatherHero
          label={report.assessment}
          reason={report.assessmentReason}
          weekEnding={report.weekEnding}
          reportId={null}
        />
      </section>

      <details className="group rounded-3xl border bg-card shadow-card">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-5 [&::-webkit-details-marker]:hidden">
          <span>
            <span className="font-semibold">
              <span aria-hidden>🔧</span> Behind the scenes
            </span>
            <span className="block text-sm text-muted-foreground">
              Sources, how this report was made, data freshness and delivery.
            </span>
          </span>
          <span className="shrink-0 rounded-full border px-3 py-1 text-xs font-medium group-open:hidden">
            Open
          </span>
          <span className="hidden shrink-0 rounded-full border px-3 py-1 text-xs font-medium group-open:inline">
            Close
          </span>
        </summary>
        <div className="space-y-6 border-t p-5">
          <p className="text-xs text-muted-foreground">
            {report.kind === "scheduled"
              ? "Saturday scheduled run"
              : "Generated on demand"}{" "}
            · generated <Timestamp iso={report.createdAt} /> ·{" "}
            {report.generator === "gemini"
              ? `written by ${report.model} (attempt ${p.meta.attempts}), validated against the input data`
              : "Gemini was unavailable — automated template from verified figures"}
          </p>
          <section>
            <SectionTitle
              sub={`${p.news.length} articles. Evidence ids (N1, N2…) above link to these.`}
            >
              Sources
            </SectionTitle>
            <NewsList items={p.news} showViews />
          </section>

          <section className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-xl border bg-card p-4 text-sm">
              <h3 className="font-semibold">Data freshness and limitations</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-[var(--ink-secondary)]">
                <li>
                  Data as of <DateText date={p.meta.dataAsOf} />; latest NAV
                  dates:{" "}
                  {[
                    ...new Set(p.funds.map((f) => f.nav?.date).filter(Boolean)),
                  ].join(", ") || "n/a"}
                  .
                </li>
                {p.breadth && (
                  <li>
                    Market breadth/valuation from NSE as of{" "}
                    <DateText date={p.breadth.date} />.
                  </li>
                )}
                <li>
                  Benchmarks are price indices; funds&apos; stated benchmarks
                  are total-return indices (which include dividends).
                </li>
                <li>
                  Peer averages are equal-weighted over available Direct-Growth
                  schemes, not official category figures.
                </li>
                {p.funds
                  .flatMap((f) => f.flags)
                  .map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                {p.meta.newsErrors.length > 0 && (
                  <li>
                    Some news queries failed ({p.meta.newsErrors.length});
                    coverage may be incomplete.
                  </li>
                )}
              </ul>
            </div>
            <div className="rounded-xl border bg-card p-4 text-sm">
              <h3 className="font-semibold">Delivery status</h3>
              {deliveries.length === 0 ? (
                <p className="mt-2 text-muted-foreground">
                  {report.kind === "scheduled"
                    ? "No delivery attempts recorded."
                    : "On-demand reports are not sent automatically."}
                </p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {deliveries.map((d) => (
                    <li key={d.id} className="rounded-md border p-2">
                      <div className="font-medium capitalize">
                        {d.channel}{" "}
                        {d.isTest && (
                          <span className="ml-1 rounded bg-[var(--tint-warning)] px-1 text-[10px] uppercase">
                            test
                          </span>
                        )}
                      </div>
                      <div className="text-xs">
                        {STATUS_LABEL[d.status] ?? d.status}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        to {d.recipientMasked ?? "—"} ·{" "}
                        <Timestamp iso={d.updatedAt ?? d.createdAt} /> ·
                        attempts {d.attempts}
                      </div>
                      {d.error && (
                        <div className="mt-1 text-xs text-[var(--down)]">
                          {d.error}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {admin && <SendControls reportId={report.id} />}
            </div>
          </section>
        </div>
      </details>

      <p className="text-xs text-muted-foreground">
        Past performance does not guarantee future returns. This report supports
        monitoring and is not investment advice.
      </p>
    </div>
  );
}
