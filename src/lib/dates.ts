// All observation dates are plain calendar dates as "YYYY-MM-DD" strings.
// Using strings (not Date objects) avoids timezone drift: an NAV dated 09-Oct-2026
// in India must stay 2026-10-09 regardless of the server's timezone (Vercel runs in UTC).

export type ISODate = string;

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isISODate(s: string): s is ISODate {
  if (!ISO_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function toUTC(d: ISODate): Date {
  return new Date(`${d}T00:00:00Z`);
}

function fromUTC(d: Date): ISODate {
  return d.toISOString().slice(0, 10);
}

export function addDays(d: ISODate, n: number): ISODate {
  const x = toUTC(d);
  x.setUTCDate(x.getUTCDate() + n);
  return fromUTC(x);
}

/** Same day-of-month one calendar month earlier, clamped to month end (31-Mar → 28/29-Feb). */
export function minusMonths(d: ISODate, n: number): ISODate {
  const [y, m, day] = d.split("-").map(Number);
  const targetMonthIndex = y * 12 + (m - 1) - n;
  const ty = Math.floor(targetMonthIndex / 12);
  const tm = targetMonthIndex % 12;
  const lastDay = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
  return fromUTC(new Date(Date.UTC(ty, tm, Math.min(day, lastDay))));
}

/** Calendar YTD reference: the last observation of the previous year (on or before 31-Dec). */
export function previousYearEnd(d: ISODate): ISODate {
  return `${Number(d.slice(0, 4)) - 1}-12-31`;
}

export function daysBetween(a: ISODate, b: ISODate): number {
  return Math.round((toUTC(b).getTime() - toUTC(a).getTime()) / 86_400_000);
}

/** "09-10-2026" (MFapi) → "2026-10-09" */
export function fromDDMMYYYY(s: string): ISODate | null {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(s.trim());
  if (!m) return null;
  const iso = `${m[3]}-${m[2]}-${m[1]}`;
  return isISODate(iso) ? iso : null;
}

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

/** "09-Oct-2026" (AMFI / NSE) → "2026-10-09" */
export function fromDDMonYYYY(s: string): ISODate | null {
  const m = /^(\d{2})-([A-Za-z]{3})-(\d{4})$/.exec(s.trim());
  if (!m) return null;
  const mm = MONTHS[m[2].toLowerCase()];
  if (!mm) return null;
  const iso = `${m[3]}-${mm}-${m[1]}`;
  return isISODate(iso) ? iso : null;
}

/** Today's calendar date in a given IANA timezone (default IST). */
export function todayIn(timeZone = "Asia/Kolkata", now: Date = new Date()): ISODate {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function formatHuman(d: ISODate): string {
  return toUTC(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}
