"use client";

import {
  AlertTriangle,
  BadgeDollarSign,
  Ban,
  Check,
  CheckCircle2,
  Copy,
  DollarSign,
  FileQuestion,
  MessageSquareMore,
  ShieldAlert,
  UserX,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  reviewOwnerItem,
  type ReviewOwnerItemValues,
} from "@/app/(app)/owner-review/actions";
import {
  type IssueType,
  issueTypeLabels,
  type Priority,
  priorityLabels,
  priorityTone,
  type ReviewItem,
  sourceActions,
  type SourceType,
} from "@/app/(app)/owner-review/types";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/ui/status-badge";

const issueIcons: Record<IssueType, typeof AlertTriangle> = {
  cash_variance: DollarSign,
  expired_member_allowed: UserX,
  gcash_duplicate: Copy,
  gcash_follow_up: MessageSquareMore,
  gcash_missing_proof: FileQuestion,
  gcash_pending_review: BadgeDollarSign,
  gcash_rejected: AlertTriangle,
  large_utang: DollarSign,
  owner_override: ShieldAlert,
  payment_dispute: AlertTriangle,
  staff_correction: AlertTriangle,
};

const statusBadgeTone: Record<string, "active" | "danger" | "neutral" | "warn"> = {
  approved: "active",
  follow_up: "neutral",
  open: "warn",
  rejected: "danger",
  resolved: "active",
};

const priorityBorder: Record<Priority, string> = {
  high: "border-l-red-500",
  low: "border-l-n-border",
  medium: "border-l-amber-500",
};

const actionIcons = {
  acknowledge: CheckCircle2,
  approve: Check,
  follow_up: MessageSquareMore,
  reject: X,
  resolve: CheckCircle2,
  verify: Check,
} as const;

function isActionDisabled(sourceType: SourceType, action: string, status: string) {
  if (status === "resolved" || status === "approved") return true;
  if (sourceType === "exception") {
    if (action === "approve" && status === "approved") return true;
    if (action === "reject" && status === "rejected") return true;
    if (action === "resolve" && status === "resolved") return true;
  }
  if (sourceType === "gcash_proof") {
    if (action === "verify" && status === "approved") return true;
    if (action === "reject" && status === "rejected") return true;
    if (action === "follow_up" && status === "follow_up") return true;
  }
  return false;
}

const pesoFormatter = new Intl.NumberFormat("en-PH", {
  currency: "PHP",
  maximumFractionDigits: 2,
  style: "currency",
});

const dateTimeFormatter = new Intl.DateTimeFormat("en-PH", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Manila",
});

export function ReviewCard({ item }: { item: ReviewItem }) {
  const router = useRouter();
  const [note, setNote] = useState(item.note ?? "");
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const actions = sourceActions[item.sourceType];
  const IssueIcon = issueIcons[item.issueType];

  function submit(action: ReviewOwnerItemValues["action"]) {
    setServerError(null);
    startTransition(async () => {
      const result = await reviewOwnerItem({
        action,
        note,
        sourceId: item.sourceId,
        sourceType: item.sourceType as "exception" | "gcash_proof" | "shift",
      });

      if (result.error) {
        setServerError(result.error);
        return;
      }

      router.refresh();
    });
  }

  return (
    <div
      className={`rounded-lg border border-n-border border-l-4 bg-white/75 transition hover:bg-white/90 ${priorityBorder[item.priority]}`}
    >
      <div className="grid gap-4 p-5 lg:grid-cols-[1fr_auto]">
        <div className="min-w-0 space-y-3">
          {/* Issue type + priority badges */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 rounded-md bg-n-hover px-2.5 py-1">
              <IssueIcon aria-hidden="true" className="size-4 text-n-ink" />
              <span className="text-xs font-bold text-n-ink">{issueTypeLabels[item.issueType]}</span>
            </div>
            <StatusBadge tone={priorityTone[item.priority]}>
              {priorityLabels[item.priority]}
            </StatusBadge>
            <StatusBadge tone={statusBadgeTone[item.status]}>
              {item.status === "open" ? "Needs Action" : item.status.replace("_", " ")}
            </StatusBadge>
          </div>

          {/* Person + amount */}
          <div>
            <p className="text-lg font-bold text-n-ink">{item.personName}</p>
            {item.memberCode ? (
              <p className="text-sm font-semibold text-n-dim">{item.memberCode}</p>
            ) : null}
          </div>

          {item.amount !== null ? (
            <p className="text-sm font-bold text-n-ink">
              {pesoFormatter.format(item.amount)}
            </p>
          ) : null}

          {/* Reason */}
          {item.reason ? (
            <p className="text-sm font-medium leading-6 text-n-dim">{item.reason}</p>
          ) : null}

          {/* Staff + shift + date */}
          <p className="text-xs font-semibold text-n-muted">
            Staff: {item.staffName}
            {item.shiftId ? ` · Shift ${item.shiftId.slice(0, 8)}` : ""}
            {" · "}
            {dateTimeFormatter.format(new Date(item.date))}
          </p>

          {/* Related link */}
          <Link
            className="inline-flex items-center gap-1 text-xs font-bold text-n-ink underline decoration-n-dark/30 transition hover:decoration-n-ink"
            href={item.relatedPath}
          >
            View related record
          </Link>
        </div>

        {/* Actions */}
        {actions.length > 0 && item.status === "open" ? (
          <div className="space-y-3 lg:w-64">
            {serverError ? (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">
                {serverError}
              </div>
            ) : null}

            <div className="space-y-1.5">
              <Label htmlFor={`note_${item.id}`}>Owner note</Label>
              <textarea
                className="min-h-16 w-full rounded-lg border border-n-border bg-white/85 px-3 py-2 text-sm font-bold text-n-ink outline-none transition placeholder:text-n-dark/50 focus:border-n-focus focus:ring-4 focus:ring-n-focus/20"
                id={`note_${item.id}`}
                maxLength={1000}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Optional review note"
                value={note}
              />
            </div>

            <div className="flex flex-wrap gap-2">
              {actions.map((action) => {
                const Icon = actionIcons[action.value as keyof typeof actionIcons] ?? Check;
                const disabled = isPending || isActionDisabled(item.sourceType, action.value, item.status);

                return (
                  <Button
                    className="gap-1.5"
                    disabled={disabled}
                    key={action.value}
                    onClick={() => submit(action.value as ReviewOwnerItemValues["action"])}
                    type="button"
                    variant={action.variant}
                  >
                    <Icon aria-hidden="true" className="size-3.5" />
                    {action.label}
                  </Button>
                );
              })}
            </div>
          </div>
        ) : null}

        {/* Balance items: link to balances module */}
        {item.sourceType === "balance" && item.status === "open" ? (
          <div className="flex items-start">
            <Link
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-n-ink px-4 text-sm font-bold text-white transition hover:bg-n-dark"
              href="/balances"
            >
              Manage in Balances
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  );
}
