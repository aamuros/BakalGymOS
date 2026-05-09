import {
  AlertTriangle,
  Banknote,
  CircleDollarSign,
  ShieldCheck,
  UserRoundCheck,
  Users,
  WalletCards,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { type AppRole } from "@/lib/auth/permissions";
import { requireModuleAccess } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";

type RelatedMember = {
  full_name: string;
  member_code: string;
};

type RelatedProfile = {
  full_name: string;
};

type RelatedPayment = {
  amount: number | string;
  payment_type: "cash" | "gcash" | "other";
  status: string;
};

type RelatedStaffProfile = {
  employee_code: string | null;
  job_title: string | null;
  profiles: RelatedProfile | RelatedProfile[] | null;
};

type RecentEntryRow = {
  entered_at: string;
  guest_name: string | null;
  id: string;
  notes: string | null;
  settlement_type: string;
  status: string;
  checked_by_profile: RelatedProfile | RelatedProfile[] | null;
  members: RelatedMember | RelatedMember[] | null;
  payments: RelatedPayment | RelatedPayment[] | null;
};

type ActiveShiftRow = {
  id: string;
  opened_at: string;
  opening_cash: number | string;
  expected_cash: number | string | null;
  staff_profiles: RelatedStaffProfile | RelatedStaffProfile[] | null;
};

type VarianceShiftRow = {
  actual_cash: number | string | null;
  cash_difference: number | string | null;
  closed_at: string | null;
  expected_cash: number | string | null;
  id: string;
  variance_note: string | null;
  staff_profiles: RelatedStaffProfile | RelatedStaffProfile[] | null;
};

type ExceptionRow = {
  amount: number | string | null;
  created_at: string;
  exception_type: string;
  id: string;
  owner_note: string | null;
  person_name: string | null;
  reason: string;
  status: string;
  created_by_profile: RelatedProfile | RelatedProfile[] | null;
  members: RelatedMember | RelatedMember[] | null;
};

type GcashProofRow = {
  created_at: string;
  gcash_reference_number: string | null;
  id: string;
  proof_status: string;
  sender_name: string | null;
  uploaded_by_profile: RelatedProfile | RelatedProfile[] | null;
  payments: {
    amount: number | string;
    purpose: string;
    status: string;
    members: RelatedMember | RelatedMember[] | null;
  } | Array<{
    amount: number | string;
    purpose: string;
    status: string;
    members: RelatedMember | RelatedMember[] | null;
  }> | null;
};

const managementRoles = new Set<AppRole>(["owner", "admin", "manager"]);

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

function relatedOne<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatAmount(value: number | string | null | undefined) {
  return pesoFormatter.format(Number(value ?? 0));
}

function labelize(value: string) {
  return value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function getTodayBounds() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Manila",
    year: "numeric",
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((item) => item.type === type)?.value;
  const today = `${part("year")}-${part("month")}-${part("day")}`;

  return {
    end: new Date(`${today}T24:00:00+08:00`).toISOString(),
    label: new Intl.DateTimeFormat("en-PH", {
      dateStyle: "full",
      timeZone: "Asia/Manila",
    }).format(new Date(`${today}T00:00:00+08:00`)),
    start: new Date(`${today}T00:00:00+08:00`).toISOString(),
  };
}

function sumAmounts(rows: Array<{ amount: number | string }> | null | undefined) {
  return (rows ?? []).reduce((total, row) => total + Number(row.amount), 0);
}

export default async function OwnerDashboardPage() {
  const profile = await requireModuleAccess("/owner-dashboard");

  if (!managementRoles.has(profile.role)) {
    redirect("/unauthorized?next=/owner-dashboard");
  }

  const supabase = await createClient();
  const today = getTodayBounds();

  const [
    totalEntriesResult,
    settledEntriesResult,
    reviewEntriesResult,
    reviewExceptionsResult,
    reviewGcashResult,
    cashPaymentsResult,
    gcashPaymentsResult,
    pendingBalancesResult,
    utangAddedResult,
    utangPaidResult,
    ownerOverridesResult,
    cashVarianceResult,
    activeShiftsResult,
    varianceAlertsResult,
    recentEntriesResult,
    recentExceptionsResult,
    gcashReviewResult,
  ] = await Promise.all([
    supabase
      .from("entries")
      .select("id", { count: "exact", head: true })
      .gte("entered_at", today.start)
      .lt("entered_at", today.end)
      .neq("status", "voided"),
    supabase
      .from("entries")
      .select("id", { count: "exact", head: true })
      .gte("entered_at", today.start)
      .lt("entered_at", today.end)
      .in("status", ["completed", "settled"]),
    supabase
      .from("entries")
      .select("id", { count: "exact", head: true })
      .gte("entered_at", today.start)
      .lt("entered_at", today.end)
      .in("status", ["needs_review", "gcash_pending_review"]),
    supabase
      .from("exceptions")
      .select("id", { count: "exact", head: true })
      .in("status", ["needs_review", "pending"]),
    supabase
      .from("gcash_proofs")
      .select("id", { count: "exact", head: true })
      .in("proof_status", ["for_review", "rejected", "follow_up"]),
    supabase
      .from("payments")
      .select("amount")
      .gte("paid_at", today.start)
      .lt("paid_at", today.end)
      .eq("payment_type", "cash")
      .eq("status", "completed"),
    supabase
      .from("payments")
      .select("amount")
      .gte("paid_at", today.start)
      .lt("paid_at", today.end)
      .eq("payment_type", "gcash")
      .not("status", "in", "(voided,refunded)"),
    supabase
      .from("walk_in_balances")
      .select("amount")
      .gte("created_at", today.start)
      .lt("created_at", today.end)
      .in("status", ["pending", "needs_review"]),
    supabase
      .from("walk_in_balances")
      .select("amount")
      .gte("created_at", today.start)
      .lt("created_at", today.end),
    supabase
      .from("payments")
      .select("amount")
      .eq("purpose", "balance_payment")
      .eq("status", "completed")
      .gte("paid_at", today.start)
      .lt("paid_at", today.end),
    supabase
      .from("exceptions")
      .select("id", { count: "exact", head: true })
      .eq("exception_type", "owner_approved_free_entry")
      .gte("created_at", today.start)
      .lt("created_at", today.end),
    supabase
      .from("shifts")
      .select("cash_difference")
      .gte("closed_at", today.start)
      .lt("closed_at", today.end)
      .eq("status", "closed"),
    supabase
      .from("shifts")
      .select("id, opened_at, opening_cash, expected_cash, staff_profiles!shifts_staff_profile_id_fkey(employee_code, job_title, profiles!staff_profiles_profile_id_fkey(full_name))")
      .eq("status", "open")
      .is("closed_at", null)
      .order("opened_at", { ascending: false }),
    supabase
      .from("shifts")
      .select("id, closed_at, expected_cash, actual_cash, cash_difference, variance_note, staff_profiles!shifts_staff_profile_id_fkey(employee_code, job_title, profiles!staff_profiles_profile_id_fkey(full_name))")
      .gte("closed_at", today.start)
      .lt("closed_at", today.end)
      .neq("cash_difference", 0)
      .order("closed_at", { ascending: false })
      .limit(6),
    supabase
      .from("entries")
      .select("id, entered_at, guest_name, settlement_type, status, notes, members(full_name, member_code), payments(amount, payment_type, status), checked_by_profile:profiles!entries_checked_in_by_fkey(full_name)")
      .gte("entered_at", today.start)
      .lt("entered_at", today.end)
      .neq("status", "voided")
      .order("entered_at", { ascending: false })
      .limit(10),
    supabase
      .from("exceptions")
      .select("id, created_at, exception_type, reason, amount, status, person_name, owner_note, members(full_name, member_code), created_by_profile:profiles!exceptions_created_by_fkey(full_name)")
      .in("status", ["needs_review", "pending"])
      .order("created_at", { ascending: false })
      .limit(6),
    supabase
      .from("gcash_proofs")
      .select("id, created_at, proof_status, gcash_reference_number, sender_name, payments(amount, purpose, status, members(full_name, member_code)), uploaded_by_profile:profiles!gcash_proofs_uploaded_by_fkey(full_name)")
      .in("proof_status", ["for_review", "rejected", "follow_up"])
      .order("created_at", { ascending: false })
      .limit(6),
  ]);

  const error =
    totalEntriesResult.error ??
    settledEntriesResult.error ??
    reviewEntriesResult.error ??
    reviewExceptionsResult.error ??
    reviewGcashResult.error ??
    cashPaymentsResult.error ??
    gcashPaymentsResult.error ??
    pendingBalancesResult.error ??
    utangAddedResult.error ??
    utangPaidResult.error ??
    ownerOverridesResult.error ??
    cashVarianceResult.error ??
    activeShiftsResult.error ??
    varianceAlertsResult.error ??
    recentEntriesResult.error ??
    recentExceptionsResult.error ??
    gcashReviewResult.error;

  if (error) {
    throw new Error(error.message);
  }

  const cashCollected = sumAmounts(cashPaymentsResult.data);
  const gcashCollected = sumAmounts(gcashPaymentsResult.data);
  const pendingUtang = sumAmounts(pendingBalancesResult.data);
  const utangAdded = sumAmounts(utangAddedResult.data);
  const utangPaid = sumAmounts(utangPaidResult.data);
  const ownerOverrides = ownerOverridesResult.count ?? 0;
  const totalCashVariance = (cashVarianceResult.data ?? []).reduce(
    (sum, row) => sum + Number(row.cash_difference ?? 0),
    0,
  );
  const activeShifts = (activeShiftsResult.data ?? []) as ActiveShiftRow[];
  const varianceAlerts = (varianceAlertsResult.data ?? []) as VarianceShiftRow[];
  const recentEntries = (recentEntriesResult.data ?? []) as RecentEntryRow[];
  const recentExceptions = (recentExceptionsResult.data ?? []) as ExceptionRow[];
  const gcashReviewItems = (gcashReviewResult.data ?? []) as GcashProofRow[];
  const needsReview =
    (reviewEntriesResult.count ?? 0) +
    (reviewExceptionsResult.count ?? 0) +
    (reviewGcashResult.count ?? 0);

  const totalEntries = totalEntriesResult.count ?? 0;
  const settledEntries = settledEntriesResult.count ?? 0;

  return (
    <div className="page-enter space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-n-ink">Dashboard</h1>
        <p className="mt-1 text-sm font-medium text-n-dim">{today.label}</p>
      </div>

      {/* Metrics — Today Summary */}
      <section className="space-y-4">
        <p className="text-xs font-semibold text-n-muted">Today Summary</p>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            icon={Users}
            label="Total entries"
            value={totalEntries.toLocaleString("en-PH")}
            detail={`${settledEntries} settled`}
          />
          <MetricCard
            icon={Banknote}
            label="Cash collected"
            value={formatAmount(cashCollected)}
          />
          <MetricCard
            icon={WalletCards}
            label="GCash collected"
            value={formatAmount(gcashCollected)}
          />
          <MetricCard
            icon={CircleDollarSign}
            label="Utang added"
            value={formatAmount(utangAdded)}
            detail={pendingUtang > 0 ? `${formatAmount(pendingUtang)} still pending` : undefined}
          />
          <MetricCard
            icon={CircleDollarSign}
            label="Utang paid"
            value={formatAmount(utangPaid)}
          />
          <MetricCard
            icon={ShieldCheck}
            label="Owner overrides"
            value={ownerOverrides.toLocaleString("en-PH")}
          />
          <MetricCard
            icon={AlertTriangle}
            label="Needs review"
            tone={needsReview > 0 ? "warn" : "default"}
            value={needsReview.toLocaleString("en-PH")}
            detail={pendingUtang > 0 ? `${formatAmount(pendingUtang)} pending utang` : undefined}
          />
          <MetricCard
            icon={Banknote}
            label="Cash variance"
            value={formatAmount(totalCashVariance)}
            tone={totalCashVariance !== 0 ? "danger" : "default"}
            detail={varianceAlerts.length > 0 ? `${varianceAlerts.length} shift${varianceAlerts.length > 1 ? "s" : ""} with variance` : undefined}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            icon={UserRoundCheck}
            label="Staff on duty"
            value={activeShifts.length.toLocaleString("en-PH")}
            detail={activeShifts.length > 0 ? activeShifts.map((s) => {
              const sp = relatedOne(s.staff_profiles);
              const p = relatedOne(sp?.profiles);
              return p?.full_name ?? "Staff";
            }).join(", ") : undefined}
          />
          <MetricCard
            icon={WalletCards}
            label="GCash for review"
            tone={(reviewGcashResult.count ?? 0) > 0 ? "warn" : "default"}
            value={(reviewGcashResult.count ?? 0).toLocaleString("en-PH")}
          />
        </div>
      </section>

      {/* Recent entries + Active shifts */}
      <section className="grid gap-5 xl:grid-cols-[1fr_22rem]">
        <Card className="p-0">
          <PanelHeader
            actionHref="/front-desk"
            actionLabel="Front Desk"
            title="Recent entries"
          />
          {recentEntries.length ? (
            <div className="divide-y divide-n-border">
              {recentEntries.map((entry) => {
                const member = relatedOne(entry.members);
                const payment = relatedOne(entry.payments);
                const checkedBy = relatedOne(entry.checked_by_profile);
                const personName = member?.full_name ?? entry.guest_name ?? "Guest";

                return (
                  <div className="flex items-center justify-between gap-3 px-5 py-3" key={entry.id}>
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-n-ink">{personName}</p>
                      <p className="mt-0.5 text-xs text-n-dim">
                        {labelize(entry.settlement_type)} · {checkedBy?.full_name ?? "Staff"}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-bold text-n-ink">{formatAmount(payment?.amount)}</p>
                      <p className="text-xs text-n-dim">
                        {timeFormatter.format(new Date(entry.entered_at))}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState title="No entries today" body="Check-ins and walk-ins will appear here." />
          )}
        </Card>

        <div className="space-y-5">
          <Card className="p-0">
            <PanelHeader
              actionHref="/shifts"
              actionLabel="Shifts"
              title="Active shifts"
            />
            {activeShifts.length ? (
              <div className="divide-y divide-n-border">
                {activeShifts.map((shift) => {
                  const staffProfile = relatedOne(shift.staff_profiles);
                  const staff = relatedOne(staffProfile?.profiles);

                  return (
                    <div className="px-5 py-3" key={shift.id}>
                      <p className="font-semibold text-n-ink">{staff?.full_name ?? "Staff"}</p>
                      <p className="mt-0.5 text-xs text-n-dim">
                        Since {timeFormatter.format(new Date(shift.opened_at))} · Expected {formatAmount(shift.expected_cash ?? shift.opening_cash)}
                      </p>
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyState title="No active shifts" body="No staff is currently collecting." compact />
            )}
          </Card>

          {varianceAlerts.length > 0 && (
            <Card className="p-0">
              <PanelHeader
                actionHref="/shifts"
                actionLabel="Review"
                title="Variance alerts"
                variant="danger"
              />
              <div className="divide-y divide-n-border">
                {varianceAlerts.map((shift) => {
                  const staffProfile = relatedOne(shift.staff_profiles);
                  const staff = relatedOne(staffProfile?.profiles);

                  return (
                    <div className="px-5 py-3" key={shift.id}>
                      <p className="font-bold text-red-700">{formatAmount(shift.cash_difference)}</p>
                      <p className="mt-0.5 text-xs text-n-dim">
                        {staff?.full_name ?? "Staff"} · {shift.closed_at ? timeFormatter.format(new Date(shift.closed_at)) : "today"}
                      </p>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
        </div>
      </section>

      {/* Review queues */}
      <section className="grid gap-5 xl:grid-cols-2">
        <Card className="p-0">
          <PanelHeader
            actionHref="/exceptions"
            actionLabel="Exceptions"
            title="Exceptions"
            count={recentExceptions.length || undefined}
          />
          {recentExceptions.length ? (
            <div className="divide-y divide-n-border">
              {recentExceptions.map((item) => {
                const member = relatedOne(item.members);
                const creator = relatedOne(item.created_by_profile);
                const personName = member?.full_name ?? item.person_name ?? "Unassigned";

                return (
                  <div className="flex items-center justify-between gap-3 px-5 py-3" key={item.id}>
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-n-ink">{personName}</p>
                      <p className="mt-0.5 text-xs text-n-dim">
                        {labelize(item.exception_type)} · {item.amount === null ? "No amount" : formatAmount(item.amount)} · {creator?.full_name ?? "Staff"}
                      </p>
                    </div>
                    <StatusBadge tone="warn" className="shrink-0">{labelize(item.status)}</StatusBadge>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState title="No exceptions" body="Unresolved exceptions will appear here." compact />
          )}
        </Card>

        <Card className="p-0">
          <PanelHeader
            actionHref="/payments/gcash-review"
            actionLabel="GCash Review"
            title="GCash for review"
            count={gcashReviewItems.length || undefined}
          />
          {gcashReviewItems.length ? (
            <div className="divide-y divide-n-border">
              {gcashReviewItems.map((proof) => {
                const payment = relatedOne(proof.payments);
                const member = relatedOne(payment?.members);
                const uploader = relatedOne(proof.uploaded_by_profile);

                return (
                  <div className="flex items-center justify-between gap-3 px-5 py-3" key={proof.id}>
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-n-ink">
                        {member?.full_name ?? proof.sender_name ?? "Walk-in GCash"}
                      </p>
                      <p className="mt-0.5 text-xs text-n-dim">
                        {formatAmount(payment?.amount)} · {uploader?.full_name ?? "Staff"}
                      </p>
                    </div>
                    <StatusBadge tone="warn" className="shrink-0">{labelize(proof.proof_status)}</StatusBadge>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState title="No GCash review items" body="Pending GCash payments will appear here." compact />
          )}
        </Card>
      </section>
    </div>
  );
}

function MetricCard({
  detail,
  detailTone,
  icon: Icon,
  label,
  tone = "default",
  value,
}: {
  detail?: string;
  detailTone?: "danger";
  icon: typeof Users;
  label: string;
  tone?: "danger" | "default" | "warn";
  value: string;
}) {
  const toneClass =
    tone === "danger"
      ? "bg-red-50 text-red-800"
      : tone === "warn"
        ? "bg-amber-50 text-amber-800"
        : "bg-n-hover text-n-muted";

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold text-n-muted">{label}</p>
        <span className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${toneClass}`}>
          <Icon aria-hidden="true" className="size-4" />
        </span>
      </div>
      <p className="mt-3 text-xl font-bold text-n-ink">{value}</p>
      {detail ? (
        <p className={`mt-1 text-xs font-medium ${detailTone === "danger" ? "text-red-600" : "text-n-dim"}`}>
          {detail}
        </p>
      ) : null}
    </Card>
  );
}

function PanelHeader({
  actionHref,
  actionLabel,
  count,
  title,
  variant,
}: {
  actionHref: string;
  actionLabel: string;
  count?: number;
  title: string;
  variant?: "danger";
}) {
  return (
    <div className="flex items-center justify-between border-b border-n-border px-5 py-3">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-bold text-n-ink">{title}</h3>
        {count != null ? (
          <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${variant === "danger" ? "bg-red-100 text-red-700" : "bg-n-hover text-n-muted"}`}>
            {count}
          </span>
        ) : null}
      </div>
      <Link
        className="text-xs font-bold text-n-dim transition hover:text-n-ink"
        href={actionHref}
      >
        {actionLabel}
      </Link>
    </div>
  );
}
