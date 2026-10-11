import { randomUUID } from "node:crypto";
import { getRow, insertIfNew, sql, updateRow, upsertRow, upsertRows, type Row } from "@/lib/db/client";
import type { Observation } from "@/lib/calc/returns";
import type { ISODate } from "@/lib/dates";

// ---------------------------------------------------------------------------------------------
// Generic helpers

/** Row ids: max 36 chars of [a-zA-Z0-9._-], starting with a letter or digit. Deterministic ids make writes idempotent. */
export function rowId(...parts: (string | number)[]): string {
  const id = parts.join("_").replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 36);
  return /^[a-zA-Z0-9]/.test(id) ? id : `x${id.slice(0, 35)}`;
}

/** A random 20-character id for rows without a natural key (on-demand reports, analyses). */
export const newId = () => randomUUID().replaceAll("-", "").slice(0, 20);

const nowIso = () => new Date().toISOString();

// ---------------------------------------------------------------------------------------------
// Tracked funds

export interface TrackedFund {
  schemeCode: number;
  schemeName: string;
  fundHouse: string;
  amfiCategory: string;
  viewId: string | null;
  peerKey: string | null;
  benchmarkId: string | null;
  statedBenchmark: string | null;
  benchmarkSource: string | null;
  active: boolean;
  addedAt: string | null;
  removedAt: string | null;
  lastNavDate: string | null;
  lastRefreshedAt: string | null;
}

function toFund(r: Row): TrackedFund {
  return {
    schemeCode: r.scheme_code,
    schemeName: r.scheme_name,
    fundHouse: r.fund_house ?? "",
    amfiCategory: r.amfi_category ?? "",
    viewId: r.view_id ?? null,
    peerKey: r.peer_key ?? null,
    benchmarkId: r.benchmark_id ?? null,
    statedBenchmark: r.stated_benchmark ?? null,
    benchmarkSource: r.benchmark_source ?? null,
    active: Boolean(r.active),
    addedAt: r.added_at ?? null,
    removedAt: r.removed_at ?? null,
    lastNavDate: r.last_nav_date ?? null,
    lastRefreshedAt: r.last_refreshed_at ?? null,
  };
}

export async function listFunds(opts: { activeOnly?: boolean } = {}): Promise<TrackedFund[]> {
  const db = sql();
  const rows = opts.activeOnly ? await db`select * from tracked_funds where active = true` : await db`select * from tracked_funds`;
  return rows.map(toFund).sort((a, b) => (a.addedAt ?? "").localeCompare(b.addedAt ?? "") || a.schemeCode - b.schemeCode);
}

export async function getFund(schemeCode: number): Promise<TrackedFund | null> {
  const r = await getRow("tracked_funds", String(schemeCode));
  return r ? toFund(r) : null;
}

export async function saveFund(f: Omit<TrackedFund, "lastNavDate" | "lastRefreshedAt" | "removedAt" | "addedAt"> & { addedAt?: string }) {
  await upsertRow("tracked_funds", String(f.schemeCode), {
    scheme_code: f.schemeCode,
    scheme_name: f.schemeName,
    fund_house: f.fundHouse,
    amfi_category: f.amfiCategory,
    view_id: f.viewId,
    peer_key: f.peerKey,
    benchmark_id: f.benchmarkId,
    stated_benchmark: f.statedBenchmark,
    benchmark_source: f.benchmarkSource,
    active: f.active,
    added_at: f.addedAt ?? nowIso(),
    removed_at: null,
  });
}

export async function updateFund(schemeCode: number, patch: Record<string, unknown>) {
  await updateRow("tracked_funds", String(schemeCode), patch);
}

// ---------------------------------------------------------------------------------------------
// NAV and index history

export async function saveNavHistory(schemeCode: number, series: Observation[], source: string) {
  const retrieved_at = nowIso();
  await upsertRows(
    "nav_history",
    series.map((o) => ({
      id: rowId("n", schemeCode, o.date.replaceAll("-", "")),
      scheme_code: schemeCode,
      date: o.date,
      nav: o.value,
      source,
      retrieved_at,
    })),
  );
}

export async function getNavSeries(schemeCode: number, from: ISODate): Promise<Observation[]> {
  const db = sql();
  const rows = await db`select "date", nav from nav_history where scheme_code = ${schemeCode} and "date" >= ${from} order by "date" asc`;
  return rows.map((r) => ({ date: r.date, value: r.nav }));
}

export async function getNavMeta(schemeCode: number): Promise<{ source: string; retrievedAt: string } | null> {
  const db = sql();
  const [r] = await db`select source, retrieved_at from nav_history where scheme_code = ${schemeCode} order by "date" desc limit 1`;
  return r ? { source: r.source, retrievedAt: r.retrieved_at } : null;
}

export async function saveIndexHistory(indexId: string, series: Observation[], source: string) {
  const retrieved_at = nowIso();
  await upsertRows(
    "index_history",
    series.map((o) => ({
      id: rowId(indexId, o.date.replaceAll("-", "")),
      index_id: indexId,
      date: o.date,
      value: o.value,
      source,
      retrieved_at,
    })),
  );
}

export async function getIndexSeries(indexId: string, from: ISODate): Promise<{ series: Observation[]; source: string | null; retrievedAt: string | null }> {
  const db = sql();
  const rows = await db`select "date", value, source, retrieved_at from index_history where index_id = ${indexId} and "date" >= ${from} order by "date" asc`;
  const last = rows.at(-1);
  return { series: rows.map((r) => ({ date: r.date, value: r.value })), source: last?.source ?? null, retrievedAt: last?.retrieved_at ?? null };
}

/** Remove specific index rows (used by maintenance scripts). */
export async function deleteIndexRows(indexId: string, dates: ISODate[]) {
  if (dates.length === 0) return 0;
  const db = sql();
  const out = await db`delete from index_history where index_id = ${indexId} and "date" in ${db(dates)}`;
  return out.count;
}

// ---------------------------------------------------------------------------------------------
// Market snapshots, peer stats, performance snapshots

export async function saveMarketSnapshot(date: ISODate, data: unknown, source: string) {
  await upsertRow("market_snapshots", rowId("m", date.replaceAll("-", "")), { date, data: JSON.stringify(data), source, retrieved_at: nowIso() });
}

export async function getLatestMarketSnapshot<T>(): Promise<{ date: ISODate; data: T; source: string; retrievedAt: string } | null> {
  const db = sql();
  const [r] = await db`select * from market_snapshots order by "date" desc limit 1`;
  return r ? { date: r.date, data: JSON.parse(r.data) as T, source: r.source, retrievedAt: r.retrieved_at } : null;
}

export async function savePeerStats(peerKey: string, asOf: ISODate, universeSize: number, stats: unknown, methodVersion: string, source: string) {
  await upsertRow("peer_stats", rowId(peerKey, asOf.replaceAll("-", "")), {
    peer_key: peerKey,
    as_of: asOf,
    universe_size: universeSize,
    stats: JSON.stringify(stats),
    method_version: methodVersion,
    source,
    computed_at: nowIso(),
  });
}

export async function getPeerStats<T>(peerKey: string, asOf: ISODate): Promise<{ stats: T; computedAt: string; source: string } | null> {
  const r = await getRow("peer_stats", rowId(peerKey, asOf.replaceAll("-", "")));
  return r ? { stats: JSON.parse(r.stats) as T, computedAt: r.computed_at, source: r.source } : null;
}

export async function getLatestPeerStats<T>(peerKey: string): Promise<{ asOf: ISODate; stats: T; computedAt: string; source: string } | null> {
  const db = sql();
  const [r] = await db`select * from peer_stats where peer_key = ${peerKey} order by as_of desc limit 1`;
  return r ? { asOf: r.as_of, stats: JSON.parse(r.stats) as T, computedAt: r.computed_at, source: r.source } : null;
}

export async function savePerformanceSnapshot(schemeCode: number, asOf: ISODate, data: unknown, calcVersion: string) {
  await upsertRow("performance_snapshots", rowId("p", schemeCode, asOf.replaceAll("-", "")), {
    scheme_code: schemeCode,
    as_of: asOf,
    data: JSON.stringify(data),
    calc_version: calcVersion,
    created_at: nowIso(),
  });
}

export async function listPerformanceSnapshots<T>(schemeCode: number, limit = 26): Promise<{ asOf: ISODate; data: T }[]> {
  const db = sql();
  const rows = await db`select as_of, data from performance_snapshots where scheme_code = ${schemeCode} order by as_of desc limit ${limit}`;
  return rows.map((r) => ({ asOf: r.as_of, data: JSON.parse(r.data) as T })).reverse();
}

// ---------------------------------------------------------------------------------------------
// News

export interface NewsItem {
  url: string;
  title: string;
  publisher: string;
  publishedAt: string | null;
  summary: string;
  views: string[];
  provider: string;
}

export async function saveNews(weekOf: ISODate, items: (NewsItem & { id: string })[]) {
  const retrieved_at = nowIso();
  await upsertRows(
    "market_news",
    items.map((n) => ({
      id: n.id,
      url: n.url,
      title: n.title.slice(0, 500),
      publisher: n.publisher.slice(0, 128),
      published_at: n.publishedAt,
      summary: n.summary.slice(0, 4000),
      views: n.views,
      provider: n.provider,
      week_of: weekOf,
      retrieved_at,
    })),
  );
}

export async function listNews(weekOf: ISODate): Promise<(NewsItem & { id: string })[]> {
  const db = sql();
  const rows = await db`select * from market_news where week_of = ${weekOf} order by published_at desc nulls last`;
  return rows.map((r) => ({
    id: r.id,
    url: r.url,
    title: r.title,
    publisher: r.publisher ?? "",
    publishedAt: r.published_at ?? null,
    summary: r.summary ?? "",
    views: r.views ?? [],
    provider: r.provider ?? "",
  }));
}

// ---------------------------------------------------------------------------------------------
// Reports

export interface StoredReport<R = unknown, I = unknown> {
  id: string;
  weekEnding: ISODate;
  kind: "scheduled" | "manual";
  assessment: string;
  assessmentReason: string;
  report: R;
  inputSnapshot: I;
  generator: "gemini" | "fallback";
  model: string | null;
  createdAt: string;
}

function toReport<R, I>(r: Row): StoredReport<R, I> {
  return {
    id: r.id,
    weekEnding: r.week_ending,
    kind: r.kind,
    assessment: r.assessment,
    assessmentReason: r.assessment_reason ?? "",
    report: JSON.parse(r.report) as R,
    inputSnapshot: JSON.parse(r.input_snapshot) as I,
    generator: r.generator,
    model: r.model ?? null,
    createdAt: r.created_at,
  };
}

/** Insert a report. A scheduled report has a deterministic id, so a second insert for the same week fails. */
export async function saveReport(rep: Omit<StoredReport, "id" | "createdAt"> & { id?: string }): Promise<string> {
  const db = sql();
  const id = rep.id ?? newId();
  const row = {
    id,
    week_ending: rep.weekEnding,
    kind: rep.kind,
    assessment: rep.assessment,
    assessment_reason: rep.assessmentReason,
    report: JSON.stringify(rep.report),
    input_snapshot: JSON.stringify(rep.inputSnapshot),
    generator: rep.generator,
    model: rep.model ?? null,
    created_at: nowIso(),
  };
  await db`insert into weekly_reports ${db(row)}`;
  return id;
}

export async function getReport<R, I>(id: string): Promise<StoredReport<R, I> | null> {
  const r = await getRow("weekly_reports", id);
  return r ? toReport<R, I>(r) : null;
}

/** Report list without the heavy JSON payloads. */
export async function listReports(limit = 52) {
  const db = sql();
  const rows = await db`select id, week_ending, kind, assessment, assessment_reason, generator, model, created_at from weekly_reports order by created_at desc limit ${limit}`;
  return rows.map((r) => ({
    id: r.id as string,
    weekEnding: r.week_ending as ISODate,
    kind: r.kind as string,
    assessment: r.assessment as string,
    assessmentReason: (r.assessment_reason ?? "") as string,
    generator: r.generator as string,
    model: (r.model ?? null) as string | null,
    createdAt: r.created_at as string,
  }));
}

export async function getLatestReport<R, I>(): Promise<StoredReport<R, I> | null> {
  const [first] = await listReports(1);
  return first ? getReport<R, I>(first.id) : null;
}

// ---------------------------------------------------------------------------------------------
// Delivery logs

export type DeliveryStatus = "pending" | "sent_to_provider" | "delivered" | "read" | "failed" | "awaiting_configuration";

export interface DeliveryLog {
  id: string;
  reportId: string;
  channel: "email" | "whatsapp" | "telegram";
  isTest: boolean;
  status: DeliveryStatus;
  recipientMasked: string | null;
  providerMessageId: string | null;
  error: string | null;
  attempts: number;
  createdAt: string;
  updatedAt: string | null;
}

function toDelivery(r: Row): DeliveryLog {
  return {
    id: r.id,
    reportId: r.report_id,
    channel: r.channel,
    isTest: r.is_test,
    status: r.status,
    recipientMasked: r.recipient_masked ?? null,
    providerMessageId: r.provider_message_id ?? null,
    error: r.error ?? null,
    attempts: r.attempts ?? 0,
    createdAt: r.created_at,
    updatedAt: r.updated_at ?? null,
  };
}

/**
 * Create a delivery log with a deterministic ID. Returns null if one already exists — this is
 * the idempotency guard that stops a re-run cron job from sending the same report twice.
 */
export async function claimDelivery(id: string, d: Pick<DeliveryLog, "reportId" | "channel" | "isTest" | "recipientMasked">): Promise<DeliveryLog | null> {
  const r = await insertIfNew("delivery_logs", id, {
    report_id: d.reportId,
    channel: d.channel,
    is_test: d.isTest,
    status: "pending",
    recipient_masked: d.recipientMasked,
    attempts: 0,
    created_at: nowIso(),
  });
  return r ? toDelivery(r) : null;
}

export async function getDelivery(id: string): Promise<DeliveryLog | null> {
  const r = await getRow("delivery_logs", id);
  return r ? toDelivery(r) : null;
}

export async function updateDelivery(id: string, patch: Partial<Pick<DeliveryLog, "status" | "providerMessageId" | "error" | "attempts">>) {
  const data: Record<string, unknown> = { updated_at: nowIso() };
  if (patch.status !== undefined) data.status = patch.status;
  if (patch.providerMessageId !== undefined) data.provider_message_id = patch.providerMessageId;
  if (patch.error !== undefined) data.error = patch.error?.slice(0, 4000) ?? null;
  if (patch.attempts !== undefined) data.attempts = patch.attempts;
  await updateRow("delivery_logs", id, data);
}

export async function listDeliveries(reportId: string): Promise<DeliveryLog[]> {
  const db = sql();
  const rows = await db`select * from delivery_logs where report_id = ${reportId} order by created_at desc`;
  return rows.map(toDelivery);
}

export async function findDeliveryByProviderId(providerMessageId: string): Promise<DeliveryLog | null> {
  const db = sql();
  const [r] = await db`select * from delivery_logs where provider_message_id = ${providerMessageId} limit 1`;
  return r ? toDelivery(r) : null;
}

// ---------------------------------------------------------------------------------------------
// Scheduled runs (idempotency + run history)

export type RunStatus = "running" | "succeeded" | "partial" | "failed";

export interface RunRecord {
  id: string;
  job: string;
  runDate: ISODate;
  status: RunStatus;
  trigger: string;
  attempts: number;
  startedAt: string;
  finishedAt: string | null;
  steps: { step: string; ok: boolean; detail?: string; ms?: number }[];
  error: string | null;
}

function toRun(r: Row): RunRecord {
  return {
    id: r.id,
    job: r.job,
    runDate: r.run_date,
    status: r.status,
    trigger: r.trigger ?? "",
    attempts: r.attempts ?? 1,
    startedAt: r.started_at,
    finishedAt: r.finished_at ?? null,
    steps: r.steps ? JSON.parse(r.steps) : [],
    error: r.error ?? null,
  };
}

/** A run that has been "running" longer than this is assumed to have crashed and may be retried. */
export const RUN_LEASE_MS = 15 * 60 * 1000;

/**
 * Atomically claim a (job, date) slot. Returns the run if this caller should proceed, or
 * { skipped } if another invocation already succeeded or is still within its lease.
 */
export async function claimRun(
  job: string,
  runDate: ISODate,
  trigger: string,
  opts: { force?: boolean } = {},
): Promise<{ run: RunRecord } | { skipped: string; run: RunRecord }> {
  const id = rowId(job, runDate);
  const startedAt = nowIso();
  const created = await insertIfNew("scheduled_runs", id, { job, run_date: runDate, status: "running", trigger, attempts: 1, started_at: startedAt, steps: "[]" });
  if (created) return { run: toRun(created) };
  const existing = toRun((await getRow("scheduled_runs", id))!);
  const leaseActive = existing.status === "running" && Date.now() - Date.parse(existing.startedAt) < RUN_LEASE_MS;
  if (!opts.force && (existing.status === "succeeded" || leaseActive)) {
    return { skipped: existing.status === "succeeded" ? "already completed" : "already running", run: existing };
  }
  if (leaseActive) return { skipped: "already running", run: existing };
  const r = await updateRow("scheduled_runs", id, { status: "running", trigger, attempts: existing.attempts + 1, started_at: startedAt, finished_at: null, error: null, steps: "[]" });
  return { run: toRun(r!) };
}

export async function finishRun(id: string, status: RunStatus, steps: RunRecord["steps"], error?: string) {
  await updateRow("scheduled_runs", id, { status, steps: JSON.stringify(steps), finished_at: nowIso(), error: error?.slice(0, 4000) ?? null });
}

export async function listRuns(limit = 20): Promise<RunRecord[]> {
  const db = sql();
  const rows = await db`select * from scheduled_runs order by started_at desc limit ${limit}`;
  return rows.map(toRun);
}

// ---------------------------------------------------------------------------------------------
// Market & News topics

export interface TopicNewsRow extends NewsItem {
  id: string;
  topics: string[];
  relevance: { why: string; fact: string } | null;
}

/** Upsert topic news. Relevance (Gemini interpretation) is stored as JSON in its own column. */
export async function saveTopicNews(weekOf: ISODate, items: (NewsItem & { id: string; topics: string[]; relevance?: { why: string; fact: string } | null })[]) {
  const retrieved_at = nowIso();
  await upsertRows(
    "market_news",
    items.map((n) => ({
      id: n.id,
      url: n.url,
      title: n.title.slice(0, 500),
      publisher: n.publisher.slice(0, 128),
      published_at: n.publishedAt,
      summary: n.summary.slice(0, 4000),
      views: n.views,
      topics: n.topics,
      relevance: n.relevance ? JSON.stringify(n.relevance) : null,
      provider: n.provider,
      week_of: weekOf,
      retrieved_at,
    })),
  );
}

export async function listNewsSince(since: string, max = 400): Promise<TopicNewsRow[]> {
  const db = sql();
  const rows = await db`select * from market_news where published_at >= ${since} order by published_at desc limit ${max}`;
  return rows.map((r) => {
    let relevance: TopicNewsRow["relevance"] = null;
    try {
      relevance = r.relevance ? JSON.parse(r.relevance) : null;
    } catch {
      relevance = null;
    }
    return {
      id: r.id,
      url: r.url,
      title: r.title,
      publisher: r.publisher ?? "",
      publishedAt: r.published_at ?? null,
      summary: r.summary ?? "",
      views: r.views ?? [],
      provider: r.provider ?? "",
      topics: r.topics ?? [],
      relevance,
    };
  });
}
