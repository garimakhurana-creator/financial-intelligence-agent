"use client";

import { Bar, BarChart, CartesianGrid, LabelList, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

// Chart conventions (see the data-viz reference): one y-axis only — series of different scale are
// rebased to 100 so they share an axis; 2px lines; recessive grid; fixed slot colours
// (1 = fund, 2 = benchmark, 3 = peer average); legend whenever there are 2+ series; a numeric
// table always sits next to each chart on the page.

export interface LineSeries {
  key: string;
  name: string;
  color: string; // CSS colour, e.g. "var(--series-1)"
  data: { date: string; value: number }[];
}

const fmtDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
const fmtMonth = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", { month: "short", year: "2-digit", timeZone: "UTC" });

/** Rebase every series to 100 at the first date they all share, then merge by date. */
function rebase(series: LineSeries[]) {
  const starts = series.map((s) => s.data[0]?.date).filter(Boolean) as string[];
  const common = starts.sort().at(-1);
  const rows = new Map<string, Record<string, number | string>>();
  for (const s of series) {
    const base = s.data.find((o) => o.date >= (common ?? ""))?.value;
    if (!base) continue;
    for (const o of s.data) {
      if (common && o.date < common) continue;
      const row = rows.get(o.date) ?? { date: o.date };
      row[s.key] = Math.round((o.value / base) * 10000) / 100;
      rows.set(o.date, row);
    }
  }
  return [...rows.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

export function IndexedLineChart({ series, height = 280 }: { series: LineSeries[]; height?: number }) {
  const data = rebase(series.filter((s) => s.data.length > 1));
  if (data.length < 2) return <p className="py-10 text-center text-sm text-muted-foreground">Not enough history to chart yet.</p>;
  return (
    <div role="img" aria-label={`Growth of 100 rupees: ${series.map((s) => s.name).join(" versus ")}`} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
          <CartesianGrid stroke="var(--grid)" vertical={false} />
          <XAxis dataKey="date" tickFormatter={fmtMonth} tick={{ fill: "var(--ink-muted)", fontSize: 11 }} axisLine={{ stroke: "var(--axis)" }} tickLine={false} minTickGap={40} />
          <YAxis domain={["auto", "auto"]} tick={{ fill: "var(--ink-muted)", fontSize: 11 }} axisLine={false} tickLine={false} width={48} />
          <ReferenceLine y={100} stroke="var(--axis)" strokeDasharray="3 3" />
          <Tooltip
            contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
            labelFormatter={(d) => fmtDate(String(d))}
            formatter={(v, name) => [Number(v).toFixed(2), String(name)]}
          />
          <Legend verticalAlign="top" align="left" height={28} iconType="plainline" wrapperStyle={{ fontSize: 12 }} />
          {series.map((s) => (
            <Line key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2} dot={false} activeDot={{ r: 4 }} connectNulls isAnimationActive={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export interface WindowBarRow {
  window: string;
  fund: number | null;
  benchmark: number | null;
  peer: number | null;
}

/** Grouped bars: fund vs benchmark vs peer average for each window. Values are labelled. */
export function WindowBars({ rows, benchmarkName, height = 240 }: { rows: WindowBarRow[]; benchmarkName: string | null; height?: number }) {
  const hasBench = rows.some((r) => r.benchmark !== null);
  const hasPeer = rows.some((r) => r.peer !== null);
  const label = (v: unknown) => (v === null || v === undefined ? "" : `${Number(v).toFixed(2)}%`);
  return (
    <div role="img" aria-label="Returns by period: fund, benchmark and peer average" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 20, right: 8, bottom: 0, left: -12 }} barGap={2} barCategoryGap="22%">
          <CartesianGrid stroke="var(--grid)" vertical={false} />
          <XAxis dataKey="window" tick={{ fill: "var(--ink-secondary)", fontSize: 12 }} axisLine={{ stroke: "var(--axis)" }} tickLine={false} />
          <YAxis tick={{ fill: "var(--ink-muted)", fontSize: 11 }} axisLine={false} tickLine={false} width={44} tickFormatter={(v) => `${v}%`} />
          <ReferenceLine y={0} stroke="var(--axis)" />
          <Tooltip
            cursor={{ fill: "var(--muted)", opacity: 0.5 }}
            contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
            formatter={(v, name) => [v === null ? "n/a" : `${Number(v).toFixed(2)}%`, String(name)]}
          />
          <Legend verticalAlign="top" align="left" height={24} iconType="square" wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="fund" name="Fund" fill="var(--series-1)" radius={[4, 4, 0, 0]} isAnimationActive={false}>
            <LabelList dataKey="fund" position="top" formatter={label} style={{ fill: "var(--foreground)", fontSize: 10 }} />
          </Bar>
          {hasBench && (
            <Bar dataKey="benchmark" name={benchmarkName ?? "Benchmark"} fill="var(--series-2)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
          )}
          {hasPeer && <Bar dataKey="peer" name="Peer average" fill="var(--series-3)" radius={[4, 4, 0, 0]} isAnimationActive={false} />}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Tiny single-series trend line (no axes; the tile's numbers carry the values). */
export function Sparkline({ data, height = 40 }: { data: { date: string; value: number }[]; height?: number }) {
  if (data.length < 2) return null;
  const up = data.at(-1)!.value >= data[0].value;
  return (
    <div aria-hidden style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 2, bottom: 4, left: 2 }}>
          <YAxis domain={["dataMin", "dataMax"]} hide />
          <Line type="monotone" dataKey="value" stroke={up ? "var(--up)" : "var(--down)"} strokeWidth={1.5} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
