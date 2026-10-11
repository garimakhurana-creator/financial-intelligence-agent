import { addDays, daysBetween, minusMonths, type ISODate } from "@/lib/dates";
import { cleanSeries, observationOnOrBefore, pctChange, type Observation } from "@/lib/calc/returns";

// Long-horizon fund metrics used by Explore Funds and Analyse a Fund. All deterministic, computed
// from NAV history only. Anything that needs more history than exists is null — never estimated.

export const METRICS_VERSION = "metrics-v1";

export type Horizon = "1M" | "3M" | "6M" | "1Y" | "3Y" | "5Y";
export const HORIZONS: Horizon[] = ["1M", "3M", "6M", "1Y", "3Y", "5Y"];
const HORIZON_MONTHS: Record<Horizon, number> = { "1M": 1, "3M": 3, "6M": 6, "1Y": 12, "3Y": 36, "5Y": 60 };

/** Reference must be within this many days before the target date. */
const REF_GAP_DAYS = 7;

export interface PeriodReturn {
  /** Point-to-point return, %. */
  total: number | null;
  /** Annualised (CAGR) for periods of a year or more, %. Equal to total for 1Y. */
  annualised: number | null;
  fromDate: ISODate | null;
}

export function periodReturn(sorted: Observation[], asOf: ISODate, h: Horizon): PeriodReturn {
  const cur = observationOnOrBefore(sorted, asOf, 5);
  if (!cur) return { total: null, annualised: null, fromDate: null };
  const target = minusMonths(cur.date, HORIZON_MONTHS[h]);
  if (sorted.length === 0 || sorted[0].date > target) return { total: null, annualised: null, fromDate: null };
  const ref = observationOnOrBefore(sorted, target, REF_GAP_DAYS);
  if (!ref) return { total: null, annualised: null, fromDate: null };
  const total = pctChange(cur.value, ref.value);
  if (total === null) return { total: null, annualised: null, fromDate: ref.date };
  const years = HORIZON_MONTHS[h] / 12;
  const annualised = years >= 1 ? (Math.pow(cur.value / ref.value, 1 / years) - 1) * 100 : null;
  return { total, annualised, fromDate: ref.date };
}

/** Last observation of each ISO week (Friday-ish closes), for volatility. */
export function weeklyCloses(sorted: Observation[]): Observation[] {
  // Keyed by the Monday of each week; later observations in the week overwrite earlier ones.
  const byWeek = new Map<ISODate, Observation>();
  for (const o of sorted) {
    const dow = new Date(`${o.date}T00:00:00Z`).getUTCDay();
    byWeek.set(addDays(o.date, -((dow + 6) % 7)), o);
  }
  return [...byWeek.values()];
}

/**
 * Annualised volatility (%): standard deviation of weekly log returns × √52, over the last
 * `years` years. Needs at least 80% of the expected weeks, otherwise null.
 */
export function annualisedVolatility(sorted: Observation[], asOf: ISODate, years = 3): number | null {
  const from = minusMonths(asOf, years * 12);
  const w = weeklyCloses(sorted.filter((o) => o.date >= from && o.date <= asOf));
  if (w.length < 52 * years * 0.8) return null;
  const r: number[] = [];
  for (let i = 1; i < w.length; i++) r.push(Math.log(w[i].value / w[i - 1].value));
  const mean = r.reduce((a, b) => a + b, 0) / r.length;
  const variance = r.reduce((a, b) => a + (b - mean) ** 2, 0) / (r.length - 1);
  return Math.sqrt(variance) * Math.sqrt(52) * 100;
}

/** Largest peak-to-trough fall (%, negative) over the last `years` years, with its dates. */
export function maxDrawdown(sorted: Observation[], asOf: ISODate, years = 3): { pct: number; peak: ISODate; trough: ISODate } | null {
  const from = minusMonths(asOf, years * 12);
  const s = sorted.filter((o) => o.date >= from && o.date <= asOf);
  if (s.length < 20 || daysBetween(s[0].date, from) > 10) return null;
  let peak = s[0];
  let worst = { pct: 0, peak: s[0].date, trough: s[0].date };
  for (const o of s) {
    if (o.value > peak.value) peak = o;
    const dd = (o.value / peak.value - 1) * 100;
    if (dd < worst.pct) worst = { pct: dd, peak: peak.date, trough: o.date };
  }
  return worst;
}

/** Month-end sample dates going back `months` months from asOf (oldest first). */
export function monthlyDates(asOf: ISODate, months: number): ISODate[] {
  const out: ISODate[] = [];
  for (let m = months; m >= 0; m--) out.push(minusMonths(asOf, m));
  return out;
}

/**
 * Rolling 1-year returns at monthly steps over the last `years` years: the fund's return for
 * every 12-month window ending on each sample date. Used for consistency.
 */
export function rollingOneYear(sorted: Observation[], asOf: ISODate, years = 3): { end: ISODate; ret: number | null }[] {
  return monthlyDates(asOf, (years - 1) * 12).map((end) => {
    const cur = observationOnOrBefore(sorted, end, REF_GAP_DAYS);
    const ref = observationOnOrBefore(sorted, minusMonths(end, 12), REF_GAP_DAYS);
    return { end, ret: cur && ref ? pctChange(cur.value, ref.value) : null };
  });
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Consistency: share of rolling 1-year windows in which the fund beat the category median for
 * that same window. Requires ≥ 12 comparable windows. Returns 0–100 (%), or null.
 */
export function consistencyVsCategory(
  fundRolling: { end: ISODate; ret: number | null }[],
  categoryRolling: { end: ISODate; ret: number | null }[][],
): { beatPct: number; windows: number } | null {
  let beat = 0;
  let n = 0;
  fundRolling.forEach((w, i) => {
    if (w.ret === null) return;
    const peers = categoryRolling.map((c) => c[i]?.ret).filter((x): x is number => x !== null && x !== undefined);
    const med = peers.length >= 3 ? median(peers) : null;
    if (med === null) return;
    n++;
    if (w.ret > med) beat++;
  });
  return n >= 12 ? { beatPct: (beat / n) * 100, windows: n } : null;
}

export interface FundMetrics {
  asOf: ISODate | null;
  nav: number | null;
  historyStart: ISODate | null;
  returns: Record<Horizon, PeriodReturn>;
  volatility3Y: number | null;
  maxDrawdown3Y: { pct: number; peak: ISODate; trough: ISODate } | null;
  rolling1Y: { end: ISODate; ret: number | null }[];
  metricsVersion: string;
}

export function computeFundMetrics(series: Observation[], asOf: ISODate): FundMetrics {
  const sorted = cleanSeries(series);
  const cur = observationOnOrBefore(sorted, asOf, 5);
  const anchor = cur?.date ?? asOf;
  const returns = {} as Record<Horizon, PeriodReturn>;
  for (const h of HORIZONS) returns[h] = periodReturn(sorted, anchor, h);
  return {
    asOf: cur?.date ?? null,
    nav: cur?.value ?? null,
    historyStart: sorted[0]?.date ?? null,
    returns,
    volatility3Y: cur ? annualisedVolatility(sorted, anchor, 3) : null,
    maxDrawdown3Y: cur ? maxDrawdown(sorted, anchor, 3) : null,
    rolling1Y: cur ? rollingOneYear(sorted, anchor, 3) : [],
    metricsVersion: METRICS_VERSION,
  };
}
