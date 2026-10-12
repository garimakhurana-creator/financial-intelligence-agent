/**
 * Lighter chart series for pages: every point from the last `recentDays`, and one point per week
 * (the last of each week) before that, plus the very first point so long periods still start at
 * the right date. At a year's scale the line looks the same with ~60% fewer points; the chart joins
 * dates that only some series have (connectNulls), so series thinned differently still line up.
 */
export function thinSeries<T extends { date: string }>(data: T[], recentDays = 92): T[] {
  if (data.length < 120) return data;
  const last = Date.parse(`${data.at(-1)!.date}T00:00:00Z`);
  const cutoff = last - recentDays * 86_400_000;
  const out: T[] = [data[0]];
  const weekOf = (d: string) => Math.floor((Date.parse(`${d}T00:00:00Z`) / 86_400_000 + 3) / 7); // Monday-start weeks
  for (let i = 1; i < data.length; i++) {
    const p = data[i];
    if (Date.parse(`${p.date}T00:00:00Z`) >= cutoff) {
      out.push(p);
      continue;
    }
    const next = data[i + 1];
    if (!next || weekOf(next.date) !== weekOf(p.date)) out.push(p);
  }
  return out;
}
