"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Banknote, HandCoins, ReceiptText, Save, WalletCards } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";

import {
  checkGcashReferenceDuplicate,
  checkUnpaidBalanceWarning,
  createWalkIn,
} from "@/app/(app)/front-desk/actions";
import { walkInSchema, type WalkInValues } from "@/app/(app)/front-desk/walk-in-schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StateMessage } from "@/components/ui/state-message";
import { cn } from "@/lib/utils";

const methodOptions = [
  {
    description: "Name optional",
    icon: Banknote,
    label: "Cash Walk-in",
    value: "cash",
  },
  {
    description: "Name optional",
    icon: WalletCards,
    label: "GCash Walk-in",
    value: "gcash",
  },
  {
    description: "Name required",
    icon: HandCoins,
    label: "Utang / Pay later",
    value: "pending",
  },
] as const;

type WalkInFormProps = {
  allowUtang?: boolean;
  defaultAmount: number;
};

export function WalkInForm({ allowUtang = true, defaultAmount }: WalkInFormProps) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [serverWarning, setServerWarning] = useState<string | null>(null);
  const [referenceWarning, setReferenceWarning] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const availableMethods = allowUtang ? methodOptions : methodOptions.filter((m) => m.value !== "pending");
  const {
    formState: { errors },
    control,
    handleSubmit,
    register,
    reset,
    setValue,
  } = useForm<WalkInValues>({
    defaultValues: {
      amount: defaultAmount,
      customer_name: "",
      gcash_reference_number: "",
      note: "",
      payment_method: "cash",
    },
    resolver: zodResolver(walkInSchema),
  });
  const selectedMethod = useWatch({ control, name: "payment_method" });
  const selectedAmount = useWatch({ control, name: "amount" });
  const gcashReference = useWatch({ control, name: "gcash_reference_number" });
  const customerName = useWatch({ control, name: "customer_name" });

  function checkDuplicateReference(referenceNumber: string | undefined) {
    const cleanReference = referenceNumber?.trim();

    if (selectedMethod !== "gcash" || !cleanReference) {
      setReferenceWarning(null);
      return;
    }

    startTransition(async () => {
      const result = await checkGcashReferenceDuplicate(cleanReference);
      setReferenceWarning(result.warning ?? null);
    });
  }

  function onSubmit(values: WalkInValues) {
    setServerError(null);
    setServerWarning(null);
    setReferenceWarning(null);
    startTransition(async () => {
      const result = await createWalkIn(values);

      if (result?.error) {
        setServerError(result.error);
        return;
      }

      if (result?.warning) {
        if (values.payment_method === "gcash") {
          setReferenceWarning(result.warning);
        } else {
          setServerWarning(result.warning);
        }
      }

      reset({
        amount: defaultAmount,
        customer_name: "",
        gcash_reference_number: "",
        note: "",
        payment_method: values.payment_method,
      });
      router.refresh();
    });
  }

  function checkExistingUtang(name: string | undefined) {
    const cleanName = name?.trim();

    if (selectedMethod !== "pending" || !cleanName) {
      setServerWarning(null);
      return;
    }

    startTransition(async () => {
      const result = await checkUnpaidBalanceWarning(cleanName);
      setServerWarning(result.warning ?? null);
    });
  }

  return (
    <form className="grid gap-5" onSubmit={handleSubmit(onSubmit)}>
      {serverError ? (
        <StateMessage tone="danger" title="Walk-in was not recorded">
          {serverError}
        </StateMessage>
      ) : null}

      {serverWarning ? (
        <StateMessage tone="warn" title="Utang warning">
          {serverWarning}
        </StateMessage>
      ) : null}

      <fieldset className="space-y-2">
        <legend className="text-sm font-bold text-n-ink">Fast actions</legend>
        <div className={cn("grid gap-3", allowUtang ? "md:grid-cols-3" : "md:grid-cols-2")}>
          {availableMethods.map((method) => {
            const Icon = method.icon;
            const checked = selectedMethod === method.value;

            return (
              <button
                className={cn(
                  "flex min-h-28 flex-col justify-between rounded-lg border p-4 text-left transition active:scale-[0.99]",
                  checked
                    ? "border-n-ink bg-n-ink text-white"
                    : "border-n-border bg-white/75 text-n-ink hover:border-n-dark",
                )}
                disabled={isPending}
                key={method.value}
                onClick={() => {
                  setValue("payment_method", method.value, { shouldValidate: true });
                  setValue("amount", Number(selectedAmount || defaultAmount), { shouldValidate: true });
                }}
                type={method.value === "gcash" && !gcashReference?.trim() ? "button" : "submit"}
              >
                <span className="flex items-center justify-between gap-3">
                  <span className="text-lg font-bold">{method.label}</span>
                  <Icon
                    aria-hidden="true"
                    className={cn("size-5", checked ? "text-white" : "text-n-muted")}
                  />
                </span>
                <span className={cn("text-sm font-bold", checked ? "text-white/75" : "text-n-dim")}>
                  {method.description} · {Number(selectedAmount || defaultAmount).toLocaleString("en-PH", {
                    currency: "PHP",
                    maximumFractionDigits: 0,
                    style: "currency",
                  })}
                </span>
              </button>
            );
          })}
        </div>
        {errors.payment_method ? (
          <p className="text-sm font-bold text-red-700">{errors.payment_method.message}</p>
        ) : null}
      </fieldset>

      <div className="grid gap-4 md:grid-cols-[1fr_14rem]">
        <div className="space-y-2">
          <Label htmlFor="walk_in_customer_name">Customer name</Label>
          <Input
            className="min-h-14 text-lg font-bold"
            id="walk_in_customer_name"
            autoComplete="name"
            placeholder={selectedMethod === "pending" ? "Required for utang" : "Optional"}
            {...register("customer_name", {
              onBlur: () => checkExistingUtang(customerName),
            })}
          />
          {errors.customer_name ? (
            <p className="text-sm font-bold text-red-700">{errors.customer_name.message}</p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="walk_in_amount">Custom amount</Label>
          <Input
            className="min-h-14 text-lg font-bold"
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

      <input type="hidden" {...register("payment_method")} />

      {selectedMethod === "gcash" ? (
        <div className="space-y-2">
          <Label htmlFor="walk_in_gcash_reference">GCash reference number</Label>
          <Input
            autoComplete="off"
            className="min-h-14 text-lg font-bold"
            id="walk_in_gcash_reference"
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
              Customer can enter after staff checks the confirmation. Owner review happens later.
            </p>
          )}
          {errors.gcash_reference_number ? (
            <p className="text-sm font-bold text-red-700">{errors.gcash_reference_number.message}</p>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-2">
        <Label className="text-n-dim" htmlFor="walk_in_note">Notes</Label>
        <textarea
          className="min-h-20 w-full rounded-lg border border-n-border bg-n-hover px-4 py-3 text-sm font-bold text-n-ink outline-none transition placeholder:text-n-dark/50 focus:border-n-focus focus:ring-4 focus:ring-n-focus/20"
          id="walk_in_note"
          placeholder={selectedMethod === "pending" ? "Required reason for utang" : "Optional note"}
          {...register("note")}
        />
        {errors.note ? <p className="text-sm font-bold text-red-700">{errors.note.message}</p> : null}
      </div>

      <div className="flex justify-end">
        <Button className="min-h-14 w-full gap-2 rounded-lg text-base sm:w-auto" disabled={isPending} type="submit">
          {selectedMethod === "pending" ? (
            <ReceiptText aria-hidden="true" className="size-4" />
          ) : (
            <Save aria-hidden="true" className="size-4" />
          )}
          {isPending ? "Recording..." : "Record custom amount"}
        </Button>
      </div>
    </form>
  );
}
