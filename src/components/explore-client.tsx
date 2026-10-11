"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Bookmark, BookmarkCheck, FileSearch, Scale, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { UniverseRow } from "@/lib/explore";
import { cn } from "@/lib/utils";

const pct = (n: number | null) => (n === null ? "—" : `${n > 0 ? "+" : ""}${n.toFixed(2)}%`);
const tone = (n: number | null) => (n === null ? "text-muted-foreground" : n > 0.004 ? "text-[var(--up)]" : n < -0.004 ? "text-[var(--down)]" : "");
const ASSET_LABEL: Record<string, string> = { equity: "Equity", index: "Index (equity)", hybrid: "Hybrid", debt: "Debt", international: "International" };
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
          <Link href={`/explore/compare?codes=${sel.join(",")}`} className="rounded-lg bg-foreground px-3 py-1.5 text-sm font-medium text-background">
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
  if (!admin)
    return (
      <Link href="/manage" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline" title="Sign in to use the watchlist">
        <Bookmark className="size-3.5" aria-hidden /> Watchlist
      </Link>
    );
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

export function FundCardExplore({ r, watched, admin, selected, onCompare, why }: { r: UniverseRow; watched: boolean; admin: boolean; selected: boolean; onCompare: () => void; why?: boolean }) {
  return (
    <article className="flex flex-col rounded-2xl border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-medium leading-snug">{r.name.replace(/\s*-\s*Direct Plan.*$/i, "")}</h3>
          <p className="text-xs text-muted-foreground">
            {r.amc} · {r.groupLabel} · {r.plan || "Direct"} plan, {r.option || "Growth"}
          </p>
        </div>
        {r.label && <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium", LABEL_TINT[r.label])}>{r.label}</span>}
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
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
      <ul className="mt-3 space-y-0.5 text-xs text-[var(--ink-secondary)]">
        <li>
          3 yrs vs category median: <span className={cn("tabular", tone(r.vsCat3))}>{r.vsCat3 === null ? "n/a" : `${r.vsCat3 > 0 ? "+" : ""}${r.vsCat3.toFixed(2)} pts`}</span>
          {r.vsRef3 !== null && (
            <>
              {" "}
              · vs reference index: <span className={cn("tabular", tone(r.vsRef3))}>{`${r.vsRef3 > 0 ? "+" : ""}${r.vsRef3.toFixed(2)} pts`}</span>
            </>
          )}
        </li>
        <li>
          Worst fall (3 yrs): <span className="tabular">{r.dd === null ? "n/a" : `${r.dd.toFixed(2)}%`}</span> · beat category median in {r.cons === null ? "n/a" : `${r.cons}%`} of 1-yr periods
        </li>
        <li>
          Typical risk for this category: {r.riskBand} · horizon {r.horizon} · expense ratio: not in our data — check the factsheet
        </li>
        <li className="text-muted-foreground">
          NAV ₹{r.nav?.toFixed(2) ?? "—"} on {r.navDate ?? "—"} · AMFI/MFapi data
        </li>
      </ul>
      {r.group === "index_nifty50" && (
        <p className="mt-2 text-xs text-[var(--ink-secondary)]">All these funds copy the same index, so differences mostly come from costs and how closely they track it.</p>
      )}
      {why && r.strengths.length > 0 && (
        <div className="mt-3 rounded-lg bg-[var(--tint-good)]/60 p-2.5 text-xs">
          <div className="font-medium">Why it is on this list</div>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {r.strengths.slice(0, 3).map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
          {r.cautions.length > 0 && <p className="mt-1 text-[var(--ink-secondary)]">Keep in mind: {r.cautions[0].toLowerCase()}.</p>}
        </div>
      )}
      <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 pt-3">
        <label className="inline-flex items-center gap-1.5 text-xs font-medium">
          <input type="checkbox" checked={selected} onChange={onCompare} /> Compare
        </label>
        <Link href={`/analyse?code=${r.code}`} className="inline-flex items-center gap-1 text-xs font-medium hover:underline">
          <FileSearch className="size-3.5" aria-hidden /> Analyse fund
        </Link>
        <WatchButton code={r.code} watched={watched} admin={admin} />
      </div>
    </article>
  );
}

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
  const [history, setHistory] = useState("3");
  const [sort, setSort] = useState("score");
  const [shown, setShown] = useState(24);

  const view = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const minYears = Number(history);
    return rows
      .filter(
        (r) =>
          (!needle || `${r.name} ${r.amc}`.toLowerCase().includes(needle)) &&
          (asset === "all" || r.assetClass === asset) &&
          (group === "all" || r.group === group) &&
          (risk === "all" || r.riskBand === risk) &&
          (horizon === "all" || r.horizonYears <= Number(horizon)) &&
          (minYears === 0 || (minYears === 3 ? r.r3 !== null : r.r5 !== null)),
      )
      .sort((a, b) => {
        const k = sort as "score" | "r1" | "r3" | "r5" | "vol" | "dd" | "cons";
        const av = a[k];
        const bv = b[k];
        if (av === null) return 1;
        if (bv === null) return -1;
        return k === "vol" ? av - bv : bv - av;
      });
  }, [rows, q, asset, group, risk, horizon, history, sort]);

  const sel = (id: string, label: string, value: string, set: (v: string) => void, opts: [string, string][]) => (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <select
        id={id}
        value={value}
        onChange={(e) => {
          set(e.target.value);
          setShown(24);
        }}
        className="h-9 w-full rounded-md border bg-background px-2 text-sm"
      >
        {opts.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-lg font-semibold">Funds worth exploring</h2>
        <p className="mb-3 text-sm text-[var(--ink-secondary)]">A short list to research further — chosen for long-term consistency within each category, not for last year&apos;s return.</p>
        {shortlist.length ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {shortlist.map((r) => (
              <FundCardExplore key={r.code} r={r} watched={watched.includes(r.code)} admin={admin} selected={cmp.sel.includes(r.code)} onCompare={() => cmp.toggle(r.code)} why />
            ))}
          </div>
        ) : (
          <p className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">No fund currently meets the shortlist bar for your preferences. Browse all funds below.</p>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold">Browse all funds</h2>
        <p className="mb-3 text-sm text-[var(--ink-secondary)]">
          {rows.length} Direct-Growth schemes across {groups.length} categories, from AMFI&apos;s list. Funds are only ranked against their own category.
        </p>
        <div className="grid gap-3 rounded-2xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="ex-q" className="text-xs">
              Fund or fund house
            </Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" aria-hidden />
              <Input
                id="ex-q"
                className="pl-8"
                placeholder="e.g. Parag Parikh, HDFC, Nifty 50"
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setShown(24);
                }}
              />
            </div>
          </div>
          {sel("ex-asset", "Type", asset, setAsset, [["all", "All types"], ...Object.entries(ASSET_LABEL)] as [string, string][])}
          {sel("ex-group", "Category", group, setGroup, [["all", "All categories"], ...groups.map((g) => [g.key, g.label] as [string, string])])}
          {sel("ex-risk", "Typical risk", risk, setRisk, [["all", "Any"], ["Lower", "Lower"], ["Moderate", "Moderate"], ["Higher", "Higher"], ["Highest", "Highest"]])}
          {sel("ex-horizon", "My horizon", horizon, setHorizon, [["all", "Any"], ["1", "Up to 1 year"], ["3", "Up to 3 years"], ["5", "Up to 5 years"], ["7", "7+ years"]])}
          {sel("ex-history", "Track record", history, setHistory, [["0", "Any history"], ["3", "At least 3 years"], ["5", "At least 5 years"]])}
          {sel("ex-sort", "Sort by", sort, setSort, [["score", "Research score"], ["cons", "Consistency"], ["r3", "3-year return"], ["r5", "5-year return"], ["r1", "1-year return"], ["vol", "Lowest volatility"], ["dd", "Smallest worst fall"]])}
        </div>
        <p className="mt-3 text-xs text-muted-foreground" role="status">
          {view.length} matching fund{view.length === 1 ? "" : "s"}
        </p>
        {view.length === 0 ? (
          <p className="mt-2 rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">No funds match. Loosen a filter.</p>
        ) : (
          <>
            <div className="mt-2 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {view.slice(0, shown).map((r) => (
                <FundCardExplore key={r.code} r={r} watched={watched.includes(r.code)} admin={admin} selected={cmp.sel.includes(r.code)} onCompare={() => cmp.toggle(r.code)} />
              ))}
            </div>
            {shown < view.length && (
              <div className="mt-4 text-center">
                <Button variant="outline" onClick={() => setShown((s) => s + 24)}>
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
                className={cn("rounded-full border px-2.5 py-1 text-xs", on ? "border-foreground bg-foreground text-background" : "hover:bg-muted")}
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
