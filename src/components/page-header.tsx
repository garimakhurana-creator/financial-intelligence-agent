import Link from "next/link";
import { ChevronRight } from "lucide-react";

/** Consistent page header: optional breadcrumbs, title, one-line purpose, optional primary action. */
export function PageHeader({
  title,
  sub,
  crumbs,
  action,
  icon: Icon,
}: {
  title: React.ReactNode;
  sub?: React.ReactNode;
  crumbs?: { href: string; label: string }[];
  action?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {crumbs && crumbs.length > 0 && (
          <nav aria-label="Breadcrumb" className="mb-2 flex flex-wrap items-center gap-1 text-xs text-muted-foreground print:hidden">
            {crumbs.map((c, i) => (
              <span key={c.href} className="inline-flex items-center gap-1">
                {i > 0 && <ChevronRight className="size-3" aria-hidden />}
                <Link href={c.href} className="hover:text-foreground hover:underline">
                  {c.label}
                </Link>
              </span>
            ))}
          </nav>
        )}
        <div className="flex items-center gap-3">
          {Icon && (
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
              <Icon className="size-5" aria-hidden />
            </span>
          )}
          <h1 className="text-2xl font-semibold tracking-tight sm:text-[1.9rem]">{title}</h1>
        </div>
        {sub && <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[var(--ink-secondary)]">{sub}</p>}
      </div>
      {action && <div className="shrink-0 print:hidden">{action}</div>}
    </div>
  );
}

/** Small "What does this mean?" disclosure for inline definitions. */
export function Explain({ label = "What does this mean?", children }: { label?: string; children: React.ReactNode }) {
  return (
    <details className="group text-sm">
      <summary className="inline cursor-pointer list-none text-[var(--ink-secondary)] underline decoration-dotted underline-offset-4 hover:text-foreground [&::-webkit-details-marker]:hidden">
        {label}
      </summary>
      <div className="mt-2 rounded-lg bg-muted/60 p-3 leading-relaxed text-[var(--ink-secondary)]">{children}</div>
    </details>
  );
}

export function Card({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return <section className={`rounded-2xl border bg-card p-5 shadow-card ${className}`}>{children}</section>;
}
