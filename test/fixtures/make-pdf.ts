// Builds a tiny, valid single-page PDF with the given text lines (Helvetica). Test fixture only —
// lets us exercise PDF text extraction and quote verification without real documents.
export function makePdf(lines: string[]): Uint8Array {
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  const content = ["BT", "/F1 10 Tf", "14 TL", "50 780 Td", ...lines.map((l) => `(${esc(l)}) Tj T*`), "ET"].join("\n");
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(Buffer.byteLength(out));
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(out, "latin1"));
}

/** A synthetic factsheet. Every value here is invented test data, not a real fund. */
export const SYNTHETIC_FACTSHEET = [
  "TEST FIXTURE - SYNTHETIC FACTSHEET - NOT A REAL FUND",
  "Example Bluechip Fund (Direct Plan - Growth)",
  "Fund house: Example Asset Management",
  "Category: Equity Scheme - Large Cap Fund",
  "Benchmark: Nifty 100 TRI",
  "Riskometer: Very High",
  "Total Expense Ratio (Direct): 0.62%",
  "Total Expense Ratio (Regular): 1.71%",
  "Fund size (AUM): Rs 12,345 crore",
  "Minimum SIP: Rs 500",
  "Performance: 1 Year 8.40% (Benchmark 7.90%)",
  "Performance: 3 Years 14.20% (Benchmark 13.10%)",
  "Top holding: Example Bank Ltd 9.10%",
  "Top holding: Example Software Ltd 7.30%",
  "Sector: Financial Services 31.50%",
];
