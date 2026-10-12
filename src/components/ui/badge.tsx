import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap",
  {
    variants: {
      tone: {
        gray: "border-ink-200 bg-ink-50 text-ink-600",
        brand: "border-brand-200 bg-brand-50 text-brand-600",
        info: "border-info-200 bg-info-50 text-info-700",
        success: "border-success-200 bg-success-50 text-success-700",
        warning: "border-warning-200 bg-warning-50 text-warning-700",
        error: "border-error-200 bg-error-50 text-error-700",
        purple: "border-purple-200 bg-purple-50 text-purple-700",
      },
    },
    defaultVariants: {
      tone: "gray",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

export { Badge, badgeVariants };
