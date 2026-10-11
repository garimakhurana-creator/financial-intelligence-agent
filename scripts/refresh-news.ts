// Daily Market & News refresh. Usage: npx tsx --env-file=.env.local scripts/refresh-news.ts
import { todayIn } from "@/lib/dates";
import { refreshMarketNews } from "@/lib/pipeline/news";
import * as research from "@/lib/db/research";
import type { MarketBrief } from "@/lib/news/brief";
async function main() {
  const t = Date.now();
  console.log(await refreshMarketNews(todayIn()), `${((Date.now() - t) / 1000).toFixed(1)} s`);
  const b = await research.getLatestMarketBrief<{ brief: MarketBrief; errors: string[] }>();
  console.log(JSON.stringify(b?.data.brief, null, 1), "\nerrors:", b?.data.errors);
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
