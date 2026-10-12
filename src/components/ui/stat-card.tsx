import * as React from "react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

const ICON_TONE: Record<string, string> = {
  brand: "bg-brand-50 text-brand-600",
  info: "bg-info-50 text-info-700",
  success: "bg-success-50 text-success-700",
  warning: "bg-warning-50 text-warning-700",
  purple: "bg-purple-50 text-purple-700",
};

export interface StatCardProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
  iconTone?: keyof typeof ICON_TONE;
  /** vd { value: "8,2%", direction: "up" } */
  delta?: { value: string; direction?: "up" | "down" };
  sub?: string;
}

/** Dashboard stat card — from the design at lines 552–582. */
function StatCard({
  label,
  value,
  icon,
  iconTone = "info",
  delta,
  sub,
  className,
  ...props
}: StatCardProps) {
  const up = delta?.direction !== "down";
  return (
    <Card className={cn("p-5", className)} {...props}>
      <div className="mb-3.5 flex items-start justify-between">
        <span className="text-[13px] font-medium text-ink-500">{label}</span>
        {icon ? (
          <span
            className={cn(
              "flex size-9 items-center justify-center rounded-lg [&_svg]:size-[18px]",
              ICON_TONE[iconTone],
            )}
          >
            {icon}
          </span>
        ) : null}
      </div>
      <div className="text-3xl font-bold leading-none tracking-tight text-ink-900 num">
        {value}
      </div>
      {(delta || sub) && (
        <div className="mt-2.5 flex items-center gap-2">
          {delta ? (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2 py-px text-xs font-semibold",
                up
                  ? "border-success-200 bg-success-50 text-success-700"
                  : "border-error-200 bg-error-50 text-error-700",
              )}
            >
              {up ? "▲" : "▼"} {delta.value}
            </span>
          ) : null}
          {sub ? <span className="text-xs text-ink-500">{sub}</span> : null}
        </div>
      )}
    </Card>
  );
}

export { StatCard };
