"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

/** Owner-only buttons for clearly-labelled test sends of an existing report. */
export function SendControls({ reportId }: { reportId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function send(channel: "email" | "whatsapp") {
    setBusy(channel);
    setMsg(null);
    try {
      const res = await fetch(`/api/reports/${encodeURIComponent(reportId)}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel, test: true }),
      });
      const j = await res.json();
      setMsg(res.ok ? `${channel}: ${j.status === "sent_to_provider" ? "accepted by provider" : j.status}${j.detail ? ` — ${j.detail}` : ""}` : `${channel}: ${j.error ?? j.detail ?? "failed"}`);
      router.refresh();
    } catch {
      setMsg("Network error — try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-3 border-t pt-3">
      <div className="text-xs text-muted-foreground">Test sends are labelled “TEST” and logged separately from the Saturday send.</div>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => send("email")}>
          {busy === "email" ? "Sending…" : "Send test email"}
        </Button>
        <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => send("whatsapp")}>
          {busy === "whatsapp" ? "Sending…" : "Send test WhatsApp"}
        </Button>
      </div>
      {msg && (
        <p role="status" className="mt-2 text-xs">
          {msg}
        </p>
      )}
    </div>
  );
}
