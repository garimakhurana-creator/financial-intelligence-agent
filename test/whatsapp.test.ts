import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { reportPdfUrl, sendWhatsApp } from "@/lib/delivery/channels";

const report = {
  id: "r1",
  weekEnding: "2026-10-09",
  inputSnapshot: { investorName: "Meera" },
  report: { output: { assessment: { label: "No action needed", reason: "No fund has a problem of its own this week." } } },
} as never;

const ok = (id: string) => new Response(JSON.stringify({ messages: [{ id }] }), { status: 200 });
const rejected = (code: number) => new Response(JSON.stringify({ error: { code, message: "Template name does not exist in the translation" } }), { status: 404 });

describe("WhatsApp delivery with the PDF report", () => {
  const env = { ...process.env };
  beforeEach(() => {
    Object.assign(process.env, {
      WHATSAPP_ACCESS_TOKEN: "t",
      WHATSAPP_PHONE_NUMBER_ID: "1",
      WHATSAPP_RECIPIENT_NUMBER: "+910000000000",
      WHATSAPP_TEMPLATE_NAME: "weekly_fund_report",
      WHATSAPP_PDF_TEMPLATE_NAME: "weekly_fund_report_pdf",
      WHATSAPP_GRAPH_VERSION: "v25.0",
      WHATSAPP_RECIPIENT_OPTED_IN: "yes",
    });
  });
  afterEach(() => {
    process.env = { ...env };
    vi.unstubAllGlobals();
  });

  it("builds the public PDF link from the report link", () => {
    expect(reportPdfUrl("https://x.app/reports/abc")).toBe("https://x.app/api/reports/abc/pdf");
  });

  it("attaches the PDF as a document header when the PDF template is usable", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(ok("wamid.1"));
    vi.stubGlobal("fetch", fetchMock);
    const r = await sendWhatsApp(report, "https://x.app/reports/r1", { isTest: false });
    expect(r.providerMessageId).toBe("wamid.1");
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(sent.template.name).toBe("weekly_fund_report_pdf");
    expect(sent.template.components[0].parameters[0].document).toEqual({ link: "https://x.app/api/reports/r1/pdf", filename: "fund-report-2026-10-09.pdf" });
  });

  it("falls back to the text template while the PDF template is not approved", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(rejected(132001)).mockResolvedValueOnce(ok("wamid.2"));
    vi.stubGlobal("fetch", fetchMock);
    const r = await sendWhatsApp(report, "https://x.app/reports/r1", { isTest: false });
    expect(r.providerMessageId).toBe("wamid.2");
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).template.name).toBe("weekly_fund_report");
    expect(r.detail).toMatch(/not approved yet/);
  });

  it("does not fall back (or double-send) on other errors", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: 131047, message: "Re-engagement message" } }), { status: 400 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(sendWhatsApp(report, "https://x.app/reports/r1", { isTest: false })).rejects.toThrow(/131047/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
