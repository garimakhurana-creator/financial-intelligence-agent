import type { Metadata } from "next";
import { Suspense } from "react";
import { Bricolage_Grotesque, Geist, Geist_Mono } from "next/font/google";
import { AppNav, AppNavFallback } from "@/components/app-nav";
import { AssistantLauncher } from "@/components/assistant";
import { THEME_SCRIPT } from "@/components/theme";
import { TooltipProvider } from "@/components/ui/tooltip";
import { isAdmin, openAccess } from "@/lib/auth";
import "./globals.css";

const geistSans = Geist({ variable: "--font-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const display = Bricolage_Grotesque({ variable: "--font-display", subsets: ["latin"], weight: ["500", "600", "700", "800"] });

export const metadata: Metadata = {
  title: "Meera's Money · Fund intelligence",
  description: "Plain-language mutual fund intelligence: weekly portfolio checks, market news, fund research and analysis.",
};

/** Session cookie is request-time data, so the nav that depends on it streams inside Suspense. */
async function NavWithSession() {
  return <AppNav admin={await isAdmin()} showAccount={!openAccess()} />;
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} ${display.variable} h-full antialiased`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full">
        <TooltipProvider>
          <div className="flex min-h-screen flex-col lg:flex-row">
            <Suspense fallback={<AppNavFallback />}>
              <NavWithSession />
            </Suspense>
            <div className="flex min-w-0 flex-1 flex-col">
              <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-10">{children}</main>
              <footer className="border-t print:hidden">
                <div className="mx-auto max-w-6xl px-4 py-5 text-xs leading-relaxed text-[var(--ink-muted)] sm:px-6 lg:px-10">
                  NAVs from AMFI via MFapi.in · indices from Yahoo Finance and NSE · news via Tavily and GNews · explanations by Gemini Flash, checked against
                  the data. Past performance does not guarantee future returns. Research and monitoring only — not investment advice.
                </div>
              </footer>
            </div>
          </div>
          <AssistantLauncher />
        </TooltipProvider>
      </body>
    </html>
  );
}
