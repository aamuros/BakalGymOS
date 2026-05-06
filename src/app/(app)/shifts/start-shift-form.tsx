"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Play } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";

import { startShift } from "@/app/(app)/shifts/actions";
import { startShiftSchema, type StartShiftValues } from "@/app/(app)/shifts/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function StartShiftForm() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const {
    formState: { errors },
    handleSubmit,
    register,
    reset,
  } = useForm<StartShiftValues>({
    defaultValues: {
      note: "",
      starting_cash: 0,
    },
    resolver: zodResolver(startShiftSchema),
  });

  function onSubmit(values: StartShiftValues) {
    setServerError(null);
    startTransition(async () => {
      const result = await startShift(values);

      if (result?.error) {
        setServerError(result.error);
        return;
      }

      reset();
      router.refresh();
    });
  }

  return (
    <form className="grid gap-4" onSubmit={handleSubmit(onSubmit)}>
      {serverError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
          {serverError}
        </div>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="starting_cash">Starting cash amount</Label>
        <Input
          id="starting_cash"
          inputMode="decimal"
          min="0"
          step="0.01"
          type="number"
          {...register("starting_cash", { valueAsNumber: true })}
        />
        {errors.starting_cash ? (
          <p className="text-sm font-bold text-red-700">{errors.starting_cash.message}</p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="note">Note</Label>
        <textarea
          className="min-h-28 w-full rounded-2xl border border-ledger-line bg-white/85 px-4 py-3 text-base font-bold text-ledger-ink outline-none transition placeholder:text-ledger-moss/50 focus:border-ledger-moss focus:ring-4 focus:ring-ledger-lime/35"
          id="note"
          placeholder="Optional opening note"
          {...register("note")}
        />
        {errors.note ? <p className="text-sm font-bold text-red-700">{errors.note.message}</p> : null}
      </div>

      <Button className="gap-2" disabled={isPending} type="submit">
        <Play aria-hidden="true" className="size-4" />
        {isPending ? "Starting..." : "Start shift"}
      </Button>
    </form>
  );
}
