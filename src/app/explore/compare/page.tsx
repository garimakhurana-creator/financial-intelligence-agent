import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Card, PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import * as cached from "@/lib/db/cached";
import { groupLabelMap, toUniverseRow, type UniverseRow } from "@/lib/explore";
import type { DiscoveryFundData, DiscoveryGroupData } from "@/lib/pipeline/discovery";
import { cn } from "@/lib/utils";

export const metadata = { title: "Compare funds · Meera's Money" };

export default function ComparePage({ searchParams }: PageProps<"/explore/compare">) {
  return (
    <>
      <PageHeader
        title="Compare funds"
        sub="Side by side over the same periods. Differences are facts from NAV history; they do not predict which fund will do better next."
        crumbs={[
          { href: "/", label: "Dashboard" },
          { href: "/explore", label: "Explore Funds" },
        ]}
      />
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-2xl" />}>
        <Compare searchParams={searchParams} />
      </Suspense>
    </>
  );
}

const pct = (n: number | null) => (n === null ? "n/a" : `${n > 0 ? "+" : ""}${n.toFixed(2)}%`);
const pts = (n: number | null) => (n === null ? "n/a" : `${n > 0 ? "+" : ""}${n.toFixed(2)} pts`);
const short = (n: string) => n.replace(/\s*-\s*Direct Plan.*$/i, "");

function best(rows: UniverseRow[], key: keyof UniverseRow, dir: "max" | "min") {
  const vals = rows.filter((r) => typeof r[key] === "number");
  if (vals.length < 2) return null;
  return vals.reduce((a, b) => ((dir === "max" ? (b[key] as number) > (a[key] as number) : (b[key] as number) < (a[key] as number)) ? b : a));
}

async function Compare({ searchParams }: { searchParams: PageProps<"/explore/compare">["searchParams"] }) {
  await connection();
  const sp = await searchParams;
  const codes = String(sp.codes ?? "")
    .split(",")
    .map(Number)
    .filter((n) => Number.isSafeInteger(n) && n > 0)
    .slice(0, 4);
  if (codes.length < 2) {
    return (
      <Card>
        <p>Pick two to four funds on the Explore page to compare them.</p>
        <Link href="/explore" className="mt-2 inline-block text-sm font-medium underline">
          Go to Explore Funds
        </Link>
      </Card>
    );
  }
  const [metrics, groups] = await Promise.all([cached.fundMetricsMany<DiscoveryFundData>(codes), cached.discoveryGroups<DiscoveryGroupData>()]);
  const labels = groupLabelMap(groups);
  const rows = codes.map((c) => metrics.find((m) => m.schemeCode === c)).flatMap((m) => (m ? [toUniverseRow(m, labels[m.groupKey] ?? m.groupKey)!] : []));
  const missing = codes.filter((c) => !rows.some((r) => r.code === c));
  const mixed = new Set(rows.map((r) => r.group)).size > 1;

  const facts: [string, (r: UniverseRow) => React.ReactNode, string?][] = [
    ["Fund house", (r) => r.amc],
    ["Category", (r) => r.groupLabel],
    ["Plan / option", (r) => `${r.plan || "Direct"} · ${r.option || "Growth"}`],
    ["Typical category risk", (r) => r.riskBand],
    ["Suggested horizon", (r) => r.horizon],
    ["Latest NAV", (r) => (r.nav ? `₹${r.nav.toFixed(2)} (${r.navDate})` : "n/a")],
    ["History since", (r) => r.historyStart ?? "n/a"],
    ["1-year return", (r) => pct(r.r1)],
    ["3-year return a year", (r) => pct(r.r3)],
    ["5-year return a year", (r) => pct(r.r5)],
    ["3 yrs vs category median", (r) => pts(r.vsCat3)],
    ["3 yrs vs reference index", (r) => pts(r.vsRef3), "Price index for the whole category, not the fund's own benchmark."],
    ["Volatility (3 yrs, a year)", (r) => (r.vol === null ? "n/a" : `${r.vol.toFixed(2)}%`)],
    ["Worst fall (3 yrs)", (r) => (r.dd === null ? "n/a" : `${r.dd.toFixed(2)}%`)],
    ["Beat category median", (r) => (r.cons === null ? "n/a" : `${r.cons}% of 1-yr periods`)],
    ["Research label", (r) => `${r.label ?? "—"}${r.rank ? ` (#${r.rank} of ${r.of})` : ""}`],
    ["Expense ratio", () => "Not in our data — see factsheet"],
  ];

  const diffs: string[] = [];
  const b3 = best(rows, "r3", "max");
  const bv = best(rows, "vol", "min");
  const bd = best(rows, "dd", "max");
  const bc = best(rows, "cons", "max");
  if (b3) diffs.push(`${short(b3.name)} had the highest 3-year return (${pct(b3.r3)} a year).`);
  if (bc) diffs.push(`${short(bc.name)} was the most consistent, beating its category median in ${bc.cons}% of rolling 1-year periods.`);
  if (bv) diffs.push(`${short(bv.name)} had the smoothest ride (volatility ${bv.vol!.toFixed(2)}% a year).`);
  if (bd) diffs.push(`${short(bd.name)} fell least in its worst stretch (${bd.dd!.toFixed(2)}%).`);

  return (
    <div className="space-y-6">
      {mixed && (
        <p className="rounded-xl bg-[var(--tint-warning)] px-4 py-3 text-sm">
          These funds are in different categories, so they do different jobs and carry different risks. Compare like with like where you can.
        </p>
      )}
      {missing.length > 0 && <p className="text-sm text-muted-foreground">Not in the research data: {missing.join(", ")}. Try Analyse a Fund for these.</p>}
      <div className="overflow-x-auto rounded-2xl border bg-card">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left">
              <th className="w-48 px-4 py-3 text-xs font-medium text-muted-foreground">Measure</th>
              {rows.map((r) => (
                <th key={r.code} className="px-4 py-3 align-top">
                  <div className="font-medium leading-snug">{short(r.name)}</div>
                  <Link href={`/analyse?code=${r.code}`} className="text-xs font-normal underline">
                    Analyse
                  </Link>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {facts.map(([label, get, note]) => (
              <tr key={label}>
                <td className="px-4 py-2.5 text-xs text-[var(--ink-secondary)]" title={note}>
                  {label}
                </td>
                {rows.map((r) => (
                  <td key={r.code} className={cn("tabular px-4 py-2.5")}>
                    {get(r)}
                  </td>
                ))}
              </tr>
            ))}
            <tr>
              <td className="px-4 py-2.5 align-top text-xs text-[var(--ink-secondary)]">Strengths</td>
              {rows.map((r) => (
                <td key={r.code} className="px-4 py-2.5 align-top text-xs">
                  {r.strengths.length ? r.strengths.map((s) => <p key={s}>+ {s}</p>) : <span className="text-muted-foreground">None stand out</span>}
                </td>
              ))}
            </tr>
            <tr>
              <td className="px-4 py-2.5 align-top text-xs text-[var(--ink-secondary)]">Limitations</td>
              {rows.map((r) => (
                <td key={r.code} className="px-4 py-2.5 align-top text-xs">
                  {r.cautions.length ? r.cautions.map((s) => <p key={s}>− {s}</p>) : <span className="text-muted-foreground">None flagged</span>}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      {diffs.length > 0 && (
        <Card>
          <h2 className="font-semibold">Key differences</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {diffs.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">Past performance does not guarantee future returns. Research, not a recommendation.</p>
        </Card>
      )}
    </div>
  );
}
