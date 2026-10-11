import { z } from "zod";
import { fetchJson } from "@/lib/http";
import { addDays, fromDDMonYYYY, type ISODate } from "@/lib/dates";
import type { Observation } from "@/lib/calc/returns";

export const NSE_SOURCE = "NSE India";

// NSE's public JSON endpoints serve browser-like requests. They may block some cloud IP ranges;
// callers must treat failure as "source unavailable" and fall back.
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36",
  Accept: "application/json,text/plain,*/*",
  Referer: "https://www.nseindia.com/",
};

const History = z.object({
  data: z.array(z.object({ EOD_CLOSE_INDEX_VAL: z.number(), EOD_TIMESTAMP: z.string() })),
});

function ddmmyyyy(d: ISODate): string {
  const [y, m, day] = d.split("-");
  return `${day}-${m}-${y}`;
}

export function parseNseHistory(raw: unknown): Observation[] {
  const parsed = History.safeParse(raw);
  if (!parsed.success) throw new Error("NSE history payload not recognised");
  const out: Observation[] = [];
  for (const r of parsed.data.data) {
    const date = fromDDMonYYYY(r.EOD_TIMESTAMP.replace(/-([A-Z]{3})-/, (_, m: string) => `-${m[0]}${m.slice(1).toLowerCase()}-`));
    if (date && r.EOD_CLOSE_INDEX_VAL > 0) out.push({ date, value: r.EOD_CLOSE_INDEX_VAL });
  }
  return out;
}

/**
 * Daily closes for an NSE index. The endpoint caps each response at ~70 rows and 365 days,
 * so we request 60-day chunks.
 */
export async function fetchNseIndexHistory(indexType: string, from: ISODate, to: ISODate): Promise<Observation[]> {
  const all = new Map<ISODate, number>();
  let start = from;
  while (start <= to) {
    const end = addDays(start, 59) < to ? addDays(start, 59) : to;
    const url =
      `https://www.nseindia.com/api/historicalOR/indicesHistory?indexType=${encodeURIComponent(indexType)}` +
      `&from=${ddmmyyyy(start)}&to=${ddmmyyyy(end)}`;
    const raw = await fetchJson<unknown>(url, { label: `nse ${indexType}`, headers: HEADERS, timeoutMs: 15_000 });
    for (const o of parseNseHistory(raw)) all.set(o.date, o.value);
    start = addDays(end, 1);
  }
  const series = [...all.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([date, value]) => ({ date, value }));
  if (series.length === 0) throw new Error(`NSE returned no history for ${indexType}`);
  return series;
}

const AllIndices = z.object({
  timestamp: z.string().optional(),
  data: z.array(
    z
      .object({
        index: z.string(),
        last: z.number(),
        percentChange: z.number().optional(),
        pe: z.string().optional(),
        pb: z.string().optional(),
        dy: z.string().optional(),
        advances: z.string().optional(),
        declines: z.string().optional(),
        unchanged: z.string().optional(),
        yearHigh: z.number().optional(),
        yearLow: z.number().optional(),
        previousDay: z.string().optional(),
      })
      .passthrough(),
  ),
});

export interface IndexSnapshot {
  index: string;
  last: number;
  asOf: ISODate | null;
  pe: number | null;
  pb: number | null;
  dividendYield: number | null;
  advances: number | null;
  declines: number | null;
  unchanged: number | null;
  yearHigh: number | null;
  yearLow: number | null;
}

const num = (s: string | undefined) => {
  const n = Number(s);
  return s !== undefined && s !== "" && Number.isFinite(n) ? n : null;
};

/** Breadth, valuation and dividend yield for all NSE indices (latest session only). */
export async function fetchNseAllIndices(): Promise<IndexSnapshot[]> {
  const raw = await fetchJson<unknown>("https://www.nseindia.com/api/allIndices", { label: "nse allIndices", headers: HEADERS });
  const parsed = AllIndices.safeParse(raw);
  if (!parsed.success) throw new Error("NSE allIndices payload not recognised");
  const asOf = parsed.data.timestamp ? fromDDMonYYYY(parsed.data.timestamp.slice(0, 11)) : null;
  return parsed.data.data.map((d) => ({
    index: d.index,
    last: d.last,
    asOf,
    pe: num(d.pe),
    pb: num(d.pb),
    dividendYield: num(d.dy),
    advances: num(d.advances),
    declines: num(d.declines),
    unchanged: num(d.unchanged),
    yearHigh: d.yearHigh ?? null,
    yearLow: d.yearLow ?? null,
  }));
}
