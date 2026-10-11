import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { CheckCircle2, CircleAlert, Minus, Plus } from "lucide-react";
import { Card, PageHeader, SignInPrompt } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { isAdmin } from "@/lib/auth";
import { HORIZONS } from "@/lib/calc/metrics";
import * as research from "@/lib/db/research";
import type { StoredAnalysisData } from "@/lib/analysis/analyse";
import { cn } from "@/lib/utils";

export const metadata = { title: "Fund analysis · Meera's Fund Intelligence" };

export default function AnalysisPage({ params }: PageProps<"/analyse/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-2xl" />}>
      <Analysis params={params} />
    </Suspense>
  );
}

const OUTCOME = {
  "Worth researching further": { tint: "bg-[var(--tint-good)]", bar: "bg-[var(--status-good)]" },
  "Suitable for further comparison": { tint: "bg-muted", bar: "bg-[var(--axis)]" },
  "Several concerns to investigate": { tint: "bg-[var(--tint-warning)]", bar: "bg-[var(--status-warning)]" },
  "Insufficient data for a reliable assessment": { tint: "bg-[var(--tint-warning)]", bar: "bg-[var(--status-warning)]" },
} as const;

const pct = (n: number | null | undefined) => (n == null ? "n/a" : `${n > 0 ? "+" : ""}${n.toFixed(2)}%`);
const FIELD_LABEL: Record<string, string> = {
  fundName: "Fund name",
  amc: "Fund house",
  schemeCategory: "Category",
  benchmark: "Benchmark",
  riskometer: "Riskometer",
  inceptionDate: "Launched",
  fundManagers: "Fund manager(s)",
  expenseRatioDirect: "Expense ratio — Direct (%)",
  expenseRatioRegular: "Expense ratio — Regular (%)",
  aumCrore: "Fund size (₹ crore)",
  minSip: "Minimum SIP (₹)",
  exitLoad: "Exit load",
  portfolioDate: "Portfolio as of",
};

function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="break-inside-avoid">
      <h2 className="text-lg font-semibold">
        <span className="mr-2 text-[var(--ink-muted)]">{n}.</span>
        {title}
      </h2>
      <div className="mt-2 space-y-3 text-sm leading-relaxed">{children}</div>
    </section>
  );
}

function Verified({ ok }: { ok: boolean }) {
  return ok ? (
    <span className="inline-flex items-center gap-0.5 text-[11px] text-[var(--up)]">
      <CheckCircle2 className="size-3" aria-hidden /> verified in document
    </span>
  ) : (
    <span className="inline-flex items-center gap-0.5 text-[11px] text-[var(--down)]">
      <CircleAlert className="size-3" aria-hidden /> could not verify — reference only
    </span>
  );
}

async function Analysis({ params }: { params: PageProps<"/analyse/[id]">["params"] }) {
  await connection();
  const { id } = await params;
  if (!/^[a-zA-Z0-9._-]{1,36}$/.test(id)) notFound();
  if (!(await isAdmin())) return <SignInPrompt what="view saved analyses" />;
  const a = await research.getAnalysis<StoredAnalysisData>(id);
  if (!a) notFound();
  const { facts: f, narrative: n } = a.data;
  const o = OUTCOME[f.outcome];
  const doc = f.document;
  const m = f.metrics;

  return (
    <div className="space-y-8">
      <PageHeader
        title={a.schemeName.replace(/\s*-\s*Direct Plan.*$/i, "")}
        sub={`Research analysis · ${new Date(a.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })} · ${a.data.generator === "gemini" ? `explained by ${a.data.model}, checked against the figures` : "template text (Gemini unavailable)"}`}
        crumbs={[
          { href: "/", label: "Dashboard" },
          { href: "/analyse", label: "Analyse a Fund" },
        ]}
        action={
          <span className="text-xs text-muted-foreground">
            Data as of {f.asOf}
            {m?.asOf ? ` · NAV ${m.asOf}` : ""}
          </span>
        }
      />

      <section className={cn("relative overflow-hidden rounded-2xl border p-6 pl-7", o.tint)}>
        <span aria-hidden className={cn("absolute inset-y-0 left-0 w-1.5", o.bar)} />
        <div className="text-xs font-medium uppercase tracking-wide text-[var(--ink-secondary)]">Research outcome</div>
        <div className="mt-1 text-2xl font-semibold tracking-tight">{f.outcome}</div>
        <p className="mt-2 max-w-3xl">{f.outcomeReason}</p>
        <p className="mt-1 text-xs text-[var(--ink-secondary)]">A research signal from fixed rules — not a recommendation to invest or not invest.</p>
      </section>

      <Card className="space-y-8">
        <Section n={1} title="Fund at a glance">
          <p>{n.glance}</p>
          {f.scheme && (
            <p className="text-xs text-muted-foreground">
              {f.scheme.fundHouse} · {f.scheme.schemeCategory} · {f.scheme.plan} plan, {f.scheme.option} option · scheme code {f.scheme.schemeCode}
            </p>
          )}
        </Section>

        <Section n={2} title="Historical performance">
          <p>{n.performance}</p>
          {m && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead className="border-b text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-3 font-medium">Period</th>
                    {HORIZONS.map((h) => (
                      <th key={h} className="px-2 py-2 text-right font-medium">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  <tr>
                    <td className="py-2 pr-3 text-xs text-[var(--ink-secondary)]">Fund (total / a year for 3Y, 5Y)</td>
                    {HORIZONS.map((h) => (
                      <td key={h} className="tabular px-2 py-2 text-right">
                        {pct(h === "3Y" || h === "5Y" ? m.returns[h].annualised : m.returns[h].total)}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-2 pr-3 text-xs text-[var(--ink-secondary)]">Category median</td>
                    {HORIZONS.map((h) => (
                      <td key={h} className="tabular px-2 py-2 text-right text-[var(--ink-secondary)]">
                        {h === "1Y" ? pct(f.comparison["1Y"].categoryMedian) : h === "3Y" ? pct(f.comparison["3Y"].categoryMedian) : h === "5Y" ? pct(f.comparison["5Y"].categoryMedian) : "—"}
                      </td>
                    ))}
                  </tr>
                  {f.category?.reference && (
                    <tr>
                      <td className="py-2 pr-3 text-xs text-[var(--ink-secondary)]">{f.category.reference.name} (reference, price)</td>
                      {HORIZONS.map((h) => (
                        <td key={h} className="tabular px-2 py-2 text-right text-[var(--ink-secondary)]">
                          {h === "1Y" ? pct(f.comparison["1Y"].reference) : h === "3Y" ? pct(f.comparison["3Y"].reference) : h === "5Y" ? pct(f.comparison["5Y"].reference) : "—"}
                        </td>
                      ))}
                    </tr>
                  )}
                </tbody>
              </table>
              <p className="mt-1 text-xs text-muted-foreground">
                Periods end on the latest NAV ({m.asOf}); history starts {m.historyStart}. 3Y and 5Y are average yearly returns.
              </p>
            </div>
          )}
          {doc && doc.returns.length > 0 && (
            <div>
              <h3 className="text-sm font-medium">As stated in the factsheet</h3>
              <ul className="mt-1 space-y-1 text-sm">
                {doc.returns.map((r, i) => (
                  <li key={i}>
                    {r.value.period}: fund {r.value.fund ?? "n/a"}%, benchmark {r.value.benchmark ?? "n/a"}% <Verified ok={r.verified} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Section>

        <Section n={3} title="Consistency">
          <p>{n.consistency}</p>
        </Section>

        <Section n={4} title="Risk profile">
          <p>{n.risk}</p>
          {m && (
            <p className="text-xs text-muted-foreground">
              Volatility (3 yrs): {m.volatility3Y === null ? "n/a" : `${m.volatility3Y.toFixed(2)}% a year`}
              {f.category?.medians.vol != null ? ` (category median ${f.category.medians.vol.toFixed(2)}%)` : ""} · Worst fall:{" "}
              {m.maxDrawdown3Y ? `${m.maxDrawdown3Y.pct.toFixed(2)}% from ${m.maxDrawdown3Y.peak} to ${m.maxDrawdown3Y.trough}` : "n/a"}
            </p>
          )}
        </Section>

        <Section n={5} title="Costs">
          <p>{n.costs}</p>
        </Section>

        <Section n={6} title="Portfolio characteristics">
          <p>{n.portfolio}</p>
          {doc && (doc.topHoldings.length > 0 || doc.sectors.length > 0) && (
            <div className="grid gap-4 md:grid-cols-2">
              {(
                [
                  ["Top holdings", doc.topHoldings],
                  ["Sectors", doc.sectors],
                ] as const
              ).map(([title, list]) =>
                list.length ? (
                  <div key={title}>
                    <h3 className="text-sm font-medium">{title} (from factsheet)</h3>
                    <ul className="mt-1 space-y-0.5 text-sm">
                      {list.map((h, i) => (
                        <li key={i} className="flex justify-between gap-2">
                          <span>
                            {h.value.name} <Verified ok={h.verified} />
                          </span>
                          <span className="tabular">{h.value.weightPct ?? "n/a"}%</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null,
              )}
            </div>
          )}
        </Section>

        <Section n={7} title="Key strengths">
          {f.strengths.length ? (
            <ul className="space-y-1">
              {f.strengths.map((s) => (
                <li key={s.text} className="flex gap-2">
                  <Plus className="mt-0.5 size-4 shrink-0 text-[var(--up)]" aria-hidden />
                  <span>
                    {s.text} <span className="text-[11px] text-muted-foreground">({s.basis === "document" ? "factsheet" : s.basis === "category" ? "vs similar funds" : "NAV data"})</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground">No evidence-based strengths stood out.</p>
          )}
          <p className="text-[var(--ink-secondary)]">{n.strengths}</p>
        </Section>

        <Section n={8} title="Key concerns">
          {f.concerns.length ? (
            <ul className="space-y-1">
              {f.concerns.map((s) => (
                <li key={s.text} className="flex gap-2">
                  <Minus className="mt-0.5 size-4 shrink-0 text-[var(--down)]" aria-hidden />
                  <span>{s.text}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground">No evidence-based concerns were found in the available data.</p>
          )}
          <p className="text-[var(--ink-secondary)]">{n.concerns}</p>
        </Section>

        <Section n={9} title="Comparison with alternatives">
          <p>{n.alternatives}</p>
          {f.alternatives.length > 0 && (
            <ul className="divide-y rounded-xl border">
              {f.alternatives.map((alt) => (
                <li key={alt.schemeCode} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                  <span>
                    {alt.schemeName.replace(/\s*-\s*Direct Plan.*$/i, "")} <span className="text-xs text-muted-foreground">· {alt.label}</span>
                  </span>
                  <span className="flex gap-3 text-xs">
                    <span className="tabular">
                      3Y {pct(alt.r3)} · 5Y {pct(alt.r5)}
                    </span>
                    <Link href={`/analyse?code=${alt.schemeCode}`} className="font-medium underline">
                      Analyse
                    </Link>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {f.scheme && f.alternatives.length > 0 && (
            <Link href={`/explore/compare?codes=${[f.scheme.schemeCode, ...f.alternatives.map((x) => x.schemeCode)].join(",")}`} className="inline-block text-sm font-medium underline">
              Compare them side by side
            </Link>
          )}
        </Section>

        <Section n={10} title="Final assessment">
          <p>{n.assessment}</p>
        </Section>
      </Card>

      {doc && (
        <Card>
          <h2 className="text-lg font-semibold">From the uploaded document</h2>
          <p className="text-sm text-[var(--ink-secondary)]">
            {doc.file.name} · {doc.file.pages} page(s) · {doc.file.textLayer ? "text layer found" : "no text layer (scanned?) — nothing could be verified"} · fingerprint {doc.file.sha256.slice(0, 16)}… · not stored
          </p>
          {doc.error && <p className="mt-2 text-sm text-[var(--down)]">{doc.error}</p>}
          <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            {Object.entries(doc.fields)
              .filter(([, v]) => v.value !== null)
              .map(([k, v]) => (
                <div key={k}>
                  <dt className="text-xs text-muted-foreground">{FIELD_LABEL[k] ?? k}</dt>
                  <dd>
                    {String(v.value)} <Verified ok={v.verified} />
                    {v.quote && <div className="text-[11px] italic text-muted-foreground">&ldquo;{v.quote}&rdquo;</div>}
                  </dd>
                </div>
              ))}
          </dl>
          <p className="mt-3 text-xs text-muted-foreground">
            A field is verified only if its quoted text appears in the PDF and contains the value. Unverified fields are never used in the analysis.
          </p>
        </Card>
      )}

      <Card>
        <h2 className="text-sm font-semibold">Sources</h2>
        <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-[var(--ink-secondary)]">
          {f.sources.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">Past performance does not guarantee future returns. Research, not a recommendation.</p>
      </Card>
    </div>
  );
}
