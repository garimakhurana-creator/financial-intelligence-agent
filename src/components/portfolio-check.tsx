"use client";

import { useRef, useState } from "react";
import { FileUp, Loader2, Users, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PortfolioAnalysis } from "@/lib/analysis/portfolio";

// "Someone else's portfolio": upload a statement or paste a list, get a plain-language summary and
// which funds (if any) are worth Meera researching. Nothing is stored.

const MAX_BYTES = 4 * 1024 * 1024;
const ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,.csv,.txt,application/pdf,image/png,image/jpeg,image/webp,text/csv,text/plain";

const STANDING_TINT: Record<string, string> = {
  strong: "bg-[var(--tint-good)]",
  good: "bg-[var(--tint-good)]",
  mixed: "bg-muted",
  new: "bg-[var(--tint-warning)]",
  unknown: "bg-muted",
};
const MEERA_TINT: Record<string, string> = {
  owned: "bg-brand-soft",
  adds: "bg-[var(--tint-good)]",
  stronger: "bg-[var(--tint-good)]",
  similar: "bg-muted",
  skip: "bg-muted",
  unknown: "bg-[var(--tint-warning)]",
};
const ASSET_EMOJI: Record<string, string> = { equity: "📈", index: "🧩", hybrid: "⚖️", debt: "🛟", international: "🌎", other: "💼" };
const MIX_COLOR = ["var(--brand)", "var(--series-2)", "var(--series-3)", "var(--series-4)", "var(--series-5)", "var(--series-6)"];

export function PortfolioCheck() {
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<PortfolioAnalysis | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function run() {
    setBusy(true);
    setErr(null);
    setResult(null);
    try {
      const fd = new FormData();
      if (file) fd.set("file", file);
      else fd.set("text", text);
      const res = await fetch("/api/analyse/portfolio", { method: "POST", body: fd });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? "Could not analyse that portfolio");
      setResult(j as PortfolioAnalysis);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  const ready = (file !== null || text.trim().length >= 5) && !busy;

  return (
    <section className="space-y-5">
      <div className="rounded-3xl border bg-card p-5 shadow-card sm:p-6">
        <h2 className="flex items-center gap-2 text-xl font-bold">
          <Users className="size-5 text-brand" aria-hidden /> Look at someone else&apos;s portfolio
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          A friend&apos;s or family member&apos;s statement: see how their funds are doing in plain words, and whether any are worth Meera researching. Nothing is saved.
        </p>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label
            className={cn("flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-5 text-center hover:bg-muted/40", file && "border-brand")}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files[0];
              if (f) setFile(f.size > MAX_BYTES ? null : f);
              if (f && f.size > MAX_BYTES) setErr("That file is larger than 4 MB.");
            }}
          >
            <FileUp className="size-6 text-muted-foreground" aria-hidden />
            <span className="mt-2 text-sm font-medium">{file ? file.name : "Upload a statement"}</span>
            <span className="mt-0.5 text-xs text-muted-foreground">PDF, screenshot (PNG/JPG) or CSV · up to 4 MB</span>
            <input
              ref={fileRef}
              type="file"
              accept={ACCEPT}
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setErr(f && f.size > MAX_BYTES ? "That file is larger than 4 MB." : null);
                setFile(f && f.size <= MAX_BYTES ? f : null);
              }}
            />
            {file && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  setFile(null);
                  if (fileRef.current) fileRef.current.value = "";
                }}
                className="mt-2 inline-flex items-center gap-1 text-xs underline"
              >
                <X className="size-3" aria-hidden /> Remove
              </button>
            )}
          </label>
          <div className="flex flex-col">
            <label htmlFor="pf-text" className="text-sm font-medium">
              …or paste the fund names
            </label>
            <textarea
              id="pf-text"
              disabled={file !== null}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={"Parag Parikh Flexi Cap Fund – Rs 2,40,000\nSBI Small Cap Fund Direct Growth\n…"}
              className="mt-1 min-h-28 flex-1 rounded-2xl border bg-background p-3 text-sm disabled:opacity-50"
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={run}
            disabled={!ready}
            className="inline-flex items-center gap-2 rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white shadow-card disabled:opacity-50 dark:text-[var(--page)]"
          >
            {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {busy ? "Reading the portfolio…" : "Check this portfolio"}
          </button>
          <span className="text-xs text-muted-foreground">PDFs must not be password-protected; for a locked statement, upload a screenshot.</span>
        </div>
        {err && (
          <p role="alert" className="mt-3 rounded-2xl bg-[var(--tint-critical)] px-4 py-2 text-sm">
            {err}
          </p>
        )}
      </div>

      {result && (
        <div className="space-y-5" aria-live="polite">
          <div className="rounded-3xl bg-gradient-to-br from-[#0f766e] via-[#0e7490] to-[#4338ca] p-6 text-white shadow-card">
            <div className="text-sm opacity-80">
              Their portfolio · {result.read.matched} of {result.read.found} funds recognised{result.read.source === "image" ? " (read from an image — check the names below)" : ""}
            </div>
            <ul className="font-display mt-2 space-y-1 text-xl font-semibold leading-snug">
              {result.summary.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
            {result.mix.length > 0 && (
              <div className="mt-4">
                <div className="flex h-3 overflow-hidden rounded-full bg-white/20">
                  {result.mix.map((m, i) => (
                    <span key={m.label} style={{ width: `${m.share}%`, background: MIX_COLOR[i % MIX_COLOR.length] }} title={`${m.label} ${m.share}%`} />
                  ))}
                </div>
                <div className="mt-2 flex flex-wrap gap-3 text-xs opacity-90">
                  {result.mix.map((m, i) => (
                    <span key={m.label} className="inline-flex items-center gap-1.5">
                      <span className="size-2.5 rounded-full" style={{ background: MIX_COLOR[i % MIX_COLOR.length] }} aria-hidden />
                      {m.label} {m.share}%
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {result.worthALook.length > 0 ? (
            <div className="rounded-3xl border border-[var(--status-good)] bg-[var(--tint-good)] p-5">
              <div className="font-semibold">
                <span aria-hidden>🔍</span> Worth Meera researching
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {result.worthALook.map((n) => (
                  <span key={n} className="rounded-full bg-card px-3 py-1 text-sm font-medium shadow-card">
                    {n}
                  </span>
                ))}
              </div>
              <p className="mt-2 text-xs text-[var(--ink-secondary)]">Ideas to look into, chosen by long-term record and what Meera doesn&apos;t already hold — not a recommendation to buy.</p>
            </div>
          ) : (
            <p className="rounded-3xl border bg-card p-5 text-sm">
              <span aria-hidden>🟰</span> Nothing here stands out for Meera: her current funds already cover these kinds of funds, or their records are not strong enough.
            </p>
          )}

          <ul className="grid gap-3 md:grid-cols-2">
            {result.funds.map((f) => (
              <li key={f.name} className="rounded-3xl border bg-card p-5 shadow-card">
                <div className="flex items-start gap-3">
                  <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-2xl bg-muted text-xl">
                    {ASSET_EMOJI[f.assetClass] ?? "💼"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold leading-snug">{f.matched?.schemeName ?? f.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {f.matched?.amc} · {f.groupLabel ?? f.matched?.category}
                      {f.matched?.plan === "Regular" && " · Regular plan"}
                      {f.value !== null && ` · ₹${Math.round(f.value).toLocaleString("en-IN")}`}
                    </div>
                  </div>
                </div>
                <p className={cn("mt-3 rounded-2xl px-3 py-2 text-sm", STANDING_TINT[f.standing])}>{f.words}</p>
                <p className={cn("mt-2 rounded-2xl px-3 py-2 text-sm font-medium", MEERA_TINT[f.forMeera.kind])}>{f.forMeera.text}</p>
                {f.matched?.plan === "Regular" && <p className="mt-2 text-xs text-muted-foreground">Compared using the fund&apos;s Direct plan, which has lower costs.</p>}
              </li>
            ))}
          </ul>

          {result.unmatched.length > 0 && (
            <div className="rounded-3xl border border-dashed p-5 text-sm">
              <div className="font-medium">Not recognised ({result.unmatched.length})</div>
              <p className="mt-1 text-xs text-muted-foreground">These names did not clearly match a current scheme (some funds have been renamed), so they are left out rather than guessed:</p>
              <ul className="mt-2 list-disc pl-5">
                {result.unmatched.map((u) => (
                  <li key={u}>{u}</li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Records come from AMFI and MFapi prices and the nightly category data. Past performance does not guarantee future returns. This is research, not investment advice.
          </p>
        </div>
      )}
    </section>
  );
}
