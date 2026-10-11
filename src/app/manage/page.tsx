import { Suspense } from "react";
import { SectionTitle } from "@/components/blocks";
import { Timestamp } from "@/components/format";
import { LoginForm, LogoutButton, ManagePanel } from "@/components/manage-panel";
import { Skeleton } from "@/components/ui/skeleton";
import { isAdmin, openAccess } from "@/lib/auth";
import { INDICES, PEER_RULES, VIEWS } from "@/lib/catalog";
import { loadManage } from "@/lib/view-data";
import { cn } from "@/lib/utils";

export default function ManagePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings &amp; funds</h1>
        <p className="mt-1 text-sm text-[var(--ink-secondary)]">
          Tracked funds and their benchmark/peer mapping, on-demand reports and data refreshes, integration status and run history. Holdings and SIPs are on My Portfolio.
        </p>
      </div>
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-xl" />}>
        <Manage />
      </Suspense>
    </div>
  );
}

async function Manage() {
  const [admin, d] = await Promise.all([isAdmin(), loadManage()]);
  const options = {
    views: Object.values(VIEWS).map((v) => ({ id: v.id, label: v.title })),
    peers: PEER_RULES.map((r) => ({ id: r.key, label: r.label })),
    benchmarks: Object.values(INDICES).map((i) => ({ id: i.id, label: i.name })),
  };
  return (
    <div className="space-y-8">
      {admin ? (
        <>
          {!openAccess() && (
            <div className="flex justify-end">
              <LogoutButton />
            </div>
          )}
          <ManagePanel funds={d.funds} options={options} />
        </>
      ) : (
        <div id="sign-in">
          <LoginForm />
        </div>
      )}

      <section>
        <SectionTitle sub="Names of configured integrations only — secret values never leave the server.">Integrations</SectionTitle>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {Object.entries(d.integrations).map(([k, ok]) => (
            <li key={k} className={cn("flex items-center justify-between rounded-lg border px-3 py-2 text-sm", ok ? "bg-[var(--tint-good)]" : "bg-[var(--tint-warning)]")}>
              <span className="capitalize">{k}</span>
              <span className="text-xs font-medium">{ok ? "Configured" : "Awaiting configuration"}</span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <SectionTitle sub="Daily data refresh (~00:00–00:59 IST) and the Saturday report (~08:00–08:59 IST). Each run is keyed by its date so duplicates are skipped.">Run history</SectionTitle>
        {d.runs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No scheduled runs yet.</p>
        ) : (
          <ul className="divide-y rounded-xl border bg-card text-sm">
            {d.runs.map((r) => (
              <li key={r.id} className="p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{r.job}</span>
                  <span className="text-muted-foreground">{r.runDate}</span>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-xs",
                      r.status === "succeeded" ? "bg-[var(--tint-good)]" : r.status === "running" ? "bg-muted" : r.status === "partial" ? "bg-[var(--tint-warning)]" : "bg-[var(--tint-critical)]",
                    )}
                  >
                    {r.status}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {r.trigger} · attempt {r.attempts} · <Timestamp iso={r.startedAt} />
                  </span>
                </div>
                {r.steps.length > 0 && (
                  <ul className="mt-1 space-y-0.5 text-xs text-[var(--ink-secondary)]">
                    {r.steps.map((s, i) => (
                      <li key={i}>
                        {s.ok ? "✓" : "✗"} {s.step}: {s.detail} {s.ms !== undefined && <span className="text-muted-foreground">({(s.ms / 1000).toFixed(1)}s)</span>}
                      </li>
                    ))}
                  </ul>
                )}
                {r.error && <p className="mt-1 text-xs text-[var(--down)]">{r.error}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
