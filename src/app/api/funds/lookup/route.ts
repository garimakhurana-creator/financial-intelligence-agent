import { adminRoute, json } from "@/lib/api";
import { lookupFund } from "@/lib/pipeline/funds";

// Resolve a scheme code to its name/category before the user confirms adding it.
export const GET = adminRoute(async (req: Request) => {
  const code = new URL(req.url).searchParams.get("code") ?? "";
  return json(await lookupFund(code));
});
