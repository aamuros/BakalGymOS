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
  danger: "border-red-200 bg-red-50/80 text-red-900",
  info: "border-sky-200 bg-sky-50/80 text-sky-900",
  success: "border-green-200 bg-green-50/80 text-green-900",
  warn: "border-amber-200 bg-amber-50/80 text-amber-900",
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
        "flex gap-3 rounded-xl border px-4 py-3 text-sm font-medium leading-6",
        toneStyles[tone],
        className,
      )}
      {...props}
    >
      <Icon aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
      <div>
        {title ? <p className="text-sm font-bold leading-6">{title}</p> : null}
        <div>{children}</div>
      </div>
    </div>
  );
}
