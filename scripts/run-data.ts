// Seeds the default funds (if empty), ingests NAVs/indices/peers into Appwrite and prints the
// resulting performance table. Usage: npx tsx --env-file=.env.local scripts/run-data.ts
import { round, WINDOWS } from "@/lib/calc/returns";
import { todayIn } from "@/lib/dates";
import * as repo from "@/lib/db/repo";
import { buildFundPerformance, refreshAllFundNavs, refreshIndices, refreshMarketSnapshot, refreshPeers } from "@/lib/pipeline/data";
import { seedDefaultFunds } from "@/lib/pipeline/funds";

async function step<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const t = Date.now();
  const r = await fn();
  console.log(`\n[${name}] ${Date.now() - t} ms`);
  console.log(JSON.stringify(r, null, 1).slice(0, 1500));
  return r;
}

async function main() {
  const asOf = todayIn();
  await step("seed", seedDefaultFunds);
  await step("navs", () => refreshAllFundNavs(asOf));
  await step("indices", () => refreshIndices(asOf));
  await step("market snapshot", refreshMarketSnapshot).catch((e) => console.log("snapshot failed:", e.message));
  await step("peers", () => refreshPeers(asOf));

  console.log("\n[performance]");
  for (const f of await repo.listFunds({ activeOnly: true })) {
    const p = await buildFundPerformance(f, asOf);
    console.log(`${p.schemeName}\n  NAV ${p.nav?.value} (${p.nav?.date}) bench=${p.benchmark?.name ?? "—"} peers=${p.peer?.label ?? "—"} (${p.peer?.fetched}/${p.peer?.universeSize})`);
    for (const w of WINDOWS) {
      const c = p.windows[w];
      console.log(
        `  ${w.padEnd(3)} fund ${round(c.fund.returnPct)}%  bench ${round(c.benchmark?.returnPct ?? null)}%  peer ${round(c.peer?.mean ?? null)}% (n=${c.peer?.n ?? 0})  vsB ${round(c.vsBenchmarkPp)}pp vsP ${round(c.vsPeerPp)}pp`,
      );
    }
    if (p.flags.length) console.log(`  flags: ${p.flags.join(" | ")}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
