import { clientIp, rateLimit } from "@/lib/auth";
import { handle, json } from "@/lib/api";
import { searchSchemes } from "@/lib/sources/mfapi";

// Public fund-name search (MFapi). Read-only; rate-limited per instance.
export async function GET(req: Request) {
  if (!rateLimit(`search:${clientIp(req)}`, 60, 60_000)) return json({ error: "Too many searches — wait a minute." }, 429);
  return handle(async () => {
    const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 80);
    if (q.length < 3) return json({ results: [] });
    const results = await searchSchemes(q);
    return json({ results: results.slice(0, 15) });
  });
}
