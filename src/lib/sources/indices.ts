import { INDICES, type IndexId } from "@/lib/catalog";
import { cleanSeries, observationOnOrBefore, type Observation } from "@/lib/calc/returns";
import type { ISODate } from "@/lib/dates";
import { errorMessage, log } from "@/lib/log";
import { fetchYahooDaily, YAHOO_SOURCE } from "@/lib/sources/yahoo";
import { fetchNseIndexHistory, NSE_SOURCE } from "@/lib/sources/nse";

export interface IndexSeriesResult {
  id: IndexId;
  series: Observation[];
  source: string;
  /** Errors from sources that were tried and failed before the one that worked. */
  fallbacks: string[];
}

/** Multiply a USD index by USD/INR on (or just before) the same date. */
export function deriveInrSeries(base: Observation[], fx: Observation[]): Observation[] {
  const fxSorted = cleanSeries(fx);
  const out: Observation[] = [];
  for (const o of cleanSeries(base)) {
    const rate = observationOnOrBefore(fxSorted, o.date, 4);
    if (rate) out.push({ date: o.date, value: o.value * rate.value });
  }
  return out;
}

/**
 * Fetch daily history for a raw (non-derived) index, trying each configured source in order.
 * Throws only if every source fails; the error lists each failure.
 */
export async function fetchRawIndex(id: IndexId, from: ISODate, to: ISODate): Promise<IndexSeriesResult> {
  const def = INDICES[id];
  const failures: string[] = [];
  for (const src of def.sources) {
    try {
      if (src.kind === "yahoo") {
        const series = (await fetchYahooDaily(src.symbol)).filter((o) => o.date >= from && o.date <= to);
        return { id, series, source: `${YAHOO_SOURCE} (${src.symbol})`, fallbacks: failures };
      }
      if (src.kind === "nse") {
        const series = await fetchNseIndexHistory(src.indexType, from, to);
        return { id, series, source: `${NSE_SOURCE} (${src.indexType})`, fallbacks: failures };
      }
    } catch (e) {
      failures.push(`${src.kind}: ${errorMessage(e)}`);
      log.warn("index.source_failed", { id, source: src.kind, error: errorMessage(e) });
    }
  }
  throw new Error(`All sources failed for ${def.name}: ${failures.join("; ")}`);
}
