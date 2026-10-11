import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import { LineChart } from "lucide-react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { VIEWS, VIEW_IDS } from "@/lib/catalog";
import "./globals.css";

const geistSans = Geist({ variable: "--font-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Meera's Fund Tracker",
  description: "Weekly mutual fund performance against benchmarks and category peers, explained in plain language.",
};

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/reports", label: "Reports" },
  { href: "/methodology", label: "Methodology" },
  { href: "/manage", label: "Manage" },
];

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <TooltipProvider>
          <header className="sticky top-0 z-30 border-b bg-[var(--page)]/90 backdrop-blur">
            <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
              <Link href="/" className="flex items-center gap-2 font-semibold">
                <span className="grid size-7 place-items-center rounded-md bg-primary text-primary-foreground">
                  <LineChart className="size-4" aria-hidden />
                </span>
                Meera&apos;s Fund Tracker
              </Link>
              <nav aria-label="Main" className="flex flex-wrap gap-1 text-sm">
                {NAV.map((n) => (
                  <Link key={n.href} href={n.href} className="rounded-md px-2.5 py-1.5 text-[var(--ink-secondary)] hover:bg-muted hover:text-foreground">
                    {n.label}
                  </Link>
                ))}
              </nav>
            </div>
            <nav aria-label="Categories" className="no-scrollbar mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 pb-2 text-xs">
              {VIEW_IDS.map((id) => (
                <Link key={id} href={`/categories/${id}`} className="shrink-0 rounded-full border px-2.5 py-1 text-[var(--ink-secondary)] hover:bg-muted hover:text-foreground">
                  {VIEWS[id].short}
                </Link>
              ))}
            </nav>
          </header>
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
          <footer className="border-t">
            <div className="mx-auto max-w-6xl px-4 py-5 text-xs leading-relaxed text-[var(--ink-muted)]">
              NAVs from AMFI via MFapi.in · indices from Yahoo Finance and NSE · news via Tavily and GNews · summaries by Gemini Flash.
              Past performance does not guarantee future returns. This is a monitoring tool, not investment advice.
            </div>
          </footer>
        </TooltipProvider>
      </body>
    </html>
  );
}
