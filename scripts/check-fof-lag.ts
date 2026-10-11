// Checks whether an overseas FoF NAV on date T tracks its benchmark's close on T or T-1.
import { addDays } from "@/lib/dates";
import { pctChange, observationOnOrBefore, cleanSeries } from "@/lib/calc/returns";
import * as repo from "@/lib/db/repo";
import { getIndexSeries } from "@/lib/pipeline/data";

async function main() {
  const fund = cleanSeries(await repo.getNavSeries(150751, "2026-01-01"));
  const bench = cleanSeries((await getIndexSeries("NASDAQ100_INR", "2026-01-01")).series);
  for (const lag of [0, 1]) {
    const diffs: number[] = [];
    for (let i = 1; i < fund.length; i++) {
      const a = fund[i - 1], b = fund[i];
      const ba = observationOnOrBefore(bench, addDays(a.date, -lag), 4);
      const bb = observationOnOrBefore(bench, addDays(b.date, -lag), 4);
      if (!ba || !bb || ba.date === bb.date) continue;
      diffs.push((pctChange(b.value, a.value)! - pctChange(bb.value, ba.value)!) ** 2);
    }
    console.log(`lag ${lag}: daily tracking RMSE ${Math.sqrt(diffs.reduce((x, y) => x + y, 0) / diffs.length).toFixed(3)} pp over ${diffs.length} days`);
  }
}
main();
