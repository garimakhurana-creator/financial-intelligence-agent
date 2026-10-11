import { MessageCircleQuestion } from "lucide-react";
import { AssistantChat } from "@/components/assistant";
import { PageHeader } from "@/components/page-header";

export const metadata = { title: "Ask the assistant · Meera's Money" };

export default function AssistantPage() {
  return (
    <div className="flex h-[calc(100vh-9rem)] min-h-[520px] flex-col lg:h-[calc(100vh-8rem)]">
      <PageHeader
        icon={MessageCircleQuestion}
        title="Ask the assistant"
        sub="Questions about your funds, this week's report, the market or a money word. Answers come from your real data and are checked before you see them."
        crumbs={[{ href: "/", label: "Dashboard" }]}
      />
      <div className="min-h-0 flex-1 rounded-2xl border bg-card p-4 shadow-card sm:p-6">
        <AssistantChat />
      </div>
    </div>
  );
}
