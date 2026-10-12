"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  bodyClassName?: string;
  hideHeader?: boolean;
}

const SIZE: Record<string, string> = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-3xl",
};

export function Dialog({ open, onClose, title, description, children, size = "md", bodyClassName, hideHeader = false }: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Lock body scroll while open
  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-ink-900/50 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />

      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal
        aria-label={title}
        className={cn(
          "relative z-10 w-full rounded-2xl bg-white shadow-xl flex flex-col max-h-[90vh]",
          SIZE[size],
        )}
      >
        <div
          className={cn(
            "flex items-start justify-between gap-4 shrink-0",
            hideHeader ? "absolute right-5 top-5 z-20" : "border-b border-ink-100 px-6 py-4",
          )}
        >
          {!hideHeader && (
            <div>
              <h2 className="text-xl font-semibold text-ink-900">{title}</h2>
              {description && <p className="mt-0.5 text-sm text-ink-500">{description}</p>}
            </div>
          )}
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-700 transition-colors"
            aria-label="Đóng"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className={cn("min-h-0 overflow-y-auto", bodyClassName)}>{children}</div>
      </div>
    </div>
  );
}

/** Padding wrapper for dialog body content */
export function DialogBody({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("px-6 py-5", className)}>{children}</div>;
}

/** Sticky footer with action buttons */
export function DialogFooter({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-center gap-3 border-t border-ink-100 bg-ink-50/60 px-6 py-4 shrink-0 rounded-b-2xl", className)}>
      {children}
    </div>
  );
}
