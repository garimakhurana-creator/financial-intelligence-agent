// Static reference data: benchmark index registry, the five category views, AMFI category mapping,
// and default seed funds. Everything here was verified against a live source on 2026-10-11;
// see docs/DATA_SOURCES.md for the evidence.

export type IndexId =
  | "NIFTY50"
  | "NIFTY_MIDCAP150"
  | "NIFTY_SMALLCAP100"
  | "NIFTY_SMALLCAP250"
  | "NASDAQ100"
  | "SP500"
  | "USDINR"
  | "NASDAQ100_INR"
  | "SP500_INR";

export interface IndexDef {
  id: IndexId;
  name: string;
  /** Ordered list of sources to try. Derived indices are computed from other series. */
  sources: (
    | { kind: "yahoo"; symbol: string }
    | { kind: "nse"; indexType: string }
    | { kind: "derived"; base: IndexId; fx: IndexId }
  )[];
  currency: "INR" | "USD";
  /** Price index, not total-return. Fund benchmarks are usually TRI — see methodology. */
  variant: "price";
  /** One of the three headline indices the brief asks for. */
  headline?: boolean;
}

export const INDICES: Record<IndexId, IndexDef> = {
  NIFTY50: {
    id: "NIFTY50",
    name: "Nifty 50",
    sources: [{ kind: "yahoo", symbol: "^NSEI" }, { kind: "nse", indexType: "NIFTY 50" }],
    currency: "INR",
    variant: "price",
    headline: true,
  },
  NIFTY_MIDCAP150: {
    id: "NIFTY_MIDCAP150",
    name: "Nifty Midcap 150",
    sources: [{ kind: "yahoo", symbol: "NIFTYMIDCAP150.NS" }, { kind: "nse", indexType: "NIFTY MIDCAP 150" }],
    currency: "INR",
    variant: "price",
    headline: true,
  },
  NIFTY_SMALLCAP100: {
    id: "NIFTY_SMALLCAP100",
    name: "Nifty Smallcap 100",
    // Yahoo ^CNXSC returns only the latest point (no history) — NSE is the primary source.
    sources: [{ kind: "nse", indexType: "NIFTY SMALLCAP 100" }],
    currency: "INR",
    variant: "price",
    headline: true,
  },
  NIFTY_SMALLCAP250: {
    id: "NIFTY_SMALLCAP250",
    name: "Nifty Smallcap 250",
    sources: [{ kind: "yahoo", symbol: "NIFTYSMLCAP250.NS" }, { kind: "nse", indexType: "NIFTY SMALLCAP 250" }],
    currency: "INR",
    variant: "price",
  },
  NASDAQ100: {
    id: "NASDAQ100",
    name: "Nasdaq-100 (USD)",
    sources: [{ kind: "yahoo", symbol: "^NDX" }],
    currency: "USD",
    variant: "price",
  },
  SP500: {
    id: "SP500",
    name: "S&P 500 (USD)",
    sources: [{ kind: "yahoo", symbol: "^GSPC" }],
    currency: "USD",
    variant: "price",
  },
  USDINR: {
    id: "USDINR",
    name: "USD/INR",
    sources: [{ kind: "yahoo", symbol: "INR=X" }],
    currency: "INR",
    variant: "price",
  },
  NASDAQ100_INR: {
    id: "NASDAQ100_INR",
    name: "Nasdaq-100 in INR",
    sources: [{ kind: "derived", base: "NASDAQ100", fx: "USDINR" }],
    currency: "INR",
    variant: "price",
  },
  SP500_INR: {
    id: "SP500_INR",
    name: "S&P 500 in INR",
    sources: [{ kind: "derived", base: "SP500", fx: "USDINR" }],
    currency: "INR",
    variant: "price",
  },
};

export const HEADLINE_INDICES: IndexId[] = ["NIFTY50", "NIFTY_MIDCAP150", "NIFTY_SMALLCAP100"];

/** Order in which raw series must be fetched so derived series can be built. */
export const RAW_INDEX_IDS = (Object.keys(INDICES) as IndexId[]).filter((id) =>
  INDICES[id].sources.some((s) => s.kind !== "derived"),
);
export const DERIVED_INDEX_IDS = (Object.keys(INDICES) as IndexId[]).filter((id) =>
  INDICES[id].sources.every((s) => s.kind === "derived"),
);

// ---------------------------------------------------------------------------------------------
// Category views

export type ViewId = "large_cap_index" | "mid_cap" | "small_cap" | "short_debt" | "intl_fof";

export interface ViewDef {
  id: ViewId;
  title: string;
  short: string;
  /** Market indices most relevant to this category (shown on the view). */
  marketIndices: IndexId[];
  /** Tavily search queries used to gather category-specific context. */
  newsQueries: string[];
  /** What the category commentary must focus on — keeps the five views distinct. */
  focus: string;
  assetClass: "equity" | "debt" | "international";
}

export const VIEWS: Record<ViewId, ViewDef> = {
  large_cap_index: {
    id: "large_cap_index",
    title: "Large-cap index funds",
    short: "Large-cap index",
    marketIndices: ["NIFTY50"],
    newsQueries: ["Nifty 50 weekly market wrap India", "Sensex Nifty large cap stocks week FII flows"],
    focus:
      "Nifty 50 movement and its drivers (index heavyweights, FII/DII flows, large corporate results), and tracking difference between index funds and the index.",
    assetClass: "equity",
  },
  mid_cap: {
    id: "mid_cap",
    title: "Mid-cap growth funds",
    short: "Mid-cap",
    marketIndices: ["NIFTY_MIDCAP150", "NIFTY50"],
    newsQueries: ["Nifty Midcap 150 week India midcap stocks", "midcap valuations earnings India mutual funds"],
    focus:
      "Nifty Midcap 150 versus Nifty 50, market breadth (advances/declines), valuation (P/E) and earnings context, liquidity and flows into mid-cap funds.",
    assetClass: "equity",
  },
  small_cap: {
    id: "small_cap",
    title: "Small-cap funds",
    short: "Small-cap",
    marketIndices: ["NIFTY_SMALLCAP100", "NIFTY_SMALLCAP250", "NIFTY50"],
    newsQueries: ["Nifty Smallcap 100 week India smallcap stocks", "smallcap stocks volatility valuation SEBI India"],
    focus:
      "Nifty Smallcap 100 and 250 versus Nifty 50, breadth, volatility, valuation stretch (P/E), liquidity and regulatory signals affecting small caps.",
    assetClass: "equity",
  },
  short_debt: {
    id: "short_debt",
    title: "Short-duration debt funds",
    short: "Short-duration debt",
    marketIndices: [],
    newsQueries: ["RBI monetary policy repo rate decision", "India 10-year government bond yield week", "India CPI inflation latest"],
    focus:
      "RBI policy (repo rate, stance, liquidity), government bond and corporate bond yields, inflation prints, and credit/interest-rate risk. Never use equity indices as the benchmark.",
    assetClass: "debt",
  },
  intl_fof: {
    id: "intl_fof",
    title: "International fund of funds",
    short: "International FoF",
    marketIndices: ["NASDAQ100", "SP500", "USDINR", "NASDAQ100_INR"],
    newsQueries: ["Nasdaq 100 weekly stock market US", "Federal Reserve interest rate decision", "rupee dollar exchange rate week"],
    focus:
      "Overseas index movement in local currency, the rupee's move against the dollar (which adds to or subtracts from INR returns), US Federal Reserve and global macro, and geographic/currency concentration risk.",
    assetClass: "international",
  },
};

export const VIEW_IDS = Object.keys(VIEWS) as ViewId[];

// ---------------------------------------------------------------------------------------------
// AMFI category canonicalisation
//
// AMFI's NAVAll.txt currently mixes two label taxonomies for the same SEBI category, e.g.
// "Equity Scheme - Mid Cap Fund" and "Equity Schemes - Mid Cap Fund", or
// "Debt Scheme - Short Duration Fund" and "Income/Debt Oriented Schemes - Short Term Fund".
// Peers must be merged across both labels, otherwise roughly half of each universe is dropped.

export interface PeerRule {
  /** Canonical peer-group key stored on tracked funds. */
  key: string;
  label: string;
  amfiCategories: string[];
  /** Optional scheme-name filter for index funds, where the category is too broad. */
  nameIncludes?: RegExp;
  nameExcludes?: RegExp;
}

export const PEER_RULES: PeerRule[] = [
  {
    key: "index_nifty50",
    label: "Nifty 50 index funds",
    amfiCategories: ["Other Scheme - Index Funds", "Index Funds - Equity Funds"],
    nameIncludes: /\bnifty\s*50\b(?!\s*(equal|value|quality|momentum|low|alpha|shariah|div|arbitrage))/i,
    nameExcludes: /\b(next\s*50|nifty\s*500|equal\s*weight|elss|tax\s*saver)\b/i,
  },
  {
    key: "mid_cap",
    label: "Mid-cap funds",
    amfiCategories: ["Equity Scheme - Mid Cap Fund", "Equity Schemes - Mid Cap Fund"],
  },
  {
    key: "small_cap",
    label: "Small-cap funds",
    amfiCategories: ["Equity Scheme - Small Cap Fund", "Equity Schemes - Small Cap Fund"],
  },
  {
    key: "short_duration",
    label: "Short-duration debt funds",
    amfiCategories: ["Debt Scheme - Short Duration Fund", "Income/Debt Oriented Schemes - Short Term Fund"],
  },
  {
    key: "fof_overseas",
    label: "Overseas fund of funds",
    amfiCategories: ["Other Scheme - FoF Overseas", "Overseas Fund of Funds - Fund of Funds investing overseas"],
  },
  {
    key: "large_cap",
    label: "Large-cap funds (active)",
    amfiCategories: ["Equity Scheme - Large Cap Fund", "Equity Schemes - Large Cap Fund"],
  },
  {
    key: "flexi_cap",
    label: "Flexi-cap funds",
    amfiCategories: ["Equity Scheme - Flexi Cap Fund", "Equity Schemes - Flexi Cap Fund"],
  },
  {
    key: "large_mid_cap",
    label: "Large & mid-cap funds",
    amfiCategories: ["Equity Scheme - Large & Mid Cap Fund", "Equity Schemes - Large & Mid Cap Fund"],
  },
  {
    key: "elss",
    label: "ELSS (tax saver) funds",
    amfiCategories: ["Equity Scheme - ELSS", "Equity Schemes - ELSS- Tax Saver Fund"],
  },
];

/** Peer universes larger than this are not computed (too broad to be a meaningful peer group). */
export const MAX_PEER_UNIVERSE = 80;

export function findPeerRule(key: string | null | undefined): PeerRule | undefined {
  return PEER_RULES.find((r) => r.key === key);
}

/** Suggest a peer group for a fund from its AMFI category and name. Returns undefined if unsure. */
export function suggestPeerRule(amfiCategory: string, schemeName: string): PeerRule | undefined {
  return PEER_RULES.find(
    (r) =>
      r.amfiCategories.includes(amfiCategory) &&
      (!r.nameIncludes || r.nameIncludes.test(schemeName)) &&
      (!r.nameExcludes || !r.nameExcludes.test(schemeName)),
  );
}

const PEER_TO_VIEW: Record<string, ViewId> = {
  index_nifty50: "large_cap_index",
  large_cap: "large_cap_index",
  mid_cap: "mid_cap",
  large_mid_cap: "mid_cap",
  small_cap: "small_cap",
  short_duration: "short_debt",
  fof_overseas: "intl_fof",
};

export function suggestView(peerKey: string | undefined): ViewId | undefined {
  return peerKey ? PEER_TO_VIEW[peerKey] : undefined;
}

// ---------------------------------------------------------------------------------------------
// Seed funds (Meera's five SIPs). Defaults only — the user can add/remove any scheme code.
// Benchmarks are the fund's stated benchmark per AMC documents; we compare against the price
// (non-TRI) version because free TRI history is not available.

export interface SeedFund {
  schemeCode: number;
  view: ViewId;
  peerKey: string;
  benchmarkId: IndexId | null;
  statedBenchmark: string;
  benchmarkSource: string;
}

export const SEED_FUNDS: SeedFund[] = [
  {
    schemeCode: 120716,
    view: "large_cap_index",
    peerKey: "index_nifty50",
    benchmarkId: "NIFTY50",
    statedBenchmark: "Nifty 50 TRI",
    benchmarkSource: "UTI scheme objective (replicates Nifty 50 TRI)",
  },
  {
    schemeCode: 118989,
    view: "mid_cap",
    peerKey: "mid_cap",
    benchmarkId: "NIFTY_MIDCAP150",
    statedBenchmark: "Nifty Midcap 150 TRI",
    benchmarkSource: "HDFC Mid Cap Fund — Fund Facts, July 2026 (files.hdfcfund.com)",
  },
  {
    schemeCode: 118778,
    view: "small_cap",
    peerKey: "small_cap",
    benchmarkId: "NIFTY_SMALLCAP250",
    statedBenchmark: "Nifty Smallcap 250 TRI (AMFI Tier I)",
    benchmarkSource: "Nippon India Small Cap Fund — product note, Aug 2026 (mf.nipponindiaim.com)",
  },
  {
    schemeCode: 119016,
    view: "short_debt",
    peerKey: "short_duration",
    benchmarkId: null,
    statedBenchmark: "CRISIL Short Duration Debt A-II Index",
    benchmarkSource: "HDFC Short Term Debt Fund — Fund Facts, July 2026 (no free data feed for this index)",
  },
  {
    schemeCode: 150751,
    view: "intl_fof",
    peerKey: "fof_overseas",
    benchmarkId: "NASDAQ100_INR",
    statedBenchmark: "Nasdaq-100 TRI (primary)",
    benchmarkSource: "Scheme factsheet via PersonalFN/AdvisorKhoj aggregators",
  },
];
