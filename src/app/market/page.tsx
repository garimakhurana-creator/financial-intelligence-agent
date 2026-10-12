import { Newspaper } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { Sparkline } from "@/components/charts";
import { Card, Explain, PageHeader } from "@/components/page-header";
import { NewsCenter, type NewsCard } from "@/components/news-center";
import { NewsShorts, type ShortItem } from "@/components/news-shorts";
import { MarketMood } from "@/components/home";
import { PerformanceChart } from "@/components/performance-chart";
import { thinSeries } from "@/lib/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { VIEWS, type ViewId } from "@/lib/catalog";
import { formatHuman } from "@/lib/dates";
import { NEWS_TOPICS, TOPIC_BY_ID, type TopicId } from "@/lib/news/topics";
import { FUND_EMOJI, signed, toneOf } from "@/lib/plain";
import { cn } from "@/lib/utils";
import { loadMarket } from "@/lib/view-data";

export const metadata = { title: "Market & News · Meera's Money" };

export default function MarketPage({ searchParams }: PageProps<"/market">) {
  return (
    <>
      <PageHeader
        icon={Newspaper}
        title="Market & News"
        sub="The market's mood and this week's news in bite-size cards. Swipe through, tap for the full story."
      />
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-2xl" />}>
        <Market searchParams={searchParams} />
      </Suspense>
    </>
  );
}

const NSE_NAME: Record<string, string> = {
  NIFTY50: "NIFTY 50",
  NIFTY_MIDCAP150: "NIFTY MIDCAP 150",
  NIFTY_SMALLCAP100: "NIFTY SMALLCAP 100",
  NIFTY_SMALLCAP250: "NIFTY SMALLCAP 250",
};

/** First sentences of an article summary, up to about 280 characters. */
function shorten(s: string) {
  if (s.length <= 280) return s;
  const cut = s.slice(0, 280);
  const end = cut.lastIndexOf(". ");
  return end > 120
    ? cut.slice(0, end + 1)
    : `${cut.slice(0, cut.lastIndexOf(" "))}…`;
}

function Pct({
  v,
  className,
}: {
  v: number | null | undefined;
  className?: string;
}) {
  const t = toneOf(v);
  return (
    <span
      className={cn(
        "tabular",
        t === "good" && "text-[var(--up)]",
        t === "bad" && "text-[var(--down)]",
        className,
      )}
    >
      {signed(v)}
    </span>
  );
}

async function Market({
  searchParams,
}: {
  searchParams: PageProps<"/market">["searchParams"];
}) {
  const sp = await searchParams;
  const initialTopic = typeof sp.topic === "string" ? sp.topic : null;
  const d = await loadMarket();
  const headline = d.indices.filter((i) =>
    ["NIFTY50", "NIFTY_MIDCAP150", "NIFTY_SMALLCAP100"].includes(i.id),
  );
  const others = d.indices.filter((i) => !headline.includes(i));
  const dayChange = (ix: (typeof d.indices)[number]) => {
    const c = ix.chart;
    return c.length >= 2 && c.at(-1)!.date === ix.current?.date
      ? (c.at(-1)!.value / c.at(-2)!.value - 1) * 100
      : null;
  };
  const brief = d.brief?.data.brief ?? null;
  const evidence = new Map(
    (d.brief?.data.input.news ?? []).map((n) => [n.id, n]),
  );
  const cards: NewsCard[] = d.news.map((n) => ({
    id: n.id,
    title: n.title,
    publisher: n.publisher,
    publishedAt: n.publishedAt,
    url: n.url,
    summary: n.summary,
    fact: n.relevance?.fact ?? null,
    why: n.relevance?.why ?? null,
    topics: (n.topics as TopicId[])
      .filter((t) => TOPIC_BY_ID[t])
      .map((t) => ({ id: t, label: TOPIC_BY_ID[t].label })),
    views: (n.views as ViewId[])
      .filter((v) => VIEWS[v])
      .map((v) => ({ id: v, label: VIEWS[v].short })),
  }));

  const tracked = new Set(d.trackedViews);
  const nowMs = new Date().getTime();
  const weekAgo = new Date(nowMs - 7 * 86_400_000).toISOString();
  const shorts: ShortItem[] = d.news
    .filter((n) => !n.publishedAt || n.publishedAt >= weekAgo)
    .slice(0, 40)
    .map((n) => ({
      id: n.id,
      title: n.title,
      publisher: n.publisher,
      publishedAt: n.publishedAt,
      url: n.url,
      short: n.relevance?.fact ?? shorten(n.summary),
      why: n.relevance?.why ?? null,
      topics: n.topics,
      forYou: n.views.some((v) => tracked.has(v)),
    }));

  return (
    <div className="space-y-10">
      <MarketMood indices={headline} />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,28rem)_minmax(0,1fr)] lg:items-start">
        <section aria-labelledby="shorts-h">
          <h2 id="shorts-h" className="mb-3 text-xl font-bold">
            News in shorts <span aria-hidden>🗞️</span>
          </h2>
          {shorts.length === 0 ? (
            <p className="rounded-3xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              No news this week yet. News is gathered each night; if a provider
              fails, nothing is shown rather than made up.
            </p>
          ) : (
            <NewsShorts items={shorts} now={nowMs} />
          )}
        </section>

        <aside className="space-y-4 lg:pt-11">
          {brief ? (
            <>
              <div className="rounded-3xl bg-[#16181d] p-6 text-white shadow-card">
                <div className="text-xs font-medium uppercase tracking-wider opacity-60">
                  The market in one line
                </div>
                <p className="font-display mt-2 text-2xl font-semibold leading-snug">
                  {brief.headline}
                </p>
                <p className="mt-3 text-xs opacity-60">
                  {formatHuman(d.brief!.date)} · written by Gemini from the
                  day&apos;s figures and articles, then checked
                </p>
              </div>
              {brief.implications.filter((i) => tracked.has(i.viewId)).length >
                0 && (
                <div className="rounded-3xl border bg-card p-5 shadow-card">
                  <h3 className="font-semibold">
                    <span aria-hidden>💭</span> What it may mean for your funds
                  </h3>
                  <ul className="mt-3 space-y-3">
                    {brief.implications
                      .filter((i) => tracked.has(i.viewId))
                      .map((i) => (
                        <li key={i.viewId} className="flex gap-3">
                          <span aria-hidden className="text-xl">
                            {FUND_EMOJI[i.viewId]}
                          </span>
                          <div>
                            <div className="text-xs font-medium text-muted-foreground">
                              {VIEWS[i.viewId].title}
                            </div>
                            <p className="text-sm leading-relaxed">{i.text}</p>
                          </div>
                        </li>
                      ))}
                  </ul>
                </div>
              )}
              {brief.risks.length > 0 && (
                <div className="rounded-3xl border bg-card p-5 shadow-card">
                  <h3 className="font-semibold">
                    <span aria-hidden>👀</span> Worth keeping an eye on
                  </h3>
                  <ul className="mt-2 space-y-2 text-sm leading-relaxed text-[var(--ink-secondary)]">
                    {brief.risks.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          ) : (
            <p className="rounded-3xl border border-dashed p-6 text-sm text-muted-foreground">
              The daily market summary has not been written yet. It is produced
              each night after the data refresh.
            </p>
          )}
        </aside>
      </div>

      <details className="group rounded-3xl border bg-card shadow-card">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-5 [&::-webkit-details-marker]:hidden">
          <span>
            <span className="font-semibold">
              <span aria-hidden>🔢</span> The full picture
            </span>
            <span className="block text-sm text-muted-foreground">
              Index levels and charts, the complete market brief, and every
              article with filters.
            </span>
          </span>
          <span className="shrink-0 rounded-full border px-3 py-1 text-xs font-medium group-open:hidden">
            Open
          </span>
          <span className="hidden shrink-0 rounded-full border px-3 py-1 text-xs font-medium group-open:inline">
            Close
          </span>
        </summary>
        <div className="space-y-8 border-t p-5">
          <section>
            <h2 className="mb-3 text-lg font-semibold">Market overview</h2>
            <div className="grid gap-3 md:grid-cols-3">
              {headline.map((ix) => {
                const snap = d.snapshot?.data.find(
                  (s) => s.index === NSE_NAME[ix.id],
                );
                return (
                  <div key={ix.id} className="rounded-2xl border bg-card p-4">
                    <div className="text-sm text-[var(--ink-secondary)]">
                      {ix.name}
                    </div>
                    <div className="mt-1 text-2xl font-semibold tabular">
                      {ix.current
                        ? ix.current.value.toLocaleString("en-IN", {
                            maximumFractionDigits: 2,
                          })
                        : "—"}
                    </div>
                    <dl className="mt-2 grid grid-cols-3 gap-1 text-xs">
                      <div>
                        <dt className="text-muted-foreground">Day</dt>
                        <dd>
                          <Pct v={dayChange(ix)} />
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Week</dt>
                        <dd>
                          <Pct v={ix.windows["1W"].returnPct} />
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Month</dt>
                        <dd>
                          <Pct v={ix.windows["1M"].returnPct} />
                        </dd>
                      </div>
                    </dl>
                    <div className="mt-2">
                      <Sparkline data={ix.chart.slice(-66)} />
                    </div>
                    <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                      Close {ix.current ? formatHuman(ix.current.date) : "n/a"}{" "}
                      · {ix.source ?? "no source"}
                      {snap
                        ? ` · ${snap.advances ?? "?"} up / ${snap.declines ?? "?"} down · P/E ${snap.pe ?? "n/a"}`
                        : ""}
                    </p>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              {others.map((ix) => (
                <span
                  key={ix.id}
                  className="rounded-full border bg-card px-3 py-1.5"
                >
                  <span className="text-[var(--ink-secondary)]">{ix.name}</span>{" "}
                  <Pct v={ix.windows["1W"].returnPct} className="font-medium" />{" "}
                  <span className="text-muted-foreground">this week</span>
                </span>
              ))}
            </div>
            <div className="mt-2">
              <Explain label="What are P/E and advances/declines?">
                P/E (price-to-earnings) compares share prices with company
                profits; a higher number means investors are paying more for
                each rupee of profit. Advances/declines count how many shares in
                the index rose versus fell in the last session — a quick sense
                of whether a move was broad or driven by a few large companies.
              </Explain>
            </div>
          </section>

          <Card>
            <h2 className="text-lg font-semibold">Index trends</h2>
            <p className="mb-4 text-sm text-[var(--ink-secondary)]">
              Price indices rebased to ₹100 at the start of the chosen period.
            </p>
            <PerformanceChart
              series={d.indices
                .filter((i) => i.id !== "USDINR")
                .map((i) => ({
                  key: i.id,
                  name: i.name,
                  kind: "index" as const,
                  data: thinSeries(i.chart),
                }))}
              initial={["NIFTY50", "NIFTY_MIDCAP150", "NIFTY_SMALLCAP100"]}
            />
          </Card>

          <Card>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold">
                What happened in the market?
              </h2>
              {d.brief && (
                <span className="text-xs text-muted-foreground">
                  {formatHuman(d.brief.date)} · written by{" "}
                  {d.brief.model ?? "Gemini"} from the figures and articles
                  below, then checked
                </span>
              )}
            </div>
            {brief ? (
              <div className="mt-3 space-y-4 text-sm leading-relaxed">
                <p className="text-base font-medium">{brief.headline}</p>
                <div className="grid gap-5 md:grid-cols-2">
                  <div>
                    <h3 className="font-medium">Biggest moves</h3>
                    <ul className="mt-1 list-disc space-y-1 pl-5 text-[var(--ink-secondary)]">
                      {brief.biggestMoves.map((m) => (
                        <li key={m}>{m}</li>
                      ))}
                    </ul>
                  </div>
                  {brief.macro.length > 0 && (
                    <div>
                      <h3 className="font-medium">Economy and policy</h3>
                      <ul className="mt-1 list-disc space-y-1 pl-5 text-[var(--ink-secondary)]">
                        {brief.macro.map((m) => (
                          <li key={m}>{m}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
                {brief.implications.length > 0 && (
                  <div>
                    <h3 className="font-medium">
                      What it may mean for each kind of fund
                    </h3>
                    <ul className="mt-1 grid gap-2 md:grid-cols-2">
                      {brief.implications.map((i) => (
                        <li
                          key={i.viewId}
                          className="rounded-lg bg-muted/50 p-3"
                        >
                          <Link
                            href={`/categories/${i.viewId}`}
                            className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-secondary)] hover:underline"
                          >
                            {VIEWS[i.viewId].title}
                          </Link>
                          <p className="mt-1">{i.text}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {brief.risks.length > 0 && (
                  <div>
                    <h3 className="font-medium">Worth keeping an eye on</h3>
                    <ul className="mt-1 list-disc space-y-1 pl-5 text-[var(--ink-secondary)]">
                      {brief.risks.map((r) => (
                        <li key={r}>{r}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {brief.evidenceIds.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Sources used:{" "}
                    {brief.evidenceIds.map((id, i) => {
                      const n = evidence.get(id);
                      const src = n
                        ? d.news.find((x) => x.title === n.title)
                        : null;
                      return (
                        <span key={id}>
                          {i > 0 && " · "}
                          {src ? (
                            <a
                              href={src.url}
                              target="_blank"
                              rel="noopener noreferrer nofollow"
                              className="underline"
                            >
                              {n!.publisher}
                            </a>
                          ) : (
                            (n?.publisher ?? id)
                          )}
                        </span>
                      );
                    })}
                  </p>
                )}
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                The daily market summary has not been written yet. It is
                produced each night after the data refresh.
              </p>
            )}
          </Card>

          <section>
            <h2 className="mb-3 text-lg font-semibold">News</h2>
            {cards.length === 0 ? (
              <p className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
                No news has been retrieved yet. News is gathered each night; if
                a provider fails, nothing is shown rather than made up.
              </p>
            ) : (
              <NewsCenter
                items={cards}
                topics={NEWS_TOPICS.map((t) => ({ id: t.id, label: t.label }))}
                trackedViews={d.trackedViews}
                initialTopic={initialTopic}
                now={new Date().toISOString()}
              />
            )}
          </section>
        </div>
      </details>
    </div>
  );
}
