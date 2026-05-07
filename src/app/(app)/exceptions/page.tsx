import { AlertTriangle, ClipboardCheck, UserRoundCheck } from "lucide-react";

import { ExceptionForm } from "@/app/(app)/exceptions/exception-form";
import { ExceptionReviewControls } from "@/app/(app)/exceptions/exception-review-controls";
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

type RelatedStaffProfile = {
  employee_code: string | null;
  profiles: RelatedProfile | RelatedProfile[] | null;
};

type ExceptionRow = {
  amount: number | string | null;
  id: string;
  entry_id: string | null;
  exception_type: string;
  owner_note: string | null;
  person_name: string | null;
  reason: string;
  shift_id: string;
  status: string;
  created_at: string;
  members: RelatedMember | RelatedMember[] | null;
  created_by_profile: RelatedProfile | RelatedProfile[] | null;
  reviewed_by_profile: RelatedProfile | RelatedProfile[] | null;
  staff_profiles: RelatedStaffProfile | RelatedStaffProfile[] | null;
};

const statusStyles: Record<string, string> = {
  approved: "bg-green-100 text-green-800",
  needs_review: "bg-amber-100 text-amber-900",
  pending: "bg-amber-100 text-amber-900",
  rejected: "bg-red-100 text-red-800",
  resolved: "bg-blue-100 text-blue-800",
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

function relatedOne<T>(value: T | T[] | null) {
  return Array.isArray(value) ? value[0] : value;
}

function labelize(value: string) {
  return value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatAmount(value: number | string | null) {
  if (value === null) {
    return "No amount";
  }

  return pesoFormatter.format(Number(value));
}

export default async function ExceptionsPage() {
  const profile = await requireModuleAccess("/exceptions");
  const supabase = await createClient();
  const canReview = managementRoles.has(profile.role);
  const [
    exceptionsResult,
    membersResult,
    entriesResult,
    activeShiftResult,
  ] = await Promise.all([
    supabase
      .from("exceptions")
      .select(
        "id, member_id, person_name, entry_id, shift_id, exception_type, reason, amount, status, owner_note, created_at, members(full_name, member_code), created_by_profile:profiles!exceptions_created_by_fkey(full_name), reviewed_by_profile:profiles!exceptions_reviewed_by_fkey(full_name), staff_profiles!exceptions_staff_profile_id_fkey(employee_code, profiles!staff_profiles_profile_id_fkey(full_name))",
      )
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("members")
      .select("id, full_name, member_code")
      .order("full_name", { ascending: true })
      .limit(100),
    supabase
      .from("entries")
      .select("id, guest_name, entered_at, settlement_type, members(full_name, member_code)")
      .eq("checked_in_by", profile.id)
      .order("entered_at", { ascending: false })
      .limit(50),
    supabase
      .from("shifts")
      .select("id")
      .eq("opened_by", profile.id)
      .eq("status", "open")
      .is("closed_at", null)
      .order("opened_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const error =
    exceptionsResult.error ??
    membersResult.error ??
    entriesResult.error ??
    activeShiftResult.error;

  if (error) {
    throw new Error(error.message);
  }

  const exceptions = (exceptionsResult.data ?? []) as ExceptionRow[];
  const pendingCount = exceptions.filter((item) => item.status === "needs_review" || item.status === "pending").length;
  const memberOptions = (membersResult.data ?? []).map((member) => ({
    id: member.id,
    label: `${member.full_name} - ${member.member_code}`,
  }));
  const entryOptions = (entriesResult.data ?? []).map((entry) => {
    const member = relatedOne(entry.members as RelatedMember | RelatedMember[] | null);
    const name = member?.full_name ?? entry.guest_name ?? "Walk-in guest";

    return {
      id: entry.id,
      label: `${name} - ${labelize(entry.settlement_type)} - ${dateTimeFormatter.format(new Date(entry.entered_at))}`,
    };
  });
  const hasActiveShift = Boolean(activeShiftResult.data);

  return (
    <div className="ledger-rise space-y-6">
      <div className="grid gap-5 lg:grid-cols-[1fr_18rem]">
        <Card className="relative overflow-hidden rounded-3xl">
          <div className="absolute -right-20 -top-24 size-72 rounded-full bg-amber-200/60 blur-3xl" />
          <div className="relative">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-ledger-ink text-ledger-lime">
              <AlertTriangle aria-hidden="true" className="size-7" />
            </div>
            <p className="mt-7 text-sm font-black uppercase tracking-[0.24em] text-ledger-moss">
              Owner Review Queue
            </p>
            <h2 className="mt-3 font-[var(--font-heading)] text-4xl font-black leading-tight text-ledger-ink sm:text-6xl">
              Exceptions
            </h2>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-ledger-moss">
              Expired member overrides and unusual front-desk entries stay visible until management reviews them.
            </p>
          </div>
        </Card>

        <Card className="flex flex-col justify-between rounded-3xl shadow-none">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.18em] text-ledger-moss">
              Pending
            </p>
            <p className="mt-3 font-[var(--font-heading)] text-5xl font-black text-ledger-ink">
              {pendingCount.toLocaleString("en-PH")}
            </p>
          </div>
          <p className="mt-6 text-sm font-bold leading-6 text-ledger-moss">
            {roleLabels[profile.role]} access. {canReview ? "Approve, reject, or resolve review items." : "Create items for management review."}
          </p>
        </Card>
      </div>

      <Card className="rounded-3xl shadow-none">
        <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.18em] text-ledger-moss">
              Front Desk Exception
            </p>
            <h3 className="mt-2 font-[var(--font-heading)] text-3xl font-black text-ledger-ink">
              Record a special case
            </h3>
          </div>
          <p className="text-sm font-bold text-ledger-moss">
            {hasActiveShift ? "Linked to your active shift" : "Start a shift before creating exceptions"}
          </p>
        </div>
        {hasActiveShift ? (
          <ExceptionForm entries={entryOptions} members={memberOptions} />
        ) : (
          <div className="rounded-2xl border border-dashed border-ledger-line bg-ledger-paper/70 px-4 py-8 text-center">
            <p className="font-black text-ledger-ink">No active shift</p>
            <p className="mt-1 text-sm font-bold text-ledger-moss">
              Exceptions must be tied to the staff member and shift that recorded them.
            </p>
          </div>
        )}
      </Card>

      <Card className="rounded-3xl p-0 shadow-none">
        <div className="flex items-center justify-between gap-4 border-b border-ledger-line px-5 py-4">
          <div>
            <h3 className="font-[var(--font-heading)] text-2xl font-black text-ledger-ink">
              Recent exception items
            </h3>
            <p className="mt-1 text-sm font-bold text-ledger-moss">
              Owner overrides created from expired member handling appear here.
            </p>
          </div>
          <ClipboardCheck aria-hidden="true" className="hidden size-6 text-ledger-moss sm:block" />
        </div>

        {exceptions.length ? (
          <div className="divide-y divide-ledger-line">
            {exceptions.map((exception) => {
              const member = relatedOne(exception.members);
              const creator = relatedOne(exception.created_by_profile);
              const reviewer = relatedOne(exception.reviewed_by_profile);
              const staffProfile = relatedOne(exception.staff_profiles);
              const staffOwner = relatedOne(staffProfile?.profiles ?? null);
              const personName = member?.full_name ?? exception.person_name ?? "Unassigned person";

              return (
                <div className="grid gap-4 px-5 py-4 lg:grid-cols-[1fr_22rem]" key={exception.id}>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <UserRoundCheck aria-hidden="true" className="size-5 text-ledger-moss" />
                      <h4 className="break-words font-black text-ledger-ink">
                        {personName}
                      </h4>
                      <span className="text-sm font-bold text-ledger-moss">
                        {member?.member_code ?? "Guest / non-member"}
                      </span>
                    </div>
                    <p className="mt-2 text-sm font-black text-ledger-ink">
                      {labelize(exception.exception_type)} · {formatAmount(exception.amount)}
                    </p>
                    <p className="mt-1 text-sm font-bold leading-6 text-ledger-moss">
                      {exception.reason}
                    </p>
                    {exception.owner_note ? (
                      <p className="mt-2 rounded-2xl bg-ledger-lime/45 px-4 py-3 text-sm font-bold leading-6 text-ledger-ink">
                        {exception.owner_note}
                      </p>
                    ) : null}
                    <p className="mt-2 text-xs font-black uppercase tracking-[0.14em] text-ledger-moss">
                      Created by {creator?.full_name ?? "Unknown staff"} ·{" "}
                      {dateTimeFormatter.format(new Date(exception.created_at))}
                    </p>
                    <p className="mt-1 text-xs font-black uppercase tracking-[0.14em] text-ledger-moss">
                      Staff {staffOwner?.full_name ?? "Unknown"}{" "}
                      {staffProfile?.employee_code ? `· ${staffProfile.employee_code}` : ""} · Shift{" "}
                      {exception.shift_id.slice(0, 8)}
                      {reviewer ? ` · Reviewed by ${reviewer.full_name}` : ""}
                      {exception.entry_id ? ` · Entry ${exception.entry_id.slice(0, 8)}` : ""}
                    </p>
                  </div>
                  <div className="space-y-4 lg:text-right">
                    <span
                      className={`inline-flex h-8 items-center rounded-full px-3 text-xs font-black uppercase ${
                        statusStyles[exception.status] ?? "bg-slate-200 text-slate-700"
                      }`}
                    >
                      {labelize(exception.status)}
                    </span>
                    {canReview ? (
                      <ExceptionReviewControls
                        exceptionId={exception.id}
                        initialNote={exception.owner_note}
                        status={exception.status}
                      />
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="px-5 py-14 text-center">
            <AlertTriangle aria-hidden="true" className="mx-auto size-10 text-ledger-moss" />
            <p className="mt-4 font-black text-ledger-ink">No exceptions recorded</p>
            <p className="mt-1 text-sm font-bold text-ledger-moss">
              Owner override entries will appear here as pending review items.
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}
