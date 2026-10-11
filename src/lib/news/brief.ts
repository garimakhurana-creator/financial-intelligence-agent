import { z } from "zod";
import { generateJson } from "@/lib/ai/gemini";
import { VIEW_IDS, VIEWS, type ViewId } from "@/lib/catalog";
import { round } from "@/lib/calc/returns";
import { errorMessage } from "@/lib/log";
import type { IndexPerformance } from "@/lib/pipeline/data";
import { ADVICE_RE, allowedNumbers, isAllowedNumber, numberTokens } from "@/lib/report/validate";
import type { IndexSnapshot } from "@/lib/sources/nse";
import { TOPIC_BY_ID, type TopicNewsItem } from "@/lib/news/topics";

// Gemini-written news context, held to the same rules as the weekly report: every number must
// come from the input, interpretation is labelled as such, no buy/sell language, and anything that
// fails validation is dropped rather than shown.

const PLAIN = `Write for Meera, a 28-year-old non-expert investor. Everyday words, short sentences. Never tell her to buy, sell, switch or stop an investment. Only use numbers that appear in the INPUT. Separate facts (what the article reports) from interpretation (what it may mean), and use cautious words like "may" or "could" for interpretation. Never claim a news event caused a fund's return.`;

// ---------------------------------------------------------------------------------------------
// Per-article "fact" + "why it may matter"

const RelevanceOut = z.object({
  items: z.array(z.object({ id: z.string(), fact: z.string().min(10).max(320), why: z.string().min(10).max(260) })),
});

const RELEVANCE_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          fact: { type: "string", description: "One sentence: what the article reports, using only its title and summary." },
          why: { type: "string", description: "One sentence, interpretation: why this may matter for the listed fund categories. Use 'may' or 'could'." },
        },
        required: ["id", "fact", "why"],
      },
    },
  },
  required: ["items"],
};

export async function explainNews(items: TopicNewsItem[]): Promise<{ map: Map<string, { fact: string; why: string }>; model: string | null; rejected: number; error?: string }> {
  const map = new Map<string, { fact: string; why: string }>();
  if (items.length === 0) return { map, model: null, rejected: 0 };
  const input = items.map((n) => ({
    id: n.id,
    title: n.title,
    publisher: n.publisher,
    summary: n.summary,
    topics: n.topics.map((t) => TOPIC_BY_ID[t].label),
    affectsFundTypes: n.views.map((v) => VIEWS[v].title),
  }));
  try {
    const { json, modelVersion } = await generateJson({
      system: `${PLAIN}\nFor each article return a factual one-sentence summary ("fact") and a one-sentence interpretation ("why") of how it may matter for the fund types listed with it.`,
      prompt: `INPUT:\n${JSON.stringify(input)}`,
      schema: RELEVANCE_SCHEMA,
    });
    const parsed = RelevanceOut.safeParse(json);
    if (!parsed.success) return { map, model: modelVersion, rejected: items.length, error: "schema mismatch" };
    let rejected = 0;
    for (const out of parsed.data.items) {
      const src = items.find((n) => n.id === out.id);
      if (!src) continue;
      // Numbers in fact/why must appear in that article's own title or summary.
      const allowed = allowedNumbers([src.title, src.summary]);
      const bad = [...numberTokens(out.fact), ...numberTokens(out.why)].some((t) => !isAllowedNumber(t, allowed));
      if (bad || ADVICE_RE.test(out.fact) || ADVICE_RE.test(out.why)) {
        rejected++;
        continue;
      }
      map.set(out.id, { fact: out.fact, why: out.why });
    }
    return { map, model: modelVersion, rejected };
  } catch (e) {
    return { map, model: null, rejected: items.length, error: errorMessage(e) };
  }
}

// ---------------------------------------------------------------------------------------------
// "What happened in the market?" brief

export const MarketBrief = z.object({
  headline: z.string().min(10).max(140),
  biggestMoves: z.array(z.string().min(10).max(260)).min(1).max(4),
  macro: z.array(z.string().min(10).max(260)).max(4),
  implications: z.array(z.object({ viewId: z.enum(VIEW_IDS as [ViewId, ...ViewId[]]), text: z.string().min(10).max(260) })),
  risks: z.array(z.string().min(10).max(220)).max(4),
  evidenceIds: z.array(z.string()).max(10),
});
export type MarketBrief = z.infer<typeof MarketBrief>;

const BRIEF_SCHEMA = {
  type: "object",
  properties: {
    headline: { type: "string" },
    biggestMoves: { type: "array", items: { type: "string" } },
    macro: { type: "array", items: { type: "string" } },
    implications: {
      type: "array",
      items: { type: "object", properties: { viewId: { type: "string", enum: VIEW_IDS }, text: { type: "string" } }, required: ["viewId", "text"] },
    },
    risks: { type: "array", items: { type: "string" } },
    evidenceIds: { type: "array", items: { type: "string" } },
  },
  required: ["headline", "biggestMoves", "macro", "implications", "risks", "evidenceIds"],
};

export interface BriefInput {
  asOf: string;
  indices: { id: string; name: string; date: string | null; level: number | null; day: number | null; week: number | null; month: number | null }[];
  breadth: { index: string; advances: number | null; declines: number | null; pe: number | null }[];
  news: { id: string; title: string; publisher: string; publishedAt: string; summary: string; topics: string[] }[];
}

export function buildBriefInput(asOf: string, indices: IndexPerformance[], breadth: IndexSnapshot[], news: TopicNewsItem[]): BriefInput {
  return {
    asOf,
    indices: indices.map((ix) => {
      const c = ix.chart;
      const last = c.at(-1);
      const prev = c.at(-2);
      return {
        id: ix.id,
        name: ix.name,
        date: ix.current?.date ?? null,
        level: ix.current ? round(ix.current.value) : null,
        day: last && prev && last.date === ix.current?.date ? round((last.value / prev.value - 1) * 100) : null,
        week: round(ix.windows["1W"].returnPct),
        month: round(ix.windows["1M"].returnPct),
      };
    }),
    breadth: breadth.map((b) => ({ index: b.index, advances: b.advances, declines: b.declines, pe: b.pe })),
    news: news.slice(0, 18).map((n, i) => ({ id: `N${i + 1}`, title: n.title, publisher: n.publisher, publishedAt: n.publishedAt, summary: n.summary.slice(0, 400), topics: n.topics.map((t) => TOPIC_BY_ID[t].label) })),
  };
}

export function validateBrief(raw: unknown, input: BriefInput): { ok: boolean; errors: string[]; value?: MarketBrief } {
  const p = MarketBrief.safeParse(raw);
  if (!p.success) return { ok: false, errors: p.error.issues.slice(0, 6).map((i) => `${i.path.join(".")} ${i.message}`) };
  const allowed = allowedNumbers(input);
  const ids = new Set(input.news.map((n) => n.id));
  const errors: string[] = [];
  const texts = [p.data.headline, ...p.data.biggestMoves, ...p.data.macro, ...p.data.implications.map((i) => i.text), ...p.data.risks];
  for (const t of texts) {
    for (const n of numberTokens(t)) if (!isAllowedNumber(n, allowed)) errors.push(`number ${n.value} is not in the input`);
    if (ADVICE_RE.test(t)) errors.push("contains buy/sell-style instruction");
  }
  for (const id of p.data.evidenceIds) if (!ids.has(id)) errors.push(`unknown evidence id ${id}`);
  return errors.length ? { ok: false, errors } : { ok: true, errors: [], value: p.data };
}

export async function writeMarketBrief(input: BriefInput): Promise<{ brief: MarketBrief | null; model: string | null; attempts: number; errors: string[] }> {
  const errors: string[] = [];
  let feedback = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const { json, modelVersion } = await generateJson({
        system: `${PLAIN}
Write "What happened in the market?" for the latest session and week:
- headline: one line.
- biggestMoves: 1–3 bullets on the largest index moves, quoting the INPUT numbers.
- macro: up to 3 bullets on the most relevant economic developments from the news.
- implications: one bullet per fund type that has relevant news or index moves (viewIds: ${VIEW_IDS.join(", ")}), phrased as "may"/"could".
- risks: up to 3 things worth keeping an eye on.
- evidenceIds: ids of the news items you relied on.
No filler, no duplicated headlines.`,
        prompt: `INPUT:\n${JSON.stringify(input)}${feedback}`,
        schema: BRIEF_SCHEMA,
      });
      const v = validateBrief(json, input);
      if (v.ok && v.value) return { brief: v.value, model: modelVersion, attempts: attempt, errors };
      errors.push(...v.errors.map((e) => `attempt ${attempt}: ${e}`));
      feedback = `\n\nYour previous answer was rejected: ${v.errors.slice(0, 8).join("; ")}. Fix these.`;
    } catch (e) {
      errors.push(`attempt ${attempt}: ${errorMessage(e)}`);
    }
  }
  return { brief: null, model: null, attempts: 2, errors };
}
