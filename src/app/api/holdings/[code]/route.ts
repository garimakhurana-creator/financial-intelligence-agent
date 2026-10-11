import { adminRoute, json, readJson } from "@/lib/api";
import * as repo from "@/lib/db/repo";
import * as research from "@/lib/db/research";
import { FundInputError } from "@/lib/pipeline/funds";

function code(raw: string) {
  const n = Number(raw);
  if (!Number.isSafeInteger(n) || n <= 0) throw new FundInputError("Invalid scheme code.");
  return n;
}

/** Optional non-negative number from form input; empty → null. */
function amount(v: unknown, field: string, max: number): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > max) throw new FundInputError(`${field} must be a number between 0 and ${max.toLocaleString("en-IN")}.`);
  return n;
}

// Holdings are entered by the owner — the only source of rupee amounts in the app.
export const PUT = adminRoute(async (req: Request, ctx: RouteContext<"/api/holdings/[code]">) => {
  const schemeCode = code((await ctx.params).code);
  if (!(await repo.getFund(schemeCode))) throw new FundInputError("Track this fund first, then add your holding.");
  const b = await readJson<Record<string, unknown>>(req);
  const sipDay = amount(b.sipDay, "SIP day", 31);
  const startDate = typeof b.startDate === "string" && b.startDate ? b.startDate : null;
  if (startDate && !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) throw new FundInputError("Start date must be YYYY-MM-DD.");
  const h = {
    schemeCode,
    units: amount(b.units, "Units", 1e9),
    invested: amount(b.invested, "Amount invested", 1e11),
    sipAmount: amount(b.sipAmount, "SIP amount", 1e8),
    sipDay: sipDay === null ? null : Math.max(1, Math.round(sipDay)),
    startDate,
  };
  if (h.units === null && h.invested === null && h.sipAmount === null) throw new FundInputError("Enter at least units, amount invested or a SIP amount.");
  await research.saveHolding(h);
  return json({ ok: true });
});

export const DELETE = adminRoute(async (_req: Request, ctx: RouteContext<"/api/holdings/[code]">) => {
  await research.deleteHolding(code((await ctx.params).code));
  return json({ ok: true });
});
