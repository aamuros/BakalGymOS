"use client";

import { ArrowRightLeft, CalendarDays, WalletCards } from "lucide-react";
import { useMemo, useState } from "react";

import { Card } from "@/components/ui/card";
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

const statusStyles: Record<BalanceStatus, string> = {
  overdue: "bg-red-100 text-red-800",
  paid: "bg-green-100 text-green-800",
  partially_paid: "bg-amber-100 text-amber-800",
  unpaid: "bg-slate-100 text-slate-700",
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
      <Card className="rounded-3xl shadow-none">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.18em] text-ledger-moss">
              Outstanding Total
            </p>
            <p className="mt-2 font-[var(--font-heading)] text-4xl font-black text-ledger-ink">
              {formatMoney(totalOutstanding)}
            </p>
          </div>
          <div className="flex size-11 items-center justify-center rounded-2xl bg-ledger-lime text-ledger-ink">
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
                    "w-full rounded-3xl border p-4 text-left transition",
                    isSelected
                      ? "border-ledger-ink bg-ledger-ink text-ledger-paper"
                      : "border-ledger-line bg-white/80 hover:border-ledger-moss",
                  )}
                  aria-pressed={isSelected}
                  key={balance.id}
                  onClick={() => setSelectedBalanceId(balance.id)}
                  type="button"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-[var(--font-heading)] text-xl font-black">
                          {balance.displayName}
                        </span>
                        {balance.memberCode ? (
                          <span
                            className={cn(
                              "rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em]",
                              isSelected ? "bg-white/15 text-ledger-lime" : "bg-ledger-paper text-ledger-moss",
                            )}
                          >
                            {balance.memberCode}
                          </span>
                        ) : null}
                      </div>
                      <p className={cn("text-sm font-bold", isSelected ? "text-ledger-paper/70" : "text-ledger-moss")}>
                        {balance.notes ?? "No notes saved."}
                      </p>
                      <p className={cn("text-xs font-black uppercase tracking-[0.18em]", isSelected ? "text-ledger-lime" : "text-ledger-moss")}>
                        Last check-in: {formatDateTime(balance.lastCheckIn)}
                      </p>
                    </div>

                    <div className="space-y-2 text-right">
                      <p className="font-[var(--font-heading)] text-2xl font-black">
                        {formatMoney(balance.remainingAmount)}
                      </p>
                      <p className={cn("text-xs font-black uppercase tracking-[0.18em]", isSelected ? "text-ledger-paper/70" : "text-ledger-moss")}>
                        {balance.daysUnpaid} day{balance.daysUnpaid === 1 ? "" : "s"} unpaid
                      </p>
                      <span
                        className={cn(
                          "inline-flex rounded-full px-3 py-1 text-xs font-black uppercase tracking-[0.16em]",
                          isSelected ? "bg-white/12 text-ledger-paper" : statusStyles[balance.status],
                        )}
                      >
                        {statusLabels[balance.status]}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })
          ) : (
            <div className="rounded-3xl border border-dashed border-ledger-line bg-white/70 px-5 py-10 text-sm font-bold text-ledger-moss">
              No balances match the current filter.
            </div>
          )}
        </div>
      </Card>

      <div className="space-y-5">
        <Card className="rounded-3xl shadow-none">
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-2xl bg-ledger-ink text-ledger-lime">
              <ArrowRightLeft aria-hidden="true" className="size-5" />
            </span>
            <div>
              <p className="text-sm font-black uppercase tracking-[0.18em] text-ledger-moss">
                Selected Balance
              </p>
              <p className="mt-1 font-[var(--font-heading)] text-2xl font-black text-ledger-ink">
                {selectedBalance?.displayName ?? "No balance selected"}
              </p>
            </div>
          </div>

          {selectedBalance ? (
            <dl className="mt-5 grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-black uppercase tracking-[0.18em] text-ledger-moss">
                  Remaining
                </dt>
                <dd className="mt-1 font-black text-ledger-ink">
                  {formatMoney(selectedBalance.remainingAmount)}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-black uppercase tracking-[0.18em] text-ledger-moss">
                  Last payment
                </dt>
                <dd className="mt-1 font-black text-ledger-ink">
                  {formatDateTime(selectedBalance.lastPaymentAt)}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-black uppercase tracking-[0.18em] text-ledger-moss">
                  Due date
                </dt>
                <dd className="mt-1 font-black text-ledger-ink">
                  {formatDateTime(selectedBalance.dueAt)}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-black uppercase tracking-[0.18em] text-ledger-moss">
                  Status
                </dt>
                <dd className="mt-1 font-black text-ledger-ink">
                  {statusLabels[selectedBalance.status]}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs font-black uppercase tracking-[0.18em] text-ledger-moss">
                  Last payment trail
                </dt>
                <dd className="mt-1 font-black text-ledger-ink">
                  {selectedBalance.latestPayment
                    ? `${formatMoney(selectedBalance.latestPayment.amount)} · ${formatDateTime(selectedBalance.latestPayment.paidAt)}${selectedBalance.lastPaymentBy ? ` · ${selectedBalance.lastPaymentBy}` : ""}`
                    : "No payment recorded yet"}
                </dd>
              </div>
            </dl>
          ) : null}
        </Card>

        <Card className="rounded-3xl shadow-none">
          <div className="flex items-center gap-3">
            <CalendarDays aria-hidden="true" className="size-5 text-ledger-moss" />
            <h3 className="font-[var(--font-heading)] text-2xl font-black text-ledger-ink">
              Record payment
            </h3>
          </div>
          <p className="mt-3 text-sm font-bold leading-6 text-ledger-moss">
            Payments are inserted server-side, linked to staff and shift when available, and logged
            to the audit trail.
          </p>
          <div className="mt-5">
            <BalancePaymentPanel key={selectedBalance?.id ?? "none"} balance={selectedBalance} />
          </div>
        </Card>
      </div>
    </div>
  );
}
