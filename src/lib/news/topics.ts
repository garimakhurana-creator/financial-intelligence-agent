import type { ViewId } from "@/lib/catalog";
import { addDays, type ISODate } from "@/lib/dates";
import { errorMessage, log } from "@/lib/log";
import { BLOCKED, credibility, gnewsSearch, hostOf, newsId, strip, tavilySearch, titleKey, type RawArticle } from "@/lib/sources/news";

// Market & News topics. Each topic has its own queries and the fund categories it can affect,
// which is how "relevant to my funds" is decided — a fixed mapping, not a model guess.

export type TopicId = "indian_markets" | "mutual_funds" | "rbi_rates" | "inflation_economy" | "global_markets" | "tech_us" | "debt_bonds";

export interface Topic {
  id: TopicId;
  label: string;
  queries: string[];
  affects: ViewId[];
}

export const NEWS_TOPICS: Topic[] = [
  { id: "indian_markets", label: "Indian Markets", queries: ["Sensex Nifty stock market today India", "Nifty midcap smallcap stocks India"], affects: ["large_cap_index", "mid_cap", "small_cap"] },
  { id: "mutual_funds", label: "Mutual Funds", queries: ["mutual fund SIP inflows India AMFI", "SEBI mutual fund rules"], affects: ["large_cap_index", "mid_cap", "small_cap", "short_debt", "intl_fof"] },
  { id: "rbi_rates", label: "RBI & Interest Rates", queries: ["RBI repo rate monetary policy", "RBI liquidity interest rates India"], affects: ["short_debt", "large_cap_index"] },
  { id: "inflation_economy", label: "Inflation & Economy", queries: ["India CPI inflation data", "India GDP growth economy"], affects: ["short_debt", "large_cap_index", "mid_cap"] },
  { id: "global_markets", label: "Global Markets", queries: ["global stock markets oil prices dollar", "Federal Reserve interest rates"], affects: ["intl_fof", "large_cap_index"] },
  { id: "tech_us", label: "Technology & US Markets", queries: ["Nasdaq 100 technology stocks", "US tech earnings Nvidia Microsoft Apple"], affects: ["intl_fof"] },
  { id: "debt_bonds", label: "Debt & Bond Markets", queries: ["India government bond yields", "India corporate bond market"], affects: ["short_debt"] },
];

export const TOPIC_BY_ID = Object.fromEntries(NEWS_TOPICS.map((t) => [t.id, t])) as Record<TopicId, Topic>;

export interface TopicNewsItem {
  id: string;
  url: string;
  title: string;
  publisher: string;
  publishedAt: string;
  summary: string;
  provider: string;
  topics: TopicId[];
  views: ViewId[];
}

/**
 * Pull recent news for every topic from Tavily (primary) and GNews (secondary), keep only dated
 * http(s) items inside the window, de-duplicate by URL and near-identical headline, and keep the
 * most credible items per topic. Never fabricates: failures are returned as errors.
 */
export async function gatherTopicNews(asOf: ISODate, opts: { days?: number; perTopic?: number } = {}) {
  const days = opts.days ?? 7;
  const perTopic = opts.perTopic ?? 8;
  const from = addDays(asOf, -days);
  const raw: (RawArticle & { topic: TopicId })[] = [];
  const errors: string[] = [];
  for (const t of NEWS_TOPICS) {
    for (const q of t.queries) {
      // The view argument is a placeholder; topics carry their own category mapping.
      const [tv, gn] = await Promise.allSettled([tavilySearch(q, t.affects[0]), gnewsSearch(q, t.affects[0], from)]);
      if (tv.status === "fulfilled") raw.push(...tv.value.map((a) => ({ ...a, topic: t.id })));
      else errors.push(`tavily "${q}": ${errorMessage(tv.reason)}`);
      if (gn.status === "fulfilled") raw.push(...gn.value.map((a) => ({ ...a, topic: t.id })));
      else errors.push(`gnews "${q}": ${errorMessage(gn.reason)}`);
    }
  }

  const byId = new Map<string, TopicNewsItem & { score: number }>();
  const byTitle = new Map<string, string>();
  for (const a of raw) {
    const host = hostOf(a.url);
    if (!host || BLOCKED.test(host) || !a.publishedAt) continue;
    const day = a.publishedAt.slice(0, 10);
    if (day < from || day > addDays(asOf, 1)) continue;
    const title = strip(a.title);
    if (title.length < 15) continue;
    const id = newsId(a.url);
    const tk = titleKey(title);
    const existing = byId.get(id) ?? (byTitle.has(tk) ? byId.get(byTitle.get(tk)!) : undefined);
    const topic = TOPIC_BY_ID[a.topic];
    if (existing) {
      if (!existing.topics.includes(a.topic)) existing.topics.push(a.topic);
      for (const v of topic.affects) if (!existing.views.includes(v)) existing.views.push(v);
      continue;
    }
    byTitle.set(tk, id);
    byId.set(id, {
      id,
      url: a.url,
      title,
      publisher: a.publisher?.trim() || host,
      publishedAt: a.publishedAt,
      summary: strip(a.summary).slice(0, 600),
      provider: a.provider,
      topics: [a.topic],
      views: [...topic.affects],
      score: credibility(host),
    });
  }
  const all = [...byId.values()];
  const keep = new Set<string>();
  for (const t of NEWS_TOPICS) {
    all
      .filter((n) => n.topics.includes(t.id))
      .sort((a, b) => b.score - a.score || b.publishedAt.localeCompare(a.publishedAt))
      .slice(0, perTopic)
      .forEach((n) => keep.add(n.id));
  }
  if (errors.length) log.warn("topic_news.partial_failure", { errors: errors.slice(0, 10) });
  return { items: all.filter((n) => keep.has(n.id)).map(({ score: _s, ...n }) => n), rawCount: raw.length, errors };
}
