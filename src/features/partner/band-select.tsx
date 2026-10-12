"use client";

// Shared IELTS band selector (0.0–9.0, step 0.5). Extracted from the standalone
// result-review page so the mock multi-skill criteria editor grades with the
// exact same control (dropdown + "—" empty state) instead of a raw number input.

import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/** All selectable IELTS bands: 0.0, 0.5, … 9.0. */
export const BAND_OPTIONS = Array.from({ length: 19 }, (_, i) => i * 0.5);

export function BandSelect({ value, onChange, emphasis = false, readOnly = false, testId }: { value?: number; onChange: (v: number | undefined) => void; emphasis?: boolean; readOnly?: boolean; testId?: string }) {
  if (readOnly) {
    return (
      <span
        data-testid={testId}
        className={cn(
          "inline-flex h-9 items-center justify-center rounded-lg border bg-white px-3 font-bold",
          emphasis ? "min-w-[92px] border-brand-200 bg-brand-50 text-lg text-brand-600" : "min-w-[82px] border-ink-200 text-sm text-ink-900",
        )}
      >
        {value != null ? value.toFixed(1) : "—"}
      </span>
    );
  }
  return (
    <div className="relative">
      <select
        data-testid={testId}
        value={value != null ? String(value) : ""}
        onChange={(e) => onChange(e.target.value === "" ? undefined : parseFloat(e.target.value))}
        className={cn(
          "h-9 cursor-pointer appearance-none rounded-lg border bg-white pl-3 pr-8 font-bold outline-none focus:border-brand-400",
          emphasis ? "min-w-[92px] border-brand-200 bg-brand-50 text-lg text-brand-600" : "min-w-[82px] border-ink-200 text-sm text-ink-900",
        )}
      >
        <option value="">—</option>
        {BAND_OPTIONS.map((b) => (
          <option key={b} value={b}>{b.toFixed(1)}</option>
        ))}
      </select>
      <ChevronDown className={cn("pointer-events-none absolute right-2 top-1/2 size-4 -translate-y-1/2", emphasis ? "text-brand-500" : "text-ink-400")} />
    </div>
  );
}
