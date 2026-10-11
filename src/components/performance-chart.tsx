"use client";

import { useMemo, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { cn } from "@/lib/utils";

// Growth-of-₹100 chart with period and series selection. Every visible series is rebased to 100
// on the first date they ALL have data in the chosen period, so lines start together and compare
// over identical dates. This is NAV/index growth, not Meera's portfolio profit.

export interface ChartSeries {
  key: string;
  name: string;
  kind: "fund" | "index";
  data: { date: string; value: number }[];
}

const PERIODS = [
  { id: "1M", label: "1M", months: 1 },
  { id: "3M", label: "3M", months: 3 },
  { id: "6M", label: "6M", months: 6 },
  { id: "1Y", label: "1Y", months: 12 },
  { id: "ALL", label: "All", months: 0 },
] as const;

const SLOT = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)", "var(--series-5)", "var(--series-6)", "var(--series-7)", "var(--series-8)"];

function monthsBack(iso: string, months: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.toISOString().slice(0, 10);
}
const fmtDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit", timeZone: "UTC" });

export function PerformanceChart({ series, initial, maxSelected = 4, height = 300 }: { series: ChartSeries[]; initial: string[]; maxSelected?: number; height?: number }) {
  const [period, setPeriod] = useState<(typeof PERIODS)[number]["id"]>("6M");
  const [selected, setSelected] = useState<string[]>(initial.filter((k) => series.some((s) => s.key === k)));
  // Colour follows the series, never its position in the selection.
  const colour = useMemo(() => Object.fromEntries(series.map((s, i) => [s.key, SLOT[i % SLOT.length]])), [series]);

  const { rows, start, end, changes } = useMemo(() => {
    const active = series.filter((s) => selected.includes(s.key) && s.data.length > 1);
    if (active.length === 0) return { rows: [], start: null, end: null, changes: [] as { key: string; pct: number }[] };
    const last = active.map((s) => s.data.at(-1)!.date).sort()[0];
    const p = PERIODS.find((x) => x.id === period)!;
    const from = p.months ? monthsBack(last, p.months) : "0000-01-01";
    const commonStart = active.map((s) => s.data.find((o) => o.date >= from)?.date ?? "9999").sort().at(-1)!;
    const byDate = new Map<string, Record<string, number | string>>();
    const changes: { key: string; pct: number }[] = [];
    for (const s of active) {
      const pts = s.data.filter((o) => o.date >= commonStart && o.date <= last);
      if (pts.length < 2) continue;
      const base = pts[0].value;
      for (const o of pts) {
        const row = byDate.get(o.date) ?? { date: o.date };
        row[s.key] = Math.round((o.value / base) * 10000) / 100;
        byDate.set(o.date, row);
      }
      changes.push({ key: s.key, pct: (pts.at(-1)!.value / base - 1) * 100 });
    }
    return { rows: [...byDate.values()].sort((a, b) => String(a.date).localeCompare(String(b.date))), start: commonStart, end: last, changes };
  }, [series, selected, period]);

  const toggle = (key: string) =>
    setSelected((cur) => (cur.includes(key) ? cur.filter((k) => k !== key) : cur.length >= maxSelected ? [...cur.slice(1), key] : [...cur, key]));

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Time period" className="inline-flex rounded-lg border bg-background p-0.5">
          {PERIODS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPeriod(p.id)}
              aria-pressed={period === p.id}
              className={cn("rounded-md px-2.5 py-1 text-xs font-medium", period === p.id ? "bg-foreground text-background" : "text-[var(--ink-secondary)] hover:bg-muted")}
            >
              {p.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Growth of ₹100{start && end ? `, ${fmtDate(start)} – ${fmtDate(end)}` : ""} · NAV / index level, not your profit
        </p>
      </div>

      <div role="group" aria-label="Series to show" className="mt-3 flex flex-wrap gap-1.5">
        {series.map((s) => {
          const on = selected.includes(s.key);
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => toggle(s.key)}
              aria-pressed={on}
              className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs", on ? "border-foreground/40 bg-muted font-medium" : "text-[var(--ink-secondary)] hover:bg-muted")}
            >
              <span aria-hidden className="h-0.5 w-3 rounded" style={{ background: on ? colour[s.key] : "var(--axis)" }} />
              {s.name}
              {s.kind === "index" && <span className="text-[10px] text-muted-foreground">index</span>}
            </button>
          );
        })}
      </div>

      {rows.length < 2 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">{selected.length === 0 ? "Pick at least one fund or index to plot." : "Not enough history for this period."}</p>
      ) : (
        <div className="mt-3" style={{ height }} role="img" aria-label={`Growth of 100 rupees for ${changes.map((c) => series.find((s) => s.key === c.key)?.name).join(", ")}`}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: -10 }}>
              <CartesianGrid stroke="var(--grid)" vertical={false} />
              <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fill: "var(--ink-muted)", fontSize: 11 }} axisLine={{ stroke: "var(--axis)" }} tickLine={false} minTickGap={48} />
              <YAxis domain={["auto", "auto"]} tick={{ fill: "var(--ink-muted)", fontSize: 11 }} axisLine={false} tickLine={false} width={46} />
              <ReferenceLine y={100} stroke="var(--axis)" strokeDasharray="3 3" />
              <Tooltip
                contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                labelFormatter={(d) => fmtDate(String(d))}
                formatter={(v, name) => [`₹${Number(v).toFixed(2)}`, String(name)]}
              />
              <Legend verticalAlign="top" align="left" height={26} iconType="plainline" wrapperStyle={{ fontSize: 12 }} />
              {series
                .filter((s) => selected.includes(s.key))
                .map((s) => (
                  <Line key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={colour[s.key]} strokeWidth={2} dot={false} activeDot={{ r: 4 }} connectNulls isAnimationActive={false} />
                ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {changes.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs">
          {changes.map((c) => (
            <li key={c.key} className="tabular">
              <span className="text-muted-foreground">{series.find((s) => s.key === c.key)?.name}:</span>{" "}
              <span className={c.pct > 0 ? "text-[var(--up)]" : c.pct < 0 ? "text-[var(--down)]" : ""}>
                {c.pct > 0 ? "+" : ""}
                {c.pct.toFixed(2)}%
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
