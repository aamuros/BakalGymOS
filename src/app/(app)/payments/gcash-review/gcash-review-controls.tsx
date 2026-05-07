"use client";

import { AlertTriangle, Check, MessageSquareMore } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  reviewGcashProof,
  type GcashReviewValues,
} from "@/app/(app)/payments/gcash-review/actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

type GcashReviewControlsProps = {
  initialNote?: string | null;
  proofId: string;
  status: string;
};

const actions = [
  { icon: Check, label: "Confirm", value: "confirm", variant: "primary" },
  { icon: AlertTriangle, label: "Dispute", value: "dispute", variant: "secondary" },
  { icon: MessageSquareMore, label: "Follow up", value: "follow_up", variant: "ghost" },
] as const;

export function GcashReviewControls({
  initialNote,
  proofId,
  status,
}: GcashReviewControlsProps) {
  const router = useRouter();
  const [note, setNote] = useState(initialNote ?? "");
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(action: GcashReviewValues["action"]) {
    setServerError(null);
    startTransition(async () => {
      const result = await reviewGcashProof({
        action,
        note,
        proofId,
      });

      if (result.error) {
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
        <Label htmlFor={`gcash_owner_note_${proofId}`}>Owner note</Label>
        <textarea
          className="min-h-20 w-full rounded-2xl border border-ledger-line bg-white/85 px-4 py-3 text-sm font-bold text-ledger-ink outline-none transition placeholder:text-ledger-moss/50 focus:border-ledger-moss focus:ring-4 focus:ring-ledger-lime/35"
          id={`gcash_owner_note_${proofId}`}
          maxLength={1000}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Optional review note"
          value={note}
        />
        <p className="text-xs font-bold text-ledger-moss">{note.length}/1000 characters</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {actions.map((item) => {
          const Icon = item.icon;
          const disabled =
            isPending ||
            (item.value === "confirm" && status === "owner_confirmed") ||
            (item.value === "dispute" && status === "disputed") ||
            (item.value === "follow_up" && status === "needs_follow_up");

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
