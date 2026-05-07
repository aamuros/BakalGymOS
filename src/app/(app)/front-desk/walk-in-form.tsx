"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Banknote, ReceiptText, Save, WalletCards } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";

import { createWalkIn } from "@/app/(app)/front-desk/actions";
import { walkInSchema, type WalkInValues } from "@/app/(app)/front-desk/walk-in-schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StateMessage } from "@/components/ui/state-message";
import { cn } from "@/lib/utils";

const methodOptions = [
  {
    description: "Counts toward shift cash",
    icon: Banknote,
    label: "Cash",
    value: "cash",
  },
  {
    description: "Proof pending review",
    icon: WalletCards,
    label: "GCash",
    value: "gcash",
  },
  {
    description: "Adds to balances",
    icon: ReceiptText,
    label: "Pending / Utang",
    value: "pending",
  },
] as const;

export function WalkInForm() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const {
    formState: { errors },
    control,
    handleSubmit,
    register,
    reset,
  } = useForm<WalkInValues>({
    defaultValues: {
      amount: 0,
      customer_name: "",
      note: "",
      payment_method: "cash",
    },
    resolver: zodResolver(walkInSchema),
  });
  const selectedMethod = useWatch({ control, name: "payment_method" });

  function onSubmit(values: WalkInValues) {
    setServerError(null);
    startTransition(async () => {
      const result = await createWalkIn(values);

      if (result?.error) {
        setServerError(result.error);
        return;
      }

      reset({
        amount: 0,
        customer_name: "",
        note: "",
        payment_method: values.payment_method,
      });
      router.refresh();
    });
  }

  return (
    <form className="grid gap-5" onSubmit={handleSubmit(onSubmit)}>
      {serverError ? (
        <StateMessage tone="danger" title="Walk-in was not recorded">
          {serverError}
        </StateMessage>
      ) : null}

      <div className="grid gap-4 md:grid-cols-[1fr_14rem]">
        <div className="space-y-2">
          <Label htmlFor="walk_in_customer_name">Customer name</Label>
          <Input
            className="min-h-14 text-lg font-bold"
            id="walk_in_customer_name"
            autoComplete="name"
            placeholder="Optional, for receipts or utang"
            {...register("customer_name")}
          />
          {errors.customer_name ? (
            <p className="text-sm font-bold text-red-700">{errors.customer_name.message}</p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="walk_in_amount">Amount</Label>
          <Input
            className="min-h-14 text-lg font-black"
            id="walk_in_amount"
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
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-black text-ledger-ink">Payment method</legend>
        <div className="grid gap-3 md:grid-cols-3">
          {methodOptions.map((method) => {
            const Icon = method.icon;
            const checked = selectedMethod === method.value;

            return (
              <label
                className={cn(
                  "flex min-h-28 cursor-pointer flex-col justify-between rounded-2xl border p-4 transition active:scale-[0.99]",
                  checked
                    ? "border-ledger-ink bg-ledger-ink text-ledger-paper"
                    : "border-ledger-line bg-white/70 text-ledger-ink hover:border-ledger-moss",
                )}
                key={method.value}
              >
                <input className="sr-only" type="radio" value={method.value} {...register("payment_method")} />
                <span className="flex items-center justify-between gap-3">
                    <span className="text-lg font-black">{method.label}</span>
                  <Icon
                    aria-hidden="true"
                    className={cn("size-5", checked ? "text-ledger-lime" : "text-ledger-moss")}
                  />
                </span>
                <span className={cn("text-sm font-bold", checked ? "text-ledger-paper/75" : "text-ledger-moss")}>
                  {method.description}
                </span>
              </label>
            );
          })}
        </div>
        {errors.payment_method ? (
          <p className="text-sm font-bold text-red-700">{errors.payment_method.message}</p>
        ) : null}
      </fieldset>

      <div className="space-y-2">
        <Label htmlFor="walk_in_note">Note</Label>
        <textarea
          className="min-h-24 w-full rounded-2xl border border-ledger-line bg-white/85 px-4 py-3 text-base font-bold text-ledger-ink outline-none transition placeholder:text-ledger-moss/50 focus:border-ledger-moss focus:ring-4 focus:ring-ledger-lime/35"
          id="walk_in_note"
          placeholder="Optional"
          {...register("note")}
        />
        {errors.note ? <p className="text-sm font-bold text-red-700">{errors.note.message}</p> : null}
      </div>

      <div className="flex justify-end">
        <Button className="min-h-14 w-full gap-2 rounded-2xl text-base sm:w-auto" disabled={isPending} type="submit">
          <Save aria-hidden="true" className="size-4" />
          {isPending ? "Recording..." : "Record walk-in"}
        </Button>
      </div>
    </form>
  );
}
