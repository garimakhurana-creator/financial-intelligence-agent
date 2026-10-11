// Spot-checks specific stored observations. Usage: npx tsx --env-file=.env.local scripts/check-index-dates.ts
import * as repo from "@/lib/db/repo";
import { buildIndexSet } from "@/lib/pipeline/data";
import { todayIn } from "@/lib/dates";

async function main() {
  const s = await repo.getIndexSeries("NIFTY_SMALLCAP100", "2026-01-28");
  const n = await repo.getIndexSeries("NIFTY50", "2026-01-28");
  console.log("Smallcap100 has 1 Feb 2026:", s.series.some((o) => o.date === "2026-02-01"));
  console.log("Nifty50 has 1 Feb 2026:", n.series.some((o) => o.date === "2026-02-01"));
  const set = await buildIndexSet(["NASDAQ100", "USDINR", "NASDAQ100_INR"], todayIn());
  for (const i of set) console.log(i.id, i.current?.date, "1W", i.windows["1W"].referenceDate, "→", i.windows["1W"].returnPct?.toFixed(3));
  const [u, f, inr] = set.map((i) => i.windows["1W"].returnPct!);
  console.log("check (1+usd)(1+fx)-1 =", (((1 + u / 100) * (1 + f / 100) - 1) * 100).toFixed(3), "vs INR", inr.toFixed(3));
}
main().then(() => process.exit(0));
