"use client";

import { useEffect, useState } from "react";
import { ZoomIn, X } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Stimulus image: thumbnail, click to view at 100% ───────────────────────
// Shared by the exam page (student) and the grading page (teacher).
export function Stimulus({ src, className }: { src: string; className?: string }) {
  const [zoom, setZoom] = useState(false);

  useEffect(() => {
    if (!zoom) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setZoom(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoom]);

  return (
    <>
      <button
        data-testid="stimulus-image"
        type="button"
        onClick={() => setZoom(true)}
        className={cn("group relative block w-full overflow-hidden rounded-xl border border-ink-100", className)}
        aria-label="Phóng to hình đề bài"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="Đề bài" className="max-h-72 w-full cursor-zoom-in object-contain" />
        <span className="absolute right-2 top-2 flex items-center gap-1 rounded-md bg-ink-900/70 px-2 py-1 text-[11px] font-medium text-white opacity-0 transition group-hover:opacity-100">
          <ZoomIn className="size-3.5" /> Phóng to
        </span>
      </button>

      {zoom && (
        <div
          data-testid="stimulus-modal"
          className="fixed inset-0 z-60 flex items-start justify-center overflow-auto bg-black/80 p-4"
          onClick={() => setZoom(false)}
          role="dialog"
          aria-modal="true"
        >
          {/* The image at its true 100% size; scrollable when larger than the screen. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="Đề bài (phóng to)" className="m-auto max-w-none cursor-zoom-out" />
          <button
            data-testid="stimulus-modal-close"
            type="button"
            onClick={(e) => { e.stopPropagation(); setZoom(false); }}
            className="fixed right-4 top-4 flex size-10 items-center justify-center rounded-full bg-white/90 text-ink-900 shadow hover:bg-white"
            aria-label="Đóng"
          >
            <X className="size-5" />
          </button>
        </div>
      )}
    </>
  );
}
