import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { reportPdfUrl, renderWhatsAppBody, sendWhatsApp, WHATSAPP_BODY_LIMIT, whatsappPdfParams } from "@/lib/delivery/channels";

const fund = (schemeName: string, viewId: string, week: number, vsPeer: number) => ({ schemeName, viewId, windows: { "1W": { fund: { returnPct: week }, vsPeerPp: vsPeer } } });

const report = {
  id: "r1",
  weekEnding: "2026-10-09",
  inputSnapshot: { investorName: "Meera" },
  report: {
    funds: [
      fund("UTI Nifty 50 Index Fund - Direct Plan - Growth", "large_cap_index", 0.43, 0),
      fund("HDFC Mid Cap Fund - Direct Plan - Growth Option", "mid_cap", 0.17, 0.24),
      fund("Nippon India Small Cap Fund - Direct Plan - Growth Option", "small_cap", 0.001, 0.4),
      fund("HDFC Short Term Fund - Direct Plan - Growth Option", "short_debt", 0.06, -0.01),
      fund("Axis NASDAQ 100 US Specific Equity Passive FOF - Direct Plan - Growth Option", "intl_fof", 2.28, 1.41),
    ],
    output: {
      assessment: { label: "No action needed", reason: "No action is needed this week. Three funds fell 3.66%–5.36% this month, but their markets fell about as much." },
      marketSummary: { text: "Indian shares rose slightly this week. The RBI raised rates to 5.50%, keeping bond markets under pressure. US tech shares advanced." },
    },
  },
} as never;

const ok = (id: string) => new Response(JSON.stringify({ messages: [{ id }] }), { status: 200 });
const notApproved = () => new Response(JSON.stringify({ error: { code: 132001, message: "template name does not exist in en" } }), { status: 404 });
const URL_ = "https://x.app/reports/r1";

describe("WhatsApp message with key insights", () => {
  it("builds the public PDF link from the report link", () => {
    expect(reportPdfUrl(URL_)).toBe("https://x.app/api/reports/r1/pdf");
  });

  it("includes the overall verdict (without repeating it), one line per fund, and the market", () => {
    const body = renderWhatsAppBody(whatsappPdfParams(report, URL_, { isTest: false }));
    expect(body).toMatch(/\*Overall:\* No action needed\. Three funds fell/);
    expect(body).not.toMatch(/No action is needed this week/);
    expect(body).toMatch(/🚀 HDFC Mid Cap \+0\.17% \(slightly ahead of similar funds\)/);
    expect(body).toMatch(/🌱 Nippon India Small Cap 0\.00%/);
    expect(body).toMatch(/🌎 Axis NASDAQ 100 \+2\.28% \(ahead of similar funds\)/);
    expect(body).toMatch(/The RBI raised rates to 5\.50%/); // sentences are not split inside numbers
    expect(body.length).toBeLessThanOrEqual(WHATSAPP_BODY_LIMIT);
  });

  it("keeps a very long market summary within WhatsApp's limit", () => {
    const long = JSON.parse(JSON.stringify(report));
    long.report.output.marketSummary.text = Array.from({ length: 30 }, (_, i) => `Sentence number ${i} about the market this week.`).join(" ");
    expect(renderWhatsAppBody(whatsappPdfParams(long, URL_, { isTest: false })).length).toBeLessThanOrEqual(WHATSAPP_BODY_LIMIT);
  });
});

describe("WhatsApp delivery order", () => {
  const env = { ...process.env };
  beforeEach(() => {
    Object.assign(process.env, {
      WHATSAPP_ACCESS_TOKEN: "t",
      WHATSAPP_PHONE_NUMBER_ID: "1",
      WHATSAPP_RECIPIENT_NUMBER: "+910000000000",
      WHATSAPP_TEMPLATE_NAME: "weekly_fund_report",
      WHATSAPP_PDF_TEMPLATE_NAME: "weekly_fund_report_pdf_v2",
      WHATSAPP_PDF_TEMPLATE_SHORT: "weekly_fund_report_pdf",
      WHATSAPP_GRAPH_VERSION: "v25.0",
      WHATSAPP_RECIPIENT_OPTED_IN: "yes",
    });
  });
  afterEach(() => {
    process.env = { ...env };
    vi.unstubAllGlobals();
  });
  const sent = (m: ReturnType<typeof vi.fn>, i: number) => JSON.parse(m.mock.calls[i][1].body).template;

  it("uses the rich PDF template (6 parameters + document) when approved", async () => {
    const f = vi.fn().mockResolvedValueOnce(ok("wamid.1"));
    vi.stubGlobal("fetch", f);
    const r = await sendWhatsApp(report, URL_, { isTest: false });
    expect(r.providerMessageId).toBe("wamid.1");
    expect(sent(f, 0).name).toBe("weekly_fund_report_pdf_v2");
    expect(sent(f, 0).components[0].parameters[0].document).toEqual({ link: "https://x.app/api/reports/r1/pdf", filename: "fund-report-2026-10-09.pdf" });
    expect(sent(f, 0).components[1].parameters).toHaveLength(6);
  });

  it("falls back to the short PDF template, then to the text template", async () => {
    const f = vi.fn().mockResolvedValueOnce(notApproved()).mockResolvedValueOnce(notApproved()).mockResolvedValueOnce(ok("wamid.3"));
    vi.stubGlobal("fetch", f);
    const r = await sendWhatsApp(report, URL_, { isTest: false });
    expect([sent(f, 0).name, sent(f, 1).name, sent(f, 2).name]).toEqual(["weekly_fund_report_pdf_v2", "weekly_fund_report_pdf", "weekly_fund_report"]);
    expect(sent(f, 1).components[1].parameters).toHaveLength(4);
    expect(r.providerMessageId).toBe("wamid.3");
    expect(r.detail).toMatch(/not approved yet/);
  });

  it("stops at the short PDF template when that one is approved", async () => {
    const f = vi.fn().mockResolvedValueOnce(notApproved()).mockResolvedValueOnce(ok("wamid.2"));
    vi.stubGlobal("fetch", f);
    const r = await sendWhatsApp(report, URL_, { isTest: false });
    expect(f).toHaveBeenCalledTimes(2);
    expect(r.detail).toMatch(/PDF report attached/);
  });

  it("does not fall back (or double-send) on other errors", async () => {
    const f = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: 131047, message: "Re-engagement message" } }), { status: 400 }));
    vi.stubGlobal("fetch", f);
    await expect(sendWhatsApp(report, URL_, { isTest: false })).rejects.toThrow(/131047/);
    expect(f).toHaveBeenCalledTimes(1);
  });
});
