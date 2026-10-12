import { metricTriples } from "@/lib/report/input";
import { lagChecks, type LagCheck } from "@/lib/report/screening";
import type { StoredWeeklyReport } from "@/lib/report/build";
import type { ViewId } from "@/lib/catalog";

const shortName = (n: string) => n.replace(/\s*-\s*Direct Plan.*$/i, "").replace(/\s+Fund$/i, "").trim();

/** The flag checks for a stored report, computed from the numbers saved with that report. */
export function reportChecks(report: StoredWeeklyReport): LagCheck[] {
  return lagChecks(report.report.funds.map((f) => ({ name: shortName(f.schemeName), view: f.viewId as ViewId | null, returns: metricTriples(f) })));
}

const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

/** A one-line summary for the verdict card; the full reason stays one tap away. */
export function shortVerdict(report: StoredWeeklyReport, checks: LagCheck[]): string {
  const flagged = checks.filter((c) => c.flagged).map((c) => c.name);
  const dip = (report.inputSnapshot.screening.notes?.marketDip.length ?? 0) > 0;
  if (flagged.length === 1) return `${flagged[0]} has been behind similar funds this month and this year. Your other funds are on track.`;
  if (flagged.length > 1) return `${list(flagged)} have been behind similar funds this month and this year. Worth a calm look at the mix.`;
  return dip ? "No fund has a problem of its own. This month's fall was market-wide." : "No fund has a problem of its own. Nothing to do this week.";
}
