import type { ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  size?: "default" | "lg";
  variant?: "primary" | "secondary" | "ghost" | "destructive";
};

export function Button({
  className,
  size = "default",
  variant = "primary",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-lg px-5 text-sm font-semibold transition active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-n-ink focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60",
        size === "default" && "min-h-11 py-2.5",
        size === "lg" && "min-h-14 px-6 py-3 text-base",
        variant === "primary" && "bg-n-ink text-white hover:bg-n-dark",
        variant === "secondary" &&
          "border border-n-border bg-white text-n-ink hover:bg-n-hover",
        variant === "ghost" && "text-n-ink hover:bg-n-hover",
        variant === "destructive" && "bg-red-700 text-white hover:bg-red-800",
        className,
      )}
      type={type}
      {...props}
    />
  );
}
