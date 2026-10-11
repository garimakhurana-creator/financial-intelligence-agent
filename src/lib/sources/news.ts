import { createHash } from "node:crypto";
import { z } from "zod";
import { VIEWS, type ViewId } from "@/lib/catalog";
import { addDays, type ISODate } from "@/lib/dates";
import { fetchJson } from "@/lib/http";
import { errorMessage, log } from "@/lib/log";
import type { NewsItem } from "@/lib/db/repo";

/** Higher = more credible for Indian market/macro news. Unknown domains get 0 but are not dropped. */
const CREDIBILITY: Record<string, number> = {
  "rbi.org.in": 10,
  "nseindia.com": 9,
  "sebi.gov.in": 9,
  "pib.gov.in": 8,
  "federalreserve.gov": 9,
  "reuters.com": 8,
  "bloomberg.com": 8,
  "livemint.com": 7,
  "economictimes.indiatimes.com": 7,
  "business-standard.com": 7,
  "thehindubusinessline.com": 7,
  "financialexpress.com": 6,
  "moneycontrol.com": 6,
  "cnbctv18.com": 6,
  "ndtvprofit.com": 6,
  "cnbc.com": 6,
  "valueresearchonline.com": 6,
  "morningstar.in": 6,
};

const BLOCKED = /(youtube\.com|facebook\.com|twitter\.com|x\.com|instagram\.com|reddit\.com|quora\.com|pinterest\.)/i;

export function hostOf(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return u.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function credibility(host: string): number {
  for (const [d, s] of Object.entries(CREDIBILITY)) if (host === d || host.endsWith(`.${d}`)) return s;
  return 0;
}

export function canonicalUrl(url: string): string {
  const u = new URL(url);
  u.hash = "";
  for (const p of [...u.searchParams.keys()]) if (/^(utm_|ref|fbclid|gclid)/i.test(p)) u.searchParams.delete(p);
  return `${u.protocol}//${u.hostname.replace(/^www\./, "")}${u.pathname.replace(/\/$/, "")}${u.search}`;
}

function titleKey(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 3).slice(0, 8).join(" ");
}

export const newsId = (url: string) => createHash("sha1").update(canonicalUrl(url)).digest("hex").slice(0, 32);

interface RawArticle {
  url: string;
  title: string;
  publisher?: string;
  publishedAt: string | null;
  summary: string;
  provider: "tavily" | "gnews";
  view: ViewId;
}

const Tavily = z.object({
  results: z.array(z.object({ url: z.string(), title: z.string(), content: z.string().optional(), published_date: z.string().optional().nullable() })),
});

async function tavilySearch(query: string, view: ViewId): Promise<RawArticle[]> {
  const key = process.env.TAVILY_API_KEY;
  if (!key) return [];
  const raw = await fetchJson<unknown>("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ query, topic: "news", days: 7, max_results: 6, search_depth: "basic" }),
    label: "tavily search",
    timeoutMs: 20_000,
  });
  const parsed = Tavily.safeParse(raw);
  if (!parsed.success) throw new Error("Tavily payload not recognised");
  return parsed.data.results.map((r) => ({
    url: r.url,
    title: r.title,
    publishedAt: r.published_date ? new Date(r.published_date).toISOString() : null,
    summary: r.content ?? "",
    provider: "tavily" as const,
    view,
  }));
}

const GNews = z.object({
  articles: z.array(
    z.object({
      url: z.string(),
      title: z.string(),
      description: z.string().nullable().optional(),
      publishedAt: z.string().nullable().optional(),
      source: z.object({ name: z.string().optional() }).optional(),
    }),
  ),
});

async function gnewsSearch(query: string, view: ViewId, from: ISODate): Promise<RawArticle[]> {
  const key = process.env.GNEWS_API_KEY;
  if (!key) return [];
  const url =
    `https://gnews.io/api/v4/search?q=${encodeURIComponent(query)}&lang=en&max=6&sortby=relevance` +
    `&from=${from}T00:00:00Z&apikey=${encodeURIComponent(key)}`;
  const raw = await fetchJson<unknown>(url, { label: "gnews search", timeoutMs: 15_000 });
  const parsed = GNews.safeParse(raw);
  if (!parsed.success) throw new Error("GNews payload not recognised");
  return parsed.data.articles.map((a) => ({
    url: a.url,
    title: a.title,
    publisher: a.source?.name,
    publishedAt: a.publishedAt ? new Date(a.publishedAt).toISOString() : null,
    summary: a.description ?? "",
    provider: "gnews" as const,
    view,
  }));
}

const strip = (s: string) => s.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

/**
 * Validate, de-duplicate and rank raw articles. Keeps only http(s) links published inside the
 * window (undated items are dropped — we cannot show an old event as new), merges duplicates
 * by canonical URL and by near-identical headline, and keeps the most credible per view.
 */
export function normaliseNews(raw: RawArticle[], windowStart: ISODate, windowEnd: ISODate, perView = 6): (NewsItem & { id: string })[] {
  const byUrl = new Map<string, NewsItem & { id: string; score: number }>();
  const seenTitles = new Map<string, string>();
  for (const a of raw) {
    const host = hostOf(a.url);
    if (!host || BLOCKED.test(host)) continue;
    if (!a.publishedAt) continue;
    const day = a.publishedAt.slice(0, 10);
    if (day < windowStart || day > addDays(windowEnd, 1)) continue;
    const title = strip(a.title);
    if (title.length < 15) continue;
    const id = newsId(a.url);
    const tk = titleKey(title);
    const dupeOf = byUrl.get(id) ?? (seenTitles.has(tk) ? byUrl.get(seenTitles.get(tk)!) : undefined);
    if (dupeOf) {
      if (!dupeOf.views.includes(a.view)) dupeOf.views.push(a.view);
      continue;
    }
    seenTitles.set(tk, id);
    byUrl.set(id, {
      id,
      url: a.url,
      title,
      publisher: a.publisher?.trim() || host,
      publishedAt: a.publishedAt,
      summary: strip(a.summary).slice(0, 600),
      views: [a.view],
      provider: a.provider,
      score: credibility(host),
    });
  }
  const all = [...byUrl.values()];
  const keep = new Set<string>();
  for (const v of Object.keys(VIEWS) as ViewId[]) {
    all
      .filter((n) => n.views.includes(v))
      .sort((a, b) => b.score - a.score || (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""))
      .slice(0, perView)
      .forEach((n) => keep.add(n.id));
  }
  return all.filter((n) => keep.has(n.id)).map(({ score: _score, ...n }) => n);
}

/** Gather the week's news for all five category views from Tavily (primary) and GNews (secondary). */
export async function gatherWeeklyNews(weekEnding: ISODate) {
  const from = addDays(weekEnding, -7);
  const raw: RawArticle[] = [];
  const errors: string[] = [];
  for (const view of Object.values(VIEWS)) {
    for (const q of view.newsQueries) {
      const [t, g] = await Promise.allSettled([tavilySearch(q, view.id), gnewsSearch(q, view.id, from)]);
      if (t.status === "fulfilled") raw.push(...t.value);
      else errors.push(`tavily "${q}": ${errorMessage(t.reason)}`);
      if (g.status === "fulfilled") raw.push(...g.value);
      else errors.push(`gnews "${q}": ${errorMessage(g.reason)}`);
    }
  }
  if (errors.length) log.warn("news.partial_failure", { errors });
  return { items: normaliseNews(raw, from, weekEnding), rawCount: raw.length, errors };
}
