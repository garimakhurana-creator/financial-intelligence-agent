import { cacheLife, cacheTag, revalidateTag } from "next/cache";
import type { IndexId } from "@/lib/catalog";
import type { ISODate } from "@/lib/dates";
import * as repo from "@/lib/db/repo";
import * as research from "@/lib/db/research";
import { buildFundPerformance, buildIndexPerformance, buildIndexSet, getIndexSeries } from "@/lib/pipeline/data";

// Shared, cached reads for pages and the assistant. The database's free plan has a monthly read
// quota, and a single dashboard view reads thousands of rows (a year of prices per fund and per
// index), so page views must not read the database each time. Everything here is cached in the
// shared remote cache for about an hour (cacheLife "hours") and invalidated with
// invalidateData() whenever a job or an owner action writes new data.
//
// Jobs and writes never use these helpers: they read the database directly so they always see
// what they just wrote.

export const DATA_TAG = "db-data";

/** Mark every cached read as stale after a write; the next visit reads fresh data. */
export function invalidateData() {
  try {
    revalidateTag(DATA_TAG, { expire: 0 });
  } catch {
    // Outside a request (scripts), there is no cache to invalidate.
  }
}

export async function funds(activeOnly = true) {
  "use cache: remote";
  cacheTag(DATA_TAG);
  cacheLife("hours");
  return repo.listFunds({ activeOnly });
}

export async function fundPerformance(fund: repo.TrackedFund, asOf: ISODate) {
  "use cache: remote";
  cacheTag(DATA_TAG);
  cacheLife("hours");
  return buildFundPerformance(fund, asOf);
}

export async function indexPerformance(id: IndexId, asOf: ISODate) {
  "use cache: remote";
  cacheTag(DATA_TAG);
  cacheLife("hours");
  return buildIndexPerformance(id, asOf);
}

export async function indexSet(ids: IndexId[], asOf: ISODate) {
  "use cache: remote";
  cacheTag(DATA_TAG);
  cacheLife("hours");
  return buildIndexSet(ids, asOf);
}

export async function indexSeries(id: IndexId, from: ISODate) {
  "use cache: remote";
  cacheTag(DATA_TAG);
  cacheLife("hours");
  return getIndexSeries(id, from);
}

export async function latestMarketSnapshot<T>() {
  "use cache: remote";
  cacheTag(DATA_TAG);
  cacheLife("hours");
  return repo.getLatestMarketSnapshot<T>();
}

export async function reports(limit: number) {
  "use cache: remote";
  cacheTag(DATA_TAG);
  cacheLife("hours");
  return repo.listReports(limit);
}

export async function report<R, I>(id: string) {
  "use cache: remote";
  cacheTag(DATA_TAG);
  cacheLife("hours");
  return repo.getReport<R, I>(id);
}

/** News since a calendar day (not a timestamp, so the cache key changes once a day). */
export async function newsSinceDay(day: ISODate, max: number) {
  "use cache: remote";
  cacheTag(DATA_TAG);
  cacheLife("hours");
  return repo.listNewsSince(`${day}T00:00:00.000Z`, max);
}

export async function peerStats<T>(peerKey: string, asOf: ISODate) {
  "use cache: remote";
  cacheTag(DATA_TAG);
  cacheLife("hours");
  return repo.getPeerStats<T>(peerKey, asOf);
}

export async function latestPeerStats<T>(peerKey: string) {
  "use cache: remote";
  cacheTag(DATA_TAG);
  cacheLife("hours");
  return repo.getLatestPeerStats<T>(peerKey);
}

export async function performanceSnapshots<T>(schemeCode: number, limit: number) {
  "use cache: remote";
  cacheTag(DATA_TAG);
  cacheLife("hours");
  return repo.listPerformanceSnapshots<T>(schemeCode, limit);
}

export async function fundMetrics<D>(groupKey?: string) {
  "use cache: remote";
  cacheTag(DATA_TAG);
  cacheLife("hours");
  return research.listFundMetrics<D>(groupKey);
}

export async function fundMetricsMany<D>(codes: number[]) {
  "use cache: remote";
  cacheTag(DATA_TAG);
  cacheLife("hours");
  return research.getFundMetricsMany<D>(codes);
}

export async function discoveryGroups<D>() {
  "use cache: remote";
  cacheTag(DATA_TAG);
  cacheLife("hours");
  return research.listDiscoveryGroups<D>();
}

export async function latestMarketBrief<D>() {
  "use cache: remote";
  cacheTag(DATA_TAG);
  cacheLife("hours");
  return research.getLatestMarketBrief<D>();
}
