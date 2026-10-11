import { adminRoute, json, readJson } from "@/lib/api";
import * as research from "@/lib/db/research";
import { FundInputError } from "@/lib/pipeline/funds";
import { fetchSchemeHistory, parseSchemeCode, SchemeNotFoundError } from "@/lib/sources/mfapi";

// Research watchlist: funds saved for later research. Never treated as holdings.
export const GET = adminRoute(async () => json({ items: await research.listWatchlist() }));

export const POST = adminRoute(async (req: Request) => {
  const b = await readJson<{ schemeCode?: string | number; note?: string; source?: string }>(req);
  const code = parseSchemeCode(String(b.schemeCode ?? ""));
  if (!code) throw new FundInputError("Invalid scheme code.");
  const stored = await research.getFundMetrics(code);
  let name = stored?.schemeName;
  let group = stored?.groupKey ?? null;
  if (!name) {
    try {
      name = (await fetchSchemeHistory(code)).meta.schemeName;
    } catch (e) {
      if (e instanceof SchemeNotFoundError) throw new FundInputError(`No scheme found for code ${code}.`);
      throw e;
    }
    group = null;
  }
  await research.addToWatchlist({ schemeCode: code, schemeName: name, groupKey: group, note: String(b.note ?? "").slice(0, 500), source: String(b.source ?? "explore").slice(0, 16) });
  return json({ ok: true }, 201);
});
