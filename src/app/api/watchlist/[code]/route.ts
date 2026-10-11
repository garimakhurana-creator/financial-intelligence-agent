import { adminRoute, json } from "@/lib/api";
import * as research from "@/lib/db/research";
import { FundInputError } from "@/lib/pipeline/funds";

export const DELETE = adminRoute(async (_req: Request, ctx: RouteContext<"/api/watchlist/[code]">) => {
  const n = Number((await ctx.params).code);
  if (!Number.isSafeInteger(n) || n <= 0) throw new FundInputError("Invalid scheme code.");
  await research.removeFromWatchlist(n);
  return json({ ok: true });
});
