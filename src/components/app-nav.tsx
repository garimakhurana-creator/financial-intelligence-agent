"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { BarChart3, BookOpen, Compass, FileSearch, LayoutDashboard, LineChart, Menu, Newspaper, Settings, Wallet, X } from "lucide-react";
import { cn } from "@/lib/utils";

export const PRIMARY_NAV = [
  { href: "/", label: "My Dashboard", Icon: LayoutDashboard },
  { href: "/portfolio", label: "My Portfolio", Icon: Wallet },
  { href: "/market", label: "Market & News", Icon: Newspaper },
  { href: "/explore", label: "Explore Funds", Icon: Compass },
  { href: "/analyse", label: "Analyse a Fund", Icon: FileSearch },
  { href: "/reports", label: "Weekly Reports", Icon: BookOpen },
] as const;

export const SECONDARY_NAV = [
  { href: "/manage", label: "Settings & funds", Icon: Settings },
  { href: "/methodology", label: "How it works", Icon: BarChart3 },
] as const;

function isActive(pathname: string | null, href: string) {
  if (pathname === null) return false;
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLinks({ pathname, onNavigate }: { pathname: string | null; onNavigate?: () => void }) {
  const item = (n: { href: string; label: string; Icon: typeof LayoutDashboard }) => {
    const active = isActive(pathname, n.href) || (n.href === "/portfolio" && !!pathname?.startsWith("/funds/"));
    return (
      <Link
        key={n.href}
        href={n.href}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
          active ? "bg-foreground text-background" : "text-[var(--ink-secondary)] hover:bg-muted hover:text-foreground",
        )}
      >
        <n.Icon className="size-4 shrink-0" aria-hidden />
        {n.label}
      </Link>
    );
  };
  return (
    <>
      <nav aria-label="Main" className="space-y-1">
        {PRIMARY_NAV.map(item)}
      </nav>
      <div className="my-4 border-t" />
      <nav aria-label="Secondary" className="space-y-1">
        {SECONDARY_NAV.map(item)}
      </nav>
    </>
  );
}

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2 font-semibold">
      <span className="grid size-8 place-items-center rounded-lg bg-foreground text-background">
        <LineChart className="size-4" aria-hidden />
      </span>
      <span className="leading-tight">
        Meera&apos;s Fund
        <br />
        <span className="text-[var(--ink-secondary)]">Intelligence</span>
      </span>
    </Link>
  );
}

/** Reads the URL (runtime data), so it streams in inside <Suspense>; the fallback is the same nav without an active item. */
function ActiveNav() {
  return <NavShell pathname={usePathname()} />;
}

export function AppNav() {
  return (
    <Suspense fallback={<NavShell pathname={null} />}>
      <ActiveNav />
    </Suspense>
  );
}

/** Desktop: fixed left sidebar. Mobile: top bar with a slide-in drawer. */
function NavShell({ pathname }: { pathname: string | null }) {
  const [open, setOpen] = useState(false);
  // Links close the drawer themselves (onNavigate); Escape closes it too.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r bg-[var(--surface-1)] px-4 py-5 lg:flex print:hidden">
        <Brand />
        <div className="mt-8 flex-1 overflow-y-auto">
          <NavLinks pathname={pathname} />
        </div>
        <p className="text-[11px] leading-relaxed text-[var(--ink-muted)]">Research and monitoring only — not investment advice.</p>
      </aside>

      <header className="sticky top-0 z-30 flex items-center justify-between border-b bg-[var(--page)]/95 px-4 py-3 backdrop-blur lg:hidden print:hidden">
        <Brand />
        <button type="button" onClick={() => setOpen(true)} aria-label="Open menu" aria-expanded={open} className="rounded-lg p-2 hover:bg-muted">
          <Menu className="size-5" aria-hidden />
        </button>
      </header>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" aria-label="Close menu" className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-[var(--surface-1)] px-4 py-5 shadow-xl">
            <div className="flex items-center justify-between">
              <Brand />
              <button type="button" onClick={() => setOpen(false)} aria-label="Close menu" className="rounded-lg p-2 hover:bg-muted">
                <X className="size-5" aria-hidden />
              </button>
            </div>
            <div className="mt-6 flex-1 overflow-y-auto">
              <NavLinks pathname={pathname} onNavigate={() => setOpen(false)} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
