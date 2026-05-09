import { AlertTriangle, ClipboardCheck, UserRoundCheck } from "lucide-react";

import { ExceptionForm } from "@/app/(app)/exceptions/exception-form";
import { ExceptionReviewControls } from "@/app/(app)/exceptions/exception-review-controls";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
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

const statusBadgeTone: Record<string, "active" | "warn" | "danger" | "neutral"> = {
  approved: "active",
  needs_review: "warn",
  pending: "warn",
  rejected: "danger",
  resolved: "neutral",
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
    <div className="page-enter space-y-6">
      <div className="grid gap-5 lg:grid-cols-[1fr_18rem]">
        <Card className="relative overflow-hidden">
          <div className="absolute -right-20 -top-24 size-72 rounded-full bg-amber-200/60 blur-3xl" />
          <div className="relative">
            <div className="flex size-14 items-center justify-center rounded-lg bg-n-ink text-white">
              <AlertTriangle aria-hidden="true" className="size-7" />
            </div>
            <p className="mt-7 text-xs font-semibold text-n-muted">
              Owner Review Queue
            </p>
            <h2 className="mt-3 text-xl font-bold leading-tight text-n-ink sm:text-2xl">
              Exceptions
            </h2>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-n-dim">
              Expired member overrides and unusual front-desk entries stay visible until management reviews them.
            </p>
          </div>
        </Card>

        <Card className="flex flex-col justify-between">
          <div>
            <p className="text-xs font-semibold text-n-muted">
              Pending
            </p>
            <p className="mt-3 text-5xl font-bold text-n-ink">
              {pendingCount.toLocaleString("en-PH")}
            </p>
          </div>
          <p className="mt-6 text-sm font-medium leading-6 text-n-dim">
            {roleLabels[profile.role]} access. {canReview ? "Approve, reject, or resolve review items." : "Create items for management review."}
          </p>
        </Card>
      </div>

      <Card>
        <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold text-n-muted">
              Front Desk Exception
            </p>
            <h3 className="mt-2 text-xl font-bold sm:text-2xl text-n-ink">
              Record a special case
            </h3>
          </div>
          <p className="text-sm font-medium text-n-dim">
            {hasActiveShift ? "Linked to your active shift" : "Start a shift before creating exceptions"}
          </p>
        </div>
        {hasActiveShift ? (
          <ExceptionForm entries={entryOptions} members={memberOptions} />
        ) : (
          <div className="rounded-lg border border-dashed border-n-border bg-n-hover px-4 py-8 text-center">
            <p className="font-bold text-n-ink">No active shift</p>
            <p className="mt-1 text-sm font-medium text-n-dim">
              Exceptions must be tied to the staff member and shift that recorded them.
            </p>
          </div>
        )}
      </Card>

      <Card className="p-0">
        <div className="flex items-center justify-between gap-4 border-b border-n-border px-5 py-4">
          <div>
            <h3 className="text-lg font-bold text-n-ink">
              Recent exception items
            </h3>
            <p className="mt-1 text-sm font-medium text-n-dim">
              Owner overrides created from expired member handling appear here.
            </p>
          </div>
          <ClipboardCheck aria-hidden="true" className="hidden size-6 text-n-muted sm:block" />
        </div>

        {exceptions.length ? (
          <div className="divide-y divide-n-border">
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
                      <UserRoundCheck aria-hidden="true" className="size-5 text-n-muted" />
                      <h4 className="break-words font-bold text-n-ink">
                        {personName}
                      </h4>
                      <span className="text-sm font-bold text-n-dim">
                        {member?.member_code ?? "Guest / non-member"}
                      </span>
                    </div>
                    <p className="mt-2 text-sm font-bold text-n-ink">
                      {labelize(exception.exception_type)} · {formatAmount(exception.amount)}
                    </p>
                    <p className="mt-1 text-sm font-medium leading-6 text-n-dim">
                      {exception.reason}
                    </p>
                    {exception.owner_note ? (
                      <p className="mt-2 rounded-lg bg-n-hover px-4 py-3 text-sm font-bold leading-6 text-n-ink">
                        {exception.owner_note}
                      </p>
                    ) : null}
                    <p className="mt-2 text-xs font-semibold text-n-muted">
                      Created by {creator?.full_name ?? "Unknown staff"} ·{" "}
                      {dateTimeFormatter.format(new Date(exception.created_at))}
                    </p>
                    <p className="mt-1 text-xs font-semibold text-n-muted">
                      Staff {staffOwner?.full_name ?? "Unknown"}{" "}
                      {staffProfile?.employee_code ? `· ${staffProfile.employee_code}` : ""} · Shift{" "}
                      {exception.shift_id.slice(0, 8)}
                      {reviewer ? ` · Reviewed by ${reviewer.full_name}` : ""}
                      {exception.entry_id ? ` · Entry ${exception.entry_id.slice(0, 8)}` : ""}
                    </p>
                  </div>
                  <div className="space-y-4 lg:text-right">
                    <StatusBadge
                      tone={statusBadgeTone[exception.status] ?? "neutral"}
                    >
                      {labelize(exception.status)}
                    </StatusBadge>
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
            <AlertTriangle aria-hidden="true" className="mx-auto size-10 text-n-muted" />
            <p className="mt-4 font-bold text-n-ink">No exceptions recorded</p>
            <p className="mt-1 text-sm font-medium text-n-dim">
              Owner override entries will appear here as pending review items.
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}
