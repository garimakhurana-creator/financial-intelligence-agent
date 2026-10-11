import { clientIp, rateLimit } from "@/lib/auth";
import { handle, json } from "@/lib/api";
import { lookupFund } from "@/lib/pipeline/funds";

// Resolve a scheme code to its name/category (read-only, public, rate-limited). Used before
// tracking a fund (owner) and before analysing one (anyone).
export async function GET(req: Request) {
  if (!rateLimit(`lookup:${clientIp(req)}`, 60, 60_000)) return json({ error: "Too many lookups — wait a minute." }, 429);
  return handle(async () => json(await lookupFund(new URL(req.url).searchParams.get("code") ?? "")));
}
