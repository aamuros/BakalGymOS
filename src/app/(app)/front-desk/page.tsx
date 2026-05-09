import {
  AlertTriangle,
  Banknote,
  CalendarClock,
  ChevronDown,
  CircleDollarSign,
  ReceiptText,
  Search,
  UserRoundCheck,
  WalletCards,
} from "lucide-react";
import Link from "next/link";

import { ExpiredMemberActions } from "@/app/(app)/front-desk/expired-member-actions";
import { GcashProofUploadForm } from "@/app/(app)/front-desk/gcash-proof-upload-form";
import { MemberCheckInButton } from "@/app/(app)/front-desk/member-check-in-button";
import { QrScanner } from "@/app/(app)/front-desk/qr-scanner";
import { WalkInForm } from "@/app/(app)/front-desk/walk-in-form";
import { EndShiftForm } from "@/app/(app)/shifts/end-shift-form";
import { StartShiftForm } from "@/app/(app)/shifts/start-shift-form";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { StateMessage } from "@/components/ui/state-message";
import { StatusBadge } from "@/components/ui/status-badge";
import { roleLabels, type AppRole } from "@/lib/auth/permissions";
import { requireModuleAccess } from "@/lib/auth/server";
import {
  deriveMemberAccess,
  getManilaDateString,
  getPlanName,
  type MemberAccessStatus,
} from "@/lib/member-access";
import { parseMemberQrPayload } from "@/lib/member-qr";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";

type FrontDeskPageProps = {
  searchParams?: Promise<{ q?: string; qr?: string }>;
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

type GcashProofRow = {
  id: string;
  payment_id: string;
  proof_status: string;
  created_at: string;
  payments: {
    amount: number | string;
    purpose: string;
    created_at: string;
    members: RelatedMember | RelatedMember[] | null;
  } | {
    amount: number | string;
    purpose: string;
    created_at: string;
    members: RelatedMember | RelatedMember[] | null;
  }[] | null;
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
  member_id?: string | null;
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

type CashMovementRow = {
  amount: number | string;
  category: "expense" | "owner_pickup" | "cash_adjustment" | null;
  movement_type: "cash_in" | "cash_out";
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
  status: "active" | "inactive" | "banned" | "archived";
};

type MemberSubscriptionRow = {
  id: string;
  member_id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  entries_used: number;
  membership_plans:
    | { name: string; entry_limit: number | null; is_unlimited: boolean }
    | { name: string; entry_limit: number | null; is_unlimited: boolean }[]
    | null;
};

type MemberPaymentRow = {
  member_id: string;
  amount: number | string;
};

type MemberBalanceRow = {
  member_id: string | null;
  amount: number | string;
};

type MemberEntryRow = {
  member_id: string;
  entered_at: string;
};

type MemberSearchResult = MemberSearchRow & {
  accessStatus: MemberAccessStatus | "has_utang";
  balance: number;
  currentPlan: string;
  expiryDate: string | null;
  lastCheckIn: string | null;
};

type SettingRow = {
  key: string;
  value: unknown;
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
const fallbackWalkInAmount = 100;

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

function relatedOne<T>(value: T | T[] | null) {
  return Array.isArray(value) ? value[0] : value;
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

function getAccessTone(status: MemberSearchResult["accessStatus"]) {
  if (status === "good") {
    return "active";
  }

  return status === "banned" || status === "archived" ? "danger" : "warn";
}

function getAccessLabel(status: MemberSearchResult["accessStatus"]) {
  if (status === "good") {
    return "Good to enter";
  }

  if (status === "has_utang") {
    return "Has utang";
  }

  const labels: Record<Exclude<MemberSearchResult["accessStatus"], "good" | "has_utang">, string> = {
    archived: "Archived - hidden",
    banned: "Banned - do not admit",
    entry_limit_reached: "No entries left",
    expired: "Expired",
    inactive: "Inactive",
  };

  return labels[status];
}

function sumAmounts(payments: Array<{ amount: number | string }> | null | undefined) {
  return (payments ?? []).reduce((total, payment) => total + Number(payment.amount), 0);
}

function getShiftCashSummary(
  shift: ActiveShiftRow | null,
  payments: PaymentRow[],
  movements: CashMovementRow[],
) {
  const startingCash = Number(shift?.opening_cash ?? 0);
  const cashSales = sumAmounts(payments);
  const expenses = movements
    .filter((movement) => movement.movement_type === "cash_out" && movement.category !== "owner_pickup")
    .reduce((total, movement) => total + Number(movement.amount), 0);
  const ownerCashPickup = movements
    .filter((movement) => movement.movement_type === "cash_out" && movement.category === "owner_pickup")
    .reduce((total, movement) => total + Number(movement.amount), 0);
  const cashAdjustments = movements
    .filter((movement) => movement.movement_type === "cash_in")
    .reduce((total, movement) => total + Number(movement.amount), 0);
  const expectedCash = startingCash + cashSales + cashAdjustments - expenses - ownerCashPickup;

  return {
    cashSales,
    expectedCash,
    expenses,
    ownerCashPickup,
    startingCash,
  };
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

function getWalkInAmount(value: unknown) {
  if (!value || typeof value !== "object" || value === null) {
    return fallbackWalkInAmount;
  }

  const amount = Number((value as { amount?: unknown }).amount);

  return Number.isFinite(amount) && amount > 0 ? amount : fallbackWalkInAmount;
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
  const memberQrToken = params?.qr ? parseMemberQrPayload(params.qr) : null;

  const [
    entriesTodayResult,
    cashPaymentsResult,
    gcashPaymentsResult,
    pendingBalancesResult,
    pendingExceptionsResult,
    pendingCorrectionsResult,
    pendingProofsResult,
    activeShiftResult,
    settingsResult,
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
      .in("status", ["needs_review", "pending"])
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
      .select("id, payment_id, proof_status, created_at, payments(amount, purpose, created_at, members(full_name, member_code))")
      .in("proof_status", ["awaiting_proof", "follow_up", "rejected"])
      .gte("created_at", today.startIso)
      .lt("created_at", today.endIso)
      .order("created_at", { ascending: false })
      .limit(8),
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
      .from("settings")
      .select("key, value")
      .in("key", ["walk_in_rate", "operational_settings", "payment_settings"]),
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
    pendingProofsResult.error ??
    activeShiftResult.error ??
    settingsResult.error ??
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
  const pendingProofRows = (pendingProofsResult.data ?? []) as GcashProofRow[];
  const pendingProofs = pendingProofRows.length;
  const cashPayments = (cashPaymentsResult.data ?? []) as PaymentRow[];
  const gcashPayments = (gcashPaymentsResult.data ?? []) as PaymentRow[];
  const pendingBalances = (pendingBalancesResult.data ?? []) as BalanceRow[];
  const needsReview = pendingExceptions + pendingCorrections + pendingProofs;
  const activeShift = activeShiftResult.data as ActiveShiftRow | null;
  const settingsRows = (settingsResult.data ?? []) as SettingRow[];
  const settingsMap = new Map(settingsRows.map((row) => [row.key, row.value]));
  const walkInAmount = getWalkInAmount(settingsMap.get("walk_in_rate") ?? null);

  const operationalSettingsRaw = settingsMap.get("operational_settings");
  const operationalSettings = operationalSettingsRaw && typeof operationalSettingsRaw === "object"
    ? operationalSettingsRaw as { allow_utang?: boolean; grace_period_days?: number; max_utang_warning_amount?: number }
    : null;
  const allowUtang = operationalSettings?.allow_utang !== false;
  const gracePeriodDays = operationalSettings?.grace_period_days ?? 0;

  const paymentSettingsRaw = settingsMap.get("payment_settings");
  const paymentSettings = paymentSettingsRaw && typeof paymentSettingsRaw === "object"
    ? paymentSettingsRaw as { gcash_account_name?: string; gcash_number?: string }
    : null;
  const gcashAccountName = paymentSettings?.gcash_account_name ?? "";
  const gcashNumber = paymentSettings?.gcash_number ?? "";
  let activeShiftCashPayments: PaymentRow[] = [];
  let activeShiftCashMovements: CashMovementRow[] = [];
  let memberResults: MemberSearchResult[] = [];
  let memberSearchError: string | null = null;

  if (activeShift) {
    const [shiftPaymentsResult, shiftMovementsResult] = await Promise.all([
      supabase
        .from("payments")
        .select("id, amount, payment_type, purpose, status, paid_at, created_at, members(full_name, member_code)")
        .eq("shift_id", activeShift.id)
        .eq("payment_type", "cash")
        .eq("status", "completed"),
      supabase
        .from("cash_movements")
        .select("amount, category, movement_type")
        .eq("shift_id", activeShift.id)
        .eq("status", "approved"),
    ]);

    const shiftError = shiftPaymentsResult.error ?? shiftMovementsResult.error;

    if (shiftError) {
      throw new Error(shiftError.message);
    }

    activeShiftCashPayments = (shiftPaymentsResult.data ?? []) as PaymentRow[];
    activeShiftCashMovements = (shiftMovementsResult.data ?? []) as CashMovementRow[];
  }

  const shiftCashSummary = getShiftCashSummary(
    activeShift,
    activeShiftCashPayments,
    activeShiftCashMovements,
  );

  if (params?.qr && !memberQrToken) {
    memberSearchError = "This QR code is not a valid GymLedger member card.";
  } else if (memberQrToken) {
    const { data: members, error: membersError } = await supabase
      .from("members")
      .select("id, full_name, phone, member_code, status")
      .eq("qr_token", memberQrToken)
      .limit(1);

    if (membersError) {
      memberSearchError = membersError.message;
    } else {
      const memberRows = (members ?? []) as MemberSearchRow[];
      const memberIds = memberRows.map((member) => member.id);

      if (memberIds.length) {
        const [subscriptionsResult, paymentsResult, balancesResult, entriesResult] = await Promise.all([
          supabase
            .from("member_subscriptions")
            .select("id, member_id, starts_at, ends_at, status, entries_used, membership_plans(name, entry_limit, is_unlimited)")
            .in("member_id", memberIds)
            .order("ends_at", { ascending: false }),
          supabase
            .from("payments")
            .select("member_id, amount")
            .in("member_id", memberIds)
            .eq("status", "pending"),
          supabase
            .from("walk_in_balances")
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

        const relatedError =
          subscriptionsResult.error ?? paymentsResult.error ?? balancesResult.error ?? entriesResult.error;

        if (relatedError) {
          memberSearchError = relatedError.message;
        } else {
          const subscriptions = (subscriptionsResult.data ?? []) as MemberSubscriptionRow[];
          const payments = (paymentsResult.data ?? []) as MemberPaymentRow[];
          const balances = (balancesResult.data ?? []) as MemberBalanceRow[];
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

          balances.forEach((balance) => {
            if (balance.member_id) {
              balanceByMember[balance.member_id] =
                (balanceByMember[balance.member_id] ?? 0) + Number(balance.amount ?? 0);
            }
          });

          memberResults = memberRows.map((member) => {
            const latestSubscription = latestSubscriptionByMember[member.id] ?? null;
            const derivedAccess = deriveMemberAccess(member.status, latestSubscription, getManilaDateString(), gracePeriodDays);
            const balance = balanceByMember[member.id] ?? 0;

            return {
              ...member,
              accessStatus: derivedAccess === "good" && balance > 0 ? "has_utang" : derivedAccess,
              balance,
              currentPlan: getPlanName(latestSubscription),
              expiryDate: latestSubscription?.ends_at ?? null,
              lastCheckIn: latestEntryByMember[member.id]?.entered_at ?? null,
            };
          });
        }
      }
    }
  } else if (memberQuery) {
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
          const [subscriptionsResult, paymentsResult, balancesResult, entriesResult] = await Promise.all([
            supabase
              .from("member_subscriptions")
              .select("id, member_id, starts_at, ends_at, status, entries_used, membership_plans(name, entry_limit, is_unlimited)")
              .in("member_id", memberIds)
              .order("ends_at", { ascending: false }),
            supabase
              .from("payments")
              .select("member_id, amount")
              .in("member_id", memberIds)
              .eq("status", "pending"),
            supabase
              .from("walk_in_balances")
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

          const relatedError =
            subscriptionsResult.error ?? paymentsResult.error ?? balancesResult.error ?? entriesResult.error;

          if (relatedError) {
            memberSearchError = relatedError.message;
          } else {
            const subscriptions = (subscriptionsResult.data ?? []) as MemberSubscriptionRow[];
            const payments = (paymentsResult.data ?? []) as MemberPaymentRow[];
            const balances = (balancesResult.data ?? []) as MemberBalanceRow[];
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

            balances.forEach((balance) => {
              if (balance.member_id) {
                balanceByMember[balance.member_id] =
                  (balanceByMember[balance.member_id] ?? 0) + Number(balance.amount ?? 0);
              }
            });

            memberResults = memberRows.map((member) => {
              const latestSubscription = latestSubscriptionByMember[member.id] ?? null;
              const derivedAccess = deriveMemberAccess(member.status, latestSubscription, getManilaDateString(), gracePeriodDays);
              const balance = balanceByMember[member.id] ?? 0;

              return {
                ...member,
                accessStatus: derivedAccess === "good" && balance > 0 ? "has_utang" : derivedAccess,
                balance,
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
      detail: `${formatAmount(balance.amount)} utang balance - ${balance.status}`,
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
      label: "Utang / Pay later",
      value: formatAmount(sumAmounts(pendingBalances)),
    },
    {
      icon: AlertTriangle,
      label: "Needs review",
      value: needsReview.toLocaleString("en-PH"),
    },
  ];

  return (
    <div className="page-enter space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold text-n-muted">
            Front Desk Portal
          </p>
          <h2 className="mt-2 text-xl font-bold leading-tight text-n-ink sm:text-2xl">
            Who is entering?
          </h2>
          <p className="mt-2 text-sm font-medium text-n-dim">
            {today.label} · {roleLabels[profile.role]} view
            {isManagement ? " · broader operational access" : " · assigned RLS access"}
          </p>
        </div>
      </div>

      {!activeShift ? (
        <Card>
          <div className="grid gap-6 lg:grid-cols-[1fr_24rem] lg:items-start">
            <div>
              <p className="text-xs font-semibold text-n-muted">
                No Active Shift
              </p>
              <h3 className="mt-2 text-lg font-bold text-n-ink">
                Start a shift to unlock front desk actions
              </h3>
              <p className="mt-2 text-sm font-medium leading-6 text-n-dim">
                Entries and payments are recorded against the active shift opened by this staff account.
              </p>
            </div>
            <StartShiftForm />
          </div>
        </Card>
      ) : null}

      {activeShift ? (
        <Card className="border-l-4 border-l-n-focus" id="member-check-in">
          <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold text-n-muted">
                Member Check-In
              </p>
              <h3 className="mt-2 text-lg font-bold text-n-ink">
                Scan or search member records
              </h3>
            </div>
            <p className="text-sm font-medium text-n-dim">
              Scan QR, or enter name, phone number, or member ID
            </p>
          </div>

          <div className="mb-5">
            <QrScanner />
          </div>

          <form action="/front-desk#member-check-in" className="relative">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-n-dim"
            />
            <Input
              className="min-h-14 pl-12 text-lg font-bold"
              defaultValue={memberQuery}
              name="q"
              placeholder="Name, phone, or member ID"
              type="search"
            />
          </form>

          {memberQrToken && memberResults.length ? (
            <StateMessage className="mt-5" tone="success" title="QR card matched">
              QR card matched. Continue with the allowed check-in action below.
            </StateMessage>
          ) : null}

          {memberSearchError ? (
            <StateMessage className="mt-5" tone="danger" title="Member lookup failed">
              {memberSearchError}
            </StateMessage>
          ) : null}

          <div className="mt-5 space-y-4">
            {(memberQuery || memberQrToken) && !memberSearchError && !memberResults.length ? (
              <EmptyState
                body="Try a different name, phone number, member ID, or scan the card again. Use walk-in only if this person should not be treated as a member entry."
                compact
                title="No matching member"
              />
            ) : null}

            {memberResults.map((member) => (
              <div
                className={cn(
                  "rounded-lg border-2 bg-white/80 p-4",
                  member.accessStatus === "good" && "border-green-300",
                  member.accessStatus === "has_utang" && "border-amber-300 bg-amber-50/60",
                  member.accessStatus === "expired" && "border-amber-300 bg-amber-50/60",
                  member.accessStatus === "entry_limit_reached" && "border-amber-300 bg-amber-50/60",
                  (member.accessStatus === "inactive" || member.accessStatus === "banned" || member.accessStatus === "archived") &&
                    "border-red-400 bg-red-50/80",
                )}
                key={member.id}
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="break-words text-lg font-bold text-n-ink">
                        {member.full_name}
                      </h4>
                      <StatusBadge tone={getAccessTone(member.accessStatus)}>
                        {getAccessLabel(member.accessStatus)}
                      </StatusBadge>
                    </div>
                    <p className="mt-1 text-sm font-medium text-n-dim">
                      {member.member_code} · {member.phone || "No phone"}
                    </p>
                  </div>

                  {member.accessStatus === "good" ? (
                    <MemberCheckInButton memberId={member.id} />
                  ) : null}
                </div>

                {member.accessStatus === "has_utang" ? (
                  <StateMessage className="mt-5" tone="warn" title="Has utang">
                    Collect payment if possible. If the owner allows entry, check in and keep the balance open.
                  </StateMessage>
                ) : null}

                {member.accessStatus === "expired" || member.accessStatus === "entry_limit_reached" ? (
                  <StateMessage className="mt-5" tone="warn" title="Membership expired">
                    Do not use normal check-in. Renew the membership, collect a walk-in payment, record utang with a reason, or send an owner override for review.
                  </StateMessage>
                ) : null}

                {member.accessStatus === "inactive" || member.accessStatus === "banned" || member.accessStatus === "archived" ? (
                  <StateMessage className="mt-5" tone="danger" title="Member access blocked">
                    Check-in is blocked by member status. Review the member profile before admitting this member.
                  </StateMessage>
                ) : null}

                <dl className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                  <MemberFact label="Current plan" value={member.currentPlan} />
                  <MemberFact label="Expiry date" value={formatDate(member.expiryDate)} />
                  <MemberFact label="Balance" value={formatAmount(member.balance)} />
                  <MemberFact label="Last check-in" value={formatDateTime(member.lastCheckIn)} />
                  <MemberFact label="Member status" value={member.status} />
                </dl>

                {member.accessStatus === "has_utang" ? (
                  <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
                    <Link
                      className="inline-flex min-h-11 items-center justify-center rounded-xl bg-n-ink px-5 text-sm font-bold text-white transition hover:bg-n-dark active:scale-[0.98]"
                      href="/balances"
                    >
                      Collect payment
                    </Link>
                    <MemberCheckInButton label="Allow and keep balance" memberId={member.id} />
                    <Link
                      className="inline-flex min-h-11 items-center justify-center rounded-xl border border-n-border bg-white px-5 text-sm font-bold text-n-ink transition hover:bg-white active:scale-[0.98]"
                      href="/exceptions"
                    >
                      Ask owner
                    </Link>
                  </div>
                ) : null}

                {member.accessStatus === "expired" || member.accessStatus === "entry_limit_reached" ? (
                  <ExpiredMemberActions allowUtang={allowUtang} defaultAmount={walkInAmount} memberId={member.id} />
                ) : null}

              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {activeShift ? (
        <Card id="walk-in">
          <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold text-n-muted">
                Walk-In
              </p>
              <h3 className="mt-2 text-lg font-bold text-n-ink">
                Quick entry log
              </h3>
            </div>
            <p className="text-sm font-medium text-n-dim">
              Linked to the active shift started {formatTime(activeShift.opened_at)}
            </p>
          </div>
          {gcashNumber || gcashAccountName ? (
            <div className="mb-4 rounded-lg border border-n-border bg-n-hover px-4 py-3 text-sm font-medium text-n-dim">
              Send GCash to: <span className="font-bold text-n-ink">{gcashAccountName || "Gym account"}</span>
              {gcashNumber ? <> &middot; <span className="font-bold text-n-ink">{gcashNumber}</span></> : null}
            </div>
          ) : null}
          <WalkInForm allowUtang={allowUtang} defaultAmount={walkInAmount} />
        </Card>
      ) : null}

      {activeShift ? (
        <Card id="end-shift">
          <div className="grid gap-6 lg:grid-cols-[1fr_26rem] lg:items-start">
            <div>
              <p className="text-xs font-semibold text-n-muted">
                Current Shift Summary
              </p>
              <h3 className="mt-2 text-lg font-bold text-n-ink">
                Started {formatTime(activeShift.opened_at)}
              </h3>
              <p className="mt-2 text-sm font-medium text-n-dim">
                Opening cash {formatAmount(activeShift.opening_cash)}
                {activeShift.notes ? ` · ${activeShift.notes}` : ""}
              </p>
              <div className="mt-5 grid gap-3 rounded-xl bg-n-hover p-4">
                <ShiftMetric label="Cash sales" value={formatAmount(shiftCashSummary.cashSales)} />
                <ShiftMetric label="Expenses" value={`-${formatAmount(shiftCashSummary.expenses)}`} />
                <ShiftMetric
                  label="Owner cash pickup"
                  value={`-${formatAmount(shiftCashSummary.ownerCashPickup)}`}
                />
                <ShiftMetric label="Expected cash" value={formatAmount(shiftCashSummary.expectedCash)} />
              </div>
              <p className="mt-4 text-sm font-medium leading-6 text-n-dim">
                Cash changes expected drawer cash. GCash and utang entries stay in reporting queues.
              </p>
              {isManagement ? (
                <Link
                  className="mt-5 inline-flex min-h-11 items-center justify-center rounded-xl bg-n-ink px-5 text-sm font-bold text-white transition hover:bg-n-dark active:scale-[0.98]"
                  href="/shifts"
                >
                  View shifts
                </Link>
              ) : null}
            </div>
            <EndShiftForm
              cashSales={shiftCashSummary.cashSales}
              expectedCash={shiftCashSummary.expectedCash}
              expenses={shiftCashSummary.expenses}
              ownerCashPickup={shiftCashSummary.ownerCashPickup}
              shiftId={activeShift.id}
              startingCash={shiftCashSummary.startingCash}
            />
          </div>
        </Card>
      ) : null}

      {activeShift && pendingProofRows.length ? (
        <details>
          <summary className="mb-3 cursor-pointer rounded-lg border border-n-border bg-white p-4 shadow-n transition hover:bg-n-hover lg:hidden">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-n-muted">
                  GCash Proofs
                </p>
                <p className="mt-1 text-sm font-bold text-n-ink">
                  {pendingProofRows.length} pending proof{pendingProofRows.length !== 1 ? "s" : ""}
                </p>
              </div>
              <span className="flex size-9 items-center justify-center rounded-lg bg-n-hover text-n-muted">
                <ChevronDown aria-hidden="true" className="size-5" />
              </span>
            </div>
          </summary>
          <Card id="gcash-proofs">
            <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-semibold text-n-muted">
                  GCash Proofs
                </p>
                <h3 className="mt-2 text-lg font-bold text-n-ink">
                  Optional proof images
                </h3>
              </div>
              <p className="text-sm font-medium text-n-dim">
                Use when management asks for follow-up or staff wants to attach a screenshot.
              </p>
            </div>

            <div className="space-y-4">
              {pendingProofRows.map((proof) => {
                const payment = relatedOne(proof.payments);

                return (
                  <div className="rounded-lg border border-n-border bg-white/70 p-4" key={proof.id}>
                    <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="font-bold text-n-ink">
                          {getMemberName(payment?.members ?? null, "Walk-in GCash")}
                        </p>
                        <p className="mt-1 text-sm font-medium text-n-dim">
                          {formatAmount(payment?.amount ?? 0)} · {purposeLabel(payment?.purpose ?? "walk_in_entry")} ·{" "}
                          {purposeLabel(proof.proof_status)}
                        </p>
                      </div>
                      <StatusBadge tone="warn">
                        {purposeLabel(proof.proof_status)}
                      </StatusBadge>
                    </div>
                    <GcashProofUploadForm proofId={proof.id} />
                  </div>
                );
              })}
            </div>
          </Card>
        </details>
      ) : null}

      <details>
        <summary className="mb-3 cursor-pointer rounded-lg border border-n-border bg-white p-4 shadow-n transition hover:bg-n-hover lg:hidden">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-n-muted">
                Today&apos;s Overview
              </p>
              <p className="mt-1 text-sm font-bold text-n-ink">
                {stats.length} metrics &middot; tap to expand
              </p>
            </div>
            <span className="flex size-9 items-center justify-center rounded-lg bg-n-hover text-n-muted">
              <ChevronDown aria-hidden="true" className="size-5" />
            </span>
          </div>
        </summary>
        <div className="flex gap-3 overflow-x-auto pb-2 snap-x scrollbar-hide lg:grid lg:grid-cols-5 lg:overflow-visible lg:pb-0">
          {stats.map((stat) => {
            const Icon = stat.icon;

            return (
              <Card className="min-w-[10rem] shrink-0 snap-start p-5 lg:min-w-0" key={stat.label}>
                <div className="flex items-start justify-between gap-3">
                  <p className="text-xs font-semibold text-n-muted">
                    {stat.label}
                  </p>
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-n-hover text-n-muted">
                    <Icon aria-hidden="true" className="size-5" />
                  </span>
                </div>
                <p className="mt-5 break-words text-xl font-bold text-n-ink sm:text-2xl">
                  {stat.value}
                </p>
              </Card>
            );
          })}
        </div>
      </details>

      <details>
        <summary className="mb-3 cursor-pointer rounded-lg border border-n-border bg-white p-4 shadow-n transition hover:bg-n-hover lg:hidden">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-n-muted">
                Activity &amp; Review
              </p>
              <p className="mt-1 text-sm font-bold text-n-ink">
                {activity.length} recent items &middot; {needsReview} need review
              </p>
            </div>
            <span className="flex size-9 items-center justify-center rounded-lg bg-n-hover text-n-muted">
              <ChevronDown aria-hidden="true" className="size-5" />
            </span>
          </div>
        </summary>
        <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
          <Card className="p-0">
            <div className="flex items-center justify-between gap-4 border-b border-n-border px-5 py-4">
              <div>
                <h3 className="text-lg font-bold text-n-ink">
                  Recent Activity
                </h3>
                <p className="mt-1 text-sm font-medium text-n-dim">
                  Entries, payments, and exceptions visible to this account.
                </p>
              </div>
              <CalendarClock aria-hidden="true" className="hidden size-6 text-n-dim sm:block" />
            </div>

            {activity.length ? (
              <div className="divide-y divide-n-border">
                {activity.map((item) => {
                  const Icon = item.icon;

                  return (
                    <div className="flex gap-4 px-5 py-4" key={item.id}>
                      <span
                        className={cn(
                          "flex size-11 shrink-0 items-center justify-center rounded-xl",
                          item.tone === "entry" && "bg-green-50 text-green-800",
                          item.tone === "payment" && "bg-n-hover text-n-muted",
                          item.tone === "exception" && "bg-amber-50 text-amber-800",
                        )}
                      >
                        <Icon aria-hidden="true" className="size-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
                          <p className="truncate font-bold text-n-ink">{item.title}</p>
                          <p className="shrink-0 text-xs font-semibold text-n-dim">
                            {formatTime(item.at)}
                          </p>
                        </div>
                        <p className="mt-1 text-sm font-medium capitalize text-n-dim">{item.detail}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyState
                className="m-5"
                body="New check-ins, payments, and exceptions will appear here as soon as staff records them."
                title="No activity yet today"
              />
            )}
          </Card>

          <Card>
            <h3 className="text-lg font-bold text-n-ink">
              Review Queue
            </h3>
            <div className="mt-5 space-y-3">
              <ReviewRow label="Pending exceptions" value={pendingExceptions} />
              <ReviewRow label="Payment corrections" value={pendingCorrections} />
              <ReviewRow label="GCash proof review" value={pendingProofs} />
            </div>
            <p className="mt-5 rounded-xl bg-n-hover p-4 text-sm font-medium leading-6 text-n-muted">
              Normal GCash entry can be recorded immediately. Proof upload is optional and review stays outside the entry step.
            </p>
          </Card>
        </div>
      </details>
    </div>
  );
}

function MemberFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-n-border bg-white px-4 py-3">
      <dt className="text-xs font-semibold text-n-muted">{label}</dt>
      <dd className="mt-1 break-words text-sm font-bold text-n-ink">{value}</dd>
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-n-border bg-n-hover px-4 py-3">
      <span className="text-sm font-medium text-n-dim">{label}</span>
      <span className="text-lg font-bold text-n-ink">
        {value.toLocaleString("en-PH")}
      </span>
    </div>
  );
}

function ShiftMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm font-medium text-n-dim">{label}</span>
      <span className="text-right text-sm font-bold text-n-ink">{value}</span>
    </div>
  );
}
