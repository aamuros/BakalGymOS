"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, Banknote, HandCoins, ShieldAlert, WalletCards } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";

import { handleExpiredMemberEntry } from "@/app/(app)/front-desk/actions";
import {
  expiredMemberActionSchema,
  type ExpiredMemberActionValues,
} from "@/app/(app)/front-desk/expired-member-schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StateMessage } from "@/components/ui/state-message";
import { cn } from "@/lib/utils";

type ExpiredMemberActionsProps = {
  memberId: string;
};

const actionOptions = [
  {
    description: "Create a settled entry with a walk-in payment.",
    icon: Banknote,
    label: "Pay Walk-In",
    value: "pay_walk_in",
  },
  {
    description: "Create a pending entry and balance with a required reason.",
    icon: HandCoins,
    label: "Record Utang",
    value: "record_utang",
  },
  {
    description: "Create an exception entry for owner review.",
    icon: ShieldAlert,
    label: "Owner Override",
    value: "owner_override",
  },
] as const;

const paymentMethods = [
  {
    icon: Banknote,
    label: "Cash",
    value: "cash",
  },
  {
    icon: WalletCards,
    label: "GCash",
    value: "gcash",
  },
  {
    icon: AlertTriangle,
    label: "Other",
    value: "other",
  },
] as const;

export function ExpiredMemberActions({ memberId }: ExpiredMemberActionsProps) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const {
    formState: { errors },
    control,
    handleSubmit,
    register,
    reset,
  } = useForm<ExpiredMemberActionValues>({
    defaultValues: {
      action_type: "pay_walk_in",
      amount: 0,
      payment_method: "cash",
      reason: "",
    },
    resolver: zodResolver(expiredMemberActionSchema),
  });
  const selectedAction = useWatch({ control, name: "action_type" });
  const selectedPaymentMethod = useWatch({ control, name: "payment_method" });
  const needsAmount = selectedAction !== "owner_override";
  const needsPaymentMethod = selectedAction === "pay_walk_in";
  const submitLabel = selectedAction === "pay_walk_in"
    ? "Record paid entry"
    : selectedAction === "record_utang"
      ? "Record utang entry"
      : "Create owner review";

  function onSubmit(values: ExpiredMemberActionValues) {
    if (
      values.action_type !== "pay_walk_in" &&
      !window.confirm("This expired member entry needs a visible reason and will be sent for review. Continue?")
    ) {
      return;
    }

    setServerError(null);
    startTransition(async () => {
      const result = await handleExpiredMemberEntry(memberId, values);

      if (result.error) {
        setServerError(result.error);
        return;
      }

      reset({
        action_type: values.action_type,
        amount: 0,
        payment_method: values.payment_method,
        reason: "",
      });
      router.refresh();
    });
  }

  return (
    <div className="mt-5 rounded-3xl border-2 border-amber-300 bg-amber-50 p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-black uppercase tracking-[0.16em] text-amber-900">
            Expired Member Handling
          </p>
          <p className="mt-1 text-base font-bold leading-7 text-amber-950">
            Expired members cannot be silently checked in. Choose a controlled entry path.
          </p>
        </div>
        <Link
          className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-full bg-ledger-ink px-5 py-2.5 text-sm font-bold text-ledger-paper transition hover:bg-ledger-moss"
          href={`/members/${memberId}`}
        >
          Renew Now
        </Link>
      </div>

      <form className="mt-4 grid gap-4" onSubmit={handleSubmit(onSubmit)}>
        {serverError ? (
          <StateMessage tone="danger" title="Expired member action failed">
            {serverError}
          </StateMessage>
        ) : null}

        <fieldset className="space-y-2">
          <legend className="text-sm font-black text-ledger-ink">Entry action</legend>
          <div className="grid gap-3 lg:grid-cols-3">
            {actionOptions.map((option) => {
              const Icon = option.icon;
              const checked = selectedAction === option.value;

              return (
                <label
                  className={cn(
                    "flex min-h-32 cursor-pointer flex-col justify-between rounded-2xl border p-4 transition active:scale-[0.99]",
                    checked
                      ? "border-ledger-ink bg-ledger-ink text-ledger-paper"
                      : "border-amber-200 bg-white/75 text-ledger-ink hover:border-ledger-moss",
                  )}
                  key={option.value}
                >
                  <input className="sr-only" type="radio" value={option.value} {...register("action_type")} />
                  <span className="flex items-center justify-between gap-3">
                    <span className="text-lg font-black">{option.label}</span>
                    <Icon
                      aria-hidden="true"
                      className={cn("size-5", checked ? "text-ledger-lime" : "text-ledger-moss")}
                    />
                  </span>
                  <span className={cn("text-sm font-bold", checked ? "text-ledger-paper/75" : "text-ledger-moss")}>
                    {option.description}
                  </span>
                </label>
              );
            })}
          </div>
          {errors.action_type ? (
            <p className="text-sm font-bold text-red-700">{errors.action_type.message}</p>
          ) : null}
        </fieldset>

        <div className="grid gap-4 lg:grid-cols-[12rem_1fr]">
          {needsAmount ? (
            <div className="space-y-2">
              <Label htmlFor={`expired_member_amount_${memberId}`}>Amount</Label>
              <Input
                id={`expired_member_amount_${memberId}`}
                className="min-h-14 text-lg font-black"
                inputMode="decimal"
                min="0"
                step="0.01"
                type="number"
                {...register("amount", { valueAsNumber: true })}
              />
              {errors.amount ? (
                <p className="text-sm font-bold text-red-700">{errors.amount.message}</p>
              ) : null}
            </div>
          ) : null}

          {needsPaymentMethod ? (
            <fieldset className="space-y-2">
              <legend className="text-sm font-black text-ledger-ink">Payment method</legend>
              <div className="grid gap-2 sm:grid-cols-3">
                {paymentMethods.map((method) => {
                  const Icon = method.icon;
                  const checked = selectedPaymentMethod === method.value;

                  return (
                    <label
                      className={cn(
                        "flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-full border px-4 py-2 text-sm font-bold transition",
                        checked
                          ? "border-ledger-ink bg-ledger-ink text-ledger-paper"
                          : "border-amber-200 bg-white/75 text-ledger-ink hover:border-ledger-moss",
                      )}
                      key={method.value}
                    >
                      <input
                        className="sr-only"
                        type="radio"
                        value={method.value}
                        {...register("payment_method")}
                      />
                      <Icon aria-hidden="true" className="size-4" />
                      {method.label}
                    </label>
                  );
                })}
              </div>
              {errors.payment_method ? (
                <p className="text-sm font-bold text-red-700">{errors.payment_method.message}</p>
              ) : null}
            </fieldset>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor={`expired_member_reason_${memberId}`}>
            {selectedAction === "pay_walk_in" ? "Reason / note" : "Reason"}
          </Label>
          <textarea
            className="min-h-24 w-full rounded-2xl border border-amber-200 bg-white/85 px-4 py-3 text-base font-bold text-ledger-ink outline-none transition placeholder:text-ledger-moss/50 focus:border-ledger-moss focus:ring-4 focus:ring-ledger-lime/35"
            id={`expired_member_reason_${memberId}`}
            placeholder={selectedAction === "pay_walk_in" ? "Optional" : "Required"}
            {...register("reason")}
          />
          {errors.reason ? <p className="text-sm font-bold text-red-700">{errors.reason.message}</p> : null}
        </div>

        <div className="flex justify-end">
          <Button className="min-h-14 w-full gap-2 rounded-2xl text-base sm:w-auto" disabled={isPending} type="submit">
            <AlertTriangle aria-hidden="true" className="size-4" />
            {isPending ? "Recording..." : submitLabel}
          </Button>
        </div>
      </form>
    </div>
  );
}
