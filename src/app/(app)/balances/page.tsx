import { HandCoins } from "lucide-react";
import Link from "next/link";

import { Card } from "@/components/ui/card";
import { requireModuleAccess } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

import { BalancesClient } from "./balances-client";
import type { BalanceHistory, BalanceListRow, BalanceStatus, BalanceViewModel } from "./types";

type BalancesPageProps = {
  searchParams?: Promise<{ status?: string }>;
};

const statusFilters = [
  { label: "Unpaid", value: "unpaid" },
  { label: "Partially paid", value: "partially_paid" },
  { label: "Paid", value: "paid" },
  { label: "Overdue", value: "overdue" },
] as const;

function relatedOne<T>(value: T | T[] | null) {
  return Array.isArray(value) ? value[0] : value;
}

function getDaysUnpaid(dateValue: string | null, fallback: string) {
  const base = dateValue ?? fallback;
  const diff = Date.now() - new Date(base).getTime();

  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
}

function getEffectiveStatus(balance: BalanceListRow, paidAmount: number, remainingAmount: number): BalanceStatus {
  if (remainingAmount <= 0) {
    return "paid";
  }

  if (balance.due_at && new Date(balance.due_at).getTime() < Date.now()) {
    return "overdue";
  }

  if (paidAmount > 0) {
    return "partially_paid";
  }

  return "unpaid";
}

function getDisplayName(balance: BalanceListRow) {
  const member = relatedOne(balance.members);

  return member?.full_name ?? balance.customer_name ?? "Unnamed balance";
}

function getMemberCode(balance: BalanceListRow) {
  const member = relatedOne(balance.members);

  return member?.member_code ?? null;
}

function getShiftLabel(balance: BalanceListRow) {
  const shift = relatedOne(balance.shifts);
  const staffProfile = relatedOne(shift?.staff_profiles ?? null);
  const staffProfileUser = relatedOne(staffProfile?.profiles ?? null);

  if (!shift) {
    return null;
  }

  return `${staffProfileUser?.full_name ?? "Unknown staff"}${staffProfile?.employee_code ? ` · ${staffProfile.employee_code}` : ""}`;
}

export default async function BalancesPage({ searchParams }: BalancesPageProps) {
  await requireModuleAccess("/balances");
  const params = (await searchParams) ?? {};
  const selectedFilter: BalanceStatus =
    statusFilters.some((filter) => filter.value === params.status)
      ? (params.status as BalanceStatus)
      : "unpaid";
  const supabase = await createClient();

  const [{ data: balancesData, error: balancesError }, { data: paymentsData, error: paymentsError }] =
    await Promise.all([
      supabase
        .from("walk_in_balances")
        .select(
          "id, entry_id, member_id, customer_name, amount, paid_amount, due_at, last_payment_at, shift_id, settled_at, note, created_at, members(full_name, member_code), entries(entered_at), created_by_profile:profiles!walk_in_balances_created_by_fkey(full_name), shifts!walk_in_balances_shift_id_fkey(id, opened_at, staff_profiles!shifts_staff_profile_id_fkey(employee_code, profiles!staff_profiles_profile_id_fkey(full_name)))",
        )
        .order("created_at", { ascending: false }),
      supabase
        .from("payments")
        .select(
          "id, balance_id, amount, paid_at, payment_type, notes, status, shift_id, received_by_profile:profiles!payments_received_by_fkey(full_name)",
        )
        .eq("purpose", "balance_payment")
        .eq("status", "completed")
        .order("paid_at", { ascending: false }),
    ]);

  const error = balancesError ?? paymentsError;

  if (error) {
    throw new Error(error.message);
  }

  const balances = (balancesData ?? []) as BalanceListRow[];
  const paymentHistory = new Map<string, BalanceHistory[]>();

  for (const payment of (paymentsData ?? []) as Array<{
    amount: number | string;
    balance_id: string | null;
    id: string;
    notes: string | null;
    paid_at: string | null;
    payment_type: "cash" | "gcash" | "other";
    received_by_profile: { full_name: string } | { full_name: string }[] | null;
    shift_id: string | null;
  }>) {
    if (!payment.balance_id || !payment.paid_at) {
      continue;
    }

    const historyItem = {
      amount: Number(payment.amount),
      id: payment.id,
      notes: payment.notes,
      paidAt: payment.paid_at,
      paymentMethod: payment.payment_type,
      receivedBy: relatedOne(payment.received_by_profile)?.full_name ?? null,
      shiftId: payment.shift_id,
    };

    paymentHistory.set(payment.balance_id, [...(paymentHistory.get(payment.balance_id) ?? []), historyItem]);
  }

  const balancesWithStatus: BalanceViewModel[] = balances.map((balance) => {
    const paidAmount = Number(balance.paid_amount ?? 0);
    const totalAmount = Number(balance.amount);
    const remainingAmount = Math.max(totalAmount - paidAmount, 0);
    const effectiveStatus = getEffectiveStatus(balance, paidAmount, remainingAmount);
    const entry = relatedOne(balance.entries);
    const history = paymentHistory.get(balance.id) ?? [];
    const latestPayment = history[0] ?? null;
    const recordedBy = relatedOne(balance.created_by_profile)?.full_name ?? null;

    return {
      createdAt: balance.created_at,
      daysUnpaid: getDaysUnpaid(entry?.entered_at ?? balance.created_at, balance.created_at),
      displayName: getDisplayName(balance),
      dueAt: balance.due_at,
      entryId: balance.entry_id,
      id: balance.id,
      lastCheckIn: entry?.entered_at ?? null,
      lastPaymentAt: balance.last_payment_at ?? latestPayment?.paidAt ?? null,
      lastPaymentBy: latestPayment?.receivedBy ?? null,
      lastPaymentShiftId: latestPayment?.shiftId ?? null,
      latestPayment,
      memberCode: getMemberCode(balance),
      memberId: balance.member_id,
      notes: balance.note,
      paidAmount,
      paymentHistory: history,
      recordedBy,
      remainingAmount,
      settledAt: balance.settled_at,
      shiftId: balance.shift_id,
      shiftLabel: getShiftLabel(balance),
      status: effectiveStatus,
      amount: totalAmount,
    };
  });

  const visibleBalances = balancesWithStatus.filter((balance) => balance.status === selectedFilter);
  const totalOutstanding = balancesWithStatus
    .filter((balance) => balance.status !== "paid")
    .reduce((total, balance) => total + balance.remainingAmount, 0);
  const unpaidCount = balancesWithStatus.filter((balance) => balance.status === "unpaid").length;
  const partialCount = balancesWithStatus.filter((balance) => balance.status === "partially_paid").length;
  const paidCount = balancesWithStatus.filter((balance) => balance.status === "paid").length;
  const overdueCount = balancesWithStatus.filter((balance) => balance.status === "overdue").length;

  return (
    <div className="page-enter space-y-6">
      <Card className="relative overflow-hidden">
        <div className="relative max-w-4xl">
          <div className="flex size-14 items-center justify-center rounded-lg bg-n-hover text-n-muted">
            <HandCoins aria-hidden="true" className="size-7" />
          </div>
          <p className="mt-7 text-xs font-semibold text-n-muted">
            Payments & Utang
          </p>
          <h2 className="mt-3 text-2xl font-bold leading-tight text-n-ink sm:text-3xl">
            Track unpaid balances and settle them cleanly.
          </h2>
          <p className="mt-5 max-w-3xl text-lg leading-8 text-n-dim">
            See who owes money, how long the balance has been open, and record full or partial
            settlement with staff, shift, and audit tracking.
          </p>

          <div className="mt-6 flex flex-wrap gap-2">
            {statusFilters.map((filter) => {
              const active = selectedFilter === filter.value;

              return (
                <Link
                  className={cn(
                    "inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-bold transition",
                    active
                      ? "border-n-ink bg-n-ink text-white"
                      : "border-n-border bg-white/80 text-n-ink hover:border-n-muted/30",
                  )}
                  href={`/balances?status=${filter.value}`}
                  key={filter.value}
                >
                  {filter.label}
                </Link>
              );
            })}
          </div>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <p className="text-xs font-semibold text-n-muted">Unpaid</p>
          <p className="mt-3 text-2xl font-bold text-n-ink">
            {unpaidCount.toLocaleString("en-PH")}
          </p>
          <p className="mt-4 text-sm font-medium leading-6 text-n-dim">
            Open balances with no payment recorded yet.
          </p>
        </Card>

        <Card>
          <p className="text-xs font-semibold text-n-muted">
            Partially paid
          </p>
          <p className="mt-3 text-2xl font-bold text-n-ink">
            {partialCount.toLocaleString("en-PH")}
          </p>
          <p className="mt-4 text-sm font-medium leading-6 text-n-dim">
            Balances with some settlement on record.
          </p>
        </Card>

        <Card>
          <p className="text-xs font-semibold text-n-muted">Paid</p>
          <p className="mt-3 text-2xl font-bold text-n-ink">
            {paidCount.toLocaleString("en-PH")}
          </p>
          <p className="mt-4 text-sm font-medium leading-6 text-n-dim">
            Fully settled balances stay in the ledger for audit history.
          </p>
        </Card>

        <Card>
          <p className="text-xs font-semibold text-n-muted">Overdue</p>
          <p className="mt-3 text-2xl font-bold text-n-ink">
            {overdueCount.toLocaleString("en-PH")}
          </p>
          <p className="mt-4 text-sm font-medium leading-6 text-n-dim">
            Past due balances that still need collection.
          </p>
        </Card>
      </div>

      <BalancesClient balances={visibleBalances} totalOutstanding={totalOutstanding} />
    </div>
  );
}
