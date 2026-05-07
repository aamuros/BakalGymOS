import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

type StatusTone = "active" | "danger" | "neutral" | "warn";

type StatusBadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone: StatusTone;
};

const toneStyles: Record<StatusTone, string> = {
  active: "border-green-300 bg-green-100 text-green-900",
  danger: "border-red-300 bg-red-100 text-red-900",
  neutral: "border-slate-300 bg-slate-100 text-slate-800",
  warn: "border-amber-300 bg-amber-100 text-amber-950",
};

export function StatusBadge({ className, tone, ...props }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex min-h-9 items-center rounded-full border px-3 text-xs font-black uppercase tracking-[0.08em]",
        toneStyles[tone],
        className,
      )}
      {...props}
    />
  );
}
