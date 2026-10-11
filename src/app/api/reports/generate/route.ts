import { adminRoute, json, readJson } from "@/lib/api";
import { todayIn } from "@/lib/dates";
import { REPORT_TZ } from "@/lib/env";
import { refreshAllFundNavs, refreshIndices, refreshMarketSnapshot, refreshPeers } from "@/lib/pipeline/data";
import { createWeeklyReport } from "@/lib/report/build";
import { errorMessage } from "@/lib/log";

export const maxDuration = 300;

// On-demand report (kind "manual"): optionally refreshes data first, never sends anything.
export const POST = adminRoute(async (req: Request) => {
  const { refresh = true, reuseNews = false } = await readJson<{ refresh?: boolean; reuseNews?: boolean }>(req).catch(() => ({ refresh: true, reuseNews: false }));
  const notes: string[] = [];
  if (refresh) {
    const today = todayIn(REPORT_TZ());
    const navs = await refreshAllFundNavs(today);
    navs.filter((n) => !n.ok).forEach((n) => notes.push(`NAV ${n.schemeCode}: ${"error" in n ? n.error : ""}`));
    const idx = await refreshIndices(today);
    idx.filter((i) => !i.ok).forEach((i) => notes.push(`Index ${i.id}: ${i.error}`));
    await refreshMarketSnapshot().catch((e) => notes.push(`Market snapshot: ${errorMessage(e)}`));
    const peers = await refreshPeers(today);
    peers.filter((p) => !p.ok).forEach((p) => notes.push(`Peers ${p.peerKey}: ${"error" in p ? p.error : ""}`));
  }
  const { id, report } = await createWeeklyReport({ kind: "manual", reuseNews });
  return json({ id, generator: report.generator, model: report.model, notes }, 201);
});
