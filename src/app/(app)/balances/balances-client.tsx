"use client";

import { ArrowRightLeft, CalendarDays, WalletCards } from "lucide-react";
import { useMemo, useState } from "react";

import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";

import { BalancePaymentPanel } from "./balance-payment-panel";
import type { BalanceStatus, BalanceViewModel } from "./types";

type BalancesClientProps = {
  balances: BalanceViewModel[];
  totalOutstanding: number;
};

const statusLabels: Record<BalanceStatus, string> = {
  overdue: "Overdue",
  paid: "Paid",
  partially_paid: "Partially paid",
  unpaid: "Unpaid",
};

const statusBadgeTone: Record<BalanceStatus, "danger" | "active" | "warn" | "neutral"> = {
  overdue: "danger",
  paid: "active",
  partially_paid: "warn",
  unpaid: "neutral",
};

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-PH", {
    currency: "PHP",
    style: "currency",
  }).format(value);
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "No record";
  }

  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  }).format(new Date(value));
}

export function BalancesClient({ balances, totalOutstanding }: BalancesClientProps) {
  const [selectedBalanceId, setSelectedBalanceId] = useState<string | null>(balances[0]?.id ?? null);
  const activeSelectedBalanceId = useMemo(() => {
    if (!balances.length) {
      return null;
    }

    const stillVisible = balances.some((balance) => balance.id === selectedBalanceId);

    return stillVisible ? selectedBalanceId : balances[0]?.id ?? null;
  }, [balances, selectedBalanceId]);

  const selectedBalance = useMemo(
    () => balances.find((balance) => balance.id === activeSelectedBalanceId) ?? null,
    [activeSelectedBalanceId, balances],
  );

  return (
    <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
      <Card>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-n-muted">
              Outstanding Total
            </p>
            <p className="mt-2 text-2xl font-bold text-n-ink">
              {formatMoney(totalOutstanding)}
            </p>
          </div>
          <div className="flex size-11 items-center justify-center rounded-lg bg-n-hover text-n-muted">
            <WalletCards aria-hidden="true" className="size-5" />
          </div>
        </div>

        <div className="mt-6 space-y-3">
          {balances.length > 0 ? (
            balances.map((balance) => {
              const isSelected = activeSelectedBalanceId === balance.id;

              return (
                <button
                  className={cn(
                    "w-full rounded-lg border p-4 text-left transition",
                    isSelected
                      ? "border-n-ink bg-n-ink text-white"
                      : "border-n-border bg-white/80 hover:border-n-muted/30",
                  )}
                  aria-pressed={isSelected}
                  key={balance.id}
                  onClick={() => setSelectedBalanceId(balance.id)}
                  type="button"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xl font-bold">
                          {balance.displayName}
                        </span>
                        {balance.memberCode ? (
                          <span
                            className={cn(
                              "rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em]",
                              isSelected ? "bg-white/15 text-white" : "bg-white text-n-muted",
                            )}
                          >
                            {balance.memberCode}
                          </span>
                        ) : null}
                      </div>
                      <p className={cn("text-sm font-medium", isSelected ? "text-white/70" : "text-n-dim")}>
                        {balance.notes ?? "No notes saved."}
                      </p>
                      <p className={cn("text-xs font-semibold", isSelected ? "text-white" : "text-n-muted")}>
                        Created: {formatDateTime(balance.createdAt)}
                      </p>
                    </div>

                    <div className="space-y-2 text-right">
                      <p className="text-2xl font-bold">
                        {formatMoney(balance.remainingAmount)}
                      </p>
                      <p className={cn("text-xs font-semibold", isSelected ? "text-white/70" : "text-n-muted")}>
                        Paid {formatMoney(balance.paidAmount)} of {formatMoney(balance.amount)}
                      </p>
                      <p className={cn("text-xs font-semibold", isSelected ? "text-white/70" : "text-n-muted")}>
                        {balance.daysUnpaid} day{balance.daysUnpaid === 1 ? "" : "s"} unpaid
                      </p>
                      <StatusBadge
                        className={cn(isSelected ? "bg-white/12 text-white border-transparent" : "")}
                        tone={statusBadgeTone[balance.status]}
                      >
                        {statusLabels[balance.status]}
                      </StatusBadge>
                    </div>
                  </div>
                </button>
              );
            })
          ) : (
            <div className="rounded-lg border border-dashed border-n-border bg-white/70 px-5 py-10 text-sm font-medium text-n-dim">
              No balances match the current filter.
            </div>
          )}
        </div>
      </Card>

      <div className="space-y-5">
        <Card>
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-lg bg-n-ink text-white">
              <ArrowRightLeft aria-hidden="true" className="size-5" />
            </span>
            <div>
              <p className="text-xs font-semibold text-n-muted">
                Selected Balance
              </p>
              <p className="mt-1 text-lg font-bold text-n-ink">
                {selectedBalance?.displayName ?? "No balance selected"}
              </p>
            </div>
          </div>

          {selectedBalance ? (
            <dl className="mt-5 grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-semibold text-n-muted">
                  Amount
                </dt>
                <dd className="mt-1 font-bold text-n-ink">
                  {formatMoney(selectedBalance.amount)}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold text-n-muted">
                  Amount paid
                </dt>
                <dd className="mt-1 font-bold text-n-ink">
                  {formatMoney(selectedBalance.paidAmount)}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold text-n-muted">
                  Remaining balance
                </dt>
                <dd className="mt-1 font-bold text-n-ink">
                  {formatMoney(selectedBalance.remainingAmount)}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold text-n-muted">
                  Date created
                </dt>
                <dd className="mt-1 font-bold text-n-ink">
                  {formatDateTime(selectedBalance.createdAt)}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold text-n-muted">
                  Due date
                </dt>
                <dd className="mt-1 font-bold text-n-ink">
                  {formatDateTime(selectedBalance.dueAt)}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold text-n-muted">
                  Staff
                </dt>
                <dd className="mt-1 font-bold text-n-ink">
                  {selectedBalance.recordedBy ?? "Unknown staff"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold text-n-muted">
                  Shift
                </dt>
                <dd className="mt-1 font-bold text-n-ink">
                  {selectedBalance.shiftLabel ?? selectedBalance.shiftId ?? "No shift linked"}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs font-semibold text-n-muted">
                  Note / reason
                </dt>
                <dd className="mt-1 font-bold text-n-ink">
                  {selectedBalance.notes ?? "No reason saved."}
                </dd>
              </div>
            </dl>
          ) : null}
        </Card>

        <Card>
          <div className="flex items-center gap-3">
            <CalendarDays aria-hidden="true" className="size-5 text-n-muted" />
            <h3 className="text-lg font-bold text-n-ink">
              Record payment
            </h3>
          </div>
          <p className="mt-3 text-sm font-medium leading-6 text-n-dim">
            Payments are inserted server-side, linked to staff and shift when available, and logged
            to the audit trail.
          </p>
          <div className="mt-5">
            <BalancePaymentPanel key={selectedBalance?.id ?? "none"} balance={selectedBalance} />
          </div>
        </Card>

        <Card>
          <h3 className="text-lg font-bold text-n-ink">
            Settlement history
          </h3>
          <div className="mt-4 space-y-3">
            {selectedBalance?.paymentHistory.length ? (
              selectedBalance.paymentHistory.map((payment) => (
                <div className="rounded-lg border border-n-border bg-white/75 px-4 py-3" key={payment.id}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-bold text-n-ink">{formatMoney(payment.amount)}</p>
                    <span className="rounded-lg bg-white px-3 py-1 text-xs font-bold uppercase text-n-muted">
                      {payment.paymentMethod}
                    </span>
                  </div>
                  <p className="mt-1 text-sm font-medium text-n-dim">
                    {formatDateTime(payment.paidAt)} · {payment.receivedBy ?? "Unknown staff"}
                    {payment.shiftId ? ` · Shift ${payment.shiftId.slice(0, 8)}` : ""}
                  </p>
                  {payment.notes ? (
                    <p className="mt-2 text-sm font-bold text-n-ink">{payment.notes}</p>
                  ) : null}
                </div>
              ))
            ) : (
              <div className="rounded-lg border border-dashed border-n-border bg-white/70 px-4 py-6 text-sm font-medium text-n-dim">
                No settlement payments recorded yet.
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
