// Live check of every external data source and the calculation engine on real data.
// Usage: npx tsx scripts/smoke-sources.ts
import { INDICES, PEER_RULES, SEED_FUNDS, type IndexId } from "@/lib/catalog";
import { computeWindowReturns, round, WINDOWS } from "@/lib/calc/returns";
import { computePeerAverage } from "@/lib/calc/peers";
import { addDays, todayIn } from "@/lib/dates";
import { fetchSchemeHistory } from "@/lib/sources/mfapi";
import { fetchNavAll, selectPeerUniverse } from "@/lib/sources/amfi";
import { deriveInrSeries, fetchRawIndex } from "@/lib/sources/indices";
import { fetchNseAllIndices } from "@/lib/sources/nse";
import { mapLimit } from "@/lib/http";

async function main() {
  const today = todayIn();
  const from = "2025-12-01";
  console.log(`as of ${today}\n`);

  console.log("== AMFI");
  const amfi = await fetchNavAll();
  console.log(`parsed ${amfi.length} schemes`);
  for (const rule of PEER_RULES.slice(0, 5)) {
    const u = selectPeerUniverse(amfi, rule);
    console.log(`  ${rule.key}: ${u.members.length} direct-growth peers ${u.problem ?? ""}`);
  }

  console.log("\n== Indices");
  const series: Partial<Record<IndexId, { date: string; value: number }[]>> = {};
  for (const id of ["NIFTY50", "NIFTY_MIDCAP150", "NIFTY_SMALLCAP100", "NIFTY_SMALLCAP250", "NASDAQ100", "USDINR"] as IndexId[]) {
    try {
      const r = await fetchRawIndex(id, from, today);
      series[id] = r.series;
      const last = r.series.at(-1)!;
      const { windows } = computeWindowReturns(r.series, today);
      console.log(
        `  ${INDICES[id].name.padEnd(20)} ${r.series.length} pts, last ${last.date} ${last.value.toFixed(2)} via ${r.source}` +
          ` | 1W ${round(windows["1W"].returnPct)}% 1M ${round(windows["1M"].returnPct)}% YTD ${round(windows["YTD"].returnPct)}%` +
          (r.fallbacks.length ? ` [fallbacks: ${r.fallbacks.join(" | ")}]` : ""),
      );
    } catch (e) {
      console.log(`  ${id} FAILED: ${(e as Error).message}`);
    }
  }
  if (series.NASDAQ100 && series.USDINR) {
    const inr = deriveInrSeries(series.NASDAQ100, series.USDINR);
    const { windows } = computeWindowReturns(inr, today);
    console.log(`  Nasdaq-100 INR (derived) ${inr.length} pts | 1W ${round(windows["1W"].returnPct)}%`);
  }
  try {
    const snaps = await fetchNseAllIndices();
    const s = snaps.find((x) => x.index === "NIFTY SMALLCAP 100");
    console.log(`  NSE allIndices: ${snaps.length} indices; Smallcap 100 PE ${s?.pe} adv/dec ${s?.advances}/${s?.declines}`);
  } catch (e) {
    console.log(`  NSE allIndices FAILED: ${(e as Error).message}`);
  }

  console.log("\n== Seed funds");
  for (const f of SEED_FUNDS) {
    const h = await fetchSchemeHistory(f.schemeCode, { from, to: today });
    const { current, windows } = computeWindowReturns(h.series, today);
    console.log(`  ${f.schemeCode} ${h.meta.schemeName}`);
    console.log(`    NAV ${current?.value} on ${current?.date}; ` + WINDOWS.map((w) => `${w} ${round(windows[w].returnPct)}% (ref ${windows[w].referenceDate})`).join(", "));
  }

  console.log("\n== Peer average (mid_cap) — live");
  const rule = PEER_RULES.find((r) => r.key === "mid_cap")!;
  const u = selectPeerUniverse(amfi, rule);
  const t0 = Date.now();
  const hist = await mapLimit(u.members, 8, (m) => fetchSchemeHistory(m.schemeCode, { from: addDays(today, -400), to: today }));
  const ok = hist.flatMap((r, i) => (r.status === "fulfilled" ? [{ schemeCode: u.members[i].schemeCode, schemeName: u.members[i].schemeName, series: r.value.series }] : []));
  const asOf = SEED_FUNDS.length ? today : today;
  const peer = computePeerAverage(ok, asOf);
  console.log(`  fetched ${ok.length}/${u.members.length} in ${Date.now() - t0} ms`);
  for (const w of WINDOWS) console.log(`  ${w}: mean ${round(peer.windows[w].mean)}% median ${round(peer.windows[w].median)}% n=${peer.windows[w].n} (${peer.windows[w].quality})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
