import { fetchWithRetry } from "@/lib/http";
import { fromDDMonYYYY, type ISODate } from "@/lib/dates";
import { MAX_PEER_UNIVERSE, type PeerRule } from "@/lib/catalog";

export const AMFI_SOURCE = "AMFI NAVAll.txt";
export const AMFI_URL = "https://portal.amfiindia.com/spages/NAVAll.txt";

export interface AmfiScheme {
  schemeCode: number;
  schemeName: string;
  plan: string;
  option: string;
  nav: number | null;
  date: ISODate | null;
  /** e.g. "Equity Scheme - Mid Cap Fund" */
  category: string;
  /** "Open Ended Schemes" / "Close Ended Schemes" / "Interval Fund Schemes" */
  structure: string;
}

const HEADER_RE = /^(Open Ended Schemes|Close Ended Schemes|Interval Fund Schemes)\((.*)\)\s*$/;

/**
 * Parse AMFI's semicolon-separated file. Columns (current format):
 * Scheme Code;ISIN Div Payout/ ISIN Growth;ISIN Div Reinvestment;Scheme Name;Plan;Option;Net Asset Value;Date
 * Category header lines look like "Open Ended Schemes(Equity Scheme - Mid Cap Fund)".
 * AMC name lines (no semicolons) are skipped.
 */
export function parseNavAll(text: string): AmfiScheme[] {
  const out: AmfiScheme[] = [];
  let structure = "";
  let category = "";
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const h = HEADER_RE.exec(line);
    if (h) {
      structure = h[1];
      category = h[2].trim();
      continue;
    }
    const p = line.split(";");
    if (p.length < 8 || !/^\d+$/.test(p[0])) continue;
    const nav = Number(p[6]);
    out.push({
      schemeCode: Number(p[0]),
      schemeName: p[3].trim(),
      plan: p[4].trim(),
      option: p[5].trim(),
      nav: Number.isFinite(nav) && nav > 0 ? nav : null,
      date: fromDDMonYYYY(p[7]),
      category,
      structure,
    });
  }
  return out;
}

/**
 * True only for the Direct plan, Growth option. Rows where AMFI leaves Plan/Option blank and the
 * scheme name does not say "Direct" and "Growth" are excluded — we cannot tell them apart.
 * Segregated portfolios (credit-event side pockets) are excluded.
 */
export function isDirectGrowth(s: Pick<AmfiScheme, "schemeName" | "plan" | "option">): boolean {
  const name = s.schemeName.toLowerCase();
  const plan = s.plan.toLowerCase();
  const option = s.option.toLowerCase();
  if (/segregat|\bsg\d/.test(name) || /\bsg\d/.test(option)) return false;
  const planText = plan || name;
  const optionText = option || name;
  if (/idcw|dividend|bonus|payout|reinvest/.test(optionText)) return false;
  return planText.includes("direct") && optionText.includes("growth");
}

export async function fetchNavAll(): Promise<AmfiScheme[]> {
  const res = await fetchWithRetry(AMFI_URL, { label: "amfi navall", timeoutMs: 30_000 });
  return parseNavAll(await res.text());
}

export interface PeerUniverse {
  rule: PeerRule;
  members: AmfiScheme[];
  /** Set when the universe is unusable, e.g. too broad. */
  problem?: string;
}

/** Open-ended, Direct-Growth schemes in any of the rule's AMFI categories, optionally name-filtered. */
export function selectPeerUniverse(all: AmfiScheme[], rule: PeerRule): PeerUniverse {
  const members = all.filter(
    (s) =>
      s.structure === "Open Ended Schemes" &&
      rule.amfiCategories.includes(s.category) &&
      isDirectGrowth(s) &&
      (!rule.nameIncludes || rule.nameIncludes.test(s.schemeName)) &&
      (!rule.nameExcludes || !rule.nameExcludes.test(s.schemeName)),
  );
  // De-duplicate by scheme code (defensive; AMFI should not repeat codes).
  const unique = [...new Map(members.map((m) => [m.schemeCode, m])).values()];
  if (unique.length > MAX_PEER_UNIVERSE) {
    return { rule, members: [], problem: `Peer universe too broad (${unique.length} schemes)` };
  }
  return { rule, members: unique };
}
