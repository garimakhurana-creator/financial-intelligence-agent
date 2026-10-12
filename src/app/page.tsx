import Link from "next/link";
import { Suspense } from "react";
import { Download, MessageCircle } from "lucide-react";
import { Highlights, PortfolioCards, QuickActions } from "@/components/dashboard";
import { DeliveryLauncher, type ChannelInfo } from "@/components/delivery-card";
import { emailRecipientMasked, telegramRecipientMasked, whatsappRecipientMasked } from "@/lib/delivery/channels";
import { whatsappTemplateState } from "@/lib/delivery/wa-status";
import { FundCards, StoryStrip, WeatherHero } from "@/components/home";
import { Skeleton } from "@/components/ui/skeleton";
import { reportUrl } from "@/lib/delivery/deliver";
import { whatsappShareLink, whatsappShareText } from "@/lib/delivery/share";
import { optionalEnv } from "@/lib/env";
import { reportChecks, shortVerdict } from "@/lib/report/checks";
import { loadDashboard } from "@/lib/view-data";

// The dashboard is deliberately light: no chart library and no year-long series in the page.
// Exact numbers and the comparison chart live on My Portfolio.

export default function Dashboard({ searchParams }: PageProps<"/">) {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardContent searchParams={searchParams} />
    </Suspense>
  );
}

/** "Saturday 17 Oct, 8 AM" — the next weekly send (Saturdays 08:00 IST). */
function nextSaturday(now: Date): string {
  const ist = new Date(now.getTime() + 5.5 * 3600_000);
  const day = ist.getUTCDay();
  const beforeSend = day === 6 && ist.getUTCHours() < 8;
  const add = beforeSend ? 0 : (6 - day + 7) % 7 || 7;
  const target = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() + add));
  return `${target.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" })}, 8 AM`;
}

function greeting(now: Date) {
  const h = Number(new Intl.DateTimeFormat("en-IN", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }).format(now));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

async function DashboardContent({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  const openDelivery = (await searchParams).delivery === "open";
  let d;
  try {
    d = await loadDashboard();
  } catch {
    return (
      <div role="alert" className="rounded-2xl border bg-[var(--tint-critical)] p-6">
        <p className="font-medium">We couldn&apos;t load your funds right now.</p>
        <p className="mt-1 text-sm text-[var(--ink-secondary)]">Please try again in a minute. If it keeps happening, check Settings.</p>
      </div>
    );
  }
  const now = new Date();
  const name = optionalEnv("INVESTOR_NAME", "Meera");
  const navDate = d.performance.map((p) => p.nav?.date).filter(Boolean).sort().at(-1) ?? null;
  const report = d.latestReport;
  // Number-less wa.me link: WhatsApp asks which chat to send it to (herself, or her CA friend).
  const share = report ? whatsappShareLink(whatsappShareText(report, reportUrl(report.id))) : null;
  const hasHoldings = (d.portfolio?.holdingsCount ?? 0) > 0;
  const checks = report ? reportChecks(report) : [];
  const wa = await whatsappTemplateState();
  const lastOf = (ch: ChannelInfo["id"]) => {
    const x = d.deliveries.find((dl) => dl.channel === ch);
    return x ? { status: x.status, at: x.updatedAt ?? x.createdAt, isTest: x.isTest } : null;
  };
  const channels: ChannelInfo[] = [
    { id: "email", configured: d.integrations.email, recipient: emailRecipientMasked(), last: lastOf("email"), note: null },
    { id: "telegram", configured: d.integrations.telegram, recipient: telegramRecipientMasked(), last: lastOf("telegram"), note: null },
    {
      id: "whatsapp",
      configured: d.integrations.whatsapp,
      recipient: whatsappRecipientMasked(),
      last: lastOf("whatsapp"),
      note: wa.approved ? null : wa.pending.length ? "Set up and tested — waiting for Meta to approve the message template. Email and Telegram cover it meanwhile." : null,
    },
  ];

  return (
    <div className="space-y-10">
      <header className="fade-up flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-brand">{now.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Kolkata" })}</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">
            {greeting(now)}, {name}{" "}
            <span className="wave inline-block" aria-hidden>
              👋
            </span>
          </h1>
        </div>
        {report && (
          <div className="flex flex-wrap gap-2">
            <a
              href={share!}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full bg-[#25D366] px-4 py-2 text-sm font-semibold text-[#073b1f] shadow-card hover:brightness-95"
            >
              <MessageCircle className="size-4" aria-hidden /> Send to WhatsApp
            </a>
            <a
              href={`/api/reports/${report.id}/pdf`}
              download
              className="inline-flex items-center gap-2 rounded-full border bg-card px-4 py-2 text-sm font-semibold shadow-card hover:bg-muted"
            >
              <Download className="size-4" aria-hidden /> Download report
            </a>
            <DeliveryLauncher reportId={report.id} channels={channels} nextSend={nextSaturday(now)} nextShort={nextSaturday(now).replace(/^(\w{3})\w*,/, "$1").replace(/, 8 AM$/, "")} defaultOpen={openDelivery} />
          </div>
        )}
      </header>

      <div className="fade-up">
        <WeatherHero label={report?.assessment ?? null} reason={report?.assessmentReason ?? null} weekEnding={report?.weekEnding ?? null} reportId={report?.id ?? null} checks={checks} summary={report ? shortVerdict(report, checks) : undefined} />
      </div>

      <section className="fade-up">
        <h2 className="text-xl font-bold">Your week in 30 seconds</h2>
        <p className="mb-4 text-sm text-muted-foreground">Swipe through →</p>
        <StoryStrip funds={d.performance} indices={d.headline} news={d.storyNews} />
      </section>

      <section>
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-xl font-bold">Your funds</h2>
          <Link href="/portfolio" className="text-sm font-medium text-brand hover:underline">
            Exact numbers and chart →
          </Link>
        </div>
        <FundCards funds={d.performance} />
      </section>

      {d.highlights.length > 0 && (
        <section>
          <h2 className="mb-4 text-xl font-bold">
            Heads up <span aria-hidden>🔔</span>
          </h2>
          <Highlights items={d.highlights} />
        </section>
      )}

      {hasHoldings && <PortfolioCards portfolio={d.portfolio} admin={d.admin} fundsTracked={d.performance.length} navDate={navDate} />}

      <section>
        <h2 className="mb-4 text-xl font-bold">Explore more</h2>
        <QuickActions reportId={report?.id ?? null} />
      </section>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading your dashboard">
      <Skeleton className="h-16 w-72" />
      <Skeleton className="h-56 w-full rounded-3xl" />
      <div className="flex gap-3 overflow-hidden">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-72 w-60 shrink-0 rounded-3xl" />
        ))}
      </div>
    </div>
  );
}
