"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import {
  BookA,
  BookOpen,
  Compass,
  FileSearch,
  LayoutDashboard,
  LogIn,
  LogOut,
  Menu,
  MessageCircleQuestion,
  Newspaper,
  Settings,
  ShieldCheck,
  Sigma,
  Sprout,
  Wallet,
  X,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme";
import { cn } from "@/lib/utils";

export const PRIMARY_NAV = [
  { href: "/", label: "My Dashboard", Icon: LayoutDashboard },
  { href: "/portfolio", label: "My Portfolio", Icon: Wallet },
  { href: "/market", label: "Market & News", Icon: Newspaper },
  { href: "/explore", label: "Explore Funds", Icon: Compass },
  { href: "/analyse", label: "Analyse a Fund", Icon: FileSearch },
  { href: "/reports", label: "Weekly Reports", Icon: BookOpen },
] as const;

export const HELP_NAV = [
  { href: "/assistant", label: "Ask the assistant", Icon: MessageCircleQuestion },
  { href: "/glossary", label: "Glossary", Icon: BookA },
  { href: "/methodology", label: "How it works", Icon: Sigma },
  { href: "/manage", label: "Settings & funds", Icon: Settings },
] as const;

type Item = { href: string; label: string; Icon: typeof LayoutDashboard };

function isActive(pathname: string | null, href: string) {
  if (pathname === null) return false;
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`) || (href === "/portfolio" && pathname.startsWith("/funds/"));
}

function NavLinks({ pathname, onNavigate }: { pathname: string | null; onNavigate?: () => void }) {
  const item = (n: Item) => {
    const active = isActive(pathname, n.href);
    return (
      <Link
        key={n.href}
        href={n.href}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className={cn(
          "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
          active ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground" : "text-[var(--ink-secondary)] hover:bg-muted hover:text-foreground",
        )}
      >
        {active && <span aria-hidden className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-brand" />}
        <n.Icon className={cn("size-4 shrink-0", active ? "text-brand" : "text-[var(--ink-muted)] group-hover:text-foreground")} aria-hidden />
        {n.label}
      </Link>
    );
  };
  return (
    <>
      <p className="px-3 pb-1.5 text-[11px] font-medium uppercase tracking-wider text-[var(--ink-muted)]">Your money</p>
      <nav aria-label="Main" className="space-y-0.5">
        {PRIMARY_NAV.map(item)}
      </nav>
      <p className="mt-6 px-3 pb-1.5 text-[11px] font-medium uppercase tracking-wider text-[var(--ink-muted)]">Help</p>
      <nav aria-label="Help and settings" className="space-y-0.5">
        {HELP_NAV.map(item)}
      </nav>
    </>
  );
}

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2.5">
      <span className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-[#0f766e] to-[#14b8a6] text-white shadow-sm">
        <Sprout className="size-5" aria-hidden />
      </span>
      <span className="leading-tight">
        <span className="font-display block text-[1.05rem] font-semibold">Meera&apos;s Money</span>
        <span className="block text-xs text-[var(--ink-muted)]">Fund intelligence</span>
      </span>
    </Link>
  );
}

function Account({ admin }: { admin: boolean | null }) {
  const router = useRouter();
  if (admin === null) return <div className="h-9" />;
  if (!admin) {
    return (
      <Link href="/manage#sign-in" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-[var(--ink-secondary)] hover:bg-muted hover:text-foreground">
        <LogIn className="size-4" aria-hidden /> Owner sign-in
      </Link>
    );
  }
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg bg-brand-soft px-3 py-2 text-sm">
      <span className="inline-flex items-center gap-1.5 font-medium text-brand-ink">
        <ShieldCheck className="size-4" aria-hidden /> Signed in
      </span>
      <button
        type="button"
        onClick={async () => {
          await fetch("/api/admin/logout", { method: "POST" });
          router.refresh();
        }}
        className="inline-flex items-center gap-1 text-xs text-[var(--ink-secondary)] hover:text-foreground"
      >
        <LogOut className="size-3.5" aria-hidden /> Sign out
      </button>
    </div>
  );
}

function NavShell({ pathname, admin }: { pathname: string | null; admin: boolean | null }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const footer = (
    <div className="space-y-3 border-t pt-4">
      <Account admin={admin} />
      <div className="flex items-center justify-between gap-2 px-1">
        <span className="text-xs text-[var(--ink-muted)]">Theme</span>
        <ThemeToggle compact />
      </div>
    </div>
  );

  return (
    <>
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar px-4 py-5 lg:flex print:hidden">
        <Brand />
        <div className="mt-8 flex-1 overflow-y-auto">
          <NavLinks pathname={pathname} />
        </div>
        {footer}
      </aside>

      <header className="sticky top-0 z-30 flex items-center justify-between border-b bg-[var(--page)]/90 px-4 py-3 backdrop-blur lg:hidden print:hidden">
        <Brand />
        <button type="button" onClick={() => setOpen(true)} aria-label="Open menu" aria-expanded={open} className="rounded-lg p-2 hover:bg-muted">
          <Menu className="size-5" aria-hidden />
        </button>
      </header>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" aria-label="Close menu" className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-sidebar px-4 py-5 shadow-xl">
            <div className="flex items-center justify-between">
              <Brand />
              <button type="button" onClick={() => setOpen(false)} aria-label="Close menu" className="rounded-lg p-2 hover:bg-muted">
                <X className="size-5" aria-hidden />
              </button>
            </div>
            <div className="mt-6 flex-1 overflow-y-auto">
              <NavLinks pathname={pathname} onNavigate={() => setOpen(false)} />
            </div>
            {footer}
          </div>
        </div>
      )}
    </>
  );
}

function ActiveNav({ admin }: { admin: boolean }) {
  return <NavShell pathname={usePathname()} admin={admin} />;
}

/** The URL is request-time data, so the active state streams in; the fallback is the same nav, neutral. */
export function AppNav({ admin }: { admin: boolean }) {
  return (
    <Suspense fallback={<NavShell pathname={null} admin={admin} />}>
      <ActiveNav admin={admin} />
    </Suspense>
  );
}

/** Shown while the session is being read. */
export function AppNavFallback() {
  return <NavShell pathname={null} admin={null} />;
}
