import { BookA } from "lucide-react";
import Link from "next/link";
import { GlossaryBrowser } from "@/components/glossary-browser";
import { PageHeader } from "@/components/page-header";
import { GLOSSARY, GLOSSARY_GROUPS } from "@/lib/glossary";

export const metadata = { title: "Glossary · Meera's Money" };

export default function GlossaryPage() {
  return (
    <>
      <PageHeader
        icon={BookA}
        title="Glossary"
        sub="Every money word used in this app, explained in everyday language. Underlined words elsewhere in the app link here."
        crumbs={[{ href: "/", label: "Dashboard" }]}
        action={
          <Link href="/assistant" className="rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white dark:text-[var(--page)]">
            Still confused? Ask
          </Link>
        }
      />
      <GlossaryBrowser entries={GLOSSARY} groups={GLOSSARY_GROUPS} />
    </>
  );
}
