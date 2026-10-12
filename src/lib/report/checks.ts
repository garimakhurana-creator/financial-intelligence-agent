import { metricTriples } from "@/lib/report/input";
import { lagChecks, type LagCheck } from "@/lib/report/screening";
import type { StoredWeeklyReport } from "@/lib/report/build";
import type { ViewId } from "@/lib/catalog";

const shortName = (n: string) => n.replace(/\s*-\s*Direct Plan.*$/i, "").replace(/\s+Fund$/i, "").trim();

/** The flag checks for a stored report, computed from the numbers saved with that report. */
export function reportChecks(report: StoredWeeklyReport): LagCheck[] {
  return lagChecks(report.report.funds.map((f) => ({ name: shortName(f.schemeName), view: f.viewId as ViewId | null, returns: metricTriples(f) })));
}
