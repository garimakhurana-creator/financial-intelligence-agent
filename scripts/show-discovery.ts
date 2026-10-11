// Prints a discovery group's ranking. Usage: npx tsx --env-file=.env.local scripts/show-discovery.ts <group>
import * as research from "@/lib/db/research";
import type { DiscoveryFundData, DiscoveryGroupData } from "@/lib/pipeline/discovery";
const f = (n: number | null | undefined) => (n == null ? "  n/a" : n.toFixed(2).padStart(6));
async function main() {
  const key = process.argv[2];
  const g = (await research.listDiscoveryGroups<DiscoveryGroupData>()).find((x) => x.groupKey === key)?.data;
  console.log(JSON.stringify({ ...g, errors: g?.errors.length }, null, 0));
  const rows = (await research.listFundMetrics<DiscoveryFundData>(key)).sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  for (const r of rows.slice(0, 8)) {
    const m = r.data.metrics;
    console.log(`${String(r.data.rank.rank ?? "-").padStart(2)} ${f(r.score)} ${r.label?.padEnd(29)} 1Y${f(m.returns["1Y"].total)} 3Y${f(m.returns["3Y"].annualised)} 5Y${f(m.returns["5Y"].annualised)} vol${f(m.volatility3Y)} dd${f(m.maxDrawdown3Y?.pct)} cons${f(r.data.consistency?.beatPct)} | ${r.schemeName.slice(0, 40)} (${r.amc.slice(0, 25)})`);
  }
  const young = rows.filter((r) => !r.data.rank.eligible);
  console.log(`not ranked: ${young.length} (${young.slice(0, 3).map((y) => y.schemeName.slice(0, 30)).join("; ")})`);
}
main().then(() => process.exit(0));
