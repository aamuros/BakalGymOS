import {
  AlertTriangle,
  Banknote,
  CalendarClock,
  CircleDollarSign,
  ClipboardPlus,
  LogOut,
  Plus,
  ReceiptText,
  Search,
  UserRoundCheck,
  WalletCards,
} from "lucide-react";
import Link from "next/link";

import { MemberCheckInButton } from "@/app/(app)/front-desk/member-check-in-button";
import { WalkInForm } from "@/app/(app)/front-desk/walk-in-form";
import { StartShiftForm } from "@/app/(app)/shifts/start-shift-form";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { roleLabels, type AppRole } from "@/lib/auth/permissions";
import { requireModuleAccess } from "@/lib/auth/server";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";

type FrontDeskPageProps = {
  searchParams?: Promise<{ q?: string }>;
};

type CountResult = {
  count: number | null;
  error: { message: string } | null;
};

type PaymentRow = {
  id: string;
  amount: number | string;
  payment_type: "cash" | "gcash" | "other";
  purpose: string;
  status: string;
  paid_at: string | null;
  created_at: string;
  members: RelatedMember | RelatedMember[] | null;
};

type EntryRow = {
  id: string;
  guest_name: string | null;
  settlement_type: string;
  status: string;
  entered_at: string;
  created_at: string;
  members: RelatedMember | RelatedMember[] | null;
};

type BalanceRow = {
  id: string;
  amount: number | string;
  customer_name: string | null;
  status: string;
  created_at: string;
};

type ExceptionRow = {
  id: string;
  exception_type: string;
  reason: string;
  status: string;
  created_at: string;
  members: RelatedMember | RelatedMember[] | null;
};

type ActiveShiftRow = {
  id: string;
  opened_at: string;
  opening_cash: number | string;
  notes: string | null;
};

type RelatedMember = {
  full_name: string;
  member_code: string;
};

type MemberSearchRow = {
  id: string;
  full_name: string;
  phone: string | null;
  member_code: string;
  status: "active" | "expired" | "banned" | "inactive" | "archived";
};

type MemberSubscriptionRow = {
  id: string;
  member_id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  entries_used: number;
  membership_plans: { name: string } | { name: string }[] | null;
};

type MemberPaymentRow = {
  member_id: string;
  amount: number | string;
};

type MemberEntryRow = {
  member_id: string;
  entered_at: string;
};

type MemberSearchResult = MemberSearchRow & {
  accessStatus: "active" | "expired" | "banned";
  balance: number;
  currentPlan: string;
  expiryDate: string | null;
  lastCheckIn: string | null;
};

type ActivityItem = {
  id: string;
  title: string;
  detail: string;
  at: string;
  icon: typeof UserRoundCheck;
  tone: "entry" | "payment" | "exception";
};

const pesoFormatter = new Intl.NumberFormat("en-PH", {
  currency: "PHP",
  maximumFractionDigits: 2,
  style: "currency",
});

const timeFormatter = new Intl.DateTimeFormat("en-PH", {
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Asia/Manila",
});

const dateFormatter = new Intl.DateTimeFormat("en-PH", {
  dateStyle: "full",
  timeZone: "Asia/Manila",
});

const shortDateFormatter = new Intl.DateTimeFormat("en-PH", {
  day: "2-digit",
  month: "short",
  timeZone: "Asia/Manila",
  year: "numeric",
});

const managementRoles = new Set<AppRole>(["owner", "admin", "manager"]);

function getManilaTodayRange() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Manila",
    year: "numeric",
  }).formatToParts(new Date());

  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);
  const start = new Date(Date.UTC(year, month - 1, day, -8));
  const end = new Date(start);

  end.setUTCDate(end.getUTCDate() + 1);

  return {
    endIso: end.toISOString(),
    label: dateFormatter.format(start),
    startIso: start.toISOString(),
  };
}

function getMemberName(member: RelatedMember | RelatedMember[] | null, fallback = "Walk-in guest") {
  const value = Array.isArray(member) ? member[0] : member;
  return value?.full_name ?? fallback;
}

function formatAmount(value: number | string | null | undefined) {
  return pesoFormatter.format(Number(value ?? 0));
}

function formatTime(value: string) {
  return timeFormatter.format(new Date(value));
}

function formatDate(value: string | null) {
  if (!value) {
    return "No expiry";
  }

  return shortDateFormatter.format(new Date(`${value}T00:00:00+08:00`));
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "No check-ins yet";
  }

  return `${shortDateFormatter.format(new Date(value))} · ${formatTime(value)}`;
}

function sumAmounts(payments: Array<{ amount: number | string }> | null | undefined) {
  return (payments ?? []).reduce((total, payment) => total + Number(payment.amount), 0);
}

function purposeLabel(value: string) {
  return value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function safeCount(result: CountResult, label: string) {
  if (result.error) {
    throw new Error(`${label}: ${result.error.message}`);
  }

  return result.count ?? 0;
}

function getPlanName(subscription: MemberSubscriptionRow | null) {
  const plan = subscription?.membership_plans;

  if (Array.isArray(plan)) {
    return plan[0]?.name ?? "No current plan";
  }

  return plan?.name ?? "No current plan";
}

function isCurrentSubscription(subscription: MemberSubscriptionRow | null) {
  if (!subscription) {
    return false;
  }

  const today = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Manila",
    year: "numeric",
  }).format(new Date());

  return subscription.status === "active" && subscription.starts_at <= today && subscription.ends_at >= today;
}

function latestByMember<T extends { member_id: string }>(
  rows: T[],
  getTime: (row: T) => number,
) {
  return rows.reduce<Record<string, T>>((lookup, row) => {
    const existing = lookup[row.member_id];

    if (!existing || getTime(row) > getTime(existing)) {
      lookup[row.member_id] = row;
    }

    return lookup;
  }, {});
}

export default async function FrontDeskPage({ searchParams }: FrontDeskPageProps) {
  const profile = await requireModuleAccess("/front-desk");
  const supabase = await createClient();
  const today = getManilaTodayRange();
  const isManagement = managementRoles.has(profile.role);
  const params = await searchParams;
  const memberQuery = (params?.q ?? "").trim();

  const [
    entriesTodayResult,
    cashPaymentsResult,
    gcashPaymentsResult,
    pendingBalancesResult,
    pendingExceptionsResult,
    pendingCorrectionsResult,
    pendingProofsResult,
    activeShiftResult,
    recentEntriesResult,
    recentPaymentsResult,
    recentBalancesResult,
    recentExceptionsResult,
  ] = await Promise.all([
    supabase
      .from("entries")
      .select("id", { count: "exact", head: true })
      .neq("status", "voided")
      .gte("entered_at", today.startIso)
      .lt("entered_at", today.endIso),
    supabase
      .from("payments")
      .select("id, amount, payment_type, purpose, status, paid_at, created_at, members(full_name, member_code)")
      .eq("status", "completed")
      .eq("payment_type", "cash")
      .gte("paid_at", today.startIso)
      .lt("paid_at", today.endIso),
    supabase
      .from("payments")
      .select("id, amount, payment_type, purpose, status, paid_at, created_at, members(full_name, member_code)")
      .eq("status", "completed")
      .eq("payment_type", "gcash")
      .gte("paid_at", today.startIso)
      .lt("paid_at", today.endIso),
    supabase
      .from("walk_in_balances")
      .select("id, amount, customer_name, status, created_at")
      .eq("status", "pending")
      .gte("created_at", today.startIso)
      .lt("created_at", today.endIso),
    supabase
      .from("exceptions")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending")
      .gte("created_at", today.startIso)
      .lt("created_at", today.endIso),
    supabase
      .from("payment_corrections")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending")
      .gte("created_at", today.startIso)
      .lt("created_at", today.endIso),
    supabase
      .from("gcash_proofs")
      .select("id", { count: "exact", head: true })
      .in("proof_status", ["pending_proof", "pending_review"])
      .gte("created_at", today.startIso)
      .lt("created_at", today.endIso),
    supabase
      .from("shifts")
      .select("id, opened_at, opening_cash, notes")
      .eq("opened_by", profile.id)
      .eq("status", "open")
      .is("closed_at", null)
      .order("opened_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("entries")
      .select("id, guest_name, settlement_type, status, entered_at, created_at, members(full_name, member_code)")
      .gte("entered_at", today.startIso)
      .lt("entered_at", today.endIso)
      .order("entered_at", { ascending: false })
      .limit(8),
    supabase
      .from("payments")
      .select("id, amount, payment_type, purpose, status, paid_at, created_at, members(full_name, member_code)")
      .gte("created_at", today.startIso)
      .lt("created_at", today.endIso)
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("walk_in_balances")
      .select("id, amount, customer_name, status, created_at")
      .gte("created_at", today.startIso)
      .lt("created_at", today.endIso)
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("exceptions")
      .select("id, exception_type, reason, status, created_at, members(full_name, member_code)")
      .gte("created_at", today.startIso)
      .lt("created_at", today.endIso)
      .order("created_at", { ascending: false })
      .limit(8),
  ]);

  const queryError =
    cashPaymentsResult.error ??
    gcashPaymentsResult.error ??
    pendingBalancesResult.error ??
    activeShiftResult.error ??
    recentEntriesResult.error ??
    recentPaymentsResult.error ??
    recentBalancesResult.error ??
    recentExceptionsResult.error;

  if (queryError) {
    throw new Error(queryError.message);
  }

  const entriesToday = safeCount(entriesTodayResult, "Entries today");
  const pendingExceptions = safeCount(pendingExceptionsResult, "Pending exceptions");
  const pendingCorrections = safeCount(pendingCorrectionsResult, "Pending corrections");
  const pendingProofs = safeCount(pendingProofsResult, "Pending GCash proofs");
  const cashPayments = (cashPaymentsResult.data ?? []) as PaymentRow[];
  const gcashPayments = (gcashPaymentsResult.data ?? []) as PaymentRow[];
  const pendingBalances = (pendingBalancesResult.data ?? []) as BalanceRow[];
  const needsReview = pendingExceptions + pendingCorrections + pendingProofs;
  const activeShift = activeShiftResult.data as ActiveShiftRow | null;
  const hasActiveShift = Boolean(activeShift);
  let memberResults: MemberSearchResult[] = [];
  let memberSearchError: string | null = null;

  if (memberQuery) {
    const safeMemberQuery = memberQuery.replace(/[^a-zA-Z0-9\s@.+-]/g, " ").trim();

    if (safeMemberQuery) {
      const { data: members, error: membersError } = await supabase
        .from("members")
        .select("id, full_name, phone, member_code, status")
        .or(
          `full_name.ilike.%${safeMemberQuery}%,phone.ilike.%${safeMemberQuery}%,member_code.ilike.%${safeMemberQuery}%`,
        )
        .order("full_name", { ascending: true })
        .limit(6);

      if (membersError) {
        memberSearchError = membersError.message;
      } else {
        const memberRows = (members ?? []) as MemberSearchRow[];
        const memberIds = memberRows.map((member) => member.id);

        if (memberIds.length) {
          const [subscriptionsResult, paymentsResult, entriesResult] = await Promise.all([
            supabase
              .from("member_subscriptions")
              .select("id, member_id, starts_at, ends_at, status, entries_used, membership_plans(name)")
              .in("member_id", memberIds)
              .order("ends_at", { ascending: false }),
            supabase
              .from("payments")
              .select("member_id, amount")
              .in("member_id", memberIds)
              .eq("status", "pending"),
            supabase
              .from("entries")
              .select("member_id, entered_at")
              .in("member_id", memberIds)
              .neq("status", "voided")
              .order("entered_at", { ascending: false }),
          ]);

          const relatedError = subscriptionsResult.error ?? paymentsResult.error ?? entriesResult.error;

          if (relatedError) {
            memberSearchError = relatedError.message;
          } else {
            const subscriptions = (subscriptionsResult.data ?? []) as MemberSubscriptionRow[];
            const payments = (paymentsResult.data ?? []) as MemberPaymentRow[];
            const entries = (entriesResult.data ?? []) as MemberEntryRow[];
            const latestSubscriptionByMember = latestByMember(subscriptions, (row) =>
              new Date(`${row.ends_at}T00:00:00+08:00`).getTime(),
            );
            const latestEntryByMember = latestByMember(entries, (row) =>
              new Date(row.entered_at).getTime(),
            );
            const balanceByMember = payments.reduce<Record<string, number>>((lookup, payment) => {
              lookup[payment.member_id] = (lookup[payment.member_id] ?? 0) + Number(payment.amount ?? 0);
              return lookup;
            }, {});

            memberResults = memberRows.map((member) => {
              const latestSubscription = latestSubscriptionByMember[member.id] ?? null;
              const isBanned = member.status === "banned";
              const isActive = !isBanned && member.status === "active" && isCurrentSubscription(latestSubscription);

              return {
                ...member,
                accessStatus: isBanned ? "banned" : isActive ? "active" : "expired",
                balance: balanceByMember[member.id] ?? 0,
                currentPlan: getPlanName(latestSubscription),
                expiryDate: latestSubscription?.ends_at ?? null,
                lastCheckIn: latestEntryByMember[member.id]?.entered_at ?? null,
              };
            });
          }
        }
      }
    }
  }

  const activity: ActivityItem[] = [
    ...((recentEntriesResult.data ?? []) as EntryRow[]).map((entry) => ({
      at: entry.entered_at,
      detail: `${entry.settlement_type} entry - ${entry.status}`,
      icon: UserRoundCheck,
      id: `entry-${entry.id}`,
      title: getMemberName(entry.members, entry.guest_name ?? "Walk-in guest"),
      tone: "entry" as const,
    })),
    ...((recentPaymentsResult.data ?? []) as PaymentRow[]).map((payment) => ({
      at: payment.created_at,
      detail: `${formatAmount(payment.amount)} ${payment.payment_type.toUpperCase()} - ${purposeLabel(payment.purpose)}`,
      icon: ReceiptText,
      id: `payment-${payment.id}`,
      title: getMemberName(payment.members, "Unassigned payment"),
      tone: "payment" as const,
    })),
    ...((recentBalancesResult.data ?? []) as BalanceRow[]).map((balance) => ({
      at: balance.created_at,
      detail: `${formatAmount(balance.amount)} pending balance - ${balance.status}`,
      icon: CircleDollarSign,
      id: `balance-${balance.id}`,
      title: balance.customer_name ?? "Walk-in guest",
      tone: "exception" as const,
    })),
    ...((recentExceptionsResult.data ?? []) as ExceptionRow[]).map((exception) => ({
      at: exception.created_at,
      detail: `${purposeLabel(exception.exception_type)} - ${exception.status}`,
      icon: AlertTriangle,
      id: `exception-${exception.id}`,
      title: getMemberName(exception.members, "Guest exception"),
      tone: "exception" as const,
    })),
  ]
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 10);

  const stats = [
    {
      icon: UserRoundCheck,
      label: "Entries today",
      value: entriesToday.toLocaleString("en-PH"),
    },
    {
      icon: Banknote,
      label: "Cash collected",
      value: formatAmount(sumAmounts(cashPayments)),
    },
    {
      icon: WalletCards,
      label: "GCash collected",
      value: formatAmount(sumAmounts(gcashPayments)),
    },
    {
      icon: CircleDollarSign,
      label: "Pending / Utang",
      value: formatAmount(sumAmounts(pendingBalances)),
    },
    {
      icon: AlertTriangle,
      label: "Needs review",
      value: needsReview.toLocaleString("en-PH"),
    },
  ];

  const actions = [
    {
      description: "Register a same-day guest entry",
      href: "#walk-in",
      icon: Plus,
      label: "+ Walk-In",
    },
    {
      description: "Find a member and record entry",
      href: "#member-check-in",
      icon: UserRoundCheck,
      label: "Member Check-In",
    },
    {
      description: "Log cash, GCash, or utang",
      href: "/payments",
      icon: ReceiptText,
      label: "Record Payment",
    },
    {
      description: "Flag owner approval or unusual cases",
      href: "/exceptions",
      icon: ClipboardPlus,
      label: "Add Exception",
    },
  ];

  return (
    <div className="ledger-rise space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-black uppercase tracking-[0.24em] text-ledger-moss">
            Front Desk Portal
          </p>
          <h2 className="mt-2 font-[var(--font-heading)] text-4xl font-black text-ledger-ink">
            Current Shift Dashboard
          </h2>
          <p className="mt-2 text-sm font-bold text-ledger-moss">
            {today.label} · {roleLabels[profile.role]} view
            {isManagement ? " · broader operational access" : " · assigned RLS access"}
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {actions.map((action) => {
          const Icon = action.icon;

          if (!hasActiveShift) {
            return (
              <div
                className="flex min-h-28 flex-col justify-between rounded-2xl border border-dashed border-ledger-line bg-ledger-paper/70 p-4 text-ledger-moss"
                key={action.label}
              >
                <span className="flex items-center justify-between gap-3">
                  <span className="text-base font-black">{action.label}</span>
                  <Icon aria-hidden="true" className="size-5 shrink-0" />
                </span>
                <span className="text-sm font-bold leading-5">
                  Start a shift before recording front desk activity.
                </span>
              </div>
            );
          }

          return (
            <a
              className="group flex min-h-28 flex-col justify-between rounded-2xl border border-ledger-line bg-ledger-ink p-4 text-ledger-paper shadow-ledger transition hover:-translate-y-0.5 hover:bg-ledger-moss"
              href={action.href}
              key={action.label}
            >
              <span className="flex items-center justify-between gap-3">
                <span className="text-base font-black">{action.label}</span>
                <Icon aria-hidden="true" className="size-5 shrink-0 text-ledger-lime" />
              </span>
              <span className="text-sm font-bold leading-5 text-ledger-paper/70">
                {action.description}
              </span>
            </a>
          );
        })}
        <button
          className="flex min-h-28 cursor-not-allowed flex-col justify-between rounded-2xl border border-dashed border-ledger-line bg-ledger-paper/70 p-4 text-left text-ledger-moss"
          disabled
          type="button"
        >
          <span className="flex items-center justify-between gap-3">
            <span className="text-base font-black">End Shift</span>
            <LogOut aria-hidden="true" className="size-5 shrink-0" />
          </span>
          <span className="text-sm font-bold leading-5">Shift close is intentionally not part of this MVP.</span>
        </button>
      </div>

      <Card className="rounded-3xl shadow-none">
        {activeShift ? (
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.18em] text-ledger-moss">
                Active Shift
              </p>
              <h3 className="mt-2 font-[var(--font-heading)] text-3xl font-black text-ledger-ink">
                Started {formatTime(activeShift.opened_at)}
              </h3>
              <p className="mt-2 text-sm font-bold text-ledger-moss">
                Opening cash {formatAmount(activeShift.opening_cash)}
                {activeShift.notes ? ` · ${activeShift.notes}` : ""}
              </p>
            </div>
            {isManagement ? (
              <Link
                className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-ledger-ink px-5 text-sm font-black text-ledger-paper transition hover:bg-ledger-moss"
                href="/shifts"
              >
                View shifts
              </Link>
            ) : null}
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[1fr_24rem] lg:items-start">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.18em] text-ledger-moss">
                No Active Shift
              </p>
              <h3 className="mt-2 font-[var(--font-heading)] text-3xl font-black text-ledger-ink">
                Start a shift to unlock front desk actions
              </h3>
              <p className="mt-2 text-sm font-bold leading-6 text-ledger-moss">
                Entries and payments are recorded against the active shift opened by this staff account.
              </p>
            </div>
            <StartShiftForm />
          </div>
        )}
      </Card>

      {activeShift ? (
        <Card className="rounded-3xl shadow-none" id="member-check-in">
          <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.18em] text-ledger-moss">
                Member Check-In
              </p>
              <h3 className="mt-2 font-[var(--font-heading)] text-3xl font-black text-ledger-ink">
                Search member records
              </h3>
            </div>
            <p className="text-sm font-bold text-ledger-moss">
              Search by name, phone number, or member ID
            </p>
          </div>

          <form action="/front-desk#member-check-in" className="relative">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-ledger-moss"
            />
            <Input
              className="pl-12"
              defaultValue={memberQuery}
              name="q"
              placeholder="Name, phone, or member ID"
              type="search"
            />
          </form>

          {memberSearchError ? (
            <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
              {memberSearchError}
            </div>
          ) : null}

          <div className="mt-5 space-y-4">
            {memberQuery && !memberSearchError && !memberResults.length ? (
              <div className="rounded-2xl border border-dashed border-ledger-line bg-white/60 px-4 py-8 text-center">
                <p className="font-black text-ledger-ink">No matching member</p>
                <p className="mt-1 text-sm font-bold text-ledger-moss">
                  Try a different name, phone number, or member ID.
                </p>
              </div>
            ) : null}

            {memberResults.map((member) => (
              <div
                className="rounded-2xl border border-ledger-line bg-white/70 p-4"
                key={member.id}
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="break-words font-[var(--font-heading)] text-2xl font-black text-ledger-ink">
                        {member.full_name}
                      </h4>
                      <span
                        className={cn(
                          "inline-flex h-8 items-center rounded-full px-3 text-xs font-black uppercase",
                          member.accessStatus === "active" && "bg-green-100 text-green-800",
                          member.accessStatus === "expired" && "bg-amber-100 text-amber-800",
                          member.accessStatus === "banned" && "bg-red-100 text-red-800",
                        )}
                      >
                        {member.accessStatus}
                      </span>
                    </div>
                    <p className="mt-1 text-sm font-bold text-ledger-moss">
                      {member.member_code} · {member.phone || "No phone"}
                    </p>
                  </div>

                  {member.accessStatus === "active" ? (
                    <MemberCheckInButton memberId={member.id} />
                  ) : null}
                </div>

                <dl className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                  <MemberFact label="Current plan" value={member.currentPlan} />
                  <MemberFact label="Expiry date" value={formatDate(member.expiryDate)} />
                  <MemberFact label="Balance" value={formatAmount(member.balance)} />
                  <MemberFact label="Last check-in" value={formatDateTime(member.lastCheckIn)} />
                  <MemberFact label="Member status" value={member.status} />
                </dl>

                {member.accessStatus === "expired" ? (
                  <div className="mt-5 flex flex-wrap gap-2">
                    <Link
                      className="inline-flex min-h-11 items-center justify-center rounded-full bg-ledger-ink px-5 py-2.5 text-sm font-bold text-ledger-paper transition hover:bg-ledger-moss"
                      href={`/members/${member.id}`}
                    >
                      Renew Now
                    </Link>
                    <a
                      className="inline-flex min-h-11 items-center justify-center rounded-full border border-ledger-line bg-ledger-paper px-5 py-2.5 text-sm font-bold text-ledger-ink transition hover:bg-white"
                      href="#walk-in"
                    >
                      Pay Walk-In
                    </a>
                    <a
                      className="inline-flex min-h-11 items-center justify-center rounded-full border border-ledger-line bg-ledger-paper px-5 py-2.5 text-sm font-bold text-ledger-ink transition hover:bg-white"
                      href="#walk-in"
                    >
                      Record Utang
                    </a>
                    <Link
                      className="inline-flex min-h-11 items-center justify-center rounded-full border border-amber-300 bg-amber-50 px-5 py-2.5 text-sm font-bold text-amber-900 transition hover:bg-amber-100"
                      href="/exceptions"
                    >
                      Owner Override
                    </Link>
                  </div>
                ) : null}

                {member.accessStatus === "banned" ? (
                  <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold leading-6 text-red-800">
                    This member is banned. Check-in is blocked and must not be overridden at the front desk.
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {activeShift ? (
        <Card className="rounded-3xl shadow-none" id="walk-in">
          <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.18em] text-ledger-moss">
                Walk-In
              </p>
              <h3 className="mt-2 font-[var(--font-heading)] text-3xl font-black text-ledger-ink">
                Quick entry log
              </h3>
            </div>
            <p className="text-sm font-bold text-ledger-moss">
              Linked to the active shift started {formatTime(activeShift.opened_at)}
            </p>
          </div>
          <WalkInForm />
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {stats.map((stat) => {
          const Icon = stat.icon;

          return (
            <Card className="rounded-2xl p-5 shadow-none" key={stat.label}>
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-black uppercase tracking-[0.14em] text-ledger-moss">
                  {stat.label}
                </p>
                <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-ledger-lime text-ledger-ink">
                  <Icon aria-hidden="true" className="size-5" />
                </span>
              </div>
              <p className="mt-5 break-words font-[var(--font-heading)] text-3xl font-black text-ledger-ink">
                {stat.value}
              </p>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <Card className="rounded-3xl p-0 shadow-none">
          <div className="flex items-center justify-between gap-4 border-b border-ledger-line px-5 py-4">
            <div>
              <h3 className="font-[var(--font-heading)] text-2xl font-black text-ledger-ink">
                Recent Activity
              </h3>
              <p className="mt-1 text-sm font-bold text-ledger-moss">
                Entries, payments, and exceptions visible to this account.
              </p>
            </div>
            <CalendarClock aria-hidden="true" className="hidden size-6 text-ledger-moss sm:block" />
          </div>

          {activity.length ? (
            <div className="divide-y divide-ledger-line">
              {activity.map((item) => {
                const Icon = item.icon;

                return (
                  <div className="flex gap-4 px-5 py-4" key={item.id}>
                    <span
                      className={cn(
                        "flex size-11 shrink-0 items-center justify-center rounded-2xl",
                        item.tone === "entry" && "bg-green-100 text-green-800",
                        item.tone === "payment" && "bg-ledger-lime text-ledger-ink",
                        item.tone === "exception" && "bg-amber-100 text-amber-800",
                      )}
                    >
                      <Icon aria-hidden="true" className="size-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
                        <p className="truncate font-black text-ledger-ink">{item.title}</p>
                        <p className="shrink-0 text-xs font-black uppercase tracking-[0.14em] text-ledger-moss">
                          {formatTime(item.at)}
                        </p>
                      </div>
                      <p className="mt-1 text-sm font-bold capitalize text-ledger-moss">{item.detail}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="px-5 py-14 text-center">
              <UserRoundCheck aria-hidden="true" className="mx-auto size-10 text-ledger-moss" />
              <p className="mt-4 font-black text-ledger-ink">No activity yet today</p>
              <p className="mt-1 text-sm font-bold text-ledger-moss">
                New check-ins, payments, and exceptions will appear here.
              </p>
            </div>
          )}
        </Card>

        <Card className="rounded-3xl shadow-none">
          <h3 className="font-[var(--font-heading)] text-2xl font-black text-ledger-ink">
            Review Queue
          </h3>
          <div className="mt-5 space-y-3">
            <ReviewRow label="Pending exceptions" value={pendingExceptions} />
            <ReviewRow label="Payment corrections" value={pendingCorrections} />
            <ReviewRow label="GCash proof review" value={pendingProofs} />
          </div>
          <p className="mt-5 rounded-2xl bg-ledger-lime/45 p-4 text-sm font-bold leading-6 text-ledger-ink">
            GCash proof upload and shift close are intentionally placeholders in this MVP.
          </p>
        </Card>
      </div>
    </div>
  );
}

function MemberFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-ledger-line bg-ledger-paper/70 px-4 py-3">
      <dt className="text-xs font-black uppercase tracking-[0.14em] text-ledger-moss">{label}</dt>
      <dd className="mt-1 break-words text-sm font-black text-ledger-ink">{value}</dd>
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-ledger-line bg-white/60 px-4 py-3">
      <span className="text-sm font-bold text-ledger-moss">{label}</span>
      <span className="font-[var(--font-heading)] text-2xl font-black text-ledger-ink">
        {value.toLocaleString("en-PH")}
      </span>
    </div>
  );
}
