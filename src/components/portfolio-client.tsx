"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Loader2, Search } from "lucide-react";
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
const tone = (n: number | null) => (n === null ? "text-muted-foreground" : n > 0.004 ? "text-[var(--up)]" : n < -0.004 ? "text-[var(--down)]" : "");

// ---------------------------------------------------------------------------------------------
// Period comparison: one period at a time (week / month / this year), every column switches.

export type Period = "1W" | "1M" | "YTD";

export interface CompareRow {
  schemeCode: number;
  name: string;
  kind: string;
  kindLabel: string;
  emoji: string;
  nav: number | null;
  navDate: string | null;
  stale: boolean;
  ret: Record<Period, number | null>;
  bench: Record<Period, number | null>;
  peer: Record<Period, number | null>;
  vsBench: Record<Period, number | null>;
  vsPeer: Record<Period, number | null>;
  from: Record<Period, string | null>;
  benchmark: string | null;
}

const PERIODS: { id: Period; label: string; long: string }[] = [
  { id: "1W", label: "This week", long: "over the last week" },
  { id: "1M", label: "This month", long: "over the last month" },
  { id: "YTD", label: "This year", long: "since 1 January" },
];

function verdict(r: CompareRow, p: Period): { text: string; tone: "good" | "bad" | "neutral" | "none" } {
  const g = r.benchmark ? r.vsBench[p] : null;
  const s = r.vsPeer[p];
  const word = (x: number) => (Math.abs(x) < 0.25 ? "level with" : x > 0 ? `${Math.abs(x).toFixed(2)} pts ahead of` : `${Math.abs(x).toFixed(2)} pts behind`);
  if (s === null && g === null) return { text: "No comparison available", tone: "none" };
  const parts = [g !== null ? `${word(g)} its index` : null, s !== null ? `${word(s)} similar funds` : null].filter(Boolean);
  const worst = Math.min(g ?? Infinity, s ?? Infinity);
  const best = Math.max(g ?? -Infinity, s ?? -Infinity);
  return { text: parts.join(", "), tone: worst <= -1 ? "bad" : best >= 0.25 && worst > -0.25 ? "good" : "neutral" };
}

function Bar({ value, max, color, label }: { value: number | null; max: number; color: string; label: string }) {
  const w = value === null || max === 0 ? 0 : Math.min(50, (Math.abs(value) / max) * 50);
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className="w-16 shrink-0 text-muted-foreground">{label}</span>
      <div className="relative h-2.5 flex-1 rounded-full bg-muted">
        <span aria-hidden className="absolute inset-y-0 left-1/2 w-px bg-[var(--axis)]" />
        {value !== null && (
          <span
            className="absolute inset-y-0 rounded-full"
            style={{ background: color, width: `${w}%`, left: value >= 0 ? "50%" : `${50 - w}%` }}
          />
        )}
      </div>
      <span className={cn("tabular w-14 shrink-0 text-right font-medium", tone(value))}>{pct(value)}</span>
    </div>
  );
}

export function ComparisonTable({ rows }: { rows: CompareRow[] }) {
  const [period, setPeriod] = useState<Period>("1W");
  const [kind, setKind] = useState("all");
  const [order, setOrder] = useState<"best" | "worst" | "name">("best");
  const kinds = useMemo(() => [...new Map(rows.map((r) => [r.kind, { id: r.kind, label: r.kindLabel, emoji: r.emoji }])).values()], [rows]);

  const view = useMemo(
    () =>
      rows
        .filter((r) => kind === "all" || r.kind === kind)
        .sort((a, b) => {
          if (order === "name") return a.name.localeCompare(b.name);
          const x = a.ret[period];
          const y = b.ret[period];
          if (x === null) return 1;
          if (y === null) return -1;
          return order === "best" ? y - x : x - y;
        }),
    [rows, kind, order, period],
  );
  const max = Math.max(0.5, ...view.flatMap((r) => [r.ret[period], r.bench[period], r.peer[period]].filter((v): v is number => v !== null).map(Math.abs)));
  const from = view.find((r) => r.from[period])?.from[period] ?? null;
  const p = PERIODS.find((x) => x.id === period)!;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Comparison period" className="inline-flex rounded-full border bg-card p-1 shadow-card">
          {PERIODS.map((x) => (
            <button
              key={x.id}
              type="button"
              role="tab"
              aria-selected={period === x.id}
              onClick={() => setPeriod(x.id)}
              className={cn("rounded-full px-4 py-1.5 text-sm font-medium transition-colors", period === x.id ? "bg-brand text-white dark:text-[var(--page)]" : "text-[var(--ink-secondary)] hover:bg-muted")}
            >
              {x.label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Sort</span>
          <select value={order} onChange={(e) => setOrder(e.target.value as typeof order)} className="h-9 rounded-full border bg-card px-3 text-sm">
            <option value="best">Best first</option>
            <option value="worst">Worst first</option>
            <option value="name">A–Z</option>
          </select>
        </label>
      </div>

      <div role="tablist" aria-label="Kind of fund" className="no-scrollbar -mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1">
        {[{ id: "all", label: "All funds", emoji: "✨" }, ...kinds].map((k) => (
          <button
            key={k.id}
            type="button"
            role="tab"
            aria-selected={kind === k.id}
            onClick={() => setKind(k.id)}
            className={cn("shrink-0 rounded-full border px-3.5 py-1.5 text-sm", kind === k.id ? "border-transparent bg-foreground text-background" : "bg-card text-[var(--ink-secondary)] hover:bg-muted")}
          >
            <span aria-hidden>{k.emoji}</span> {k.label}
          </button>
        ))}
      </div>

      <p className="mt-3 text-sm text-[var(--ink-secondary)]" role="status">
        Showing returns <strong className="text-foreground">{p.long}</strong>
        {from ? ` (from ${from})` : ""}, next to each fund&apos;s index and the average of similar funds.
      </p>

      <ul className="mt-3 grid gap-3 lg:grid-cols-2">
        {view.map((r) => {
          const v = verdict(r, period);
          return (
            <li key={r.schemeCode}>
              <Link href={`/funds/${r.schemeCode}`} className="lift block rounded-3xl border bg-card p-5 shadow-card">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <span aria-hidden className="text-2xl">
                      {r.emoji}
                    </span>
                    <div className="min-w-0">
                      <div className="font-semibold leading-snug">{r.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {r.kindLabel} · NAV {r.nav === null ? "—" : `₹${r.nav.toFixed(2)}`}
                        {r.navDate ? ` on ${r.navDate}` : ""}
                        {r.stale && <span className="text-[var(--down)]"> · price is old</span>}
                      </div>
                    </div>
                  </div>
                  <div className={cn("font-display shrink-0 text-2xl font-bold tabular", tone(r.ret[period]))}>{pct(r.ret[period])}</div>
                </div>
                <div className="mt-4 space-y-1.5">
                  <Bar label="Your fund" value={r.ret[period]} max={max} color="var(--brand)" />
                  {r.benchmark ? <Bar label="Its index" value={r.bench[period]} max={max} color="var(--series-2)" /> : <p className="text-[11px] text-muted-foreground">No free index feed for this fund — compared with similar funds only.</p>}
                  <Bar label="Similar" value={r.peer[period]} max={max} color="var(--series-3)" />
                </div>
                <p className={cn("mt-3 text-sm", v.tone === "good" && "text-[var(--up)]", v.tone === "bad" && "text-[var(--down)]", v.tone === "none" && "text-muted-foreground")}>{v.text}</p>
              </Link>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-xs text-muted-foreground">
        &ldquo;pts&rdquo; = percentage points: the gap between two returns. Index = the market index the fund is compared with (price version); similar funds = average of comparable
        Direct-Growth funds. Tap a fund for its full page.
      </p>
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
