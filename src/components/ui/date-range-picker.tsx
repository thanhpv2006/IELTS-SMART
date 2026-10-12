"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export type DateRange = { from: string; to: string }; // YYYY-MM-DD

export function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

export function startOfWeek(d: Date): Date {
  const r = new Date(d);
  r.setDate(r.getDate() - r.getDay());
  return r;
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function formatDisplay(from: string, to: string): string {
  const fmt = (s: string) => {
    const [y, m, d] = s.split("-");
    return `${d}/${m}/${y.slice(2)}`;
  };
  return `${fmt(from)} - ${fmt(to)}`;
}

// ── Calendar ─────────────────────────────────────────────────────────────────

function Calendar({
  year,
  month,
  selecting,
  onSelect,
  hoverDate,
  onHover,
}: {
  year: number;
  month: number; // 0-indexed
  selecting: { from?: string; to?: string };
  onSelect: (d: string) => void;
  hoverDate: string | null;
  onHover: (d: string | null) => void;
}) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startPad = firstDay.getDay(); // 0=Sun
  const totalCells = startPad + lastDay.getDate();
  const weeks = Math.ceil(totalCells / 7);

  const days: (string | null)[] = [];
  for (let i = 0; i < startPad; i++) days.push(null);
  for (let d = 1; d <= lastDay.getDate(); d++) {
    days.push(toDateStr(new Date(year, month, d)));
  }
  while (days.length < weeks * 7) days.push(null);

  const monthNames = ["Tháng 1","Tháng 2","Tháng 3","Tháng 4","Tháng 5","Tháng 6",
                      "Tháng 7","Tháng 8","Tháng 9","Tháng 10","Tháng 11","Tháng 12"];

  const rangeFrom = selecting.from;
  const rangeTo = selecting.to ?? hoverDate ?? rangeFrom;
  const lo = rangeFrom && rangeTo ? (rangeFrom < rangeTo ? rangeFrom : rangeTo) : rangeFrom;
  const hi = rangeFrom && rangeTo ? (rangeFrom > rangeTo ? rangeFrom : rangeTo) : rangeFrom;

  return (
    <div className="w-52">
      <p className="mb-2 text-center text-sm font-semibold text-ink-700">
        {monthNames[month]} {year}
      </p>
      <div className="grid grid-cols-7 text-center">
        {["Su","Mo","Tu","We","Th","Fr","Sa"].map((d) => (
          <span key={d} className="py-1 text-[10px] font-medium text-ink-400">{d}</span>
        ))}
        {days.map((d, i) => {
          if (!d) return <span key={i} />;
          const isStart = d === lo;
          const isEnd = d === hi;
          const inRange = lo && hi && d > lo && d < hi;
          const today = toDateStr(new Date());
          const isFuture = d > today;
          const isHovered = d === hoverDate && !isFuture;
          return (
            <button
              key={d}
              disabled={isFuture}
              onMouseEnter={() => onHover(d)}
              onMouseLeave={() => onHover(null)}
              onClick={() => onSelect(d)}
              className={cn(
                "relative py-1 text-[13px] transition-colors rounded-full",
                isFuture && "text-ink-300 cursor-not-allowed",
                inRange && !isStart && !isEnd && "bg-brand-50 text-brand-700 rounded-none",
                isHovered && !isStart && !isEnd && "bg-brand-500 text-white font-semibold",
                (isStart || isEnd) && "bg-brand-500 text-white font-semibold",
              )}
            >
              {d.slice(8).replace(/^0/, "")}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── DateRangePicker ───────────────────────────────────────────────────────────

const PRESETS = [
  { label: "Week to date", range: () => { const t = new Date(); return { from: toDateStr(startOfWeek(t)), to: toDateStr(t) }; } },
  { label: "Month to date", range: () => { const t = new Date(); return { from: toDateStr(startOfMonth(t)), to: toDateStr(t) }; } },
  { label: "Last 7 days",  range: () => { const t = new Date(); return { from: toDateStr(addDays(t, -6)), to: toDateStr(t) }; } },
  { label: "Last 14 days", range: () => { const t = new Date(); return { from: toDateStr(addDays(t, -13)), to: toDateStr(t) }; } },
  { label: "Last 30 days", range: () => { const t = new Date(); return { from: toDateStr(addDays(t, -29)), to: toDateStr(t) }; } },
];

export function DateRangePicker({
  value,
  onChange,
  testId,
}: {
  value: DateRange;
  onChange: (r: DateRange) => void;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<"idle" | "picking-end">("idle");
  const [draft, setDraft] = useState<{ from?: string; to?: string }>({});
  const [hover, setHover] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // Calendar months: left = current month - 1, right = current month
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth()); // right panel month

  const leftMonth = viewMonth === 0 ? 11 : viewMonth - 1;
  const leftYear  = viewMonth === 0 ? viewYear - 1 : viewYear;

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setStage("idle");
        setDraft({});
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function handlePreset(rangeFn: () => DateRange) {
    onChange(rangeFn());
    setOpen(false);
    setStage("idle");
    setDraft({});
  }

  function handleDaySelect(d: string) {
    if (stage === "idle" || stage === "picking-end" && !draft.from) {
      setDraft({ from: d });
      setStage("picking-end");
    } else if (stage === "picking-end") {
      const lo = draft.from! < d ? draft.from! : d;
      const hi = draft.from! < d ? d : draft.from!;
      onChange({ from: lo, to: hi });
      setOpen(false);
      setStage("idle");
      setDraft({});
    }
  }

  function navMonth(delta: number) {
    let m = viewMonth + delta;
    let y = viewYear;
    if (m > 11) { m = 0; y++; }
    if (m < 0)  { m = 11; y--; }
    setViewMonth(m);
    setViewYear(y);
  }

  const calDraft = stage === "picking-end" ? draft : { from: value.from, to: value.to };

  return (
    <div ref={ref} className="relative inline-block">
      <button
        data-testid={testId}
        onClick={() => { setOpen((v) => !v); setStage("idle"); setDraft({}); }}
        className="flex items-center gap-2 rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm font-medium text-ink-700 hover:bg-ink-50 shadow-sm"
      >
        <svg className="h-4 w-4 text-ink-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" strokeLinecap="round" />
        </svg>
        <span>{formatDisplay(value.from, value.to)}</span>
        <svg className="h-3.5 w-3.5 text-ink-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 z-50 mt-1.5 flex rounded-xl border border-ink-200 bg-white shadow-lg">
          {/* Presets */}
          <div className="w-40 border-r border-ink-100 p-2">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                onClick={() => handlePreset(p.range)}
                className="w-full rounded-lg px-3 py-2 text-left text-sm text-ink-700 hover:bg-ink-50 transition-colors"
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Calendar */}
          <div className="p-4">
            {stage === "picking-end" && (
              <p className="mb-2 text-xs text-brand-500">Chọn ngày kết thúc</p>
            )}
            <div className="flex items-start gap-6">
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <button onClick={() => navMonth(-1)} className="rounded p-1 hover:bg-ink-100">
                    <svg className="h-4 w-4 text-ink-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" d="M15 18l-6-6 6-6" />
                    </svg>
                  </button>
                  <span />
                </div>
                <Calendar
                  year={leftYear} month={leftMonth}
                  selecting={calDraft}
                  onSelect={handleDaySelect}
                  hoverDate={hover}
                  onHover={setHover}
                />
              </div>
              <div>
                <div className="mb-2 flex justify-end">
                  <button onClick={() => navMonth(1)} className="rounded p-1 hover:bg-ink-100">
                    <svg className="h-4 w-4 text-ink-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" d="M9 18l6-6-6-6" />
                    </svg>
                  </button>
                </div>
                <Calendar
                  year={viewYear} month={viewMonth}
                  selecting={calDraft}
                  onSelect={handleDaySelect}
                  hoverDate={hover}
                  onHover={setHover}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
