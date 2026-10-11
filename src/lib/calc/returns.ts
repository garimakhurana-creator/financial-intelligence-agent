import { addDays, daysBetween, minusMonths, previousYearEnd, type ISODate } from "@/lib/dates";

/** A dated observation: a fund NAV or an index close. */
export interface Observation {
  date: ISODate;
  value: number;
}

export type WindowKey = "1W" | "1M" | "YTD";
export const WINDOWS: WindowKey[] = ["1W", "1M", "YTD"];

export const CALC_VERSION = "returns-v1";

/**
 * How far back from a target date we will accept an observation as its reference.
 * Covers weekends plus the longest typical Indian market-holiday cluster.
 * Beyond this we report "unavailable" rather than reaching for an unrelated older value.
 */
export const MAX_REFERENCE_GAP_DAYS = 7;

/** The current value must be at most this old relative to the requested as-of date. */
export const MAX_CURRENT_STALENESS_DAYS = 5;

export type UnavailableReason =
  | "no_current_observation"
  | "current_too_stale"
  | "no_reference_near_target"
  | "invalid_reference_value"
  | "insufficient_history";

export interface WindowResult {
  window: WindowKey;
  /** Calendar date the window is measured from (before snapping to an observation). */
  targetDate: ISODate;
  /** Actual observation used as reference, if any. */
  referenceDate: ISODate | null;
  referenceValue: number | null;
  currentDate: ISODate | null;
  currentValue: number | null;
  /** Percentage return, e.g. 1.25 means +1.25 %. null when unavailable — never coerced to 0. */
  returnPct: number | null;
  unavailableReason?: UnavailableReason;
}

export function targetDateFor(window: WindowKey, asOf: ISODate): ISODate {
  switch (window) {
    case "1W":
      return addDays(asOf, -7);
    case "1M":
      return minusMonths(asOf, 1);
    case "YTD":
      return previousYearEnd(asOf);
  }
}

/** Sort ascending by date and drop non-finite / non-positive values and duplicate dates. */
export function cleanSeries(series: Observation[]): Observation[] {
  const byDate = new Map<ISODate, number>();
  for (const o of series) {
    if (Number.isFinite(o.value) && o.value > 0) byDate.set(o.date, o.value);
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, value]) => ({ date, value }));
}

/** Latest observation on or before `date`, within `maxGapDays`. Series must be sorted ascending. */
export function observationOnOrBefore(
  sorted: Observation[],
  date: ISODate,
  maxGapDays: number,
): Observation | null {
  let lo = 0;
  let hi = sorted.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid].date <= date) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (found < 0) return null;
  const obs = sorted[found];
  return daysBetween(obs.date, date) <= maxGapDays ? obs : null;
}

export function pctChange(current: number, reference: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(reference) || reference <= 0 || current <= 0) return null;
  return (current / reference - 1) * 100;
}

/**
 * Compute 1W / 1M / YTD point-to-point returns.
 *
 * `asOf` is the date the comparison is anchored to. The current value is the last observation
 * on or before `asOf`; window targets are measured back from that observation's date so that a
 * fund, its benchmark and its peers can all be anchored to the same calendar dates.
 */
export function computeWindowReturns(
  series: Observation[],
  asOf: ISODate,
  options: { anchorTo?: ISODate } = {},
): { current: Observation | null; windows: Record<WindowKey, WindowResult> } {
  const sorted = cleanSeries(series);
  const current = observationOnOrBefore(sorted, asOf, MAX_CURRENT_STALENESS_DAYS);
  const anchor = options.anchorTo ?? current?.date ?? asOf;

  const windows = {} as Record<WindowKey, WindowResult>;
  for (const w of WINDOWS) {
    const targetDate = targetDateFor(w, anchor);
    const base: WindowResult = {
      window: w,
      targetDate,
      referenceDate: null,
      referenceValue: null,
      currentDate: current?.date ?? null,
      currentValue: current?.value ?? null,
      returnPct: null,
    };
    if (!current) {
      const anyBefore = observationOnOrBefore(sorted, asOf, Number.POSITIVE_INFINITY);
      windows[w] = { ...base, unavailableReason: anyBefore ? "current_too_stale" : "no_current_observation" };
      continue;
    }
    if (sorted.length === 0 || sorted[0].date > targetDate) {
      windows[w] = { ...base, unavailableReason: "insufficient_history" };
      continue;
    }
    const ref = observationOnOrBefore(sorted, targetDate, MAX_REFERENCE_GAP_DAYS);
    if (!ref) {
      windows[w] = { ...base, unavailableReason: "no_reference_near_target" };
      continue;
    }
    const r = pctChange(current.value, ref.value);
    windows[w] = {
      ...base,
      referenceDate: ref.date,
      referenceValue: ref.value,
      returnPct: r,
      ...(r === null ? { unavailableReason: "invalid_reference_value" as const } : {}),
    };
  }
  return { current, windows };
}

/** Difference in percentage points; null if either side is unavailable. */
export function excessReturn(a: number | null, b: number | null): number | null {
  if (a === null || b === null || !Number.isFinite(a) || !Number.isFinite(b)) return null;
  return a - b;
}

export function round(n: number | null, dp = 2): number | null {
  if (n === null || !Number.isFinite(n)) return null;
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}
