"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";

import { createMember, updateMember } from "@/app/(app)/members/actions";
import {
  memberFormSchema,
  memberStatuses,
  type MemberFormValues,
} from "@/app/(app)/members/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type MemberFormProps = {
  memberId?: string;
  defaultValues?: MemberFormValues;
  mode: "create" | "edit";
};

const statusLabels: Record<MemberFormValues["status"], string> = {
  active: "Active",
  expired: "Expired",
  banned: "Banned",
  inactive: "Inactive",
};

export function MemberForm({ defaultValues, memberId, mode }: MemberFormProps) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const {
    formState: { errors },
    handleSubmit,
    register,
  } = useForm<MemberFormValues>({
    resolver: zodResolver(memberFormSchema),
    defaultValues: defaultValues ?? {
      full_name: "",
      member_code: "",
      phone: "",
      status: "active",
    },
  });

  function onSubmit(values: MemberFormValues) {
    setServerError(null);
    startTransition(async () => {
      const result =
        mode === "create" ? await createMember(values) : await updateMember(memberId ?? "", values);

      if (result?.error) {
        setServerError(result.error);
      }
    });
  }

  return (
    <form className="grid gap-5" onSubmit={handleSubmit(onSubmit)}>
      {serverError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
          {serverError}
        </div>
      ) : null}

      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="full_name">Name</Label>
          <Input id="full_name" autoComplete="name" {...register("full_name")} />
          {errors.full_name ? <p className="text-sm font-bold text-red-700">{errors.full_name.message}</p> : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="phone">Phone number</Label>
          <Input id="phone" autoComplete="tel" {...register("phone")} />
          {errors.phone ? <p className="text-sm font-bold text-red-700">{errors.phone.message}</p> : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="member_code">Member ID</Label>
          <Input id="member_code" {...register("member_code")} />
          {errors.member_code ? (
            <p className="text-sm font-bold text-red-700">{errors.member_code.message}</p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="status">Status</Label>
          <select
            className="min-h-12 w-full rounded-2xl border border-ledger-line bg-white/85 px-4 text-base font-bold text-ledger-ink outline-none transition focus:border-ledger-moss focus:ring-4 focus:ring-ledger-lime/35"
            id="status"
            {...register("status")}
          >
            {memberStatuses.map((status) => (
              <option key={status} value={status}>
                {statusLabels[status]}
              </option>
            ))}
          </select>
          {errors.status ? <p className="text-sm font-bold text-red-700">{errors.status.message}</p> : null}
        </div>
      </div>

      <div className="flex flex-wrap justify-end gap-3">
        <Button disabled={isPending} onClick={() => router.back()} type="button" variant="secondary">
          Cancel
        </Button>
        <Button className="gap-2" disabled={isPending} type="submit">
          <Save aria-hidden="true" className="size-4" />
          {isPending ? "Saving..." : "Save member"}
        </Button>
      </div>
    </form>
  );
}
