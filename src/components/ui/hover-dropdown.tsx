"use client";

import { ChevronDown } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

const CLOSE_DELAY_MS = 150;

export function HoverDropdown({
  label,
  active,
  align = "left",
  triggerClassName,
  menuClassName,
  children,
}: {
  label: ReactNode;
  active?: boolean;
  align?: "left" | "right";
  /** Replaces the default trigger styling — for a screen that carries its own palette. */
  triggerClassName?: string;
  menuClassName?: string;
  children: ReactNode | ((close: () => void) => ReactNode);
}) {
  const [open, setOpen] = useState(false);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const openedByHoverRef = useRef(false);

  const clearCloseTimeout = () => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  };

  const close = () => {
    clearCloseTimeout();
    openedByHoverRef.current = false;
    setOpen(false);
  };

  const handleMouseEnter = () => {
    clearCloseTimeout();
    setOpen((wasOpen) => {
      if (!wasOpen) openedByHoverRef.current = true;
      return true;
    });
  };

  const handleMouseLeave = () => {
    clearCloseTimeout();
    closeTimeoutRef.current = setTimeout(() => {
      openedByHoverRef.current = false;
      setOpen(false);
    }, CLOSE_DELAY_MS);
  };

  const handleTriggerClick = () => {
    if (openedByHoverRef.current) {
      openedByHoverRef.current = false;
      return;
    }
    setOpen((wasOpen) => {
      const next = !wasOpen;
      if (!next) openedByHoverRef.current = false;
      return next;
    });
  };

  useEffect(() => clearCloseTimeout, []);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) close();
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div
      ref={wrapperRef}
      className="relative inline-flex"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        type="button"
        onClick={handleTriggerClick}
        className={cn(
          "inline-flex h-9 items-center gap-1 rounded-lg border px-3 text-sm font-medium transition",
          triggerClassName ??
            (active
              ? "border-brand-300 bg-brand-50 text-brand-600"
              : "border-ink-200 bg-white text-ink-600 hover:bg-ink-50"),
        )}
      >
        {label}
        <ChevronDown className="size-3.5" />
      </button>
      {open && (
        <div
          className={cn(
            "absolute top-full z-20 mt-1 min-w-40 rounded-xl border border-ink-200 bg-white p-1 shadow-lg",
            align === "right" ? "right-0" : "left-0",
            menuClassName,
          )}
        >
          {typeof children === "function" ? children(close) : children}
        </div>
      )}
    </div>
  );
}
