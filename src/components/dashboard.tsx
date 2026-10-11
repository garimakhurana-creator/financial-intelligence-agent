import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2, Clock, Compass, Eye, FileSearch, Landmark, LineChart, Newspaper, PlusCircle, BookOpen, TrendingDown, TrendingUp } from "lucide-react";
import { Explain } from "@/components/page-header";
import { VIEWS, type ViewId } from "@/lib/catalog";
import { formatHuman } from "@/lib/dates";
import type { Highlight } from "@/lib/highlights";
import type { FundPerformance } from "@/lib/pipeline/data";
import { describeGap, FUND_KIND, signed, toneOf } from "@/lib/plain";
import type { PortfolioSummary } from "@/lib/portfolio";
import { metricTriples } from "@/lib/report/input";
import { screenFund, THRESHOLDS } from "@/lib/report/screening";
import { cn } from "@/lib/utils";

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const shortName = (n: string) => n.replace(/\s*-\s*Direct Plan.*$/i, "").replace(/\s*-\s*Growth.*$/i, "");

export function Num({ value, className }: { value: number | null | undefined; className?: string }) {
  const t = toneOf(value);
  return <span className={cn("tabular", t === "good" && "text-[var(--up)]", t === "bad" && "text-[var(--down)]", t === "none" && "text-muted-foreground", className)}>{signed(value)}</span>;
}

// ---------------------------------------------------------------------------------------------

function SummaryCard({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("mt-1 text-xl font-semibold tabular", tone === "good" && "text-[var(--up)]", tone === "bad" && "text-[var(--down)]")}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

export function PortfolioCards({ portfolio, admin, fundsTracked, navDate }: { portfolio: PortfolioSummary | null; admin: boolean; fundsTracked: number; navDate: string | null }) {
  const p = portfolio;
  const hasHoldings = p && p.holdingsCount > 0;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      {hasHoldings ? (
        <>
          <SummaryCard label="Current value" value={p.currentValue !== null ? inr(p.currentValue) : "—"} sub={p.currentValue !== null ? `${p.valuedCount} of ${p.holdingsCount} holdings valued` : "Add units to see value"} />
          <SummaryCard label="Amount invested" value={p.invested !== null ? inr(p.invested) : "—"} sub="as you entered it" />
          <SummaryCard
            label="Gain / loss"
            value={p.gain ? `${p.gain.amount >= 0 ? "+" : "−"}${inr(Math.abs(p.gain.amount))}` : "—"}
            sub={p.gain ? `${signed(p.gain.pct)} on ${p.gain.funds} fund${p.gain.funds === 1 ? "" : "s"}` : "needs units and invested amount"}
            tone={p.gain ? (p.gain.amount >= 0 ? "good" : "bad") : undefined}
          />
          <SummaryCard label="Monthly SIPs" value={p.monthlySip !== null ? inr(p.monthlySip) : "—"} sub={p.sipCount ? `${p.sipCount} active SIP${p.sipCount === 1 ? "" : "s"}` : "none entered"} />
        </>
      ) : (
        <div className="col-span-2 flex flex-col justify-between gap-3 rounded-xl border border-dashed bg-card p-4 sm:flex-row sm:items-center lg:col-span-4">
          <div>
            <div className="font-medium">See your money in rupees</div>
            <p className="mt-0.5 text-sm text-[var(--ink-secondary)]">
              {admin
                ? "Add the units you hold, what you invested and your monthly SIPs. We never estimate these from returns."
                : "Portfolio amounts are private. Sign in to add or view holdings and SIPs."}
            </p>
          </div>
          <Link href={admin ? "/portfolio#holdings" : "/manage"} className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-foreground px-3 py-2 text-sm font-medium text-background">
            {admin ? "Add holdings" : "Sign in"} <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
      )}
      <div className={hasHoldings ? "" : "col-span-2 lg:col-span-1"}>
        <SummaryCard label="Latest prices" value={navDate ? formatHuman(navDate) : "—"} sub={`${fundsTracked} funds tracked`} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------

const VERDICT = {
  "No action needed": { Icon: CheckCircle2, tint: "bg-[var(--tint-good)]", bar: "bg-[var(--status-good)]" },
  "One fund worth watching": { Icon: Eye, tint: "bg-[var(--tint-warning)]", bar: "bg-[var(--status-warning)]" },
  "Consider reviewing your allocation": { Icon: AlertTriangle, tint: "bg-[var(--tint-critical)]", bar: "bg-[var(--status-critical)]" },
} as const;

export function AssessmentPanel({ label, reason, weekEnding, reportId, funds }: { label: string; reason: string; weekEnding: string; reportId: string; funds: FundPerformance[] }) {
  const v = VERDICT[label as keyof typeof VERDICT] ?? VERDICT["No action needed"];
  return (
    <section className={cn("relative overflow-hidden rounded-2xl border p-6 pl-7", v.tint)}>
      <span aria-hidden className={cn("absolute inset-y-0 left-0 w-1.5", v.bar)} />
      <div className="text-xs font-medium uppercase tracking-wide text-[var(--ink-secondary)]">This week&apos;s assessment · up to {formatHuman(weekEnding)}</div>
      <h2 className="mt-2 flex items-center gap-2.5 text-2xl font-semibold tracking-tight sm:text-3xl">
        <v.Icon className="size-7 shrink-0" aria-hidden />
        {label}
      </h2>
      <p className="mt-2 max-w-3xl text-base leading-relaxed">{reason}</p>
      <p className="mt-1 text-xs text-[var(--ink-secondary)]">A monitoring signal, not a recommendation to buy or sell.</p>
      <div className="mt-4 flex flex-wrap items-start gap-x-6 gap-y-3">
        <Link href={`/reports/${reportId}`} className="inline-flex items-center gap-1 text-sm font-medium underline underline-offset-4">
          Read the full report <ArrowRight className="size-4" aria-hidden />
        </Link>
        <Explain label="Why am I seeing this?">
          <p>
            The label comes from fixed rules applied to verified numbers; Gemini only writes the wording. A fund is flagged as &ldquo;worth watching&rdquo; only when the weakness lasts:
            equity and overseas funds behind similar funds by {Math.abs(THRESHOLDS.equity.vsPeer1M)}+ points over a month <em>and</em> {Math.abs(THRESHOLDS.equity.vsPeerYTD)}+ points this year; bond funds by{" "}
            {Math.abs(THRESHOLDS.debt.vsPeer1M)} and {Math.abs(THRESHOLDS.debt.vsPeerYTD)}; index funds drifting more than {THRESHOLDS.indexTracking1M} points from their index in a month. No flags → &ldquo;No action
            needed&rdquo;; one → &ldquo;One fund worth watching&rdquo;; two or more → &ldquo;Consider reviewing your allocation&rdquo;.
          </p>
          <ul className="mt-2 space-y-1">
            {funds.map((f) => {
              const s = screenFund(f.viewId, metricTriples(f));
              return (
                <li key={f.schemeCode}>
                  <span className="font-medium text-foreground">{shortName(f.schemeName)}:</span> {s.flag ? "flagged — " : ""}
                  {s.reason.charAt(0).toUpperCase() + s.reason.slice(1)}
                </li>
              );
            })}
          </ul>
          <Link href="/methodology" className="mt-2 inline-block underline">
            Full methodology
          </Link>
        </Explain>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------

function statusOf(f: FundPerformance): { text: string; Icon: typeof CheckCircle2; cls: string } {
  if (!f.nav) return { text: "Data delayed", Icon: Clock, cls: "bg-muted" };
  if (screenFund(f.viewId, metricTriples(f)).flag) return { text: "Worth monitoring", Icon: Eye, cls: "bg-[var(--tint-warning)]" };
  const w = f.windows["1M"];
  const gap = f.benchmark ? w.vsBenchmarkPp : w.vsPeerPp;
  if (gap !== null && Math.abs(gap) < 1) return { text: f.benchmark ? "In line with benchmark" : "In line with peers", Icon: CheckCircle2, cls: "bg-[var(--tint-good)]" };
  return { text: "On track", Icon: CheckCircle2, cls: "bg-[var(--tint-good)]" };
}

/** Signed points with two decimals; tiny values never print as "-0.00". */
function ppText(pp: number) {
  const r = Math.round(pp * 100) / 100;
  return r === 0 ? "0.00" : `${r > 0 ? "+" : ""}${r.toFixed(2)}`;
}

function Gap({ pp, label }: { pp: number | null; label: string }) {
  const g = describeGap(pp);
  return (
    <span className="text-xs leading-snug">
      <span className={cn(g.tone === "good" && "text-[var(--up)]", g.tone === "bad" && "text-[var(--down)]", g.tone === "none" && "text-muted-foreground")}>{g.words}</span>{" "}
      <span className="text-muted-foreground">{label}</span>
      {pp !== null && <span className="tabular text-muted-foreground"> ({ppText(pp)})</span>}
    </span>
  );
}

/** All tracked funds side by side: desktop table, mobile stacked rows. */
export function FundSummary({ funds }: { funds: FundPerformance[] }) {
  return (
    <>
      <div className="hidden overflow-hidden rounded-2xl border bg-card md:block">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 font-medium">Fund</th>
              <th className="px-3 py-2.5 text-right font-medium">NAV</th>
              <th className="px-3 py-2.5 text-right font-medium">Week</th>
              <th className="px-3 py-2.5 text-right font-medium">Month</th>
              <th className="px-3 py-2.5 text-right font-medium">This year</th>
              <th className="px-3 py-2.5 font-medium">This week vs…</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {funds.map((f) => {
              const s = statusOf(f);
              const w = f.windows["1W"];
              return (
                <tr key={f.schemeCode} className="group hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <Link href={`/funds/${f.schemeCode}`} className="font-medium group-hover:underline">
                      {shortName(f.schemeName)}
                    </Link>
                    <div className="text-xs text-muted-foreground">{f.viewId ? VIEWS[f.viewId as ViewId].title : f.amfiCategory}</div>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <div className="tabular">{f.nav ? `₹${f.nav.value.toFixed(2)}` : "—"}</div>
                    <div className="text-[11px] text-muted-foreground">{f.nav ? formatHuman(f.nav.date) : ""}</div>
                  </td>
                  <td className="px-3 py-3 text-right font-medium">
                    <Num value={w.fund.returnPct} />
                  </td>
                  <td className="px-3 py-3 text-right">
                    <Num value={f.windows["1M"].fund.returnPct} />
                  </td>
                  <td className="px-3 py-3 text-right">
                    <Num value={f.windows["YTD"].fund.returnPct} />
                  </td>
                  <td className="space-y-0.5 px-3 py-3">
                    <div>{f.benchmark ? <Gap pp={w.vsBenchmarkPp} label={f.benchmark.name} /> : <span className="text-xs text-muted-foreground">No index feed for this fund</span>}</div>
                    <div>
                      <Gap pp={w.vsPeerPp} label="similar funds" />
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium", s.cls)}>
                      <s.Icon className="size-3.5" aria-hidden />
                      {s.text}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ul className="space-y-3 md:hidden">
        {funds.map((f) => {
          const s = statusOf(f);
          const w = f.windows["1W"];
          return (
            <li key={f.schemeCode}>
              <Link href={`/funds/${f.schemeCode}`} className="block rounded-xl border bg-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-medium leading-snug">{shortName(f.schemeName)}</div>
                    <div className="text-xs text-muted-foreground">{f.viewId ? FUND_KIND[f.viewId as ViewId] : f.amfiCategory}</div>
                  </div>
                  <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium", s.cls)}>
                    <s.Icon className="size-3" aria-hidden />
                    {s.text}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                  {(["1W", "1M", "YTD"] as const).map((k) => (
                    <div key={k} className="rounded-lg bg-muted/50 py-1.5">
                      <div className="text-muted-foreground">{k === "1W" ? "Week" : k === "1M" ? "Month" : "Year"}</div>
                      <Num value={f.windows[k].fund.returnPct} className="font-medium" />
                    </div>
                  ))}
                </div>
                <div className="mt-2 space-y-0.5">
                  {f.benchmark && <Gap pp={w.vsBenchmarkPp} label={f.benchmark.name} />}
                  <div>
                    <Gap pp={w.vsPeerPp} label="similar funds" />
                  </div>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}

// ---------------------------------------------------------------------------------------------

const HL_ICON: Record<Highlight["kind"], typeof Eye> = { watch: Eye, market: LineChart, currency: Landmark, rates: Landmark, lag: TrendingDown };

export function Highlights({ items }: { items: Highlight[] }) {
  if (items.length === 0) {
    return (
      <div className="flex items-start gap-3 rounded-xl border bg-card p-4 text-sm">
        <TrendingUp className="mt-0.5 size-4 shrink-0 text-[var(--up)]" aria-hidden />
        <p>Nothing unusual this week: no big index moves, no sharp rupee move, and no fund slipping behind similar funds.</p>
      </div>
    );
  }
  return (
    <ul className="grid gap-3 md:grid-cols-3">
      {items.map((h) => {
        const Icon = HL_ICON[h.kind];
        return (
          <li key={h.title}>
            <Link href={h.href} className="flex h-full flex-col rounded-xl border bg-card p-4 hover:border-foreground/30">
              <Icon className="size-4 text-[var(--ink-secondary)]" aria-hidden />
              <div className="mt-2 font-medium leading-snug">{h.title}</div>
              <p className="mt-1 flex-1 text-sm leading-relaxed text-[var(--ink-secondary)]">{h.body}</p>
              <span className="mt-3 text-xs font-medium">See the details →</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function QuickActions({ reportId }: { reportId: string | null }) {
  const actions = [
    { href: "/explore", label: "Explore SIP funds", Icon: Compass },
    { href: "/analyse", label: "Analyse a fund", Icon: FileSearch },
    { href: reportId ? `/reports/${reportId}` : "/reports", label: "This week's report", Icon: BookOpen },
    { href: "/market", label: "Market news", Icon: Newspaper },
    { href: "/portfolio#manage", label: "Add a fund", Icon: PlusCircle },
  ];
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
      {actions.map((a) => (
        <Link key={a.href + a.label} href={a.href} className="flex items-center gap-2 rounded-xl border bg-card px-3 py-3 text-sm font-medium hover:border-foreground/30">
          <a.Icon className="size-4 shrink-0 text-[var(--ink-secondary)]" aria-hidden />
          {a.label}
        </Link>
      ))}
    </div>
  );
}
