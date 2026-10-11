import { clientIp, rateLimit } from "@/lib/auth";
import { json } from "@/lib/api";
import * as cached from "@/lib/db/cached";
import { reportUrl } from "@/lib/delivery/deliver";
import { renderReportPdf } from "@/lib/delivery/pdf";
import type { ReportPayload } from "@/lib/report/build";
import type { ReportInput } from "@/lib/report/types";

// Download a weekly report as a PDF (same content and order as the email).
export async function GET(req: Request, ctx: RouteContext<"/api/reports/[id]/pdf">) {
  const { id } = await ctx.params;
  if (!/^[a-zA-Z0-9._-]{1,36}$/.test(id)) return json({ error: "Unknown report" }, 404);
  if (!rateLimit(`pdf:${clientIp(req)}`, 30, 10 * 60_000)) return json({ error: "Too many downloads — please wait a few minutes." }, 429);
  const report = await cached.report<ReportPayload, ReportInput>(id);
  if (!report) return json({ error: "Unknown report" }, 404);
  const bytes = await renderReportPdf(report, reportUrl(report.id));
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="fund-report-${report.weekEnding}.pdf"`,
      "Cache-Control": "private, max-age=300",
    },
  });
}
