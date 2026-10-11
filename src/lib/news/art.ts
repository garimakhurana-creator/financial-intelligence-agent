import type { TopicId } from "@/lib/news/topics";

// Visual identity for news topics on the swipe cards: a friendly label, an emoji and a gradient.
// Purely decorative; the topic itself comes from the fixed query-to-topic mapping.

export const TOPIC_ART: Record<TopicId, { emoji: string; label: string; from: string; to: string }> = {
  indian_markets: { emoji: "📈", label: "Indian markets", from: "#f97316", to: "#ec4899" },
  mutual_funds: { emoji: "💸", label: "Mutual funds", from: "#10b981", to: "#0ea5e9" },
  rbi_rates: { emoji: "🏦", label: "RBI & rates", from: "#6366f1", to: "#0ea5e9" },
  inflation_economy: { emoji: "🛒", label: "Prices & economy", from: "#f59e0b", to: "#ef4444" },
  global_markets: { emoji: "🌍", label: "World markets", from: "#0ea5e9", to: "#8b5cf6" },
  tech_us: { emoji: "💻", label: "US tech", from: "#8b5cf6", to: "#ec4899" },
  debt_bonds: { emoji: "📜", label: "Bonds", from: "#14b8a6", to: "#84cc16" },
};

export const DEFAULT_ART = { emoji: "📰", label: "News", from: "#64748b", to: "#0f766e" };

export function topicArt(topics: string[]) {
  const t = topics.find((x) => x in TOPIC_ART) as TopicId | undefined;
  return t ? TOPIC_ART[t] : DEFAULT_ART;
}

/** "2h ago", "Yesterday", "3 days ago": publication time, relative to now. */
export function ago(iso: string | null, now: number): string {
  if (!iso) return "date unknown";
  const mins = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  if (mins < 60) return `${mins || 1} min ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "Yesterday" : `${d} days ago`;
}

const MEDIA = /\b(times|express|mint|standard|news|economic|hindu|reuters|bloomberg|moneycontrol|today|post|journal|herald|tribune|financial|business|cnbc|ndtv)\b|\.(com|in)\b/i;

/** Drop a trailing " - Publisher" that some feeds append to headlines (the publisher is shown separately). */
export function cleanTitle(title: string): string {
  const m = title.match(/^(.{20,}?)\s+[-–|]\s+([^-–|]{2,40})$/);
  return m && MEDIA.test(m[2]) ? m[1] : title;
}
