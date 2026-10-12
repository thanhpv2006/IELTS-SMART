"use client";

import { cn } from "@/lib/utils";

// ── SearchBar ────────────────────────────────────────────────────────────────

export function SearchBar({
  value,
  onChange,
  placeholder = "Tìm kiếm...",
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      <svg
        className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-400"
        xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
      </svg>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-ink-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
      />
    </div>
  );
}

// ── Pagination ───────────────────────────────────────────────────────────────

export function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (p: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between px-1 text-sm text-ink-500">
      <span data-testid="page-indicator">Trang {page} / {totalPages}</span>
      <div className="flex gap-1">
        <button
          data-testid="page-prev"
          onClick={() => onChange(page - 1)}
          disabled={page === 1}
          className="rounded px-2.5 py-1 hover:bg-ink-100 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          ‹
        </button>
        {Array.from({ length: totalPages }, (_, i) => i + 1)
          .filter((p) => Math.abs(p - page) <= 2 || p === 1 || p === totalPages)
          .reduce<(number | "…")[]>((acc, p, i, arr) => {
            if (i > 0 && (p as number) - (arr[i - 1] as number) > 1) acc.push("…");
            acc.push(p);
            return acc;
          }, [])
          .map((p, i) =>
            p === "…" ? (
              <span key={`e${i}`} className="px-2 py-1">…</span>
            ) : (
              <button
                key={p}
                onClick={() => onChange(p as number)}
                className={cn(
                  "rounded px-2.5 py-1",
                  p === page ? "bg-brand-500 text-white font-medium" : "hover:bg-ink-100",
                )}
              >
                {p}
              </button>
            )
          )}
        <button
          data-testid="page-next"
          onClick={() => onChange(page + 1)}
          disabled={page === totalPages}
          className="rounded px-2.5 py-1 hover:bg-ink-100 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          ›
        </button>
      </div>
    </div>
  );
}

// ── usePaginatedSearch hook ───────────────────────────────────────────────────

import { useMemo, useState } from "react";

export function usePaginatedSearch<T>(
  items: T[],
  searchFn: (item: T, q: string) => boolean,
  pageSize = 20,
) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? items.filter((item) => searchFn(item, q)) : items;
  }, [items, query, searchFn]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const handleQuery = (q: string) => { setQuery(q); setPage(1); };

  return { query, setQuery: handleQuery, page: safePage, setPage, paged, filtered, totalPages };
}
