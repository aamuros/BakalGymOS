"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, Banknote, HandCoins, ShieldAlert, WalletCards } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";

import { checkGcashReferenceDuplicate, handleExpiredMemberEntry } from "@/app/(app)/front-desk/actions";
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
  allowUtang?: boolean;
  defaultAmount: number;
  memberId: string;
};

const actionOptions = [
  {
    description: "Create a settled entry with a walk-in payment.",
    icon: Banknote,
    label: "Pay walk-in",
    value: "pay_walk_in",
  },
  {
    description: "Create a pending entry and balance with a required reason.",
    icon: HandCoins,
    label: "Record utang",
    value: "record_utang",
  },
  {
    description: "Create an exception entry for owner review.",
    icon: ShieldAlert,
    label: "Ask owner",
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

export function ExpiredMemberActions({ allowUtang = true, defaultAmount, memberId }: ExpiredMemberActionsProps) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [referenceWarning, setReferenceWarning] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const visibleActions = allowUtang ? actionOptions : actionOptions.filter((a) => a.value !== "record_utang");
  const {
    formState: { errors },
    control,
    handleSubmit,
    register,
    reset,
  } = useForm<ExpiredMemberActionValues>({
    defaultValues: {
      action_type: "pay_walk_in",
      amount: defaultAmount,
      gcash_reference_number: "",
      payment_method: "cash",
      reason: "",
    },
    resolver: zodResolver(expiredMemberActionSchema),
  });
  const selectedAction = useWatch({ control, name: "action_type" });
  const selectedPaymentMethod = useWatch({ control, name: "payment_method" });
  const gcashReference = useWatch({ control, name: "gcash_reference_number" });
  const needsAmount = selectedAction !== "owner_override";
  const needsPaymentMethod = selectedAction === "pay_walk_in";
  const needsGcashReference = selectedAction === "pay_walk_in" && selectedPaymentMethod === "gcash";
  const submitLabel = selectedAction === "pay_walk_in"
    ? "Record paid entry"
    : selectedAction === "record_utang"
      ? "Record utang entry"
      : "Create owner review";

  function checkDuplicateReference(referenceNumber: string | undefined) {
    const cleanReference = referenceNumber?.trim();

    if (!needsGcashReference || !cleanReference) {
      setReferenceWarning(null);
      return;
    }

    startTransition(async () => {
      const result = await checkGcashReferenceDuplicate(cleanReference);
      setReferenceWarning(result.warning ?? null);
    });
  }

  function onSubmit(values: ExpiredMemberActionValues) {
    if (
      values.action_type === "owner_override" &&
      !window.confirm("This expired member entry will be sent for owner review. Continue?")
    ) {
      return;
    }

    setServerError(null);
    setReferenceWarning(null);
    startTransition(async () => {
      const result = await handleExpiredMemberEntry(memberId, values);

      if (result.error) {
        setServerError(result.error);
        return;
      }

      if (result.warning) {
        setReferenceWarning(result.warning);
      }

      reset({
        action_type: values.action_type,
        amount: defaultAmount,
        gcash_reference_number: "",
        payment_method: values.payment_method,
        reason: "",
      });
      router.refresh();
    });
  }

  return (
    <div className="mt-5 rounded-lg border-2 border-amber-300 bg-amber-50 p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.14em] text-amber-900">
            Expired Member Handling
          </p>
          <p className="mt-1 text-base font-bold leading-7 text-amber-950">
            Expired members cannot be silently checked in. Choose a controlled entry path.
          </p>
        </div>
        <Link
          className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl bg-n-ink px-5 py-2.5 text-sm font-bold text-white transition hover:bg-n-dark"
          href={`/members/${memberId}#renew`}
        >
          Renew
        </Link>
      </div>

      <form className="mt-4 grid gap-4" onSubmit={handleSubmit(onSubmit)}>
        {serverError ? (
          <StateMessage tone="danger" title="Expired member action failed">
            {serverError}
          </StateMessage>
        ) : null}

        <fieldset className="space-y-2">
          <legend className="text-sm font-bold text-n-ink">Entry action</legend>
          <div className="grid gap-3 lg:grid-cols-3">
            {visibleActions.map((option) => {
              const Icon = option.icon;
              const checked = selectedAction === option.value;

              return (
                <label
                  className={cn(
                    "flex min-h-32 cursor-pointer flex-col justify-between rounded-lg border p-4 transition active:scale-[0.99]",
                    checked
                      ? "border-n-ink bg-n-ink text-white"
                      : "border-amber-200 bg-white/75 text-n-ink hover:border-n-dark",
                  )}
                  key={option.value}
                >
                  <input className="sr-only" type="radio" value={option.value} {...register("action_type")} />
                  <span className="flex items-center justify-between gap-3">
                    <span className="text-lg font-bold">{option.label}</span>
                    <Icon
                      aria-hidden="true"
                      className={cn("size-5", checked ? "text-white" : "text-n-muted")}
                    />
                  </span>
                  <span className={cn("text-sm font-bold", checked ? "text-white/75" : "text-n-dim")}>
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
                className="min-h-14 text-lg font-bold"
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
              <legend className="text-sm font-bold text-n-ink">Payment method</legend>
              <div className="grid gap-2 sm:grid-cols-3">
                {paymentMethods.map((method) => {
                  const Icon = method.icon;
                  const checked = selectedPaymentMethod === method.value;

                  return (
                    <label
                      className={cn(
                        "flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border px-4 py-2 text-sm font-bold transition",
                        checked
                          ? "border-n-ink bg-n-ink text-white"
                          : "border-amber-200 bg-white/75 text-n-ink hover:border-n-dark",
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

        {needsGcashReference ? (
          <div className="space-y-2">
            <Label htmlFor={`expired_member_gcash_reference_${memberId}`}>GCash reference number</Label>
            <Input
              autoComplete="off"
              className="min-h-14 text-lg font-bold"
              id={`expired_member_gcash_reference_${memberId}`}
              maxLength={80}
              placeholder="From customer confirmation"
              {...register("gcash_reference_number", {
                onBlur: () => checkDuplicateReference(gcashReference),
              })}
            />
            {referenceWarning ? (
              <p className="text-sm font-bold text-amber-800">{referenceWarning}</p>
            ) : (
              <p className="text-sm font-medium text-n-dim">
                Entry is allowed after staff checks the confirmation. Owner review happens later.
              </p>
            )}
            {errors.gcash_reference_number ? (
              <p className="text-sm font-bold text-red-700">{errors.gcash_reference_number.message}</p>
            ) : null}
          </div>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor={`expired_member_reason_${memberId}`}>
            {selectedAction === "pay_walk_in" ? "Reason / note" : "Reason"}
          </Label>
          <textarea
            className="min-h-24 w-full rounded-lg border border-amber-200 bg-white/85 px-4 py-3 text-base font-bold text-n-ink outline-none transition placeholder:text-n-dark/50 focus:border-n-focus focus:ring-4 focus:ring-n-focus/20"
            id={`expired_member_reason_${memberId}`}
            placeholder={selectedAction === "pay_walk_in" ? "Optional" : "Required"}
            {...register("reason")}
          />
          {errors.reason ? <p className="text-sm font-bold text-red-700">{errors.reason.message}</p> : null}
        </div>

        <div className="flex justify-end">
          <Button className="min-h-14 w-full gap-2 rounded-lg text-base sm:w-auto" disabled={isPending} type="submit">
            <AlertTriangle aria-hidden="true" className="size-4" />
            {isPending ? "Recording..." : submitLabel}
          </Button>
        </div>
      </form>
    </div>
  );
}
