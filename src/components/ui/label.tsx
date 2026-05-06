import type { LabelHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn("text-sm font-bold uppercase tracking-[0.18em] text-ledger-moss", className)}
      {...props}
    />
  );
}
