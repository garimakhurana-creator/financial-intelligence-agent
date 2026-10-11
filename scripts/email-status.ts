// Prints Resend's last_event for the most recent email deliveries of the latest report.
import * as repo from "@/lib/db/repo";
async function main() {
  const report = await repo.getLatestReport();
  const logs = (await repo.listDeliveries(report!.id)).filter((d) => d.channel === "email" && d.providerMessageId);
  for (const d of logs) {
    const r = await fetch(`https://api.resend.com/emails/${d.providerMessageId}`, { headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` } });
    const j = await r.json();
    console.log(d.id, "→ resend last_event:", j.last_event, "| to:", (j.to ?? []).length, "recipient(s) | subject:", j.subject);
  }
}
main().then(() => process.exit(0));
