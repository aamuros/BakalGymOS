import type { ReactNode } from "react";
import { ClipboardList } from "lucide-react";

import { cn } from "@/lib/utils";

type EmptyStateProps = {
  action?: ReactNode;
  body: string;
  className?: string;
  compact?: boolean;
  icon?: ReactNode;
  title: string;
};

export function EmptyState({
  action,
  body,
  className,
  compact = false,
  icon,
  title,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center rounded-lg border border-dashed border-n-border bg-white/60 px-5 text-center",
        compact ? "py-8" : "py-12",
        className,
      )}
    >
      <span className="flex size-12 items-center justify-center rounded-lg bg-n-hover text-n-muted">
        {icon ?? <ClipboardList aria-hidden="true" className="size-6" />}
      </span>
      <p className="mt-4 text-lg font-semibold text-n-ink">{title}</p>
      <p className="mt-1 max-w-md text-sm leading-6 text-n-dim">{body}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
