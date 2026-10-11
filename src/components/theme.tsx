"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

export type ThemePref = "light" | "dark" | "system";
const KEY = "theme";

/**
 * Runs in <head> before first paint so the page never flashes the wrong theme.
 * Kept as a string because it must execute before React loads.
 */
export const THEME_SCRIPT = `(function(){try{var p=localStorage.getItem("${KEY}")||"system";var d=p==="dark"||(p==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.setAttribute("data-theme",d?"dark":"light");}catch(e){document.documentElement.setAttribute("data-theme","light");}})();`;

function apply(pref: ThemePref) {
  const dark = pref === "dark" || (pref === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
}

function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

const listeners = new Set<() => void>();
function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

/** Light / dark / follow-system switch. The choice is remembered in this browser only. */
export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const pref = useSyncExternalStore(subscribe, readPref, () => "system" as ThemePref);

  useEffect(() => {
    if (pref !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [pref]);

  const choose = (p: ThemePref) => {
    try {
      localStorage.setItem(KEY, p);
    } catch {
      /* private mode: the choice just won't persist */
    }
    apply(p);
    listeners.forEach((l) => l());
  };

  const opts: { id: ThemePref; label: string; Icon: typeof Sun }[] = [
    { id: "light", label: "Light", Icon: Sun },
    { id: "dark", label: "Dark", Icon: Moon },
    { id: "system", label: "System", Icon: Monitor },
  ];
  return (
    <div role="radiogroup" aria-label="Colour theme" className="inline-flex rounded-lg border bg-background p-0.5">
      {opts.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={pref === o.id}
          title={`${o.label} theme`}
          onClick={() => choose(o.id)}
          className={cn(
            "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors",
            pref === o.id ? "bg-brand text-white dark:text-[var(--page)]" : "text-[var(--ink-secondary)] hover:bg-muted",
          )}
        >
          <o.Icon className="size-3.5" aria-hidden />
          {!compact && o.label}
        </button>
      ))}
    </div>
  );
}
