"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Bookmark, BookmarkCheck, FileSearch, Scale, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Term } from "@/components/term";
import type { UniverseRow } from "@/lib/explore";
import { cn } from "@/lib/utils";

const pct = (n: number | null) => (n === null ? "—" : `${n > 0 ? "+" : ""}${n.toFixed(2)}%`);
const tone = (n: number | null) => (n === null ? "text-muted-foreground" : n > 0.004 ? "text-[var(--up)]" : n < -0.004 ? "text-[var(--down)]" : "");
const LABEL_TINT: Record<string, string> = {
  "Strong historical consistency": "bg-[var(--tint-good)]",
  "Worth researching": "bg-[var(--tint-good)]",
  "Mixed record": "bg-muted",
  "Insufficient history": "bg-[var(--tint-warning)]",
};

async function api(url: string, init?: RequestInit) {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json" } });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error ?? `Request failed (${res.status})`);
  return j;
}

// ---------------------------------------------------------------------------------------------
// Compare selection (shared by shortlist cards and the browser)

function useCompare() {
  const [sel, setSel] = useState<number[]>([]);
  const toggle = (code: number) => setSel((s) => (s.includes(code) ? s.filter((c) => c !== code) : s.length >= 4 ? s : [...s, code]));
  return { sel, toggle, clear: () => setSel([]) };
}

function CompareBar({ sel, rows, clear, toggle }: { sel: number[]; rows: UniverseRow[]; clear: () => void; toggle: (c: number) => void }) {
  if (sel.length === 0) return null;
  return (
    <div className="sticky bottom-3 z-20 mt-4 flex flex-wrap items-center gap-2 rounded-2xl border bg-card p-3 shadow-lg">
      <Scale className="size-4 text-[var(--ink-secondary)]" aria-hidden />
      <span className="text-sm font-medium">Compare ({sel.length}/4):</span>
      {sel.map((c) => (
        <span key={c} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs">
          {rows.find((r) => r.code === c)?.name.replace(/\s*-\s*Direct.*$/i, "").slice(0, 28) ?? c}
          <button type="button" aria-label="Remove from comparison" onClick={() => toggle(c)}>
            <X className="size-3" aria-hidden />
          </button>
        </span>
      ))}
      <div className="ml-auto flex gap-2">
        <Button size="sm" variant="ghost" onClick={clear}>
          Clear
        </Button>
        {sel.length >= 2 ? (
          <Link href={`/explore/compare?codes=${sel.join(",")}`} className="rounded-lg bg-brand text-white dark:text-[var(--page)] px-3 py-1.5 text-sm font-medium">
            Compare side by side
          </Link>
        ) : (
          <span className="text-xs text-muted-foreground">Pick at least 2</span>
        )}
      </div>
    </div>
  );
}

function WatchButton({ code, watched, admin }: { code: number; watched: boolean; admin: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!admin) return null;
  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        disabled={busy}
        aria-pressed={watched}
        onClick={async () => {
          setBusy(true);
          setErr(null);
          try {
            await api(watched ? `/api/watchlist/${code}` : "/api/watchlist", watched ? { method: "DELETE" } : { method: "POST", body: JSON.stringify({ schemeCode: code, source: "explore" }) });
            router.refresh();
          } catch (e) {
            setErr(e instanceof Error ? e.message : "Failed");
          } finally {
            setBusy(false);
          }
        }}
        className="inline-flex items-center gap-1 text-xs font-medium hover:underline"
      >
        {watched ? <BookmarkCheck className="size-3.5" aria-hidden /> : <Bookmark className="size-3.5" aria-hidden />}
        {busy ? "Saving…" : watched ? "On watchlist" : "Add to watchlist"}
      </button>
      {err && <span className="text-xs text-[var(--down)]">{err}</span>}
    </span>
  );
}

// ---------------------------------------------------------------------------------------------
// Fund card: one headline number, a few friendly facts, details one tap away.

const ASSET_EMOJI: Record<string, string> = { equity: "📈", index: "🧩", hybrid: "⚖️", debt: "🛟", international: "🌎" };
const ASSET_GRADIENT: Record<string, [string, string]> = {
  equity: ["#f97316", "#ec4899"],
  index: ["#6366f1", "#8b5cf6"],
  hybrid: ["#f59e0b", "#10b981"],
  debt: ["#0ea5e9", "#14b8a6"],
  international: ["#8b5cf6", "#06b6d4"],
};
const RISK_DOT: Record<string, string> = { Lower: "🟢", Moderate: "🟡", Higher: "🟠", Highest: "🔴" };

export function FundCardExplore({ r, watched, admin, selected, onCompare, why }: { r: UniverseRow; watched: boolean; admin: boolean; selected: boolean; onCompare: () => void; why?: boolean }) {
  const [a, b] = ASSET_GRADIENT[r.assetClass] ?? ["#64748b", "#0f766e"];
  const headline = r.r3 !== null ? { label: "a year, over 3 years", v: r.r3 } : r.r1 !== null ? { label: "over the last year", v: r.r1 } : null;
  return (
    <article className={cn("lift flex flex-col rounded-3xl border bg-card p-5 shadow-card", selected && "ring-2 ring-brand")}>
      <div className="flex items-start gap-3">
        <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-2xl text-xl" style={{ background: `linear-gradient(135deg, ${a}, ${b})` }}>
          {ASSET_EMOJI[r.assetClass] ?? "💼"}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold leading-snug">{r.name.replace(/\s*-\s*Direct Plan.*$/i, "")}</h3>
          <p className="truncate text-xs text-muted-foreground">
            {r.amc} · {r.groupLabel}
          </p>
        </div>
      </div>

      <div className="mt-4 flex items-end justify-between gap-2">
        <div>
          <div className={cn("font-display text-2xl font-bold tabular", tone(headline?.v ?? null))}>{headline ? pct(headline.v) : "—"}</div>
          <div className="text-xs text-muted-foreground">{headline ? headline.label : "not enough history yet"}</div>
        </div>
        {r.label && <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-medium", LABEL_TINT[r.label])}>{r.label}</span>}
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
        <span className="rounded-full bg-muted px-2 py-0.5">
          {RISK_DOT[r.riskBand]} {r.riskBand} risk
        </span>
        <span className="rounded-full bg-muted px-2 py-0.5">⏳ {r.horizon}</span>
        {r.cons !== null && <span className="rounded-full bg-muted px-2 py-0.5">🎯 beat similar funds {r.cons}% of the time</span>}
        {r.dd !== null && <span className="rounded-full bg-muted px-2 py-0.5">📉 worst fall {r.dd.toFixed(1)}%</span>}
      </div>

      {why && r.strengths.length > 0 && <p className="mt-3 rounded-2xl bg-[var(--tint-good)] px-3 py-2 text-xs leading-relaxed">✅ {r.strengths[0]}</p>}

      <details className="group mt-3 text-xs">
        <summary className="cursor-pointer list-none font-medium text-[var(--ink-secondary)] hover:text-foreground [&::-webkit-details-marker]:hidden">
          <span className="group-open:hidden">More details ▾</span>
          <span className="hidden group-open:inline">Less ▴</span>
        </summary>
        <dl className="mt-2 grid grid-cols-3 gap-2 text-center">
          {(
            [
              ["1 year", r.r1],
              ["3 yrs / yr", r.r3],
              ["5 yrs / yr", r.r5],
            ] as const
          ).map(([k, v]) => (
            <div key={k} className="rounded-lg bg-muted/50 py-1.5">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className={cn("tabular font-medium", tone(v))}>{pct(v)}</dd>
            </div>
          ))}
        </dl>
        <ul className="mt-2 space-y-0.5 text-[var(--ink-secondary)]">
          <li>
            3 yrs vs <Term slug="category-median">middle fund in its category</Term>: <span className={cn("tabular", tone(r.vsCat3))}>{r.vsCat3 === null ? "n/a" : `${r.vsCat3 > 0 ? "+" : ""}${r.vsCat3.toFixed(2)} pts`}</span>
          </li>
          {r.cautions[0] && <li>Keep in mind: {r.cautions[0].toLowerCase()}.</li>}
          <li className="text-muted-foreground">
            NAV ₹{r.nav?.toFixed(2) ?? "—"} on {r.navDate ?? "—"} · expense ratio: check the factsheet
          </li>
        </ul>
      </details>

      <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
        <button
          type="button"
          aria-pressed={selected}
          onClick={onCompare}
          className={cn("inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium", selected ? "border-transparent bg-brand text-white dark:text-[var(--page)]" : "hover:bg-muted")}
        >
          <Scale className="size-3.5" aria-hidden /> {selected ? "Comparing" : "Compare"}
        </button>
        <Link href={`/analyse?code=${r.code}`} className="inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium hover:bg-muted">
          <FileSearch className="size-3.5" aria-hidden /> Analyse
        </Link>
        <WatchButton code={r.code} watched={watched} admin={admin} />
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------------------------
// Workspace: chips instead of dropdowns.

type Chip = { id: string; label: string };

function ChipRow({ label, chips, value, onChange }: { label: string; chips: Chip[]; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <div className="mb-1.5 text-xs font-medium text-muted-foreground">{label}</div>
      <div role="radiogroup" aria-label={label} className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {chips.map((c) => (
          <button
            key={c.id}
            type="button"
            role="radio"
            aria-checked={value === c.id}
            onClick={() => onChange(c.id)}
            className={cn("shrink-0 rounded-full border px-3.5 py-1.5 text-sm", value === c.id ? "border-transparent bg-foreground text-background" : "bg-card text-[var(--ink-secondary)] hover:bg-muted")}
          >
            {c.label}
          </button>
        ))}
      </div>
    </div>
  );
}

const TYPE_CHIPS: Chip[] = [
  { id: "all", label: "✨ All" },
  { id: "equity", label: "📈 Shares" },
  { id: "index", label: "🧩 Index" },
  { id: "hybrid", label: "⚖️ Mixed" },
  { id: "debt", label: "🛟 Bonds" },
  { id: "international", label: "🌎 Abroad" },
];
const RISK_CHIPS: Chip[] = [
  { id: "all", label: "Any" },
  { id: "Lower", label: "🟢 Lower" },
  { id: "Moderate", label: "🟡 Moderate" },
  { id: "Higher", label: "🟠 Higher" },
  { id: "Highest", label: "🔴 Highest" },
];
const HORIZON_CHIPS: Chip[] = [
  { id: "all", label: "Any time" },
  { id: "1", label: "Within a year" },
  { id: "3", label: "1–3 years" },
  { id: "5", label: "3–5 years" },
  { id: "99", label: "5+ years" },
];
const SORT_CHIPS: Chip[] = [
  { id: "score", label: "⭐ Best overall" },
  { id: "cons", label: "🎯 Most consistent" },
  { id: "r3", label: "📈 Highest 3-yr return" },
  { id: "dd", label: "🛡️ Smallest falls" },
  { id: "vol", label: "😌 Steadiest" },
];

export function ExploreWorkspace({
  rows,
  shortlist,
  watched,
  admin,
  groups,
}: {
  rows: UniverseRow[];
  shortlist: UniverseRow[];
  watched: number[];
  admin: boolean;
  groups: { key: string; label: string }[];
}) {
  const cmp = useCompare();
  const [q, setQ] = useState("");
  const [asset, setAsset] = useState("all");
  const [group, setGroup] = useState("all");
  const [risk, setRisk] = useState("all");
  const [horizon, setHorizon] = useState("all");
  const [sort, setSort] = useState("score");
  const [shown, setShown] = useState(12);

  const groupChips = useMemo(() => {
    const keys = new Set(rows.filter((r) => asset === "all" || r.assetClass === asset).map((r) => r.group));
    return [{ id: "all", label: "All" }, ...groups.filter((g) => keys.has(g.key)).map((g) => ({ id: g.key, label: g.label.replace(/\s*funds?\b/i, "").replace(/\s*\(.*\)/, "") }))];
  }, [rows, groups, asset]);

  const view = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const h = Number(horizon);
    return rows
      .filter(
        (r) =>
          (!needle || `${r.name} ${r.amc}`.toLowerCase().includes(needle)) &&
          (asset === "all" || r.assetClass === asset) &&
          (group === "all" || r.group === group) &&
          (risk === "all" || r.riskBand === risk) &&
          (horizon === "all" || (h === 99 ? r.horizonYears >= 5 : h === 1 ? r.horizonYears <= 1 : r.horizonYears <= h && r.horizonYears > (h === 3 ? 1 : 3))),
      )
      .sort((a, b) => {
        const k = sort as "score" | "r3" | "vol" | "dd" | "cons";
        const av = a[k];
        const bv = b[k];
        if (av === null) return 1;
        if (bv === null) return -1;
        return k === "vol" ? av - bv : bv - av;
      });
  }, [rows, q, asset, group, risk, horizon, sort]);

  const reset = (fn: (v: string) => void) => (v: string) => {
    fn(v);
    setShown(12);
  };

  return (
    <div className="space-y-10">
      {shortlist.length > 0 && (
        <section>
          <h2 className="text-xl font-bold">
            Top picks to research <span aria-hidden>⭐</span>
          </h2>
          <p className="mb-4 text-sm text-muted-foreground">Chosen for steady long-term records within their own category — not last year&apos;s winners.</p>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {shortlist.map((r) => (
              <FundCardExplore key={r.code} r={r} watched={watched.includes(r.code)} admin={admin} selected={cmp.sel.includes(r.code)} onCompare={() => cmp.toggle(r.code)} why />
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="text-xl font-bold">Find a fund</h2>
        <p className="mb-4 text-sm text-muted-foreground">{rows.length} funds · tap to filter</p>
        <div className="space-y-4 rounded-3xl border bg-card p-5 shadow-card">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" aria-hidden />
            <Input
              aria-label="Search by fund or fund house"
              className="rounded-full pl-9"
              placeholder="Search e.g. Parag Parikh, HDFC, Nifty 50"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setShown(12);
              }}
            />
          </div>
          <ChipRow
            label="What it invests in"
            chips={TYPE_CHIPS}
            value={asset}
            onChange={(v) => {
              reset(setAsset)(v);
              setGroup("all");
            }}
          />
          {groupChips.length > 2 && <ChipRow label="Category" chips={groupChips} value={group} onChange={reset(setGroup)} />}
          <ChipRow label="How much ups and downs" chips={RISK_CHIPS} value={risk} onChange={reset(setRisk)} />
          <ChipRow label="When I need the money" chips={HORIZON_CHIPS} value={horizon} onChange={reset(setHorizon)} />
          <ChipRow label="Show first" chips={SORT_CHIPS} value={sort} onChange={reset(setSort)} />
        </div>

        <p className="mt-4 text-sm text-muted-foreground" role="status">
          {view.length} matching fund{view.length === 1 ? "" : "s"}
        </p>
        {view.length === 0 ? (
          <p className="mt-2 rounded-3xl border border-dashed p-8 text-center text-sm text-muted-foreground">No funds match. Try removing a filter.</p>
        ) : (
          <>
            <div className="mt-3 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {view.slice(0, shown).map((r) => (
                <FundCardExplore key={r.code} r={r} watched={watched.includes(r.code)} admin={admin} selected={cmp.sel.includes(r.code)} onCompare={() => cmp.toggle(r.code)} />
              ))}
            </div>
            {shown < view.length && (
              <div className="mt-5 text-center">
                <Button variant="outline" className="rounded-full" onClick={() => setShown((s) => s + 12)}>
                  Show more ({view.length - shown} left)
                </Button>
              </div>
            )}
          </>
        )}
      </section>

      <CompareBar sel={cmp.sel} rows={rows} clear={cmp.clear} toggle={cmp.toggle} />
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// SIP preferences questionnaire (owner)

export function PreferencesForm({
  initial,
  groups,
}: {
  initial: { goal: string | null; horizonYears: number | null; monthlyBudget: number | null; riskComfort: string | null; preferredGroups: string[] };
  groups: { key: string; label: string }[];
}) {
  const router = useRouter();
  const [v, setV] = useState({
    goal: initial.goal ?? "",
    horizonYears: initial.horizonYears?.toString() ?? "",
    monthlyBudget: initial.monthlyBudget?.toString() ?? "",
    riskComfort: initial.riskComfort ?? "",
    preferredGroups: initial.preferredGroups,
  });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setMsg(null);
        try {
          await api("/api/preferences", { method: "PUT", body: JSON.stringify({ ...v, goal: v.goal || null, riskComfort: v.riskComfort || null }) });
          setMsg({ ok: true, text: "Saved — the shortlist now follows these preferences." });
          router.refresh();
        } catch (err) {
          setMsg({ ok: false, text: err instanceof Error ? err.message : "Failed" });
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="space-y-1">
          <Label htmlFor="p-goal" className="text-xs">
            Goal
          </Label>
          <select id="p-goal" value={v.goal} onChange={(e) => setV({ ...v, goal: e.target.value })} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
            <option value="">Not specified</option>
            <option value="wealth">Build long-term wealth</option>
            <option value="retirement">Retirement</option>
            <option value="house">Buy a house</option>
            <option value="education">Education</option>
            <option value="emergency">Emergency fund</option>
            <option value="other">Something else</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="p-h" className="text-xs">
            Years until I need the money
          </Label>
          <Input id="p-h" inputMode="numeric" placeholder="e.g. 7" value={v.horizonYears} onChange={(e) => setV({ ...v, horizonYears: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="p-b" className="text-xs">
            Monthly SIP budget (₹)
          </Label>
          <Input id="p-b" inputMode="numeric" placeholder="e.g. 5000" value={v.monthlyBudget} onChange={(e) => setV({ ...v, monthlyBudget: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="p-r" className="text-xs">
            Comfort with ups and downs
          </Label>
          <select id="p-r" value={v.riskComfort} onChange={(e) => setV({ ...v, riskComfort: e.target.value })} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
            <option value="">Not specified</option>
            <option value="low">Low — I want steadiness</option>
            <option value="medium">Medium — some swings are fine</option>
            <option value="high">High — I can sit through big falls</option>
          </select>
        </div>
      </div>
      <fieldset>
        <legend className="text-xs font-medium">Categories I&apos;m interested in (optional)</legend>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {groups.map((g) => {
            const on = v.preferredGroups.includes(g.key);
            return (
              <button
                key={g.key}
                type="button"
                aria-pressed={on}
                onClick={() => setV({ ...v, preferredGroups: on ? v.preferredGroups.filter((x) => x !== g.key) : [...v.preferredGroups, g.key] })}
                className={cn("rounded-full border px-2.5 py-1 text-xs", on ? "border-brand bg-brand text-white dark:text-[var(--page)]" : "hover:bg-muted")}
              >
                {g.label}
              </button>
            );
          })}
        </div>
      </fieldset>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save preferences"}
        </Button>
        {msg && (
          <span role="status" className={cn("text-sm", msg.ok ? "text-[var(--up)]" : "text-[var(--down)]")}>
            {msg.text}
          </span>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Used only to filter and explain the shortlist. The monthly budget is noted but not used to filter, because verified minimum SIP amounts are not in our data. This is not
        a suitability assessment.
      </p>
    </form>
  );
}
