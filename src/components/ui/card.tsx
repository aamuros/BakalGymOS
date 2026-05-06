import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <section
      className={cn(
        "rounded-[2rem] border border-ledger-line bg-ledger-paper/90 p-6 shadow-ledger backdrop-blur",
        className,
      )}
      {...props}
    />
  );
}
