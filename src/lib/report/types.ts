import { z } from "zod";
import { VIEW_IDS, type ViewId } from "@/lib/catalog";
import type { WindowKey } from "@/lib/calc/returns";
import type { ISODate } from "@/lib/dates";

export const ASSESSMENT_LABELS = ["No action needed", "One fund worth watching", "Consider reviewing your allocation"] as const;
export type AssessmentLabel = (typeof ASSESSMENT_LABELS)[number];

export const REPORT_SCHEMA_VERSION = "report-v1";

// ---------------------------------------------------------------------------------------------
// Input snapshot: everything the model may use. Stored verbatim with each report for audit.

export interface MetricTriple {
  fund: number | null;
  benchmark: number | null;
  peerAverage: number | null;
  vsBenchmarkPp: number | null;
  vsPeerPp: number | null;
  referenceDate: ISODate | null;
  peerCount: number;
}

export interface FundInput {
  schemeCode: number;
  name: string;
  view: ViewId | null;
  navDate: ISODate | null;
  nav: number | null;
  benchmarkName: string | null;
  statedBenchmark: string | null;
  peerGroup: string | null;
  returns: Record<WindowKey, MetricTriple>;
  dataNotes: string[];
  screening: { flag: boolean; reason: string };
}

export interface IndexInput {
  id: string;
  name: string;
  date: ISODate | null;
  level: number | null;
  returns: Record<WindowKey, number | null>;
}

export interface NewsInput {
  id: string; // short evidence id, e.g. "N3"
  title: string;
  publisher: string;
  publishedAt: string | null;
  url: string;
  summary: string;
  views: ViewId[];
}

export interface ReportInput {
  schemaVersion: string;
  weekEnding: ISODate;
  investorName: string;
  funds: FundInput[];
  indices: IndexInput[];
  breadth: { index: string; pe: number | null; advances: number | null; declines: number | null; dividendYield: number | null }[];
  breadthDate: ISODate | null;
  news: NewsInput[];
  views: { id: ViewId; title: string; focus: string; fundCodes: number[]; indexIds: string[] }[];
  screening: { suggestedLabel: AssessmentLabel; rationale: string };
}

// ---------------------------------------------------------------------------------------------
// Model output

export const ReportOutput = z.object({
  funds: z
    .array(
      z.object({
        schemeCode: z.number().int(),
        performance: z.string().min(20).max(400),
        comparison: z.string().min(20).max(450),
        marketContext: z.string().min(20).max(450),
        evidenceIds: z.array(z.string()).max(4),
      }),
    )
    .min(1),
  categories: z.array(
    z.object({
      viewId: z.enum(VIEW_IDS as [ViewId, ...ViewId[]]),
      headline: z.string().min(10).max(140),
      summary: z.string().min(40).max(900),
      watchItems: z.array(z.string().min(5).max(220)).max(4),
      evidenceIds: z.array(z.string()).max(6),
    }),
  ),
  marketSummary: z.object({ text: z.string().min(40).max(900), evidenceIds: z.array(z.string()).max(6) }),
  assessment: z.object({
    label: z.enum(ASSESSMENT_LABELS),
    reason: z.string().min(30).max(500),
    fundOfConcern: z.number().int().nullable(),
  }),
});
export type ReportOutput = z.infer<typeof ReportOutput>;

/** JSON Schema handed to Gemini's structured-output mode (mirrors the zod schema above). */
export const REPORT_JSON_SCHEMA = {
  type: "object",
  properties: {
    funds: {
      type: "array",
      items: {
        type: "object",
        properties: {
          schemeCode: { type: "integer" },
          performance: { type: "string", description: "Sentence 1: the fund's own NAV-based performance." },
          comparison: { type: "string", description: "Sentence 2: versus the stated benchmark and the category peer average." },
          marketContext: { type: "string", description: "Sentence 3: what market/macro evidence may explain the difference, citing evidence ids." },
          evidenceIds: { type: "array", items: { type: "string" } },
        },
        required: ["schemeCode", "performance", "comparison", "marketContext", "evidenceIds"],
      },
    },
    categories: {
      type: "array",
      items: {
        type: "object",
        properties: {
          viewId: { type: "string", enum: VIEW_IDS },
          headline: { type: "string" },
          summary: { type: "string" },
          watchItems: { type: "array", items: { type: "string" } },
          evidenceIds: { type: "array", items: { type: "string" } },
        },
        required: ["viewId", "headline", "summary", "watchItems", "evidenceIds"],
      },
    },
    marketSummary: {
      type: "object",
      properties: { text: { type: "string" }, evidenceIds: { type: "array", items: { type: "string" } } },
      required: ["text", "evidenceIds"],
    },
    assessment: {
      type: "object",
      properties: {
        label: { type: "string", enum: [...ASSESSMENT_LABELS] },
        reason: { type: "string" },
        fundOfConcern: { type: ["integer", "null"] },
      },
      required: ["label", "reason", "fundOfConcern"],
    },
  },
  required: ["funds", "categories", "marketSummary", "assessment"],
} as const;

export interface GeneratedReport {
  output: ReportOutput;
  generator: "gemini" | "fallback";
  model: string | null;
  attempts: number;
  validationErrors: string[];
}
