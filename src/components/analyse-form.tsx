"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { FileUp, Hash, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const MAX_BYTES = 4 * 1024 * 1024;

interface Resolved {
  schemeCode: number;
  schemeName: string;
  fundHouse: string;
  amfiCategory: string;
  latestNav: number | null;
  latestNavDate: string | null;
  warnings: string[];
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error ?? `Request failed (${res.status})`);
  return j as T;
}

function FundPicker({ onPick, label }: { onPick: (r: Resolved) => void; label: string }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ schemeCode: number; schemeName: string }[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <form
        className="flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setErr(null);
          try {
            const r = await getJson<{ results: { schemeCode: number; schemeName: string }[] }>(`/api/funds/search?q=${encodeURIComponent(q.trim())}`);
            setResults(r.results);
            if (!r.results.length) setErr("No funds matched. Try fewer words, e.g. the fund house and category.");
          } catch (e) {
            setErr(e instanceof Error ? e.message : "Search failed");
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="relative flex-1">
          <Label htmlFor="an-q" className="sr-only">
            {label}
          </Label>
          <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" aria-hidden />
          <Input id="an-q" className="pl-8" placeholder="e.g. Parag Parikh Flexi Cap Direct Growth" value={q} onChange={(e) => setQ(e.target.value)} minLength={3} required />
        </div>
        <Button type="submit" variant="outline" disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : "Search"}
        </Button>
      </form>
      {err && <p className="text-sm text-[var(--down)]">{err}</p>}
      {results && results.length > 0 && (
        <ul className="max-h-64 divide-y overflow-y-auto rounded-xl border">
          {results.map((r) => (
            <li key={r.schemeCode}>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted/50"
                onClick={async () => {
                  setBusy(true);
                  setErr(null);
                  try {
                    onPick(await getJson<Resolved>(`/api/funds/lookup?code=${r.schemeCode}`));
                    setResults(null);
                  } catch (e) {
                    setErr(e instanceof Error ? e.message : "Lookup failed");
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <span>{r.schemeName}</span>
                <span className="tabular shrink-0 text-xs text-muted-foreground">{r.schemeCode}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ResolvedCard({ r, onClear }: { r: Resolved; onClear: () => void }) {
  const plan = /direct/i.test(r.schemeName) ? "Direct" : /regular/i.test(r.schemeName) ? "Regular" : "Not stated";
  const option = /idcw|dividend/i.test(r.schemeName) ? "IDCW" : /growth/i.test(r.schemeName) ? "Growth" : "Not stated";
  return (
    <div className="rounded-xl border bg-muted/30 p-4 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-medium">{r.schemeName}</div>
          <dl className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-[var(--ink-secondary)] sm:grid-cols-3">
            <div>
              <dt className="inline text-muted-foreground">Fund house: </dt>
              <dd className="inline">{r.fundHouse || "—"}</dd>
            </div>
            <div>
              <dt className="inline text-muted-foreground">Category: </dt>
              <dd className="inline">{r.amfiCategory || "—"}</dd>
            </div>
            <div>
              <dt className="inline text-muted-foreground">Plan / option: </dt>
              <dd className="inline">
                {plan} / {option}
              </dd>
            </div>
            <div>
              <dt className="inline text-muted-foreground">Scheme code: </dt>
              <dd className="inline tabular">{r.schemeCode}</dd>
            </div>
            <div>
              <dt className="inline text-muted-foreground">Latest NAV: </dt>
              <dd className="inline tabular">
                {r.latestNav ?? "n/a"} ({r.latestNavDate ?? "n/a"})
              </dd>
            </div>
          </dl>
        </div>
        <button type="button" className="text-xs underline" onClick={onClear}>
          Change
        </button>
      </div>
      {r.warnings.map((w) => (
        <p key={w} className="mt-2 rounded bg-[var(--tint-warning)] px-2 py-1 text-xs">
          {w}
        </p>
      ))}
    </div>
  );
}

export function AnalyseForm({ initialCode }: { initialCode: string | null }) {
  const router = useRouter();
  const [mode, setMode] = useState<"search" | "code" | "pdf">(initialCode ? "code" : "search");
  const [code, setCode] = useState(initialCode ?? "");
  const [resolved, setResolved] = useState<Resolved | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<"lookup" | "run" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function lookup(c: string) {
    setBusy("lookup");
    setErr(null);
    try {
      setResolved(await getJson<Resolved>(`/api/funds/lookup?code=${encodeURIComponent(c.trim())}`));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Lookup failed");
    } finally {
      setBusy(null);
    }
  }
  // Coming from Explore ("Analyse fund") with ?code=: resolve it straight away.
  const started = useRef(false);
  useEffect(() => {
    if (initialCode && !started.current) {
      started.current = true;
      void lookup(initialCode);
    }
  }, [initialCode]);

  async function run() {
    setBusy("run");
    setErr(null);
    const fd = new FormData();
    if (resolved) fd.set("schemeCode", String(resolved.schemeCode));
    if (mode === "pdf" && file) fd.set("file", file);
    fd.set("source", mode);
    try {
      const res = await fetch("/api/analyse", { method: "POST", body: fd });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? `Analysis failed (${res.status})`);
      router.push(`/analyse/${j.id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Analysis failed");
      setBusy(null);
    }
  }

  const fileError = file && (file.size > MAX_BYTES ? "The file is larger than 4 MB." : !/\.pdf$/i.test(file.name) && file.type !== "application/pdf" ? "Only PDF files are supported." : null);
  const canRun = mode === "pdf" ? !!file && !fileError : !!resolved;

  const tabs = [
    { id: "search" as const, label: "Search by name", Icon: Search },
    { id: "code" as const, label: "Scheme code", Icon: Hash },
    { id: "pdf" as const, label: "Upload a factsheet", Icon: FileUp },
  ];

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="How to choose the fund" className="grid gap-2 sm:grid-cols-3">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={mode === t.id}
            onClick={() => {
              setMode(t.id);
              setErr(null);
            }}
            className={cn("flex items-center gap-2 rounded-xl border px-4 py-3 text-left text-sm font-medium", mode === t.id ? "border-foreground bg-foreground text-background" : "bg-card hover:bg-muted")}
          >
            <t.Icon className="size-4" aria-hidden />
            {t.label}
          </button>
        ))}
      </div>

      {mode === "search" && !resolved && <FundPicker label="Fund name" onPick={setResolved} />}

      {mode === "code" && !resolved && (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void lookup(code);
          }}
        >
          <div className="space-y-1">
            <Label htmlFor="an-code">AMFI scheme code</Label>
            <Input id="an-code" inputMode="numeric" pattern="\d{3,7}" placeholder="e.g. 122639" value={code} onChange={(e) => setCode(e.target.value)} className="w-44" required />
          </div>
          <Button type="submit" variant="outline" disabled={busy !== null}>
            {busy === "lookup" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : "Look up"}
          </Button>
        </form>
      )}

      {mode === "pdf" && (
        <div className="space-y-3">
          <div className="rounded-xl border border-dashed p-5 text-center">
            <FileUp className="mx-auto size-6 text-muted-foreground" aria-hidden />
            <p className="mt-2 text-sm">A single-scheme factsheet or key information document, PDF up to 4 MB.</p>
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf,.pdf"
              className="sr-only"
              id="an-file"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setErr(null);
              }}
            />
            <Button type="button" variant="outline" className="mt-3" onClick={() => fileRef.current?.click()}>
              {file ? "Choose a different file" : "Choose PDF"}
            </Button>
            {file && (
              <p className={cn("mt-2 text-sm", fileError ? "text-[var(--down)]" : "text-[var(--ink-secondary)]")}>
                {file.name} · {(file.size / 1048576).toFixed(2)} MB {fileError ? `— ${fileError}` : ""}
              </p>
            )}
            <p className="mt-2 text-xs text-muted-foreground">The file is read once and not stored. Only the facts extracted from it, its name and a fingerprint are saved with your analysis.</p>
          </div>
          {!resolved && (
            <div>
              <p className="mb-2 text-sm">
                <span className="font-medium">Recommended:</span> also pick the fund, so its returns can be checked against independent NAV data.
              </p>
              <FundPicker label="Fund name" onPick={setResolved} />
            </div>
          )}
        </div>
      )}

      {resolved && <ResolvedCard r={resolved} onClear={() => setResolved(null)} />}

      {err && (
        <p role="alert" className="rounded-lg bg-[var(--tint-critical)] px-3 py-2 text-sm">
          {err}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={run} disabled={!canRun || busy !== null}>
          {busy === "run" ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden /> Analysing…
            </>
          ) : (
            "Run analysis"
          )}
        </Button>
        {busy === "run" && <span className="text-sm text-[var(--ink-secondary)]">Fetching NAV history, comparing with similar funds and writing the explanation — usually 20–60 seconds.</span>}
      </div>
    </div>
  );
}
