import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppNav } from "@/components/app-nav";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const geistSans = Geist({ variable: "--font-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Meera's Fund Intelligence",
  description: "Plain-language mutual fund intelligence: weekly portfolio checks, market news, fund research and analysis.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full">
        <TooltipProvider>
          <div className="flex min-h-screen flex-col lg:flex-row">
            <AppNav />
            <div className="flex min-w-0 flex-1 flex-col">
              <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
              <footer className="border-t print:hidden">
                <div className="mx-auto max-w-6xl px-4 py-5 text-xs leading-relaxed text-[var(--ink-muted)] sm:px-6 lg:px-8">
                  NAVs from AMFI via MFapi.in · indices from Yahoo Finance and NSE · news via Tavily and GNews · explanations by Gemini Flash, checked against
                  the data. Past performance does not guarantee future returns. Research and monitoring only — not investment advice.
                </div>
              </footer>
            </div>
          </div>
        </TooltipProvider>
      </body>
    </html>
  );
}
