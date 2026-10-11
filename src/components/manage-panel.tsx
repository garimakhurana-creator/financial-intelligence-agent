"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { TrackedFund } from "@/lib/db/repo";

interface Option {
  id: string;
  label: string;
}
interface Options {
  views: Option[];
  peers: Option[];
  benchmarks: Option[];
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error ?? j.detail ?? `Request failed (${res.status})`);
  return j as T;
}

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function LoginForm() {
  const router = useRouter();
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="max-w-sm space-y-3 rounded-xl border bg-card p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErr(null);
        try {
          await api("/api/admin/login", { method: "POST", body: JSON.stringify({ password: pw }) });
          router.refresh();
        } catch (e) {
          setErr(errText(e));
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2 className="font-semibold">Owner sign-in</h2>
      <p className="text-sm text-muted-foreground">Viewing is public. Changing funds, generating reports and sending messages require the owner password.</p>
      <div className="space-y-1.5">
        <Label htmlFor="pw">Password</Label>
        <Input id="pw" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} required />
      </div>
      {err && (
        <p role="alert" className="text-sm text-[var(--down)]">
          {err}
        </p>
      )}
      <Button type="submit" disabled={busy}>
        {busy ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}

export function LogoutButton() {
  const router = useRouter();
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={async () => {
        await fetch("/api/admin/logout", { method: "POST" });
        router.refresh();
      }}
    >
      Sign out
    </Button>
  );
}

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

function Select({ id, value, onChange, options, none }: { id: string; value: string; onChange: (v: string) => void; options: Option[]; none: string }) {
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
      <option value="">{none}</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function ManagePanel({ funds, options }: { funds: TrackedFund[]; options: Options }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [mapping, setMapping] = useState({ viewId: "", peerKey: "", benchmarkId: "" });
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const active = funds.filter((f) => f.active);
  const removed = funds.filter((f) => !f.active);

  async function run(label: string, fn: () => Promise<string>) {
    setBusy(label);
    setMsg(null);
    try {
      setMsg({ ok: true, text: await fn() });
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: errText(e) });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-8">
      {msg && (
        <div role="status" className={`rounded-lg border px-4 py-3 text-sm ${msg.ok ? "bg-[var(--tint-good)]" : "bg-[var(--tint-critical)]"}`}>
          {msg.text}
        </div>
      )}

      <section className="rounded-xl border bg-card p-5">
        <h2 className="font-semibold">Add a fund</h2>
        <p className="text-sm text-muted-foreground">
          Enter an AMFI scheme code (e.g. 120716). Find codes on{" "}
          <a className="underline" href="https://www.mfapi.in/" target="_blank" rel="noopener noreferrer">
            mfapi.in
          </a>
          .
        </p>
        <form
          className="mt-3 flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            run("lookup", async () => {
              const r = await api<Lookup>(`/api/funds/lookup?code=${encodeURIComponent(code.trim())}`);
              setLookup(r);
              setMapping({ viewId: r.suggested.viewId ?? "", peerKey: r.suggested.peerKey ?? "", benchmarkId: r.suggested.benchmarkId ?? "" });
              return r.alreadyTracked ? `${r.schemeName} is already tracked.` : `Found: ${r.schemeName}. Check the mapping below and confirm.`;
            });
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="code">Scheme code</Label>
            <Input id="code" inputMode="numeric" pattern="\d{3,7}" placeholder="120716" value={code} onChange={(e) => setCode(e.target.value)} className="w-40" required />
          </div>
          <Button type="submit" disabled={busy !== null}>
            {busy === "lookup" ? "Looking up…" : "Look up"}
          </Button>
        </form>

        {lookup && !lookup.alreadyTracked && (
          <div className="mt-4 space-y-3 rounded-lg border p-4">
            <div>
              <div className="font-medium">{lookup.schemeName}</div>
              <div className="text-xs text-muted-foreground">
                {lookup.fundHouse} · {lookup.amfiCategory} · latest NAV {lookup.latestNav ?? "n/a"} on {lookup.latestNavDate ?? "n/a"}
              </div>
            </div>
            {lookup.warnings.length > 0 && (
              <ul className="space-y-1 text-xs">
                {lookup.warnings.map((w) => (
                  <li key={w} className="rounded bg-[var(--tint-warning)] px-2 py-1">
                    {w}
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-muted-foreground">These were suggested from the fund&apos;s category — change them if they don&apos;t fit. Benchmark should match the scheme factsheet.</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="view">Category view</Label>
                <Select id="view" value={mapping.viewId} onChange={(v) => setMapping({ ...mapping, viewId: v })} options={options.views} none="None" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="peer">Peer group</Label>
                <Select id="peer" value={mapping.peerKey} onChange={(v) => setMapping({ ...mapping, peerKey: v })} options={options.peers} none="No peer comparison" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bench">Benchmark index</Label>
                <Select id="bench" value={mapping.benchmarkId} onChange={(v) => setMapping({ ...mapping, benchmarkId: v })} options={options.benchmarks} none="No benchmark feed" />
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                disabled={busy !== null}
                onClick={() =>
                  run("add", async () => {
                    const r = await api<{ navRowsLoaded: number }>("/api/funds", {
                      method: "POST",
                      body: JSON.stringify({ schemeCode: lookup.schemeCode, viewId: mapping.viewId || null, peerKey: mapping.peerKey || null, benchmarkId: mapping.benchmarkId || null }),
                    });
                    setLookup(null);
                    setCode("");
                    return `Added ${lookup.schemeName} and loaded ${r.navRowsLoaded} days of NAV history. Peer averages for it are computed on the next refresh or report.`;
                  })
                }
              >
                {busy === "add" ? "Adding…" : "Confirm and add"}
              </Button>
              <Button variant="ghost" onClick={() => setLookup(null)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-xl border bg-card p-5">
        <h2 className="font-semibold">Tracked funds ({active.length})</h2>
        <ul className="mt-3 divide-y">
          {active.map((f) => (
            <li key={f.schemeCode} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <div>
                <Link href={`/funds/${f.schemeCode}`} className="font-medium hover:underline">
                  {f.schemeName}
                </Link>
                <div className="text-xs text-muted-foreground">
                  {f.schemeCode} · view: {options.views.find((v) => v.id === f.viewId)?.label ?? "none"} · peers: {options.peers.find((p) => p.id === f.peerKey)?.label ?? "none"} · benchmark:{" "}
                  {options.benchmarks.find((b) => b.id === f.benchmarkId)?.label ?? "none"}
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={busy !== null}
                onClick={() => {
                  if (!confirm(`Stop tracking ${f.schemeName}? Its history and past reports are kept.`)) return;
                  run(`rm-${f.schemeCode}`, async () => {
                    await api(`/api/funds/${f.schemeCode}`, { method: "DELETE" });
                    return `Removed ${f.schemeName}. Past reports that included it are unchanged.`;
                  });
                }}
              >
                {busy === `rm-${f.schemeCode}` ? "Removing…" : "Remove"}
              </Button>
            </li>
          ))}
        </ul>
        {removed.length > 0 && <p className="mt-3 text-xs text-muted-foreground">Previously tracked: {removed.map((f) => f.schemeName).join("; ")}</p>}
      </section>

      <section className="rounded-xl border bg-card p-5">
        <h2 className="font-semibold">Reports and jobs</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            disabled={busy !== null}
            onClick={() =>
              run("generate", async () => {
                const r = await api<{ id: string; generator: string; notes: string[] }>("/api/reports/generate", { method: "POST", body: JSON.stringify({ refresh: true }) });
                router.push(`/reports/${r.id}`);
                return `Report generated (${r.generator}).${r.notes.length ? ` Notes: ${r.notes.join("; ")}` : ""}`;
              })
            }
          >
            {busy === "generate" ? "Refreshing data and writing… (~1 min)" : "Refresh data and generate report now"}
          </Button>
          <Button
            variant="outline"
            disabled={busy !== null}
            onClick={() =>
              run("daily", async () => {
                const r = await api<{ status?: string; skipped?: string }>("/api/jobs/run", { method: "POST", body: JSON.stringify({ job: "daily", force: true }) });
                return r.skipped ? `Daily refresh skipped: ${r.skipped}` : `Daily refresh: ${r.status}`;
              })
            }
          >
            {busy === "daily" ? "Refreshing…" : "Run daily refresh"}
          </Button>
          <Button
            variant="outline"
            disabled={busy !== null}
            onClick={() => {
              if (!confirm("Run the full Saturday job now? It sends the REAL (non-test) email and WhatsApp for this week if they have not been sent yet.")) return;
              run("weekly", async () => {
                const r = await api<{ status?: string; skipped?: string; reportId?: string }>("/api/jobs/run", { method: "POST", body: JSON.stringify({ job: "weekly" }) });
                return r.skipped ? `Weekly job skipped: ${r.skipped} for this week.` : `Weekly job: ${r.status}${r.reportId ? ` (report ${r.reportId})` : ""}`;
              });
            }}
          >
            {busy === "weekly" ? "Running…" : "Run Saturday job now"}
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Test email/WhatsApp sends are on each report&apos;s page.</p>
      </section>
    </div>
  );
}
