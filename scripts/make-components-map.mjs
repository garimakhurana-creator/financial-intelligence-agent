// Generates docs/components-map.svg and docs/components-map.html — a swimlane components map
// (actors × Trigger / Input / Context / Processing / AI / Output). Run: node scripts/make-components-map.mjs
import { writeFileSync } from "node:fs";

const W = 1560;
const TITLE_H = 70;
const HEAD_H = 56;
const ACTOR_W = 200;
const LANE_H = 96;
const COLS = ["Trigger", "Input", "Context", "Processing", "AI", "Output"];
const COL_W = (W - ACTOR_W - 20) / COLS.length;

const LANES = [
  ["Vercel Cron", "(Scheduler)"],
  ["Meera", "(Investor)"],
  ["MFapi · AMFI", "(Fund NAV data)"],
  ["Yahoo · NSE", "(Index data)"],
  ["Tavily · GNews", "(News API)"],
  ["Next.js on Vercel", "(Engine)"],
  ["Gemini Flash", "(AI writer)"],
  ["Nhost Postgres", "(Storage)"],
  ["Delivery", "(Email · Telegram · WhatsApp)"],
];
const H = TITLE_H + HEAD_H + LANES.length * LANE_H + 60;

const STYLE = {
  Trigger: { fill: "#ede9fe", stroke: "#7c3aed" },
  Input: { fill: "#dbeafe", stroke: "#2563eb" },
  Context: { fill: "#dcfce7", stroke: "#16a34a" },
  Processing: { fill: "#fef3c7", stroke: "#d97706" },
  AI: { fill: "#fce7f3", stroke: "#db2777" },
  Output: { fill: "#ffedd5", stroke: "#ea580c" },
};
const LANE_TINT = ["#f8fafc", "#f1f5f9"];

// [laneIndex, column, lines]
const BOXES = {
  cron: [0, "Trigger", ["Daily 00:00 IST: refresh data", "Saturday 08:00 IST: weekly run"]],
  meeraIn: [1, "Trigger", ["Adds / removes a fund", "by scheme code (Vercel form)"]],
  nav: [2, "Input", ["Fetches latest NAV + history", "for each fund; AMFI category", "list for similar funds"]],
  idx: [3, "Context", ["Nifty 50 · Midcap 150 ·", "Smallcap 100 + each fund's", "benchmark index"]],
  news: [4, "Context", ["Fetches the week's market", "& macro news"]],
  calc: [5, "Processing", ["1W · 1M · YTD returns", "vs benchmark & category avg", "Rule-based 'worth watching'"]],
  ai: [6, "AI", ["3 sentences per fund +", "overall assessment", "Every number checked"]],
  store: [7, "Processing", ["Weekly snapshots & reports", "stored for trend tracking"]],
  send: [8, "Output", ["Saturday report: Email ·", "Telegram (insights + PDF) ·", "WhatsApp (insights + PDF)"]],
  meeraOut: [1, "Output", ["Reads plain-language report", "+ live dashboard, Market &", "News, Explore, Analyse"]],
};
const BOX_W = COL_W - 26;
const BOX_H = LANE_H - 22;

const laneY = (i) => TITLE_H + HEAD_H + i * LANE_H;
const colX = (c) => ACTOR_W + 10 + COLS.indexOf(c) * COL_W;
const box = (k) => {
  const [lane, col] = BOXES[k];
  const x = colX(col) + 13;
  const y = laneY(lane) + 11;
  return { x, y, cx: x + BOX_W / 2, cy: y + BOX_H / 2, r: x + BOX_W, b: y + BOX_H };
};

// Dashed connectors: elbow paths between box edges.
// [from, to, kind, x-offset at the target]
const ARROWS = [
  ["cron", "nav", "right-down", -40],
  ["meeraIn", "nav", "right-down", 0],
  ["nav", "calc", "right-down", -45],
  ["idx", "calc", "right-down", 0],
  ["calc", "ai", "right-down", -30],
  ["news", "ai", "right-down", 30],
  ["calc", "store", "down", 0],
  ["ai", "send", "right-down", -40],
  ["send", "meeraOut", "up", 40],
];

function path(a, b, kind, off) {
  const A = box(a);
  const B = box(b);
  if (kind === "down") return `M ${A.cx + off} ${A.b} V ${B.y}`;
  if (kind === "up") return `M ${A.cx + off} ${A.y} V ${B.b}`;
  // out of the right edge, along the lane, then down into the target's top
  return `M ${A.r} ${A.cy} H ${B.cx + off} V ${B.y}`;
}

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="Inter, 'Segoe UI', Arial, sans-serif">
<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#334155"/></marker></defs>
<rect width="${W}" height="${H}" fill="#ffffff"/>
<text x="${W / 2}" y="44" text-anchor="middle" font-size="26" font-weight="700" fill="#0f172a">PS19 · Meera / Mutual Fund Performance Tracker — Components Map</text>
`;
// header
svg += `<rect x="10" y="${TITLE_H}" width="${ACTOR_W - 10}" height="${HEAD_H}" fill="#0b2545"/><text x="${(ACTOR_W + 10) / 2}" y="${TITLE_H + 35}" text-anchor="middle" font-size="18" font-weight="700" fill="#fff">Actor</text>`;
COLS.forEach((c, i) => {
  const x = ACTOR_W + 10 + i * COL_W;
  svg += `<rect x="${x}" y="${TITLE_H}" width="${COL_W}" height="${HEAD_H}" fill="#0b2545" stroke="#1e3a5f"/><text x="${x + COL_W / 2}" y="${TITLE_H + 35}" text-anchor="middle" font-size="18" font-weight="700" fill="#fff">${c}</text>`;
});
// lanes
LANES.forEach(([name, sub], i) => {
  const y = laneY(i);
  svg += `<rect x="${ACTOR_W + 10}" y="${y}" width="${W - ACTOR_W - 20}" height="${LANE_H}" fill="${LANE_TINT[i % 2]}"/>`;
  svg += `<rect x="10" y="${y}" width="${ACTOR_W - 10}" height="${LANE_H}" fill="#0b2545" stroke="#1e3a5f"/>`;
  svg += `<text x="${(ACTOR_W + 10) / 2}" y="${y + LANE_H / 2 - 4}" text-anchor="middle" font-size="16" font-weight="700" fill="#fff">${esc(name)}</text>`;
  svg += `<text x="${(ACTOR_W + 10) / 2}" y="${y + LANE_H / 2 + 18}" text-anchor="middle" font-size="${sub.length > 22 ? 11.5 : 13}" fill="#cbd5e1">${esc(sub)}</text>`;
});
// arrows (under boxes)
for (const [a, b, kind, off] of ARROWS) svg += `<path d="${path(a, b, kind, off)}" fill="none" stroke="#334155" stroke-width="1.6" stroke-dasharray="6 5" marker-end="url(#arrow)"/>`;
// boxes
for (const [k, [, col, lines]] of Object.entries(BOXES)) {
  const b = box(k);
  const s = STYLE[col];
  svg += `<rect x="${b.x}" y="${b.y}" width="${BOX_W}" height="${BOX_H}" rx="10" fill="${s.fill}" stroke="${s.stroke}" stroke-width="1.6"/>`;
  const start = b.cy - ((lines.length - 1) * 17) / 2 + 5;
  lines.forEach((l, j) => (svg += `<text x="${b.cx}" y="${start + j * 17}" text-anchor="middle" font-size="13.5" fill="#0f172a">${esc(l)}</text>`));
}
svg += `<text x="${W / 2}" y="${H - 22}" text-anchor="middle" font-size="13" fill="#64748b">Live: financial-intelligence-agent-lake.vercel.app · Data: AMFI/MFapi, Yahoo/NSE, Tavily/GNews · AI: Gemini Flash · Storage: Nhost Postgres · Scheduling: Vercel Cron</text>`;
svg += `</svg>\n`;

writeFileSync("docs/components-map.svg", svg);
writeFileSync("public/components-map.svg", svg);
const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Components Map</title><style>body{margin:0;background:#fff;display:flex;justify-content:center;padding:16px}svg{max-width:100%;height:auto}@media print{body{padding:0}@page{size:landscape;margin:8mm}}</style></head><body>${svg}</body></html>\n`;
writeFileSync("docs/components-map.html", page);
writeFileSync("public/components-map.html", page);
console.log("wrote docs/ and public/ components-map.svg + .html", W, "x", H);
