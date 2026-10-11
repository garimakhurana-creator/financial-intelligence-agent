import { z } from "zod";
import { fetchJson } from "@/lib/http";
import { fromDDMMYYYY, type ISODate } from "@/lib/dates";
import type { Observation } from "@/lib/calc/returns";

export const MFAPI_SOURCE = "mfapi.in";
const BASE = "https://api.mfapi.in/mf";

const MfapiResponse = z.object({
  meta: z.object({
    fund_house: z.string().nullable().optional(),
    scheme_type: z.string().nullable().optional(),
    scheme_category: z.string().nullable().optional(),
    scheme_code: z.union([z.number(), z.string()]),
    scheme_name: z.string().nullable().optional(),
    isin_growth: z.string().nullable().optional(),
  }),
  data: z.array(z.object({ date: z.string(), nav: z.string() })),
});

export interface SchemeMeta {
  schemeCode: number;
  schemeName: string;
  fundHouse: string;
  schemeType: string;
  schemeCategory: string;
  isinGrowth: string | null;
}

export interface SchemeHistory {
  meta: SchemeMeta;
  series: Observation[];
}

export class SchemeNotFoundError extends Error {
  constructor(readonly schemeCode: number) {
    super(`Scheme code ${schemeCode} was not found in MFapi`);
    this.name = "SchemeNotFoundError";
  }
}

export function parseSchemeCode(input: string): number | null {
  const s = input.trim();
  if (!/^\d{3,7}$/.test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/** Parse an MFapi payload. MFapi returns HTTP 200 with scheme_code 0 for unknown codes. */
export function parseMfapi(raw: unknown, requestedCode: number): SchemeHistory {
  const parsed = MfapiResponse.safeParse(raw);
  if (!parsed.success) throw new Error(`MFapi returned an unexpected payload for ${requestedCode}`);
  const { meta, data } = parsed.data;
  const code = Number(meta.scheme_code);
  if (!code || !meta.scheme_name) throw new SchemeNotFoundError(requestedCode);

  const series: Observation[] = [];
  for (const row of data) {
    const date = fromDDMMYYYY(row.date);
    const value = Number(row.nav);
    if (date && Number.isFinite(value) && value > 0) series.push({ date, value });
  }
  series.sort((a, b) => (a.date < b.date ? -1 : 1));
  return {
    meta: {
      schemeCode: code,
      schemeName: meta.scheme_name,
      fundHouse: meta.fund_house ?? "",
      schemeType: meta.scheme_type ?? "",
      schemeCategory: meta.scheme_category ?? "",
      isinGrowth: meta.isin_growth ?? null,
    },
    series,
  };
}

/** Full or ranged NAV history for one scheme. */
export async function fetchSchemeHistory(
  schemeCode: number,
  range?: { from: ISODate; to: ISODate },
): Promise<SchemeHistory> {
  const qs = range ? `?startDate=${range.from}&endDate=${range.to}` : "";
  const raw = await fetchJson<unknown>(`${BASE}/${schemeCode}${qs}`, {
    label: `mfapi ${schemeCode}`,
    timeoutMs: 20_000,
  });
  return parseMfapi(raw, schemeCode);
}

export async function searchSchemes(q: string): Promise<{ schemeCode: number; schemeName: string }[]> {
  const raw = await fetchJson<unknown>(`${BASE}/search?q=${encodeURIComponent(q)}`, { label: "mfapi search" });
  const arr = z.array(z.object({ schemeCode: z.number(), schemeName: z.string() })).safeParse(raw);
  return arr.success ? arr.data.slice(0, 20) : [];
}
