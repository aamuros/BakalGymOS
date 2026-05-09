import type { SelectHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "min-h-11 w-full rounded-lg border border-n-border bg-white px-4 text-sm text-n-ink outline-none transition focus:border-n-focus focus:ring-2 focus:ring-n-focus/20",
        className,
      )}
      {...props}
    />
  );
}
