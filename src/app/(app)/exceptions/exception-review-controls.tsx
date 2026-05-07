"use client";

import { Check, CheckCircle2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { reviewException } from "@/app/(app)/exceptions/actions";
import type { ExceptionReviewValues } from "@/app/(app)/exceptions/schema";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

type ExceptionReviewControlsProps = {
  exceptionId: string;
  initialNote?: string | null;
  status: string;
};

const actions = [
  { icon: Check, label: "Approve", value: "approve", variant: "primary" },
  { icon: X, label: "Reject", value: "reject", variant: "secondary" },
  { icon: CheckCircle2, label: "Resolved", value: "resolve", variant: "ghost" },
] as const;

export function ExceptionReviewControls({
  exceptionId,
  initialNote,
  status,
}: ExceptionReviewControlsProps) {
  const router = useRouter();
  const [ownerNote, setOwnerNote] = useState(initialNote ?? "");
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(action: ExceptionReviewValues["action"]) {
    setServerError(null);
    startTransition(async () => {
      const result = await reviewException({
        action,
        exceptionId,
        ownerNote,
      });

      if (result?.error) {
        setServerError(result.error);
        return;
      }

      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {serverError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
          {serverError}
        </div>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor={`owner_note_${exceptionId}`}>Owner note</Label>
        <textarea
          className="min-h-20 w-full rounded-2xl border border-ledger-line bg-white/85 px-4 py-3 text-sm font-bold text-ledger-ink outline-none transition placeholder:text-ledger-moss/50 focus:border-ledger-moss focus:ring-4 focus:ring-ledger-lime/35"
          id={`owner_note_${exceptionId}`}
          maxLength={500}
          onChange={(event) => setOwnerNote(event.target.value)}
          placeholder="Optional note for the review record"
          value={ownerNote}
        />
        <p className="text-xs font-bold text-ledger-moss">{ownerNote.length}/500 characters</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {actions.map((item) => {
          const Icon = item.icon;
          const disabled =
            isPending ||
            (item.value === "approve" && status === "approved") ||
            (item.value === "reject" && status === "rejected") ||
            (item.value === "resolve" && status === "resolved");

          return (
            <Button
              className="gap-2"
              disabled={disabled}
              key={item.value}
              onClick={() => submit(item.value)}
              type="button"
              variant={item.variant}
            >
              <Icon aria-hidden="true" className="size-4" />
              {item.label}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
