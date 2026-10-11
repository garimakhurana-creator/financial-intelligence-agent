import { HEADLINE_INDICES } from "@/lib/catalog";
import type { ISODate } from "@/lib/dates";
import * as repo from "@/lib/db/repo";
import * as research from "@/lib/db/research";
import { buildBriefInput, explainNews, writeMarketBrief } from "@/lib/news/brief";
import { gatherTopicNews } from "@/lib/news/topics";
import { buildIndexSet } from "@/lib/pipeline/data";
import { weekEndingFor } from "@/lib/report/build";
import type { IndexSnapshot } from "@/lib/sources/nse";

/**
 * Daily Market & News refresh: retrieve topic news, add Gemini's labelled fact/why lines
 * (validated; failures simply leave them out), store, then write the market brief.
 */
export async function refreshMarketNews(asOf: ISODate) {
  const gathered = await gatherTopicNews(asOf);
  const explained = await explainNews(gathered.items);
  await repo.saveTopicNews(
    weekEndingFor(asOf),
    gathered.items.map((n) => ({ ...n, relevance: explained.map.get(n.id) ?? null })),
  );

  const indices = await buildIndexSet([...HEADLINE_INDICES, "NIFTY_SMALLCAP250", "NASDAQ100", "USDINR"], asOf);
  const snap = await repo.getLatestMarketSnapshot<IndexSnapshot[]>();
  const sorted = [...gathered.items].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  const input = buildBriefInput(asOf, indices, snap?.data ?? [], sorted);
  const b = await writeMarketBrief(input);
  if (b.brief) {
    await research.saveMarketBrief(asOf, { brief: b.brief, input, attempts: b.attempts, errors: b.errors }, "gemini", b.model);
  }
  return {
    news: gathered.items.length,
    explained: explained.map.size,
    rejectedExplanations: explained.rejected,
    newsErrors: gathered.errors.length,
    brief: b.brief ? "written" : `failed (${b.errors.slice(-1)[0] ?? "unknown"})`,
  };
}
