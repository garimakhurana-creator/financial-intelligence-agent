"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error ?? j.detail ?? `Request failed (${res.status})`);
  return j as T;
}
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const pct = (n: number | null) => (n === null ? "—" : `${n > 0 ? "+" : ""}${n.toFixed(2)}%`);
const pp = (n: number | null) => {
  if (n === null) return "—";
  const r = Math.round(n * 100) / 100;
  return r === 0 ? "0.00" : `${r > 0 ? "+" : ""}${r.toFixed(2)}`;
};
const tone = (n: number | null) => (n === null ? "text-muted-foreground" : n > 0.004 ? "text-[var(--up)]" : n < -0.004 ? "text-[var(--down)]" : "");

// ---------------------------------------------------------------------------------------------
// Sortable, filterable comparison table

export interface CompareRow {
  schemeCode: number;
  name: string;
  category: string;
  nav: number | null;
  navDate: string | null;
  stale: boolean;
  ret: Record<"1W" | "1M" | "YTD", number | null>;
  vsBench: Record<"1W" | "1M" | "YTD", number | null>;
  vsPeer: Record<"1W" | "1M" | "YTD", number | null>;
  benchmark: string | null;
}

type SortKey = "name" | "ret1W" | "ret1M" | "retYTD" | "vsBench" | "vsPeer";
type SortState = { key: SortKey; dir: 1 | -1 };

function SortTh({ k, sort, onSort, children, right = true }: { k: SortKey; sort: SortState; onSort: (k: SortKey) => void; children: React.ReactNode; right?: boolean }) {
  return (
    <th className={cn("px-3 py-2.5 font-medium", right && "text-right")} aria-sort={sort.key === k ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
      <button type="button" className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => onSort(k)}>
        {children}
        {sort.key === k && (sort.dir === 1 ? <ArrowUp className="size-3" aria-hidden /> : <ArrowDown className="size-3" aria-hidden />)}
      </button>
    </th>
  );
}

export function ComparisonTable({ rows }: { rows: CompareRow[] }) {
  const router = useRouter();
  const [period, setPeriod] = useState<"1W" | "1M" | "YTD">("1M");
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState<SortState>({ key: "ret1M", dir: -1 });
  const onSort = (k: SortKey) => setSort((s) => ({ key: k, dir: s.key === k ? ((-s.dir) as 1 | -1) : -1 }));
  const categories = useMemo(() => [...new Set(rows.map((r) => r.category))], [rows]);

  const view = useMemo(() => {
    const val = (r: CompareRow): number | string | null =>
      sort.key === "name" ? r.name : sort.key === "ret1W" ? r.ret["1W"] : sort.key === "ret1M" ? r.ret["1M"] : sort.key === "retYTD" ? r.ret.YTD : sort.key === "vsBench" ? r.vsBench[period] : r.vsPeer[period];
    return rows
      .filter((r) => category === "all" || r.category === category)
      .sort((a, b) => {
        const x = val(a);
        const y = val(b);
        if (x === null) return 1;
        if (y === null) return -1;
        return (typeof x === "string" ? x.localeCompare(String(y)) : x - (y as number)) * sort.dir;
      });
  }, [rows, category, sort, period]);


  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="cmp-cat" className="text-xs">
            Category
          </Label>
          <select id="cmp-cat" value={category} onChange={(e) => setCategory(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm">
            <option value="all">All categories</option>
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <span className="text-xs font-medium">Compare over</span>
          <div role="group" aria-label="Comparison period" className="flex rounded-lg border bg-background p-0.5">
            {(["1W", "1M", "YTD"] as const).map((p) => (
              <button key={p} type="button" aria-pressed={period === p} onClick={() => setPeriod(p)} className={cn("rounded-md px-2.5 py-1 text-xs font-medium", period === p ? "bg-foreground text-background" : "hover:bg-muted")}>
                {p === "1W" ? "Week" : p === "1M" ? "Month" : "This year"}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="overflow-x-auto rounded-2xl border bg-card">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              <SortTh k="name" sort={sort} onSort={onSort} right={false}>
                Fund
              </SortTh>
              <th className="px-3 py-2.5 text-right font-medium">NAV</th>
              <SortTh k="ret1W" sort={sort} onSort={onSort}>Week</SortTh>
              <SortTh k="ret1M" sort={sort} onSort={onSort}>Month</SortTh>
              <SortTh k="retYTD" sort={sort} onSort={onSort}>This year</SortTh>
              <SortTh k="vsBench" sort={sort} onSort={onSort}>vs benchmark</SortTh>
              <SortTh k="vsPeer" sort={sort} onSort={onSort}>vs similar funds</SortTh>
            </tr>
          </thead>
          <tbody className="divide-y">
            {view.map((r) => (
              <tr key={r.schemeCode} className="cursor-pointer hover:bg-muted/30" onClick={() => router.push(`/funds/${r.schemeCode}`)}>
                <td className="px-3 py-3">
                  <Link href={`/funds/${r.schemeCode}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
                    {r.name}
                  </Link>
                  <div className="text-xs text-muted-foreground">{r.category}</div>
                </td>
                <td className="px-3 py-3 text-right">
                  <div className="tabular">{r.nav === null ? "—" : `₹${r.nav.toFixed(2)}`}</div>
                  <div className={cn("text-[11px]", r.stale ? "text-[var(--down)]" : "text-muted-foreground")}>{r.navDate ?? ""}{r.stale ? " · stale" : ""}</div>
                </td>
                {(["1W", "1M", "YTD"] as const).map((p) => (
                  <td key={p} className={cn("tabular px-3 py-3 text-right", tone(r.ret[p]), period === p && "font-medium")}>
                    {pct(r.ret[p])}
                  </td>
                ))}
                <td className={cn("tabular px-3 py-3 text-right", tone(r.vsBench[period]))} title={r.benchmark ?? "No index feed"}>
                  {r.benchmark ? pp(r.vsBench[period]) : <span className="text-xs text-muted-foreground">no feed</span>}
                </td>
                <td className={cn("tabular px-3 py-3 text-right", tone(r.vsPeer[period]))}>{pp(r.vsPeer[period])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">Differences are in percentage points over the selected period. Click a row for the fund&apos;s full page.</p>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Holdings and SIP editor (owner only)

export interface HoldingRow {
  schemeCode: number;
  name: string;
  nav: number | null;
  units: number | null;
  invested: number | null;
  sipAmount: number | null;
  sipDay: number | null;
}

function HoldingForm({ row }: { row: HoldingRow }) {
  const router = useRouter();
  const [v, setV] = useState({ units: row.units?.toString() ?? "", invested: row.invested?.toString() ?? "", sipAmount: row.sipAmount?.toString() ?? "", sipDay: row.sipDay?.toString() ?? "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const hasAny = row.units !== null || row.invested !== null || row.sipAmount !== null;
  const value = Number(v.units) > 0 && row.nav ? Number(v.units) * row.nav : null;

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      await api(`/api/holdings/${row.schemeCode}`, { method: "PUT", body: JSON.stringify(v) });
      setMsg({ ok: true, text: "Saved" });
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: errText(e) });
    } finally {
      setBusy(false);
    }
  }
  async function clear() {
    if (!confirm(`Remove your holding details for ${row.name}? The fund stays tracked.`)) return;
    setBusy(true);
    try {
      await api(`/api/holdings/${row.schemeCode}`, { method: "DELETE" });
      setV({ units: "", invested: "", sipAmount: "", sipDay: "" });
      setMsg({ ok: true, text: "Removed" });
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: errText(e) });
    } finally {
      setBusy(false);
    }
  }
  const id = (k: string) => `h-${row.schemeCode}-${k}`;
  return (
    <div className="rounded-xl border p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="font-medium">{row.name}</div>
        <div className="text-xs text-muted-foreground">{value !== null ? `Current value ≈ ₹${Math.round(value).toLocaleString("en-IN")} at NAV ₹${row.nav?.toFixed(2)}` : "Enter units to see current value"}</div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(
          [
            ["units", "Units held", "e.g. 152.317"],
            ["invested", "Amount invested (₹)", "e.g. 30000"],
            ["sipAmount", "Monthly SIP (₹)", "e.g. 2000"],
            ["sipDay", "SIP date (1–31)", "e.g. 5"],
          ] as const
        ).map(([k, label, ph]) => (
          <div key={k} className="space-y-1">
            <Label htmlFor={id(k)} className="text-xs">
              {label}
            </Label>
            <Input id={id(k)} inputMode="decimal" placeholder={ph} value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} />
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </Button>
        {hasAny && (
          <Button size="sm" variant="ghost" onClick={clear} disabled={busy}>
            Clear
          </Button>
        )}
        {msg && (
          <span role="status" className={cn("text-xs", msg.ok ? "text-[var(--up)]" : "text-[var(--down)]")}>
            {msg.text}
          </span>
        )}
      </div>
    </div>
  );
}

export function HoldingsEditor({ rows }: { rows: HoldingRow[] }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">Track a fund first, then add your holding here.</p>;
  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <HoldingForm key={r.schemeCode} row={r} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Add / remove tracked funds, with name search (owner only)

interface Lookup {
  schemeCode: number;
  schemeName: string;
  fundHouse: string;
  amfiCategory: string;
  latestNav: number | null;
  latestNavDate: string | null;
  suggested: { viewId: string | null; peerKey: string | null; benchmarkId: string | null };
  alreadyTracked: boolean;
  warnings: string[];
}

export function FundManager({ tracked }: { tracked: { schemeCode: number; name: string; lastNavDate: string | null; lastRefreshedAt: string | null }[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ schemeCode: number; schemeName: string }[] | null>(null);
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function run(label: string, fn: () => Promise<string | void>) {
    setBusy(label);
    setMsg(null);
    try {
      const t = await fn();
      if (t) setMsg({ ok: true, text: t });
    } catch (e) {
      setMsg({ ok: false, text: errText(e) });
    } finally {
      setBusy(null);
    }
  }

  const isCode = /^\d{3,7}$/.test(q.trim());
  return (
    <div className="space-y-4">
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (isCode) {
            run("lookup", async () => {
              setResults(null);
              setLookup(await api<Lookup>(`/api/funds/lookup?code=${encodeURIComponent(q.trim())}`));
            });
          } else {
            run("search", async () => {
              setLookup(null);
              const r = await api<{ results: { schemeCode: number; schemeName: string }[] }>(`/api/funds/search?q=${encodeURIComponent(q.trim())}`);
              setResults(r.results);
              if (r.results.length === 0) return "No funds matched that name.";
            });
          }
        }}
      >
        <div className="min-w-0 flex-1 space-y-1">
          <Label htmlFor="fund-q" className="text-xs">
            Fund name or scheme code
          </Label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" aria-hidden />
            <Input id="fund-q" className="pl-8" placeholder="e.g. Parag Parikh Flexi Cap or 122639" value={q} onChange={(e) => setQ(e.target.value)} required minLength={3} />
          </div>
        </div>
        <Button type="submit" disabled={busy !== null}>
          {busy === "search" || busy === "lookup" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : isCode ? "Look up" : "Search"}
        </Button>
      </form>

      {results && results.length > 0 && (
        <ul className="divide-y rounded-xl border">
          {results.map((r) => (
            <li key={r.schemeCode}>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted/50"
                onClick={() =>
                  run("lookup", async () => {
                    setLookup(await api<Lookup>(`/api/funds/lookup?code=${r.schemeCode}`));
                    setResults(null);
                  })
                }
              >
                <span>{r.schemeName}</span>
                <span className="tabular text-xs text-muted-foreground">{r.schemeCode}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {lookup && (
        <div className="space-y-2 rounded-xl border p-4">
          <div className="font-medium">{lookup.schemeName}</div>
          <div className="text-xs text-muted-foreground">
            {lookup.fundHouse} · {lookup.amfiCategory} · NAV {lookup.latestNav ?? "n/a"} on {lookup.latestNavDate ?? "n/a"} · code {lookup.schemeCode}
          </div>
          {lookup.warnings.map((w) => (
            <p key={w} className="rounded bg-[var(--tint-warning)] px-2 py-1 text-xs">
              {w}
            </p>
          ))}
          {lookup.alreadyTracked ? (
            <p className="text-sm">Already tracked.</p>
          ) : (
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={busy !== null}
                onClick={() =>
                  run("add", async () => {
                    const r = await api<{ navRowsLoaded: number }>("/api/funds", { method: "POST", body: JSON.stringify({ schemeCode: lookup.schemeCode }) });
                    setLookup(null);
                    setQ("");
                    router.refresh();
                    return `Now tracking ${lookup.schemeName} (${r.navRowsLoaded} days of NAV loaded). Benchmark and peer group were suggested from its category; change them in Settings if needed.`;
                  })
                }
              >
                {busy === "add" ? "Adding…" : "Track this fund"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setLookup(null)}>
                Cancel
              </Button>
            </div>
          )}
        </div>
      )}

      {msg && (
        <p role="status" className={cn("rounded-lg px-3 py-2 text-sm", msg.ok ? "bg-[var(--tint-good)]" : "bg-[var(--tint-critical)]")}>
          {msg.text}
        </p>
      )}

      <ul className="divide-y rounded-xl border">
        {tracked.map((f) => (
          <li key={f.schemeCode} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm">
            <div>
              <Link href={`/funds/${f.schemeCode}`} className="font-medium hover:underline">
                {f.name}
              </Link>
              <div className="text-xs text-muted-foreground">
                Latest NAV {f.lastNavDate ?? "—"} · refreshed {f.lastRefreshedAt ? new Date(f.lastRefreshedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={busy !== null}
              onClick={() => {
                if (!confirm(`Stop tracking ${f.name}? Its history and past reports are kept.`)) return;
                run(`rm-${f.schemeCode}`, async () => {
                  await api(`/api/funds/${f.schemeCode}`, { method: "DELETE" });
                  router.refresh();
                  return `Stopped tracking ${f.name}. Past reports that included it are unchanged.`;
                });
              }}
            >
              {busy === `rm-${f.schemeCode}` ? "Removing…" : "Remove"}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
