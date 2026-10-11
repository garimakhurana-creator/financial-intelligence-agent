import Link from "next/link";
import { findTerm } from "@/lib/glossary";

/**
 * An inline glossary word: dotted underline, a short definition on hover/focus, and a link to the
 * full entry. Pure CSS, so it works in server components and without JavaScript.
 */
export function Term({ slug, children }: { slug: string; children?: React.ReactNode }) {
  const t = findTerm(slug);
  if (!t) return <>{children}</>;
  return (
    <span className="group/term relative inline">
      <Link href={`/glossary#${t.slug}`} className="underline decoration-[var(--brand)]/60 decoration-dotted underline-offset-4 hover:decoration-solid">
        {children ?? t.term}
      </Link>
      <span
        role="tooltip"
        className="pointer-events-none invisible absolute bottom-full left-0 z-30 mb-2 w-64 rounded-lg border bg-popover p-3 text-left text-xs font-normal leading-relaxed text-popover-foreground opacity-0 shadow-lg transition-opacity group-focus-within/term:visible group-focus-within/term:opacity-100 group-hover/term:visible group-hover/term:opacity-100"
      >
        <span className="block font-semibold">{t.term}</span>
        <span className="mt-0.5 block text-[var(--ink-secondary)]">{t.short}</span>
      </span>
    </span>
  );
}
