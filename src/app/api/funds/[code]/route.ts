import { adminRoute, json, readJson } from "@/lib/api";
import { FundInputError, removeFund, updateFundMapping } from "@/lib/pipeline/funds";

function parseCode(raw: string): number {
  const n = Number(raw);
  if (!Number.isSafeInteger(n) || n <= 0) throw new FundInputError("Invalid scheme code.");
  return n;
}

export const DELETE = adminRoute(async (_req: Request, ctx: RouteContext<"/api/funds/[code]">) => {
  const { code } = await ctx.params;
  await removeFund(parseCode(code));
  return json({ ok: true });
});

export const PATCH = adminRoute(async (req: Request, ctx: RouteContext<"/api/funds/[code]">) => {
  const { code } = await ctx.params;
  const body = await readJson<{ viewId?: string | null; peerKey?: string | null; benchmarkId?: string | null; statedBenchmark?: string | null }>(req);
  await updateFundMapping(parseCode(code), body);
  return json({ ok: true });
});
