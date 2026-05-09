"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";

import { createException } from "@/app/(app)/exceptions/actions";
import {
  exceptionSchema,
  type ExceptionValues,
} from "@/app/(app)/exceptions/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type MemberOption = {
  id: string;
  label: string;
};

type EntryOption = {
  id: string;
  label: string;
};

type ExceptionFormProps = {
  entries: EntryOption[];
  members: MemberOption[];
};

const typeOptions = [
  { label: "Free Entry", value: "free_entry" },
  { label: "Guest Entry", value: "guest_entry" },
  { label: "Trial Session", value: "trial_session" },
  { label: "Utang / Pay later", value: "pending_payment" },
  { label: "GCash Pending", value: "gcash_pending" },
  { label: "Expired But Allowed", value: "expired_but_allowed" },
  { label: "Owner Allowed", value: "owner_allowed" },
  { label: "Disputed Payment", value: "disputed_payment" },
] as const;

export function ExceptionForm({ entries, members }: ExceptionFormProps) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const {
    formState: { errors },
    handleSubmit,
    register,
    reset,
  } = useForm<ExceptionValues>({
    defaultValues: {
      amount: undefined,
      exception_type: "free_entry",
      member_id: undefined,
      person_name: "",
      reason: "",
      related_entry_id: undefined,
    },
    resolver: zodResolver(exceptionSchema),
  });

  function onSubmit(values: ExceptionValues) {
    setServerError(null);
    startTransition(async () => {
      const result = await createException(values);

      if (result?.error) {
        setServerError(result.error);
        return;
      }

      reset({
        amount: undefined,
        exception_type: values.exception_type,
        member_id: undefined,
        person_name: "",
        reason: "",
        related_entry_id: undefined,
      });
      router.refresh();
    });
  }

  return (
    <form className="grid gap-5" onSubmit={handleSubmit(onSubmit)}>
      {serverError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
          {serverError}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="exception_member_id">Member involved</Label>
          <select
            className="min-h-12 w-full rounded-lg border border-n-border bg-white/85 px-4 text-base text-n-ink outline-none transition focus:border-n-focus focus:ring-4 focus:ring-n-focus/20"
            id="exception_member_id"
            {...register("member_id", {
              setValueAs: (value) => (value ? value : undefined),
            })}
          >
            <option value="">No linked member</option>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.label}
              </option>
            ))}
          </select>
          {errors.member_id ? (
            <p className="text-sm font-bold text-red-700">{errors.member_id.message}</p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="exception_person_name">Person / guest name</Label>
          <Input
            id="exception_person_name"
            placeholder="Required if no member is selected"
            {...register("person_name")}
          />
          {errors.person_name ? (
            <p className="text-sm font-bold text-red-700">{errors.person_name.message}</p>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_12rem]">
        <div className="space-y-2">
          <Label htmlFor="exception_type">Exception type</Label>
          <select
            className="min-h-12 w-full rounded-lg border border-n-border bg-white/85 px-4 text-base text-n-ink outline-none transition focus:border-n-focus focus:ring-4 focus:ring-n-focus/20"
            id="exception_type"
            {...register("exception_type")}
          >
            {typeOptions.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
          {errors.exception_type ? (
            <p className="text-sm font-bold text-red-700">{errors.exception_type.message}</p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="exception_amount">Amount</Label>
          <Input
            id="exception_amount"
            inputMode="decimal"
            min="0"
            placeholder="Optional"
            step="0.01"
            type="number"
            {...register("amount", {
              setValueAs: (value) => {
                if (value === "") {
                  return undefined;
                }

                return Number(value);
              },
            })}
          />
          {errors.amount ? (
            <p className="text-sm font-bold text-red-700">{errors.amount.message}</p>
          ) : null}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="exception_related_entry_id">Related entry</Label>
        <select
          className="min-h-12 w-full rounded-lg border border-n-border bg-white/85 px-4 text-base text-n-ink outline-none transition focus:border-n-focus focus:ring-4 focus:ring-n-focus/20"
          id="exception_related_entry_id"
          {...register("related_entry_id", {
            setValueAs: (value) => (value ? value : undefined),
          })}
        >
          <option value="">No related entry</option>
          {entries.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.label}
            </option>
          ))}
        </select>
        {errors.related_entry_id ? (
          <p className="text-sm font-bold text-red-700">{errors.related_entry_id.message}</p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="exception_reason">Reason</Label>
        <textarea
          className="min-h-28 w-full rounded-lg border border-n-border bg-white/85 px-4 py-3 text-base font-bold text-n-ink outline-none transition placeholder:text-n-dark/50 focus:border-n-focus focus:ring-4 focus:ring-n-focus/20"
          id="exception_reason"
          placeholder="What happened and why this needs owner review"
          {...register("reason")}
        />
        {errors.reason ? <p className="text-sm font-bold text-red-700">{errors.reason.message}</p> : null}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-center gap-2 text-sm font-bold text-n-dark">
          <AlertTriangle aria-hidden="true" className="size-4" />
          New exceptions default to needs review and are linked to your active shift.
        </p>
        <Button className="gap-2" disabled={isPending} type="submit">
          <Save aria-hidden="true" className="size-4" />
          {isPending ? "Creating..." : "Create exception"}
        </Button>
      </div>
    </form>
  );
}
