import type { InputHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "min-h-11 w-full rounded-lg border border-n-border bg-white px-4 text-sm text-n-ink outline-none transition placeholder:text-n-dim focus:border-n-focus focus:ring-2 focus:ring-n-focus/20",
        className,
      )}
      {...props}
    />
  );
}
