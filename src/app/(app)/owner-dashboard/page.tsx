import {
  AlertTriangle,
  Banknote,
  ClipboardCheck,
  Clock3,
  LayoutDashboard,
  ReceiptText,
  Smartphone,
  UserRoundCheck,
  Users,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Card } from "@/components/ui/card";
import { roleLabels, type AppRole } from "@/lib/auth/permissions";
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

const dateTimeFormatter = new Intl.DateTimeFormat("en-PH", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Manila",
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
      .in("proof_status", ["staff_checked", "disputed", "needs_follow_up"]),
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
      .in("proof_status", ["staff_checked", "disputed", "needs_follow_up"])
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
  const activeShifts = (activeShiftsResult.data ?? []) as ActiveShiftRow[];
  const varianceAlerts = (varianceAlertsResult.data ?? []) as VarianceShiftRow[];
  const recentEntries = (recentEntriesResult.data ?? []) as RecentEntryRow[];
  const recentExceptions = (recentExceptionsResult.data ?? []) as ExceptionRow[];
  const gcashReviewItems = (gcashReviewResult.data ?? []) as GcashProofRow[];
  const needsReview =
    (reviewEntriesResult.count ?? 0) +
    (reviewExceptionsResult.count ?? 0) +
    (reviewGcashResult.count ?? 0);

  return (
    <div className="ledger-rise space-y-6">
      <div className="grid gap-5 lg:grid-cols-[1fr_18rem]">
        <Card className="relative overflow-hidden rounded-3xl shadow-none">
          <div className="relative">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-ledger-ink text-ledger-lime">
              <LayoutDashboard aria-hidden="true" className="size-7" />
            </div>
            <p className="mt-5 text-sm font-black uppercase tracking-[0.18em] text-ledger-moss">
              Owner Today
            </p>
            <h2 className="mt-2 font-[var(--font-heading)] text-4xl font-black leading-tight text-ledger-ink sm:text-5xl">
              Today Dashboard
            </h2>
            <p className="mt-3 max-w-2xl text-base font-bold leading-7 text-ledger-moss">
              {today.label}. Entries, collections, shifts, and review queues for owner decisions.
            </p>
          </div>
        </Card>

        <Card className="flex flex-col justify-between rounded-3xl shadow-none">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.18em] text-ledger-moss">
              Access
            </p>
            <p className="mt-3 font-[var(--font-heading)] text-3xl font-black text-ledger-ink">
              {roleLabels[profile.role]}
            </p>
          </div>
          <p className="mt-6 rounded-2xl bg-ledger-lime/45 p-4 text-sm font-bold leading-6 text-ledger-ink">
            Use this screen for quick review. Use Front Desk for live counter work.
          </p>
        </Card>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={Users} label="Today's total entries" value={(totalEntriesResult.count ?? 0).toLocaleString("en-PH")} />
        <MetricCard icon={ClipboardCheck} label="Settled entries" value={(settledEntriesResult.count ?? 0).toLocaleString("en-PH")} />
        <MetricCard icon={AlertTriangle} label="Needs review" tone="warn" value={needsReview.toLocaleString("en-PH")} />
        <MetricCard icon={Banknote} label="Cash collected" value={formatAmount(cashCollected)} />
        <MetricCard icon={Smartphone} label="GCash collected" value={formatAmount(gcashCollected)} />
        <MetricCard icon={Clock3} label="Pending / Utang" tone={pendingUtang > 0 ? "warn" : "default"} value={formatAmount(pendingUtang)} />
        <MetricCard icon={UserRoundCheck} label="Active shift/staff" value={activeShifts.length.toLocaleString("en-PH")} />
        <MetricCard icon={ReceiptText} label="Cash variance alerts" tone={varianceAlerts.length ? "danger" : "default"} value={varianceAlerts.length.toLocaleString("en-PH")} />
      </section>

      <section className="grid gap-5 xl:grid-cols-[1fr_24rem]">
        <Card className="rounded-3xl p-0 shadow-none">
          <PanelHeader
            actionHref="/front-desk"
            actionLabel="Open Front Desk"
            subtitle="Latest check-ins and walk-ins recorded today."
            title="Recent entries"
          />
          {recentEntries.length ? (
            <div className="divide-y divide-ledger-line">
              {recentEntries.map((entry) => {
                const member = relatedOne(entry.members);
                const payment = relatedOne(entry.payments);
                const checkedBy = relatedOne(entry.checked_by_profile);
                const personName = member?.full_name ?? entry.guest_name ?? "Guest entry";

                return (
                  <div className="grid gap-3 px-5 py-4 md:grid-cols-[1fr_auto]" key={entry.id}>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="break-words font-black text-ledger-ink">{personName}</p>
                        <span className="text-sm font-bold text-ledger-moss">
                          {member?.member_code ?? "Walk-in"}
                        </span>
                      </div>
                      <p className="mt-1 text-sm font-bold text-ledger-moss">
                        {labelize(entry.settlement_type)} · {labelize(entry.status)} · by {checkedBy?.full_name ?? "Unknown staff"}
                      </p>
                      {entry.notes ? (
                        <p className="mt-1 text-sm font-bold leading-6 text-ledger-moss">{entry.notes}</p>
                      ) : null}
                    </div>
                    <div className="text-left md:text-right">
                      <p className="font-black text-ledger-ink">{formatAmount(payment?.amount)}</p>
                      <p className="mt-1 text-xs font-black uppercase tracking-[0.14em] text-ledger-moss">
                        {timeFormatter.format(new Date(entry.entered_at))}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState title="No entries today" body="Check-ins and walk-ins will appear here as staff records them." />
          )}
        </Card>

        <div className="space-y-5">
          <Card className="rounded-3xl p-0 shadow-none">
            <PanelHeader
              actionHref="/shifts"
              actionLabel="Open Shifts"
              subtitle="Who is currently collecting money."
              title="Active shift/staff"
            />
            {activeShifts.length ? (
              <div className="divide-y divide-ledger-line">
                {activeShifts.map((shift) => {
                  const staffProfile = relatedOne(shift.staff_profiles);
                  const staff = relatedOne(staffProfile?.profiles);

                  return (
                    <div className="px-5 py-4" key={shift.id}>
                      <p className="font-black text-ledger-ink">{staff?.full_name ?? "Staff member"}</p>
                      <p className="mt-1 text-sm font-bold text-ledger-moss">
                        {staffProfile?.employee_code ?? staffProfile?.job_title ?? "No staff code"} · started {timeFormatter.format(new Date(shift.opened_at))}
                      </p>
                      <p className="mt-2 text-sm font-black text-ledger-ink">
                        Expected cash {formatAmount(shift.expected_cash ?? shift.opening_cash)}
                      </p>
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyState title="No active shifts" body="No staff member is currently marked as collecting money." compact />
            )}
          </Card>

          <Card className="rounded-3xl p-0 shadow-none">
            <PanelHeader
              actionHref="/shifts"
              actionLabel="Review"
              subtitle="Closed shifts with non-zero cash differences today."
              title="Cash variance alerts"
            />
            {varianceAlerts.length ? (
              <div className="divide-y divide-ledger-line">
                {varianceAlerts.map((shift) => {
                  const staffProfile = relatedOne(shift.staff_profiles);
                  const staff = relatedOne(staffProfile?.profiles);

                  return (
                    <div className="px-5 py-4" key={shift.id}>
                      <p className="font-black text-red-700">{formatAmount(shift.cash_difference)}</p>
                      <p className="mt-1 text-sm font-bold text-ledger-moss">
                        {staff?.full_name ?? "Staff member"} · closed {shift.closed_at ? timeFormatter.format(new Date(shift.closed_at)) : "today"}
                      </p>
                      {shift.variance_note ? (
                        <p className="mt-2 text-sm font-bold leading-6 text-ledger-moss">{shift.variance_note}</p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyState title="No variance alerts" body="Closed shifts today have no cash variance." compact />
            )}
          </Card>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <Card className="rounded-3xl p-0 shadow-none">
          <PanelHeader
            actionHref="/exceptions"
            actionLabel="Open Exceptions"
            subtitle="Recent unresolved exception records."
            title="Recent exceptions"
          />
          {recentExceptions.length ? (
            <div className="divide-y divide-ledger-line">
              {recentExceptions.map((item) => {
                const member = relatedOne(item.members);
                const creator = relatedOne(item.created_by_profile);
                const personName = member?.full_name ?? item.person_name ?? "Unassigned person";

                return (
                  <div className="px-5 py-4" key={item.id}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="break-words font-black text-ledger-ink">{personName}</p>
                      <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-black uppercase text-amber-900">
                        {labelize(item.status)}
                      </span>
                    </div>
                    <p className="mt-1 text-sm font-black text-ledger-ink">
                      {labelize(item.exception_type)} · {item.amount === null ? "No amount" : formatAmount(item.amount)}
                    </p>
                    <p className="mt-1 text-sm font-bold leading-6 text-ledger-moss">{item.reason}</p>
                    <p className="mt-2 text-xs font-black uppercase tracking-[0.14em] text-ledger-moss">
                      {creator?.full_name ?? "Unknown staff"} · {dateTimeFormatter.format(new Date(item.created_at))}
                    </p>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState title="No recent exceptions" body="Unresolved exceptions will appear here for management review." />
          )}
        </Card>

        <Card className="rounded-3xl p-0 shadow-none">
          <PanelHeader
            actionHref="/payments/gcash-review"
            actionLabel="Open GCash Review"
            subtitle="GCash proofs staff submitted or marked for follow-up."
            title="GCash payments needing review"
          />
          {gcashReviewItems.length ? (
            <div className="divide-y divide-ledger-line">
              {gcashReviewItems.map((proof) => {
                const payment = relatedOne(proof.payments);
                const member = relatedOne(payment?.members);
                const uploader = relatedOne(proof.uploaded_by_profile);

                return (
                  <div className="px-5 py-4" key={proof.id}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="break-words font-black text-ledger-ink">
                        {member?.full_name ?? proof.sender_name ?? "Walk-in GCash"}
                      </p>
                      <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-black uppercase text-amber-900">
                        {labelize(proof.proof_status)}
                      </span>
                    </div>
                    <p className="mt-1 text-sm font-black text-ledger-ink">
                      {formatAmount(payment?.amount)} · {labelize(payment?.purpose ?? "walk_in_entry")}
                    </p>
                    <p className="mt-1 text-sm font-bold text-ledger-moss">
                      Ref {proof.gcash_reference_number ?? "not provided"} · uploaded by {uploader?.full_name ?? "Unknown staff"}
                    </p>
                    <p className="mt-2 text-xs font-black uppercase tracking-[0.14em] text-ledger-moss">
                      {dateTimeFormatter.format(new Date(proof.created_at))}
                    </p>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState title="No GCash review items" body="Staff-checked, disputed, and follow-up GCash proofs will appear here." />
          )}
        </Card>
      </section>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  tone = "default",
  value,
}: {
  icon: typeof Users;
  label: string;
  tone?: "danger" | "default" | "warn";
  value: string;
}) {
  const toneClass =
    tone === "danger"
      ? "bg-red-100 text-red-800"
      : tone === "warn"
        ? "bg-amber-100 text-amber-900"
        : "bg-ledger-lime text-ledger-ink";

  return (
    <Card className="rounded-2xl p-5 shadow-none">
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm font-black uppercase tracking-[0.16em] text-ledger-moss">{label}</p>
        <span className={`flex size-10 shrink-0 items-center justify-center rounded-2xl ${toneClass}`}>
          <Icon aria-hidden="true" className="size-5" />
        </span>
      </div>
      <p className="mt-4 break-words font-[var(--font-heading)] text-3xl font-black text-ledger-ink sm:text-4xl">{value}</p>
    </Card>
  );
}

function PanelHeader({
  actionHref,
  actionLabel,
  subtitle,
  title,
}: {
  actionHref: string;
  actionLabel: string;
  subtitle: string;
  title: string;
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-ledger-line px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h3 className="font-[var(--font-heading)] text-2xl font-black text-ledger-ink">{title}</h3>
        <p className="mt-1 text-sm font-bold text-ledger-moss">{subtitle}</p>
      </div>
      <Link
        className="inline-flex min-h-10 items-center justify-center rounded-2xl bg-ledger-ink px-4 text-sm font-black text-ledger-paper transition hover:bg-ledger-moss"
        href={actionHref}
      >
        {actionLabel}
      </Link>
    </div>
  );
}

function EmptyState({
  body,
  compact = false,
  title,
}: {
  body: string;
  compact?: boolean;
  title: string;
}) {
  return (
    <div className={compact ? "px-5 py-8 text-center" : "px-5 py-14 text-center"}>
      <AlertTriangle aria-hidden="true" className="mx-auto size-9 text-ledger-moss" />
      <p className="mt-3 font-black text-ledger-ink">{title}</p>
      <p className="mt-1 text-sm font-bold leading-6 text-ledger-moss">{body}</p>
    </div>
  );
}
