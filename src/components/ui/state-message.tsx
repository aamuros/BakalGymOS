import type { HTMLAttributes, ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info } from "lucide-react";

import { cn } from "@/lib/utils";

type StateTone = "danger" | "info" | "success" | "warn";

type StateMessageProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  title?: string;
  tone: StateTone;
};

const toneStyles: Record<StateTone, string> = {
  danger: "border-red-300 bg-red-50 text-red-900",
  info: "border-sky-200 bg-sky-50 text-sky-950",
  success: "border-green-300 bg-green-50 text-green-900",
  warn: "border-amber-300 bg-amber-50 text-amber-950",
};

const icons = {
  danger: AlertTriangle,
  info: Info,
  success: CheckCircle2,
  warn: AlertTriangle,
};

export function StateMessage({ children, className, title, tone, ...props }: StateMessageProps) {
  const Icon = icons[tone];

  return (
    <div
      className={cn(
        "flex gap-3 rounded-2xl border px-4 py-3 text-sm font-bold leading-6",
        toneStyles[tone],
        className,
      )}
      {...props}
    >
      <Icon aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
      <div>
        {title ? <p className="text-base font-black leading-6">{title}</p> : null}
        <div>{children}</div>
      </div>
    </div>
  );
}
