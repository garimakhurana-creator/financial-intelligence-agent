// Compute Explore Funds metrics and rankings. Usage:
//   npx tsx --env-file=.env.local scripts/refresh-discovery.ts [group_key ...]
import { todayIn } from "@/lib/dates";
import { refreshDiscovery } from "@/lib/pipeline/discovery";

async function main() {
  const keys = process.argv.slice(2);
  const t = Date.now();
  const r = await refreshDiscovery(todayIn(), keys.length ? keys : undefined);
  for (const x of r) console.log(`${x.ok ? "✓" : "✗"} ${x.group}: ${x.detail}`);
  console.log(`done in ${((Date.now() - t) / 1000).toFixed(1)} s`);
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
