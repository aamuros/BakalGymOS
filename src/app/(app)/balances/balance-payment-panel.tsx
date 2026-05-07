"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Banknote, CircleDollarSign, WalletCards } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";

import { recordBalancePayment } from "@/app/(app)/balances/actions";
import {
  balancePaymentMethods,
  balancePaymentModes,
  balancePaymentSchema,
  type BalancePaymentValues,
} from "@/app/(app)/balances/schema";
import type { BalanceViewModel } from "@/app/(app)/balances/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type BalancePaymentPanelProps = {
  balance: BalanceViewModel | null;
  onRecorded?: () => void;
};

const paymentMethodMeta = {
  cash: {
    description: "Cash settlement",
    icon: Banknote,
    label: "Cash",
  },
  gcash: {
    description: "GCash settlement",
    icon: WalletCards,
    label: "GCash",
  },
  other: {
    description: "Other settlement",
    icon: CircleDollarSign,
    label: "Other",
  },
} as const;

export function BalancePaymentPanel({ balance, onRecorded }: BalancePaymentPanelProps) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [serverMessage, setServerMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const {
    formState: { errors },
    control,
    handleSubmit,
    register,
    reset,
  } = useForm<BalancePaymentValues>({
    defaultValues: {
      amount: undefined,
      note: "",
      payment_method: "cash",
      payment_mode: "full",
    },
    resolver: zodResolver(balancePaymentSchema),
  });

  const paymentMode = useWatch({ control, name: "payment_mode" });
  const paymentMethod = useWatch({ control, name: "payment_method" });

  function onSubmit(values: BalancePaymentValues) {
    if (!balance) {
      return;
    }

    setServerError(null);
    setServerMessage(null);

    startTransition(async () => {
      const result = await recordBalancePayment(balance.id, values);

      if (result.error) {
        setServerError(result.error);
        return;
      }

      setServerMessage(
        values.payment_mode === "full"
          ? "Full payment recorded."
          : "Partial payment recorded.",
      );
      reset({
        amount: undefined,
        note: "",
        payment_method: values.payment_method,
        payment_mode: "full",
      });

      if (onRecorded) {
        onRecorded();
      }

      router.refresh();
    });
  }

  if (!balance) {
    return (
      <div className="rounded-3xl border border-dashed border-ledger-line bg-white/65 p-5 text-sm font-bold text-ledger-moss">
        Select a balance to record a payment.
      </div>
    );
  }

  if (balance.remainingAmount <= 0) {
    return (
      <div className="rounded-3xl border border-green-200 bg-green-50 px-4 py-4 text-sm font-bold text-green-800">
        This balance is fully settled. The last recorded payment remains in the audit trail.
      </div>
    );
  }

  const remainingLabel = new Intl.NumberFormat("en-PH", {
    currency: "PHP",
    style: "currency",
  }).format(balance.remainingAmount);

  return (
    <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
      {serverError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
          {serverError}
        </div>
      ) : null}

      {serverMessage ? (
        <div className="rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-bold text-green-700">
          {serverMessage}
        </div>
      ) : null}

      <fieldset className="space-y-2">
        <legend className="text-sm font-black uppercase tracking-[0.18em] text-ledger-moss">
          Payment mode
        </legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {balancePaymentModes.map((mode) => {
            const checked = paymentMode === mode;

            return (
              <label
                className={cn(
                  "flex cursor-pointer items-center justify-between rounded-2xl border px-4 py-3 text-sm font-bold transition",
                  checked
                    ? "border-ledger-ink bg-ledger-ink text-ledger-paper"
                    : "border-ledger-line bg-white/75 text-ledger-ink hover:border-ledger-moss",
                )}
                key={mode}
              >
                <input className="sr-only" type="radio" value={mode} {...register("payment_mode")} />
                <span>{mode === "full" ? "Full payment" : "Partial payment"}</span>
                <span className={cn("text-xs font-black uppercase tracking-[0.16em]", checked ? "text-ledger-lime" : "text-ledger-moss")}>
                  {mode === "full" ? remainingLabel : "Custom amount"}
                </span>
              </label>
            );
          })}
        </div>
        {errors.payment_mode ? (
          <p className="text-sm font-bold text-red-700">{errors.payment_mode.message}</p>
        ) : null}
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-black uppercase tracking-[0.18em] text-ledger-moss">
          Payment method
        </legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {balancePaymentMethods.map((method) => {
            const meta = paymentMethodMeta[method];
            const checked = paymentMethod === method;
            const Icon = meta.icon;

            return (
              <label
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-bold transition",
                  checked
                    ? "border-ledger-ink bg-ledger-ink text-ledger-paper"
                    : "border-ledger-line bg-white/75 text-ledger-ink hover:border-ledger-moss",
                )}
                key={method}
              >
                <input className="sr-only" type="radio" value={method} {...register("payment_method")} />
                <Icon aria-hidden="true" className={cn("size-4", checked ? "text-ledger-lime" : "text-ledger-moss")} />
                <span>{meta.label}</span>
              </label>
            );
          })}
        </div>
        {errors.payment_method ? (
          <p className="text-sm font-bold text-red-700">{errors.payment_method.message}</p>
        ) : null}
      </fieldset>

      {paymentMode === "partial" ? (
        <div className="space-y-2">
          <Label htmlFor={`balance_payment_amount_${balance.id}`}>Amount</Label>
          <Input
            id={`balance_payment_amount_${balance.id}`}
            inputMode="decimal"
            min="0"
            step="0.01"
            type="number"
            {...register("amount", { valueAsNumber: true })}
          />
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-ledger-moss">
            Remaining balance: {remainingLabel}
          </p>
          {errors.amount ? (
            <p className="text-sm font-bold text-red-700">{errors.amount.message}</p>
          ) : null}
        </div>
      ) : (
        <div className="rounded-2xl border border-ledger-line bg-white/75 px-4 py-3 text-sm font-bold text-ledger-moss">
          Full payment will settle the entire remaining balance of {remainingLabel}.
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor={`balance_payment_note_${balance.id}`}>Note</Label>
        <textarea
          id={`balance_payment_note_${balance.id}`}
          className="min-h-28 w-full rounded-2xl border border-ledger-line bg-white/85 px-4 py-3 text-base text-ledger-ink outline-none transition placeholder:text-ledger-moss/50 focus:border-ledger-moss focus:ring-4 focus:ring-ledger-lime/35"
          placeholder="Optional note for the payment record"
          {...register("note")}
        />
        {errors.note ? (
          <p className="text-sm font-bold text-red-700">{errors.note.message}</p>
        ) : null}
      </div>

      <Button className="w-full" disabled={isPending} type="submit">
        {isPending
          ? "Recording payment..."
          : paymentMode === "full"
            ? `Record full payment · ${remainingLabel}`
            : "Record partial payment"}
      </Button>
    </form>
  );
}
