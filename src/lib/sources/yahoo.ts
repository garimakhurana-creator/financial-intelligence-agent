import { z } from "zod";
import { fetchJson } from "@/lib/http";
import type { Observation } from "@/lib/calc/returns";

export const YAHOO_SOURCE = "Yahoo Finance chart API";

const Chart = z.object({
  chart: z.object({
    result: z
      .array(
        z.object({
          meta: z.object({ symbol: z.string(), gmtoffset: z.number().optional(), currency: z.string().nullable().optional() }),
          timestamp: z.array(z.number()).optional(),
          indicators: z.object({ quote: z.array(z.object({ close: z.array(z.number().nullable()) })) }),
        }),
      )
      .nullable(),
    error: z.unknown().nullable().optional(),
  }),
});

/** Convert a unix timestamp to the exchange-local calendar date using the exchange's GMT offset. */
function localDate(ts: number, gmtoffset: number): string {
  return new Date((ts + gmtoffset) * 1000).toISOString().slice(0, 10);
}

export function parseYahooChart(raw: unknown, opts: { dropWeekends?: boolean } = {}): Observation[] {
  const parsed = Chart.safeParse(raw);
  if (!parsed.success || !parsed.data.chart.result?.[0]) throw new Error("Yahoo returned no chart data");
  const r = parsed.data.chart.result[0];
  const ts = r.timestamp ?? [];
  const close = r.indicators.quote[0]?.close ?? [];
  const off = r.meta.gmtoffset ?? 0;
  const out: Observation[] = [];
  for (let i = 0; i < ts.length; i++) {
    const v = close[i];
    if (v !== null && v !== undefined && Number.isFinite(v) && v > 0) out.push({ date: localDate(ts[i], off), value: v });
  }
  // Yahoo quotes FX pairs (e.g. INR=X) on Sundays; those prints are not trading-day closes and
  // would shift the FX windows relative to the index they convert, so FX drops weekends.
  // Equity indices keep them: exchanges occasionally hold weekend sessions (e.g. NSE's
  // Budget-day session on Sunday 1 Feb 2026).
  const weekdays = opts.dropWeekends
    ? out.filter((o) => {
        const dow = new Date(`${o.date}T00:00:00Z`).getUTCDay();
        return dow !== 0 && dow !== 6;
      })
    : out;
  // Intraday duplicates for "today" collapse to the last value per date.
  const byDate = new Map(weekdays.map((o) => [o.date, o.value]));
  return [...byDate.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([date, value]) => ({ date, value }));
}

export async function fetchYahooDaily(symbol: string, range = "2y"): Promise<Observation[]> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d`;
  const raw = await fetchJson<unknown>(url, {
    label: `yahoo ${symbol}`,
    headers: { "User-Agent": "Mozilla/5.0 (compatible; MeeraFundTracker/1.0)" },
  });
  const series = parseYahooChart(raw, { dropWeekends: symbol.endsWith("=X") });
  // A single point means Yahoo has a quote but no history (e.g. ^CNXSC) — unusable for returns.
  if (series.length < 5) throw new Error(`Yahoo ${symbol} has no usable history (${series.length} points)`);
  return series;
}
