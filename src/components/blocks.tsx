import Link from "next/link";
import { AlertTriangle, CheckCircle2, ExternalLink, Eye } from "lucide-react";
import { Sparkline } from "@/components/charts";
import { DateText, Num, Pct, Pp, shortFundName } from "@/components/format";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { VIEWS, type ViewId } from "@/lib/catalog";
import { WINDOWS, type WindowKey } from "@/lib/calc/returns";
import { formatHuman } from "@/lib/dates";
import type { NewsItem } from "@/lib/db/repo";
import type { FundPerformance, IndexPerformance } from "@/lib/pipeline/data";
import { cn } from "@/lib/utils";

export const WINDOW_LABEL: Record<WindowKey, string> = { "1W": "1 week", "1M": "1 month", YTD: "Year to date" };

const LABEL_STYLE: Record<string, { tint: string; bar: string; Icon: typeof CheckCircle2 }> = {
  "No action needed": { tint: "bg-[var(--tint-good)]", bar: "bg-[var(--status-good)]", Icon: CheckCircle2 },
  "One fund worth watching": { tint: "bg-[var(--tint-warning)]", bar: "bg-[var(--status-warning)]", Icon: Eye },
  "Consider reviewing your allocation": { tint: "bg-[var(--tint-critical)]", bar: "bg-[var(--status-critical)]", Icon: AlertTriangle },
};

export function AssessmentBanner({ label, reason, weekEnding, href, generator }: { label: string; reason: string; weekEnding: string; href?: string; generator?: string }) {
  const s = LABEL_STYLE[label] ?? LABEL_STYLE["No action needed"];
  return (
    <div className={cn("relative overflow-hidden rounded-xl border p-5 pl-6", s.tint)}>
      <span aria-hidden className={cn("absolute inset-y-0 left-0 w-1.5", s.bar)} />
      <div className="text-xs font-medium uppercase tracking-wide text-[var(--ink-secondary)]">Overall assessment · week ending {formatHuman(weekEnding)}</div>
      <div className="mt-1 flex items-center gap-2 text-xl font-semibold">
        <s.Icon className="size-5 shrink-0" aria-hidden />
        {label}
      </div>
      <p className="mt-2 max-w-3xl leading-relaxed">{reason}</p>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
        {href && (
          <Link href={href} className="font-medium underline underline-offset-4">
            Read the full report
          </Link>
        )}
        {generator && <span className="text-xs text-[var(--ink-secondary)]">{generator === "gemini" ? "Written by Gemini Flash from verified figures" : "Automated summary (Gemini unavailable)"}</span>}
      </div>
    </div>
  );
}

/** Main comparison table: one row per fund, the chosen window's fund / benchmark / peer numbers. */
export function FundTable({ funds, window = "1W" }: { funds: FundPerformance[]; window?: WindowKey }) {
  if (funds.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        No funds are being tracked yet. <Link href="/manage" className="underline">Add one by scheme code</Link>.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-56">Fund</TableHead>
            <TableHead className="text-right">NAV</TableHead>
            {WINDOWS.map((w) => (
              <TableHead key={w} className="text-right">
                {w === "YTD" ? "YTD" : w}
              </TableHead>
            ))}
            <TableHead className="text-right">vs benchmark ({window})</TableHead>
            <TableHead className="text-right">vs peers ({window})</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {funds.map((f) => {
            const c = f.windows[window];
            return (
              <TableRow key={f.schemeCode}>
                <TableCell>
                  <Link href={`/funds/${f.schemeCode}`} className="font-medium hover:underline">
                    {shortFundName(f.schemeName)}
                  </Link>
                  <div className="text-xs text-muted-foreground">
                    {f.viewId ? VIEWS[f.viewId as ViewId]?.short : f.amfiCategory} · {f.schemeCode}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <div className="tabular">{f.nav ? `₹${f.nav.value.toFixed(2)}` : "n/a"}</div>
                  <div className="text-xs text-muted-foreground">
                    <DateText date={f.nav?.date} />
                  </div>
                </TableCell>
                {WINDOWS.map((w) => (
                  <TableCell key={w} className="text-right">
                    <Pct value={f.windows[w].fund.returnPct} />
                  </TableCell>
                ))}
                <TableCell className="text-right">
                  {c.benchmark ? <Pp value={c.vsBenchmarkPp} /> : <span className="text-xs text-muted-foreground">no feed</span>}
                  <div className="text-xs text-muted-foreground">{f.benchmark?.name ?? f.statedBenchmarkOnly ?? "—"}</div>
                </TableCell>
                <TableCell className="text-right">
                  <Pp value={c.vsPeerPp} />
                  <div className="text-xs text-muted-foreground">{c.peer ? `avg ${c.peer.mean?.toFixed(2) ?? "n/a"}% · n=${c.peer.n}` : "—"}</div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

export function IndexTile({ ix, note }: { ix: IndexPerformance; note?: string }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{ix.name}</CardDescription>
        <CardTitle className="text-xl">
          <Num value={ix.current?.value} />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <Sparkline data={ix.chart.slice(-66)} />
        <dl className="grid grid-cols-3 gap-1 text-xs">
          {WINDOWS.map((w) => (
            <div key={w}>
              <dt className="text-muted-foreground">{w}</dt>
              <dd>
                <Pct value={ix.windows[w].returnPct} />
              </dd>
            </div>
          ))}
        </dl>
        <p className="text-[11px] leading-snug text-muted-foreground">
          {ix.current ? `Close ${formatHuman(ix.current.date)}` : "No recent close"} · {ix.source ?? "no source yet"}
          {note ? ` · ${note}` : ""}
        </p>
      </CardContent>
    </Card>
  );
}

export function NewsList({ items, showViews = false }: { items: (NewsItem & { id: string; evidenceId?: string })[]; showViews?: boolean }) {
  if (items.length === 0) return <p className="text-sm text-muted-foreground">No news items were retrieved for this week.</p>;
  return (
    <ul className="divide-y rounded-xl border bg-card">
      {items.map((n) => (
        <li key={n.id} className="p-3">
          <a href={n.url} target="_blank" rel="noopener noreferrer nofollow" className="group flex items-start gap-1.5 font-medium leading-snug hover:underline">
            {n.evidenceId && <span className="mt-0.5 shrink-0 rounded bg-muted px-1 text-[10px] font-semibold text-muted-foreground">{n.evidenceId}</span>}
            <span>{n.title}</span>
            <ExternalLink className="mt-0.5 size-3 shrink-0 opacity-50 group-hover:opacity-100" aria-hidden />
          </a>
          <div className="mt-1 text-xs text-muted-foreground">
            {n.publisher} · published {n.publishedAt ? formatHuman(n.publishedAt.slice(0, 10)) : "date unknown"}
            {showViews && n.views.length > 0 && ` · ${n.views.map((v) => VIEWS[v as ViewId]?.short ?? v).join(", ")}`}
          </div>
        </li>
      ))}
    </ul>
  );
}

export function SectionTitle({ children, sub }: { children: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="mb-3">
      <h2 className="text-lg font-semibold">{children}</h2>
      {sub && <p className="text-sm text-muted-foreground">{sub}</p>}
    </div>
  );
}
