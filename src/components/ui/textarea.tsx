import type { TextareaHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "min-h-20 w-full rounded-lg border border-n-border bg-white px-4 py-3 text-sm text-n-ink outline-none transition placeholder:text-n-dim focus:border-n-focus focus:ring-2 focus:ring-n-focus/20",
        className,
      )}
      {...props}
    />
  );
}
