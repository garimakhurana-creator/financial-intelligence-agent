// Appwrite TablesDB schema — single source of truth for scripts/setup-db.ts.
// Bump SCHEMA_VERSION whenever a table/column/index is added; the setup script is additive and
// idempotent (it creates what is missing and never drops data).

export const SCHEMA_VERSION = 1;

export type ColumnType = "varchar" | "text" | "longtext" | "integer" | "double" | "boolean" | "datetime";

export interface ColumnDef {
  key: string;
  type: ColumnType;
  size?: number; // varchar only
  required?: boolean;
  array?: boolean;
}

export interface IndexDef {
  key: string;
  type: "key" | "unique";
  columns: string[];
  orders?: ("ASC" | "DESC")[];
}

export interface TableDef {
  id: string;
  name: string;
  columns: ColumnDef[];
  indexes: IndexDef[];
}

const v = (key: string, size: number, required = false, array = false): ColumnDef => ({ key, type: "varchar", size, required, array });
const c = (key: string, type: Exclude<ColumnType, "varchar">, required = false): ColumnDef => ({ key, type, required });

export const TABLES = {
  tracked_funds: {
    id: "tracked_funds",
    name: "Tracked funds",
    columns: [
      c("scheme_code", "integer", true),
      v("scheme_name", 255, true),
      v("fund_house", 128),
      v("amfi_category", 160),
      v("view_id", 32),
      v("peer_key", 32),
      v("benchmark_id", 32),
      v("stated_benchmark", 160),
      v("benchmark_source", 255),
      c("active", "boolean", true),
      c("added_at", "datetime"),
      c("removed_at", "datetime"),
      v("last_nav_date", 10),
      c("last_refreshed_at", "datetime"),
    ],
    indexes: [{ key: "idx_active", type: "key", columns: ["active"] }],
  },
  nav_history: {
    id: "nav_history",
    name: "NAV history",
    columns: [c("scheme_code", "integer", true), v("date", 10, true), c("nav", "double", true), v("source", 32), c("retrieved_at", "datetime")],
    indexes: [{ key: "uq_scheme_date", type: "unique", columns: ["scheme_code", "date"] }],
  },
  index_history: {
    id: "index_history",
    name: "Index history",
    columns: [v("index_id", 32, true), v("date", 10, true), c("value", "double", true), v("source", 64), c("retrieved_at", "datetime")],
    indexes: [{ key: "uq_index_date", type: "unique", columns: ["index_id", "date"] }],
  },
  market_snapshots: {
    id: "market_snapshots",
    name: "Market breadth & valuation snapshots",
    columns: [v("date", 10, true), c("data", "longtext", true), v("source", 64), c("retrieved_at", "datetime")],
    indexes: [{ key: "idx_date", type: "key", columns: ["date"], orders: ["DESC"] }],
  },
  peer_stats: {
    id: "peer_stats",
    name: "Peer-average snapshots",
    columns: [
      v("peer_key", 32, true),
      v("as_of", 10, true),
      c("universe_size", "integer"),
      c("stats", "longtext", true),
      v("method_version", 16),
      v("source", 128),
      c("computed_at", "datetime"),
    ],
    indexes: [{ key: "uq_peer_asof", type: "unique", columns: ["peer_key", "as_of"] }],
  },
  performance_snapshots: {
    id: "performance_snapshots",
    name: "Performance snapshots",
    columns: [c("scheme_code", "integer", true), v("as_of", 10, true), c("data", "longtext", true), v("calc_version", 16), c("created_at", "datetime")],
    indexes: [{ key: "uq_scheme_asof", type: "unique", columns: ["scheme_code", "as_of"] }],
  },
  market_news: {
    id: "market_news",
    name: "Market news",
    columns: [
      v("url", 1000, true),
      v("title", 500, true),
      v("publisher", 128),
      c("published_at", "datetime"),
      c("summary", "text"),
      v("views", 32, false, true),
      v("provider", 16),
      v("week_of", 10, true),
      c("retrieved_at", "datetime"),
    ],
    indexes: [{ key: "idx_week", type: "key", columns: ["week_of"] }],
  },
  weekly_reports: {
    id: "weekly_reports",
    name: "Weekly reports",
    columns: [
      v("week_ending", 10, true),
      v("kind", 16, true),
      v("assessment", 48, true),
      c("assessment_reason", "text"),
      c("report", "longtext", true),
      c("input_snapshot", "longtext", true),
      v("generator", 16, true),
      v("model", 64),
      c("created_at", "datetime", true),
    ],
    indexes: [
      { key: "idx_created", type: "key", columns: ["created_at"], orders: ["DESC"] },
      { key: "idx_week", type: "key", columns: ["week_ending"] },
    ],
  },
  delivery_logs: {
    id: "delivery_logs",
    name: "Delivery logs",
    columns: [
      v("report_id", 36, true),
      v("channel", 16, true),
      c("is_test", "boolean", true),
      v("status", 24, true),
      v("recipient_masked", 64),
      v("provider_message_id", 128),
      c("error", "text"),
      c("attempts", "integer"),
      c("created_at", "datetime", true),
      c("updated_at", "datetime"),
    ],
    indexes: [
      { key: "idx_report", type: "key", columns: ["report_id"] },
      { key: "idx_provider_msg", type: "key", columns: ["provider_message_id"] },
    ],
  },
  scheduled_runs: {
    id: "scheduled_runs",
    name: "Scheduled runs",
    columns: [
      v("job", 16, true),
      v("run_date", 10, true),
      v("status", 16, true),
      v("trigger", 16),
      c("attempts", "integer"),
      c("started_at", "datetime", true),
      c("finished_at", "datetime"),
      c("steps", "longtext"),
      c("error", "text"),
    ],
    indexes: [{ key: "idx_started", type: "key", columns: ["started_at"], orders: ["DESC"] }],
  },
} satisfies Record<string, TableDef>;

export type TableId = keyof typeof TABLES;
