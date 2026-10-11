"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FundSearch } from "@/components/fund-search";
import { cn } from "@/lib/utils";

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error ?? j.detail ?? `Request failed (${res.status})`);
  return j as T;
}
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

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

  return (
    <div className="space-y-4">
      <FundSearch
        label="Fund name or scheme code"
        placeholder="Type a fund name (e.g. Parag Parikh Flexi Cap) or a scheme code"
        disabled={busy !== null}
        onPick={(h) =>
          run("lookup", async () => {
            setLookup(await api<Lookup>(`/api/funds/lookup?code=${h.schemeCode}`));
          })
        }
      />
      {busy === "lookup" && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden /> Loading fund details…
        </p>
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
