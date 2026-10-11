"use client";

import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { cn } from "@/lib/utils";

// SIP / lump-sum / goal calculator. Pure maths on the inputs; the rate presets come from the
// tracked funds' real past 3-year returns and are labelled as history, not a forecast.

export interface RatePreset {
  label: string;
  emoji: string;
  rate: number;
}

type Mode = "sip" | "lump" | "goal";

const MODES: { id: Mode; label: string; emoji: string }[] = [
  { id: "sip", label: "Monthly SIP", emoji: "📅" },
  { id: "lump", label: "One-time", emoji: "💰" },
  { id: "goal", label: "Reach a goal", emoji: "🎯" },
];

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const short = (n: number) => (n >= 1e7 ? `₹${(n / 1e7).toFixed(2)} Cr` : n >= 1e5 ? `₹${(n / 1e5).toFixed(2)} L` : inr(n));

/** Value of a monthly SIP after `years`, invested at the start of each month, compounding monthly. */
export function sipValue(monthly: number, ratePct: number, years: number): number {
  const n = Math.round(years * 12);
  const i = ratePct / 100 / 12;
  if (i === 0) return monthly * n;
  return monthly * ((Math.pow(1 + i, n) - 1) / i) * (1 + i);
}

export function lumpValue(amount: number, ratePct: number, years: number): number {
  return amount * Math.pow(1 + ratePct / 100, years);
}

/** Monthly SIP needed to reach `goal` in `years`. */
export function sipForGoal(goal: number, ratePct: number, years: number): number {
  const one = sipValue(1, ratePct, years);
  return one > 0 ? goal / one : 0;
}

function Slider({ id, label, value, min, max, step, onChange, format }: { id: string; label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; format: (v: number) => string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        <input
          aria-label={label}
          inputMode="decimal"
          className="w-32 rounded-full border bg-background px-3 py-1 text-right text-sm font-semibold tabular"
          value={format(value)}
          onChange={(e) => {
            const n = Number(e.target.value.replace(/[^\d.]/g, ""));
            if (Number.isFinite(n)) onChange(Math.min(max, Math.max(0, n)));
          }}
        />
      </div>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="mt-2 w-full accent-[var(--brand)]" />
    </div>
  );
}

export function Calculator({ presets }: { presets: RatePreset[] }) {
  const [mode, setMode] = useState<Mode>("sip");
  const [monthly, setMonthly] = useState(5000);
  const [lump, setLump] = useState(100000);
  const [goal, setGoal] = useState(1000000);
  const [years, setYears] = useState(10);
  const [rate, setRate] = useState(12);

  const result = useMemo(() => {
    if (mode === "sip") {
      const value = sipValue(monthly, rate, years);
      return { value, invested: monthly * 12 * years, monthlyNeeded: null };
    }
    if (mode === "lump") return { value: lumpValue(lump, rate, years), invested: lump, monthlyNeeded: null };
    const m = sipForGoal(goal, rate, years);
    return { value: goal, invested: m * 12 * years, monthlyNeeded: m };
  }, [mode, monthly, lump, goal, years, rate]);

  const series = useMemo(() => {
    const out: { year: number; invested: number; value: number }[] = [];
    const m = mode === "goal" ? (result.monthlyNeeded ?? 0) : monthly;
    for (let y = 0; y <= years; y++) {
      if (mode === "lump") out.push({ year: y, invested: lump, value: lumpValue(lump, rate, y) });
      else out.push({ year: y, invested: m * 12 * y, value: sipValue(m, rate, y) });
    }
    return out;
  }, [mode, monthly, lump, years, rate, result.monthlyNeeded]);

  const gain = result.value - result.invested;
  const multiple = result.invested > 0 ? result.value / result.invested : 0;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
      <div className="space-y-6 rounded-3xl border bg-card p-6 shadow-card">
        <div role="tablist" aria-label="Calculator type" className="grid grid-cols-3 gap-1 rounded-full border bg-background p-1">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              role="tab"
              aria-selected={mode === m.id}
              onClick={() => setMode(m.id)}
              className={cn("rounded-full px-2 py-1.5 text-xs font-medium sm:text-sm", mode === m.id ? "bg-brand text-white dark:text-[var(--page)]" : "text-[var(--ink-secondary)] hover:bg-muted")}
            >
              <span aria-hidden>{m.emoji}</span> {m.label}
            </button>
          ))}
        </div>

        {mode === "sip" && <Slider id="c-sip" label="Every month" value={monthly} min={500} max={100000} step={500} onChange={setMonthly} format={inr} />}
        {mode === "lump" && <Slider id="c-lump" label="Invest once" value={lump} min={5000} max={5000000} step={5000} onChange={setLump} format={inr} />}
        {mode === "goal" && <Slider id="c-goal" label="I want to have" value={goal} min={50000} max={50000000} step={50000} onChange={setGoal} format={inr} />}
        <Slider id="c-years" label="For how long" value={years} min={1} max={40} step={1} onChange={setYears} format={(v) => `${v} yr${v === 1 ? "" : "s"}`} />
        <Slider id="c-rate" label="Yearly growth (assumed)" value={rate} min={1} max={40} step={0.5} onChange={setRate} format={(v) => `${v}%`} />

        {presets.length > 0 && (
          <div>
            <div className="text-xs font-medium text-muted-foreground">Use a past 3-year average from your funds</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {presets.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => setRate(Math.round(p.rate * 2) / 2)}
                  className="rounded-full border bg-background px-3 py-1 text-xs hover:bg-muted"
                  title={`${p.label}: ${p.rate.toFixed(2)}% a year over the last 3 years`}
                >
                  <span aria-hidden>{p.emoji}</span> {p.label} · {p.rate.toFixed(1)}%
                </button>
              ))}
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">These are what the funds actually did over the last 3 years — not a promise. Real returns go up and down from year to year.</p>
          </div>
        )}
      </div>

      <div className="space-y-4">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0f766e] to-[#14b8a6] p-6 text-white shadow-card">
          <span aria-hidden className="absolute -right-3 -top-4 text-[7rem] leading-none opacity-20">
            {mode === "goal" ? "🎯" : "🌱"}
          </span>
          {mode === "goal" ? (
            <>
              <div className="text-sm opacity-80">You&apos;d need to invest about</div>
              <div className="font-display mt-1 text-4xl font-bold tabular sm:text-5xl">
                {inr(result.monthlyNeeded ?? 0)}
                <span className="text-xl font-semibold opacity-80"> / month</span>
              </div>
              <div className="mt-2 text-sm opacity-90">
                for {years} year{years === 1 ? "" : "s"} to reach {short(goal)} at {rate}% a year.
              </div>
            </>
          ) : (
            <>
              <div className="text-sm opacity-80">After {years} year{years === 1 ? "" : "s"} you could have about</div>
              <div className="font-display mt-1 text-4xl font-bold tabular sm:text-5xl">{short(result.value)}</div>
              <div className="mt-2 text-sm opacity-90">
                You put in {short(result.invested)} · growth {short(Math.max(0, gain))}
                {multiple > 0 && ` · ${multiple.toFixed(1)}× your money`}
              </div>
            </>
          )}
        </div>

        <div className="rounded-3xl border bg-card p-5 shadow-card">
          <div className="mb-2 flex flex-wrap items-center gap-4 text-xs">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-[var(--series-3)]" aria-hidden /> What you put in
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-brand" aria-hidden /> What it could grow to
            </span>
          </div>
          <div className="h-64" role="img" aria-label={`Growth over ${years} years: from ${short(result.invested)} invested to about ${short(result.value)}.`}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="var(--grid)" vertical={false} />
                <XAxis dataKey="year" tickFormatter={(y) => `${y}y`} stroke="var(--axis)" fontSize={11} tickLine={false} />
                <YAxis tickFormatter={(v) => short(v)} stroke="var(--axis)" fontSize={11} width={70} tickLine={false} axisLine={false} />
                <Tooltip
                  formatter={(v, n) => [inr(Number(v)), n === "value" ? "Could grow to" : "Put in"]}
                  labelFormatter={(y) => `After ${y} year${y === 1 ? "" : "s"}`}
                  contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12 }}
                />
                <Area type="monotone" dataKey="value" stroke="var(--brand)" fill="var(--brand)" fillOpacity={0.18} strokeWidth={2} />
                <Area type="monotone" dataKey="invested" stroke="var(--series-3)" fill="var(--series-3)" fillOpacity={0.15} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Assumes the same growth every year, money added at the start of each month, and no taxes or exit loads. Real returns go up and down — this shows what the maths
          looks like, not what will happen.
        </p>
      </div>
    </div>
  );
}
