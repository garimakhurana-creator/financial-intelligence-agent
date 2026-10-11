import { Calculator as CalculatorIcon } from "lucide-react";
import { connection } from "next/server";
import { Suspense } from "react";
import { Calculator, type RatePreset } from "@/components/calculator";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { type ViewId } from "@/lib/catalog";
import * as cached from "@/lib/db/cached";
import { FUND_EMOJI } from "@/lib/plain";
import type { DiscoveryFundData } from "@/lib/pipeline/discovery";

export const metadata = { title: "Calculator · Meera's Money" };

export default function CalculatorPage() {
  return (
    <>
      <PageHeader icon={CalculatorIcon} title="Money calculator" sub="See how a monthly SIP or a one-time amount could grow — or how much you'd need each month to reach a goal." crumbs={[{ href: "/", label: "Dashboard" }]} />
      <Suspense fallback={<Skeleton className="h-[28rem] w-full rounded-3xl" />}>
        <WithPresets />
      </Suspense>
    </>
  );
}

/** Rate presets: each tracked fund's real 3-year annual return (from the nightly Explore data). */
async function WithPresets() {
  await connection();
  let presets: RatePreset[] = [];
  try {
    const funds = await cached.funds();
    const metrics = await cached.fundMetricsMany<DiscoveryFundData>(funds.map((f) => f.schemeCode));
    presets = funds.flatMap((f) => {
      const r3 = metrics.find((m) => m.schemeCode === f.schemeCode)?.data.metrics.returns["3Y"].annualised;
      if (typeof r3 !== "number" || !Number.isFinite(r3) || r3 <= 0) return [];
      const name = f.schemeName.replace(/\s*-\s*Direct Plan.*$/i, "").replace(/\s+(US Specific Equity Passive FOF|Fund)$/i, "");
      return [{ label: name, emoji: FUND_EMOJI[f.viewId as ViewId] ?? "💼", rate: r3 }];
    });
  } catch {
    presets = [];
  }
  return <Calculator presets={presets} />;
}
