import { adminRoute, json, readJson } from "@/lib/api";
import { addFund, type AddFundInput } from "@/lib/pipeline/funds";

export const maxDuration = 60;

export const POST = adminRoute(async (req: Request) => {
  const body = await readJson<AddFundInput>(req);
  const r = await addFund({
    schemeCode: String(body.schemeCode ?? ""),
    viewId: body.viewId,
    peerKey: body.peerKey,
    benchmarkId: body.benchmarkId,
  });
  return json({ fund: r.fund, navRowsLoaded: r.backfill.rows, warnings: r.warnings }, 201);
});
