import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

type StatusTone = "active" | "danger" | "neutral" | "warn";

type StatusBadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone: StatusTone;
};

const toneStyles: Record<StatusTone, string> = {
  active: "border border-green-200 bg-green-50 text-green-800",
  danger: "border border-red-200 bg-red-50 text-red-800",
  neutral: "border border-n-border bg-n-hover text-n-dim",
  warn: "border border-amber-200 bg-amber-50 text-amber-800",
};

export function StatusBadge({ className, tone, ...props }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-3 text-xs font-semibold",
        toneStyles[tone],
        className,
      )}
      {...props}
    />
  );
}
