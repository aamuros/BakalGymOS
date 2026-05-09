"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Archive, Banknote, Ban, CalendarDays, HandCoins, RefreshCcw, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";

import { recordMemberPayment, recordMemberUtang, renewMember, setMemberStatus } from "@/app/(app)/members/actions";
import {
  memberPaymentSchema,
  memberRenewalSchema,
  memberUtangSchema,
  type MemberPaymentValues,
  type MemberRenewalValues,
  type MemberUtangValues,
} from "@/app/(app)/members/schema";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { StateMessage } from "@/components/ui/state-message";

type PlanOption = {
  duration_days: number;
  id: string;
  name: string;
  price: number;
};

type MemberOperationsProps = {
  canEdit: boolean;
  memberId: string;
  memberName: string;
  memberStatus: "active" | "inactive" | "banned" | "archived";
  plans: PlanOption[];
  today: string;
};

function addDays(dateValue: string, days: number) {
  const date = new Date(`${dateValue}T00:00:00+08:00`);
  date.setDate(date.getDate() + days - 1);

  return date.toISOString().slice(0, 10);
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-PH", {
    currency: "PHP",
    style: "currency",
  }).format(value);
}

export function MemberOperations({
  canEdit,
  memberId,
  memberName,
  memberStatus,
  plans,
  today,
}: MemberOperationsProps) {
  const router = useRouter();
  const [message, setMessage] = useState<{ tone: "success" | "danger" | "warn"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const renewalForm = useForm<MemberRenewalValues>({
    defaultValues: {
      gcash_reference_number: "",
      payment_method: "cash",
      plan_id: plans[0]?.id ?? "",
      start_date: today,
    },
    resolver: zodResolver(memberRenewalSchema),
  });
  const paymentForm = useForm<MemberPaymentValues>({
    defaultValues: {
      amount: 0,
      gcash_reference_number: "",
      note: "",
      payment_method: "cash",
    },
    resolver: zodResolver(memberPaymentSchema),
  });
  const utangForm = useForm<MemberUtangValues>({
    defaultValues: {
      amount: 0,
      reason: "",
    },
    resolver: zodResolver(memberUtangSchema),
  });
  const selectedPlanId = useWatch({ control: renewalForm.control, name: "plan_id" });
  const selectedStartDate = useWatch({ control: renewalForm.control, name: "start_date" });
  const renewalPaymentMethod = useWatch({ control: renewalForm.control, name: "payment_method" });
  const paymentMethod = useWatch({ control: paymentForm.control, name: "payment_method" });
  const selectedPlan = useMemo(
    () => plans.find((plan) => plan.id === selectedPlanId) ?? plans[0],
    [plans, selectedPlanId],
  );
  const calculatedEndDate = selectedPlan && selectedStartDate
    ? addDays(selectedStartDate, selectedPlan.duration_days)
    : "Choose a plan";

  function runAction(action: () => Promise<{ error?: string; warning?: string }>, success: string) {
    setMessage(null);
    startTransition(async () => {
      const result = await action();

      if (result.error) {
        setMessage({ tone: "danger", text: result.error });
        return;
      }

      setMessage({ tone: result.warning ? "warn" : "success", text: result.warning ?? success });
      router.refresh();
    });
  }

  return (
    <Card id="renew" className="space-y-5">
      <div>
        <p className="text-xs font-semibold text-n-muted">
          Member actions
        </p>
        <h3 className="mt-1 text-lg font-bold text-n-ink">
          Renew, collect, or restrict access
        </h3>
      </div>

      {message ? (
        <StateMessage tone={message.tone} title={message.tone === "danger" ? "Action failed" : "Action recorded"}>
          {message.text}
        </StateMessage>
      ) : null}

      <form
        className="rounded-lg border border-n-border bg-white/70 p-4"
        onSubmit={renewalForm.handleSubmit((values) =>
          runAction(() => renewMember(memberId, values), "Membership renewed."),
        )}
      >
        <div className="grid gap-4 lg:grid-cols-[1fr_11rem_11rem]">
          <div className="space-y-2">
            <Label htmlFor="renew_plan">Plan</Label>
            <Select id="renew_plan" className="min-h-12 font-bold" {...renewalForm.register("plan_id")}>
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name} - {formatMoney(plan.price)}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="renew_start">Start</Label>
            <Input id="renew_start" min={today} type="date" {...renewalForm.register("start_date")} />
          </div>
          <div className="space-y-2">
            <Label>End</Label>
            <div className="flex min-h-12 items-center rounded-xl border border-n-border bg-white px-4 text-sm font-bold text-n-ink">
              {calculatedEndDate}
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[12rem_1fr_auto] lg:items-end">
          <div className="space-y-2">
            <Label htmlFor="renew_payment_method">Payment</Label>
            <Select id="renew_payment_method" className="min-h-12 font-bold" {...renewalForm.register("payment_method")}>
              <option value="cash">Cash</option>
              <option value="gcash">GCash</option>
              <option value="other">Other</option>
            </Select>
          </div>
          {renewalPaymentMethod === "gcash" ? (
            <div className="space-y-2">
              <Label htmlFor="renew_gcash_reference">GCash reference</Label>
              <Input id="renew_gcash_reference" placeholder="From customer confirmation" {...renewalForm.register("gcash_reference_number")} />
            </div>
          ) : <div />}
          <Button className="min-h-12 gap-2" disabled={isPending || !plans.length} type="submit">
            <RefreshCcw aria-hidden="true" className="size-4" />
            {isPending ? "Recording..." : "Renew"}
          </Button>
        </div>
      </form>

      <div className="grid gap-4 lg:grid-cols-2">
        <form
          className="rounded-lg border border-n-border bg-white/70 p-4"
          onSubmit={paymentForm.handleSubmit((values) =>
            runAction(() => recordMemberPayment(memberId, values), "Payment recorded."),
          )}
        >
          <p className="font-bold text-n-ink">Record payment</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Input inputMode="decimal" min="0" step="0.01" type="number" {...paymentForm.register("amount", { valueAsNumber: true })} />
            <Select {...paymentForm.register("payment_method")}>
              <option value="cash">Cash</option>
              <option value="gcash">GCash</option>
              <option value="other">Other</option>
            </Select>
          </div>
          {paymentMethod === "gcash" ? (
            <Input className="mt-3" placeholder="GCash reference" {...paymentForm.register("gcash_reference_number")} />
          ) : null}
          <Input className="mt-3" placeholder="Note" {...paymentForm.register("note")} />
          <Button className="mt-3 w-full gap-2" disabled={isPending} type="submit" variant="secondary">
            <Banknote aria-hidden="true" className="size-4" />
            Record payment
          </Button>
        </form>

        <form
          className="rounded-lg border border-n-border bg-white/70 p-4"
          onSubmit={utangForm.handleSubmit((values) =>
            runAction(() => recordMemberUtang(memberId, memberName, values), "Utang recorded."),
          )}
        >
          <p className="font-bold text-n-ink">Record utang</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-[10rem_1fr]">
            <Input inputMode="decimal" min="0" step="0.01" type="number" {...utangForm.register("amount", { valueAsNumber: true })} />
            <Input placeholder="Reason" {...utangForm.register("reason")} />
          </div>
          <Button className="mt-3 w-full gap-2" disabled={isPending} type="submit" variant="secondary">
            <HandCoins aria-hidden="true" className="size-4" />
            Record utang
          </Button>
        </form>
      </div>

      {canEdit ? (
        <div className="flex flex-wrap gap-3">
          <Button
            className="gap-2"
            disabled={isPending || memberStatus === "banned"}
            onClick={() => runAction(() => setMemberStatus(memberId, "banned"), "Member banned.")}
            type="button"
            variant="secondary"
          >
            <Ban aria-hidden="true" className="size-4" />
            Ban
          </Button>
          <Button
            className="gap-2"
            disabled={isPending || memberStatus === "active"}
            onClick={() => runAction(() => setMemberStatus(memberId, "active"), "Member restored.")}
            type="button"
            variant="secondary"
          >
            <ShieldCheck aria-hidden="true" className="size-4" />
            Unban / activate
          </Button>
          <Button
            className="gap-2"
            disabled={isPending || memberStatus === "archived"}
            onClick={() => {
              if (window.confirm("Archive this member? They will be hidden from active member lists.")) {
                runAction(() => setMemberStatus(memberId, "archived"), "Member archived.");
              }
            }}
            type="button"
            variant="secondary"
          >
            <Archive aria-hidden="true" className="size-4" />
            Archive
          </Button>
          <span className="inline-flex items-center gap-2 text-sm font-bold text-n-dim">
            <CalendarDays aria-hidden="true" className="size-4" />
            Actions require an active shift for money or utang.
          </span>
        </div>
      ) : null}

      {!plans.length ? (
        <StateMessage tone="warn" title="No active plans">
          Add an active membership plan before renewing this member.
        </StateMessage>
      ) : null}

    </Card>
  );
}
