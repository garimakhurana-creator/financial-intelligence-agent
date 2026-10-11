"use client";

import { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/** Horizontal swipe strip (CSS scroll-snap) with arrow buttons for mouse users. */
export function Carousel({ label, children }: { label: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const by = (dir: 1 | -1) => ref.current?.scrollBy({ left: dir * (ref.current.clientWidth * 0.8), behavior: "smooth" });
  return (
    <div className="relative">
      <div ref={ref} role="region" aria-label={label} tabIndex={0} className="no-scrollbar -mx-4 flex snap-x snap-mandatory scroll-px-4 sm:scroll-px-6 lg:scroll-px-10 gap-3 overflow-x-auto scroll-smooth px-4 pb-2 outline-none sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10">
        {children}
      </div>
      <div className="pointer-events-none absolute -top-12 right-0 hidden gap-2 md:flex">
        <button type="button" onClick={() => by(-1)} aria-label="Scroll back" className="pointer-events-auto grid size-9 place-items-center rounded-full border bg-card shadow-card hover:bg-muted">
          <ChevronLeft className="size-4" aria-hidden />
        </button>
        <button type="button" onClick={() => by(1)} aria-label="Scroll forward" className="pointer-events-auto grid size-9 place-items-center rounded-full border bg-card shadow-card hover:bg-muted">
          <ChevronRight className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
