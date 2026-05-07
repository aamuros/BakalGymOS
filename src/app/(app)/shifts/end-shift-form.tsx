"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Calculator, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";

import { closeShift } from "@/app/(app)/shifts/actions";
import { closeShiftSchema, type CloseShiftValues } from "@/app/(app)/shifts/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StateMessage } from "@/components/ui/state-message";

type EndShiftFormProps = {
  cashSales: number;
  expectedCash: number;
  expenses: number;
  ownerCashPickup: number;
  shiftId: string;
  startingCash: number;
};

const pesoFormatter = new Intl.NumberFormat("en-PH", {
  currency: "PHP",
  maximumFractionDigits: 2,
  style: "currency",
});

function formatAmount(value: number) {
  return pesoFormatter.format(value);
}

export function EndShiftForm({
  cashSales,
  expectedCash,
  expenses,
  ownerCashPickup,
  shiftId,
  startingCash,
}: EndShiftFormProps) {
  const router = useRouter();
  const [actualCashValue, setActualCashValue] = useState(expectedCash);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const {
    formState: { errors },
    handleSubmit,
    register,
    reset,
  } = useForm<CloseShiftValues>({
    defaultValues: {
      actual_cash: expectedCash,
      expected_cash: expectedCash,
      note: "",
      shift_id: shiftId,
      variance_note: "",
    },
    resolver: zodResolver(closeShiftSchema),
  });
  const actualCashRegister = register("actual_cash", {
    onChange: (event) => setActualCashValue(Number(event.target.value)),
    valueAsNumber: true,
  });
  const variance = Number(((Number.isFinite(actualCashValue) ? actualCashValue : 0) - expectedCash).toFixed(2));

  function onSubmit(values: CloseShiftValues) {
    if (!window.confirm("End this shift now? Staff will not be able to record more activity on this shift.")) {
      return;
    }

    setServerError(null);
    startTransition(async () => {
      const result = await closeShift(values);

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
        <StateMessage tone="danger" title="Shift was not closed">
          {serverError}
        </StateMessage>
      ) : null}

      <input type="hidden" {...register("shift_id")} />
      <input type="hidden" {...register("expected_cash", { valueAsNumber: true })} />

      <div className="grid gap-3 rounded-2xl bg-ledger-paper/70 p-4">
        <ShiftCloseMetric label="Starting cash" value={formatAmount(startingCash)} />
        <ShiftCloseMetric label="Cash sales" value={formatAmount(cashSales)} />
        <ShiftCloseMetric label="Expenses" value={`-${formatAmount(expenses)}`} />
        <ShiftCloseMetric label="Owner cash pickup" value={`-${formatAmount(ownerCashPickup)}`} />
        <ShiftCloseMetric label="Expected cash" value={formatAmount(expectedCash)} />
      </div>

      <div className="space-y-2">
        <Label htmlFor={`actual_cash_${shiftId}`}>Actual cash counted</Label>
        <Input
          id={`actual_cash_${shiftId}`}
          className="min-h-14 text-lg font-black"
          inputMode="decimal"
          min="0"
          step="0.01"
          type="number"
          {...actualCashRegister}
        />
        {errors.actual_cash ? (
          <p className="text-sm font-bold text-red-700">{errors.actual_cash.message}</p>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-3 rounded-2xl border border-ledger-line bg-white/80 px-4 py-3">
        <span className="flex items-center gap-2 text-sm font-black text-ledger-moss">
          <Calculator aria-hidden="true" className="size-4" />
          Cash variance
        </span>
        <span className={variance === 0 ? "text-sm font-black text-ledger-ink" : "text-sm font-black text-red-700"}>
          {formatAmount(variance)}
        </span>
      </div>

      {variance !== 0 ? (
        <div className="space-y-2">
          <Label htmlFor={`variance_note_${shiftId}`}>Variance explanation</Label>
          <textarea
            className="min-h-24 w-full rounded-2xl border border-ledger-line bg-white/85 px-4 py-3 text-base font-bold text-ledger-ink outline-none transition placeholder:text-ledger-moss/50 focus:border-ledger-moss focus:ring-4 focus:ring-ledger-lime/35"
            id={`variance_note_${shiftId}`}
            placeholder="Required when actual cash does not match expected cash"
            {...register("variance_note")}
          />
          {errors.variance_note ? (
            <p className="text-sm font-bold text-red-700">{errors.variance_note.message}</p>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor={`close_note_${shiftId}`}>Closing notes</Label>
        <textarea
          className="min-h-24 w-full rounded-2xl border border-ledger-line bg-white/85 px-4 py-3 text-base font-bold text-ledger-ink outline-none transition placeholder:text-ledger-moss/50 focus:border-ledger-moss focus:ring-4 focus:ring-ledger-lime/35"
          id={`close_note_${shiftId}`}
          placeholder="Optional handoff notes"
          {...register("note")}
        />
        {errors.note ? <p className="text-sm font-bold text-red-700">{errors.note.message}</p> : null}
      </div>

      <Button className="min-h-14 w-full gap-2 rounded-2xl text-base" disabled={isPending} type="submit">
        <LogOut aria-hidden="true" className="size-4" />
        {isPending ? "Closing..." : "End shift"}
      </Button>
    </form>
  );
}

function ShiftCloseMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm font-bold text-ledger-moss">{label}</span>
      <span className="text-right text-sm font-black text-ledger-ink">{value}</span>
    </div>
  );
}
