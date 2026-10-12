import { cn } from "@/lib/utils";

const COLORS = ["#7F56D9", "#175CD3", "#067647", "#B54708", "#155EEF", "#0E7090", "#C11574"];

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function colorFor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return COLORS[h % COLORS.length];
}

const SIZES = { sm: "size-8 text-[11px]", md: "size-9 text-xs", lg: "size-[38px] text-[13px]" };

/** Round avatar showing initials, with a colour derived from the name. */
export function AvatarInitials({
  name,
  size = "md",
  className,
}: {
  name: string;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  return (
    <span
      className={cn("flex shrink-0 items-center justify-center rounded-full font-semibold text-white", SIZES[size], className)}
      style={{ background: colorFor(name) }}
    >
      {initials(name)}
    </span>
  );
}
