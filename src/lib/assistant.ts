import { z } from "zod";
import { generateJson } from "@/lib/ai/gemini";
import { VIEWS, type ViewId } from "@/lib/catalog";
import { round } from "@/lib/calc/returns";
import { addDays, todayIn } from "@/lib/dates";
import * as repo from "@/lib/db/repo";
import * as research from "@/lib/db/research";
import { REPORT_TZ } from "@/lib/env";
import { shortlist, toUniverseRow, groupLabelMap } from "@/lib/explore";
import { GLOSSARY } from "@/lib/glossary";
import { errorMessage } from "@/lib/log";
import type { MarketBrief } from "@/lib/news/brief";
import { buildFundPerformance, buildIndexPerformance } from "@/lib/pipeline/data";
import type { DiscoveryFundData, DiscoveryGroupData } from "@/lib/pipeline/discovery";
import { summarisePortfolio } from "@/lib/portfolio";
import type { ReportPayload } from "@/lib/report/build";
import { metricTriples } from "@/lib/report/input";
import { screenFund } from "@/lib/report/screening";
import { allowedNumbers, hasAdvice, isAllowedNumber, numberTokens } from "@/lib/report/validate";

// "Ask the assistant": Gemini Flash answers Meera's questions from a compact, verified context
// (her funds, the latest report, market brief, news, Explore shortlist, glossary). Same guard rails
// as the reports: numbers must come from the context or her question, no buy/sell instructions,
// links only to real app pages or retrieved articles. Anything that fails is retried once, then
// replaced by an honest "I can't answer that reliably".

export const APP_PAGES = [
  { href: "/", label: "My Dashboard", about: "weekly assessment, funds at a glance, chart, what matters this week" },
  { href: "/portfolio", label: "My Portfolio", about: "compare funds, holdings and SIPs, add or remove funds" },
  { href: "/market", label: "Market & News", about: "index moves, daily market summary, news by topic" },
  { href: "/explore", label: "Explore Funds", about: "research funds for a future SIP, shortlist, compare, watchlist" },
  { href: "/analyse", label: "Analyse a Fund", about: "research report on any fund by name, scheme code or factsheet PDF" },
  { href: "/reports", label: "Weekly Reports", about: "Saturday reports archive" },
  { href: "/glossary", label: "Glossary", about: "plain-English definitions" },
  { href: "/methodology", label: "How it works", about: "formulas, rules and data sources" },
];

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const short = (n: string) => n.replace(/\s*-\s*Direct Plan.*$/i, "").replace(/\s*-\s*Growth.*$/i, "");

export async function buildAssistantContext(admin: boolean) {
  const asOf = todayIn(REPORT_TZ());
  const funds = await repo.listFunds({ activeOnly: true });
  const [perf, indices, latestMeta, brief, news, metrics, groups] = await Promise.all([
    Promise.all(funds.map((f) => buildFundPerformance(f, asOf))),
    Promise.all((["NIFTY50", "NIFTY_MIDCAP150", "NIFTY_SMALLCAP100"] as const).map((id) => buildIndexPerformance(id, asOf))),
    repo.listReports(1),
    research.getLatestMarketBrief<{ brief: MarketBrief }>().catch(() => null),
    repo.listNewsSince(addDays(asOf, -7) + "T00:00:00.000Z", 60).catch(() => []),
    research.listFundMetrics<DiscoveryFundData>().catch(() => []),
    research.listDiscoveryGroups<DiscoveryGroupData>().catch(() => []),
  ]);
  const report = latestMeta[0] ? await repo.getReport<ReportPayload, unknown>(latestMeta[0].id) : null;
  const labels = groupLabelMap(groups);
  const rows = metrics.map((m) => toUniverseRow(m, labels[m.groupKey] ?? m.groupKey)).filter((r): r is NonNullable<typeof r> => r !== null);
  const sl = shortlist(rows, admin ? await research.getPreferences().catch(() => null) : null).rows;
  const holdings = admin ? await research.listHoldings().catch(() => []) : [];
  const portfolio = admin && holdings.length ? summarisePortfolio(holdings, perf.map((p, i) => ({ ...p, peerKey: funds[i].peerKey }))) : null;

  const newsItems = news.slice(0, 12).map((n, i) => ({ id: `N${i + 1}`, title: n.title, publisher: n.publisher, publishedAt: n.publishedAt?.slice(0, 10), url: n.url, fact: n.relevance?.fact ?? null }));
  return {
    today: asOf,
    trackedFunds: perf.map((p) => {
      const t = metricTriples(p);
      const s = screenFund(p.viewId, t);
      const sum = report?.report.output.funds.find((f) => f.schemeCode === p.schemeCode);
      return {
        name: short(p.schemeName),
        schemeCode: p.schemeCode,
        type: p.viewId ? VIEWS[p.viewId as ViewId].title : p.amfiCategory,
        nav: p.nav ? { value: round(p.nav.value, 4), date: p.nav.date } : null,
        returnsPct: { week: t["1W"].fund, month: t["1M"].fund, thisYear: t.YTD.fund },
        weekVsIndexPoints: t["1W"].vsBenchmarkPp,
        weekVsSimilarFundsPoints: t["1W"].vsPeerPp,
        monthVsSimilarFundsPoints: t["1M"].vsPeerPp,
        index: p.benchmark?.name ?? null,
        status: s.flag ? "worth monitoring" : "on track",
        statusReason: s.reason,
        latestReportSummary: sum ? [sum.performance, sum.comparison, sum.marketContext] : null,
      };
    }),
    weeklyAssessment: report ? { weekEnding: report.weekEnding, label: report.assessment, reason: report.assessmentReason, reportLink: `/reports/${report.id}` } : null,
    marketIndices: indices.map((i) => ({ name: i.name, date: i.current?.date ?? null, weekPct: round(i.windows["1W"].returnPct), monthPct: round(i.windows["1M"].returnPct) })),
    marketBrief: brief ? { date: brief.date, headline: brief.data.brief.headline, moves: brief.data.brief.biggestMoves, economy: brief.data.brief.macro, risks: brief.data.brief.risks } : null,
    recentNews: newsItems,
    exploreShortlist: sl.map((r) => ({ name: short(r.name), category: r.groupLabel, label: r.label, threeYearPctPerYear: r.r3, scoreOutOf100: r.score, analyseLink: `/analyse?code=${r.code}` })),
    portfolio: portfolio
      ? { currentValueRupees: portfolio.currentValue === null ? null : Math.round(portfolio.currentValue), investedRupees: portfolio.invested, monthlySipRupees: portfolio.monthlySip, gainPct: portfolio.gain ? round(portfolio.gain.pct) : null }
      : admin
        ? "No holdings entered yet (Meera can add them on My Portfolio)."
        : "Private — the visitor is not signed in, so holdings are not available.",
    glossary: GLOSSARY.map((g) => ({ term: g.term, meaning: g.short, link: `/glossary#${g.slug}` })),
    appPages: APP_PAGES,
  };
}

export type AssistantContext = Awaited<ReturnType<typeof buildAssistantContext>>;

const Answer = z.object({
  answer: z.string().min(5).max(1500),
  links: z.array(z.object({ label: z.string().min(1).max(80), href: z.string().min(1).max(500) })).max(4),
  followUps: z.array(z.string().min(3).max(90)).max(3),
});
export type AssistantAnswer = z.infer<typeof Answer>;

const SCHEMA = {
  type: "object",
  properties: {
    answer: { type: "string", description: "Plain-language answer, at most about 140 words. Short paragraphs or a few bullets." },
    links: { type: "array", items: { type: "object", properties: { label: { type: "string" }, href: { type: "string" } }, required: ["label", "href"] } },
    followUps: { type: "array", items: { type: "string" }, description: "Up to 3 short follow-up questions Meera might ask next." },
  },
  required: ["answer", "links", "followUps"],
};

const SYSTEM = `You are the friendly money assistant inside "Meera's Money", a personal mutual-fund tracker. Meera is 28 and not a finance expert.
Use everyday words and short sentences. Explain any jargon in a few words (the glossary in CONTEXT helps).
RULES:
1. Facts about her funds, the market, news or her portfolio must come ONLY from CONTEXT. Quote numbers exactly as given there. If CONTEXT doesn't have it, say you don't have that data and point to the right page.
2. General education (what is a SIP, how expense ratios work, why diversify) is fine, without inventing specific figures.
3. Never tell her to buy, sell, switch, redeem, stop or increase an investment, and never promise returns. If she asks "should I…", explain what to look at, point to Analyse a Fund / Explore Funds / the weekly assessment, and remind her this is not personal advice.
4. Do not claim a news event caused a fund's return; use "may" or "coincided with".
5. links: only hrefs that appear in CONTEXT (appPages, reportLink, analyseLink, glossary links, or recentNews urls). Pick the 1–3 most useful.
6. If the question is unrelated to money or this app, briefly say what you can help with.`;

export function allowedLinks(ctx: AssistantContext): Set<string> {
  const s = new Set<string>(APP_PAGES.map((p) => p.href));
  if (ctx.weeklyAssessment) s.add(ctx.weeklyAssessment.reportLink);
  ctx.exploreShortlist.forEach((r) => s.add(r.analyseLink));
  ctx.glossary.forEach((g) => s.add(g.link));
  ctx.recentNews.forEach((n) => s.add(n.url));
  ctx.trackedFunds.forEach((f) => s.add(`/funds/${f.schemeCode}`));
  return s;
}

export function validateAnswer(raw: unknown, ctx: AssistantContext, question: string): { ok: boolean; errors: string[]; value?: AssistantAnswer } {
  const p = Answer.safeParse(raw);
  if (!p.success) return { ok: false, errors: p.error.issues.slice(0, 4).map((i) => `${i.path.join(".")} ${i.message}`) };
  const errors: string[] = [];
  const allowed = allowedNumbers([ctx, question]);
  for (const n of numberTokens(p.data.answer)) if (!isAllowedNumber(n, allowed)) errors.push(`number ${n.value} is not in CONTEXT`);
  if (hasAdvice(p.data.answer)) errors.push("answer reads like a buy/sell instruction");
  const links = allowedLinks(ctx);
  const goodLinks = p.data.links.filter((l) => links.has(l.href));
  return errors.length ? { ok: false, errors } : { ok: true, errors: [], value: { ...p.data, links: goodLinks } };
}

export const FALLBACK: AssistantAnswer = {
  answer: "Sorry — I couldn't answer that reliably from the data I have. You can find your funds' figures on My Portfolio, this week's verdict on the Dashboard, and explanations of terms in the Glossary.",
  links: [
    { label: "My Portfolio", href: "/portfolio" },
    { label: "Glossary", href: "/glossary" },
  ],
  followUps: ["How did my funds do this week?", "What does NAV mean?"],
};

export async function askAssistant(messages: ChatMessage[], ctx: AssistantContext): Promise<{ answer: AssistantAnswer; model: string | null; grounded: boolean; errors: string[] }> {
  const question = messages.at(-1)?.content ?? "";
  const history = messages.slice(-7, -1).map((m) => `${m.role === "user" ? "Meera" : "Assistant"}: ${m.content}`).join("\n");
  const errors: string[] = [];
  let feedback = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const { json, modelVersion } = await generateJson({
        system: SYSTEM,
        prompt: `CONTEXT:\n${JSON.stringify(ctx)}\n\n${history ? `CONVERSATION SO FAR:\n${history}\n\n` : ""}MEERA ASKS: ${question}${feedback}`,
        schema: SCHEMA,
        temperature: 0.3,
        timeoutMs: 45_000,
      });
      const v = validateAnswer(json, ctx, question);
      if (v.ok && v.value) return { answer: v.value, model: modelVersion, grounded: true, errors };
      errors.push(...v.errors);
      feedback = `\n\nYour previous answer was rejected: ${v.errors.slice(0, 5).join("; ")}. Fix it.`;
    } catch (e) {
      errors.push(errorMessage(e));
    }
  }
  return { answer: FALLBACK, model: null, grounded: false, errors };
}
