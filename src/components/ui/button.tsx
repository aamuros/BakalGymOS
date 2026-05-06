import type { ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
};

export function Button({
  className,
  variant = "primary",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex min-h-11 items-center justify-center rounded-full px-5 py-2.5 text-sm font-bold transition focus:outline-none focus:ring-2 focus:ring-ledger-ink focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60",
        variant === "primary" && "bg-ledger-ink text-ledger-paper hover:bg-ledger-moss",
        variant === "secondary" &&
          "border border-ledger-line bg-ledger-paper text-ledger-ink hover:bg-white",
        variant === "ghost" && "text-ledger-ink hover:bg-ledger-paper/80",
        className,
      )}
      type={type}
      {...props}
    />
  );
}
