import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { daysBetween, formatHuman, type ISODate } from "@/lib/dates";
import { cn } from "@/lib/utils";

/** Signed percentage, coloured by sign, with an arrow so meaning is never colour-only. */
export function Pct({ value, className, plain = false }: { value: number | null | undefined; className?: string; plain?: boolean }) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return (
      <span className={cn("text-[var(--ink-muted)]", className)} title="Not available">
        n/a
      </span>
    );
  }
  const r = Math.round(value * 100) / 100;
  const Icon = r > 0 ? ArrowUpRight : r < 0 ? ArrowDownRight : Minus;
  return (
    <span className={cn("tabular inline-flex items-center gap-0.5 whitespace-nowrap", !plain && (r > 0 ? "text-[var(--up)]" : r < 0 ? "text-[var(--down)]" : ""), className)}>
      {!plain && <Icon aria-hidden className="size-3.5 shrink-0" />}
      {r > 0 ? "+" : ""}
      {r.toFixed(2)}%
    </span>
  );
}

/** Percentage-point difference ("ahead by / behind by"). */
export function Pp({ value, className }: { value: number | null | undefined; className?: string }) {
  if (value === null || value === undefined || !Number.isFinite(value)) return <span className={cn("text-[var(--ink-muted)]", className)}>n/a</span>;
  const r = Math.round(value * 100) / 100;
  return (
    <span className={cn("tabular whitespace-nowrap", r > 0 ? "text-[var(--up)]" : r < 0 ? "text-[var(--down)]" : "", className)}>
      {r > 0 ? "+" : ""}
      {r.toFixed(2)} pp
    </span>
  );
}

export function Inr({ value, dp = 4 }: { value: number | null | undefined; dp?: number }) {
  if (value === null || value === undefined) return <span className="text-[var(--ink-muted)]">n/a</span>;
  return <span className="tabular">₹{value.toLocaleString("en-IN", { minimumFractionDigits: dp, maximumFractionDigits: dp })}</span>;
}

export function Num({ value, dp = 2 }: { value: number | null | undefined; dp?: number }) {
  if (value === null || value === undefined) return <span className="text-[var(--ink-muted)]">n/a</span>;
  return <span className="tabular">{value.toLocaleString("en-IN", { minimumFractionDigits: dp, maximumFractionDigits: dp })}</span>;
}

export function DateText({ date }: { date: ISODate | null | undefined }) {
  return <span className="tabular">{date ? formatHuman(date) : "—"}</span>;
}

export function Timestamp({ iso }: { iso: string | null | undefined }) {
  if (!iso) return <span>—</span>;
  const d = new Date(iso);
  return (
    <time dateTime={iso} className="tabular">
      {d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} IST
    </time>
  );
}

/** Data-freshness pill: how old an observation is relative to "today". */
export function Freshness({ date, today, label = "Data" }: { date: ISODate | null | undefined; today: ISODate; label?: string }) {
  if (!date) return <span className="rounded-full bg-[var(--tint-critical)] px-2 py-0.5 text-xs font-medium">No data</span>;
  const age = daysBetween(date, today);
  const stale = age > 4;
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", stale ? "bg-[var(--tint-warning)]" : "bg-[var(--tint-good)]")}
      title={`${label} dated ${formatHuman(date)} (${age} day${age === 1 ? "" : "s"} old)`}
    >
      <span aria-hidden className={cn("size-1.5 rounded-full", stale ? "bg-[var(--status-warning)]" : "bg-[var(--status-good)]")} />
      {label} as of {formatHuman(date)}
      {stale ? " · stale" : ""}
    </span>
  );
}

export const shortFundName = (n: string) => n.replace(/\s*-\s*Direct Plan.*$/i, "").replace(/\s*-\s*Growth.*$/i, "").trim();
