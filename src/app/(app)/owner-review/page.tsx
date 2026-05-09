import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Clock3,
  DollarSign,
  Search,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { ReviewCard } from "@/app/(app)/owner-review/review-card";
import {
  type IssueType,
  issueTypeLabels,
  issueTypePriority,
  mapExceptionStatus,
  mapExceptionToIssueType,
  mapGcashProofStatus,
  mapShiftStatus,
  priorityOrder,
  type Priority,
  type ReviewItem,
  type SourceType,
  UTANG_THRESHOLD,
} from "@/app/(app)/owner-review/types";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { roleLabels, type AppRole } from "@/lib/auth/permissions";
import { requireModuleAccess } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";

type OwnerReviewPageProps = {
  searchParams?: Promise<{
    date?: string;
    priority?: string;
    q?: string;
    staff?: string;
    status?: string;
    type?: string;
  }>;
};

type RelatedMember = { full_name: string; member_code: string };
type RelatedProfile = { full_name: string };
type RelatedStaffProfile = {
  employee_code: string | null;
  profiles: RelatedProfile | RelatedProfile[] | null;
};

// --- Exception row type ---
type ExceptionRow = {
  amount: number | string | null;
  created_at: string;
  entry_id: string | null;
  exception_type: string;
  id: string;
  members: RelatedMember | RelatedMember[] | null;
  owner_note: string | null;
  person_name: string | null;
  reason: string;
  shift_id: string;
  staff_profiles: RelatedStaffProfile | RelatedStaffProfile[] | null;
  status: string;
};

// --- GCash proof row type ---
type PaymentRow = {
  amount: number | string;
  id: string;
  members: RelatedMember | RelatedMember[] | null;
  purpose: string;
  status: string;
};

type GcashProofRow = {
  created_at: string;
  gcash_reference_number: string | null;
  id: string;
  owner_note: string | null;
  proof_status: string;
  uploaded_by_profile: RelatedProfile | RelatedProfile[] | null;
};

// --- Walk-in balance row type ---
type BalanceRow = {
  amount: number | string;
  created_at: string;
  customer_name: string | null;
  id: string;
  member_id: string | null;
  members: RelatedMember | RelatedMember[] | null;
  note: string | null;
  paid_amount: number | string;
  shift_id: string | null;
  status: string;
};

// --- Shift row type ---
type ShiftRow = {
  cash_difference: number | string;
  closed_at: string | null;
  expected_cash: number | string;
  id: string;
  notes: string | null;
  opening_cash: number | string;
  staff_profiles: RelatedStaffProfile | RelatedStaffProfile[] | null;
  status: string;
};

type StaffOption = { full_name: string; id: string; role: AppRole };

const managementRoles = new Set<AppRole>(["owner", "admin", "manager"]);

function relatedOne<T>(value: T | T[] | null) {
  return Array.isArray(value) ? value[0] : value;
}

function getDateBounds(date: string) {
  const start = new Date(`${date}T00:00:00+08:00`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { end: end.toISOString(), start: start.toISOString() };
}

// --- Transform exceptions into ReviewItems ---
function transformExceptions(rows: ExceptionRow[]): ReviewItem[] {
  return rows.map((row) => {
    const member = relatedOne(row.members);
    const staffProfile = relatedOne(row.staff_profiles);
    const staffOwner = relatedOne(staffProfile?.profiles ?? null);
    const staffName = staffOwner?.full_name ?? staffProfile?.employee_code ?? "Unknown staff";
    const personName = member?.full_name ?? row.person_name ?? "Unknown person";

    const issueType = mapExceptionToIssueType(row.exception_type);

    return {
      amount: row.amount !== null ? Number(row.amount) : null,
      date: row.created_at,
      id: `exception_${row.id}`,
      issueType,
      memberCode: member?.member_code ?? null,
      note: row.owner_note,
      personName,
      priority: issueTypePriority[issueType],
      reason: row.reason,
      relatedPath: row.entry_id ? `/entry-reconciliation?entry=${row.entry_id}` : "/exceptions",
      shiftId: row.shift_id,
      sourceId: row.id,
      sourceType: "exception" as SourceType,
      staffName,
      status: mapExceptionStatus(row.status),
    };
  });
}

// --- Transform GCash proofs into ReviewItems ---
function transformGcashProofs(rows: GcashProofRow[]): ReviewItem[] {
  // Detect duplicate reference numbers
  const refMap = new Map<string, string[]>();
  for (const row of rows) {
    if (row.gcash_reference_number) {
      const ids = refMap.get(row.gcash_reference_number) ?? [];
      ids.push(row.id);
      refMap.set(row.gcash_reference_number, ids);
    }
  }
  const duplicateIds = new Set<string>();
  for (const ids of refMap.values()) {
    if (ids.length > 1) {
      for (const id of ids) duplicateIds.add(id);
    }
  }

  return rows.map((row) => {
    const uploadedBy = relatedOne(row.uploaded_by_profile);
    const isDuplicate = duplicateIds.has(row.id);

    let issueType: IssueType;
    if (row.proof_status === "rejected") {
      issueType = "gcash_rejected";
    } else if (row.proof_status === "follow_up") {
      issueType = "gcash_follow_up";
    } else if (isDuplicate) {
      issueType = "gcash_duplicate";
    } else if (row.proof_status === "awaiting_proof") {
      issueType = "gcash_missing_proof";
    } else {
      issueType = "gcash_pending_review";
    }

    const reason =
      row.proof_status === "awaiting_proof"
        ? "Staff recorded GCash payment but has not uploaded proof yet."
        : row.proof_status === "rejected"
          ? "GCash proof was rejected and needs resolution."
          : row.proof_status === "follow_up"
            ? "GCash proof flagged for follow-up."
            : isDuplicate
              ? `Duplicate GCash reference: ${row.gcash_reference_number ?? "unknown"}`
              : "GCash proof awaiting owner verification.";

    return {
      amount: null,
      date: row.created_at,
      id: `gcash_${row.id}`,
      issueType,
      memberCode: null,
      note: row.owner_note,
      personName: "GCash Proof",
      priority: issueTypePriority[issueType],
      reason,
      relatedPath: `/payments/gcash-review`,
      shiftId: null,
      sourceId: row.id,
      sourceType: "gcash_proof" as SourceType,
      staffName: uploadedBy?.full_name ?? "Unknown staff",
      status: mapGcashProofStatus(row.proof_status),
    };
  });
}

// --- Transform walk-in balances into ReviewItems ---
function transformBalances(rows: BalanceRow[]): ReviewItem[] {
  return rows
    .filter((row) => {
      const outstanding = Number(row.amount) - Number(row.paid_amount);
      return outstanding >= UTANG_THRESHOLD;
    })
    .map((row) => {
      const member = relatedOne(row.members);
      const personName = member?.full_name ?? row.customer_name ?? "Unknown customer";
      const outstanding = Number(row.amount) - Number(row.paid_amount);

      return {
        amount: outstanding,
        date: row.created_at,
        id: `balance_${row.id}`,
        issueType: "large_utang" as IssueType,
        memberCode: member?.member_code ?? null,
        note: row.note,
        personName,
        priority: "medium" as Priority,
        reason: `Outstanding balance of ₱${outstanding.toFixed(2)} from utang entry.${row.note ? ` ${row.note}` : ""}`,
        relatedPath: "/balances",
        shiftId: row.shift_id,
        sourceId: row.id,
        sourceType: "balance" as SourceType,
        staffName: "See entry",
        status: "open" as const,
      };
    });
}

// --- Transform shifts with variance into ReviewItems ---
function transformShifts(rows: ShiftRow[]): ReviewItem[] {
  return rows.map((row) => {
    const staffProfile = relatedOne(row.staff_profiles);
    const staffOwner = relatedOne(staffProfile?.profiles ?? null);
    const diff = Number(row.cash_difference);
    const absDiff = Math.abs(diff);
    const direction = diff > 0 ? "over" : "short";

    return {
      amount: absDiff,
      date: row.closed_at ?? row.status,
      id: `shift_${row.id}`,
      issueType: "cash_variance" as IssueType,
      memberCode: null,
      note: row.notes,
      personName: "Cash Variance",
      priority: "high" as Priority,
      reason: `Cash is ₱${absDiff.toFixed(2)} ${direction}. Expected ₱${Number(row.expected_cash).toFixed(2)}.`,
      relatedPath: "/shifts",
      shiftId: row.id,
      sourceId: row.id,
      sourceType: "shift" as SourceType,
      staffName: staffOwner?.full_name ?? staffProfile?.employee_code ?? "Unknown staff",
      status: mapShiftStatus(row.status),
    };
  });
}

// --- Filtering ---
function matchesSearch(item: ReviewItem, query: string) {
  const haystack = [
    item.personName,
    item.memberCode,
    item.staffName,
    item.reason,
    item.note,
    item.shiftId,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(query.toLowerCase());
}

function buildHref(params: Record<string, string | undefined>) {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) next.set(key, value);
  }
  const query = next.toString();
  return query ? `/owner-review?${query}` : "/owner-review";
}

// --- Filter options ---
const issueTypeOptions: Array<{ label: string; value: IssueType }> = Object.entries(issueTypeLabels).map(
  ([value, label]) => ({ label, value: value as IssueType }),
);

const priorityOptions: Array<{ label: string; value: Priority }> = [
  { label: "High", value: "high" },
  { label: "Medium", value: "medium" },
  { label: "Low", value: "low" },
];

const statusFilterOptions = [
  { label: "Needs Action", value: "open" },
  { label: "Approved / Verified", value: "approved" },
  { label: "Rejected", value: "rejected" },
  { label: "Resolved", value: "resolved" },
  { label: "Follow Up", value: "follow_up" },
];

export default async function OwnerReviewPage({ searchParams }: OwnerReviewPageProps) {
  const profile = await requireModuleAccess("/owner-review");

  if (!managementRoles.has(profile.role)) {
    redirect("/unauthorized?next=/owner-review");
  }

  const params = await searchParams;
  const filters = {
    date: params?.date?.trim() ?? "",
    priority: params?.priority?.trim() ?? "",
    q: params?.q?.trim() ?? "",
    staff: params?.staff?.trim() ?? "",
    status: params?.status?.trim() ?? "",
    type: params?.type?.trim() ?? "",
  };

  const supabase = await createClient();

  const [exceptionsResult, gcashResult, balancesResult, shiftsResult, staffResult] =
    await Promise.all([
      supabase
        .from("exceptions")
        .select(
          "id, member_id, person_name, entry_id, shift_id, exception_type, reason, amount, status, owner_note, created_at, members(full_name, member_code), staff_profiles!exceptions_staff_profile_id_fkey(employee_code, profiles!staff_profiles_profile_id_fkey(full_name))",
        )
        .in("status", ["needs_review", "pending"])
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("gcash_proofs")
        .select(
          "id, gcash_reference_number, proof_status, owner_note, created_at, uploaded_by_profile:profiles!gcash_proofs_uploaded_by_fkey(full_name)",
        )
        .in("proof_status", ["for_review", "awaiting_proof", "rejected", "follow_up"])
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("walk_in_balances")
        .select(
          "id, customer_name, member_id, amount, paid_amount, note, status, created_at, shift_id, members(full_name, member_code)",
        )
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("shifts")
        .select(
          "id, opening_cash, expected_cash, cash_difference, status, closed_at, notes, staff_profiles!shifts_staff_profile_id_fkey(employee_code, profiles!staff_profiles_profile_id_fkey(full_name))",
        )
        .neq("cash_difference", 0)
        .in("status", ["closed"])
        .order("closed_at", { ascending: false })
        .limit(50),
      supabase
        .from("profiles")
        .select("id, full_name, role")
        .in("role", ["owner", "admin", "manager", "front_desk"])
        .eq("status", "active")
        .order("full_name", { ascending: true }),
    ]);

  const error =
    exceptionsResult.error ??
    gcashResult.error ??
    balancesResult.error ??
    shiftsResult.error ??
    staffResult.error;

  if (error) {
    throw new Error(error.message);
  }

  // Build unified review items
  const allItems: ReviewItem[] = [
    ...transformExceptions((exceptionsResult.data ?? []) as ExceptionRow[]),
    ...transformGcashProofs((gcashResult.data ?? []) as GcashProofRow[]),
    ...transformBalances((balancesResult.data ?? []) as BalanceRow[]),
    ...transformShifts((shiftsResult.data ?? []) as ShiftRow[]),
  ];

  const staffOptions = (staffResult.data ?? []) as StaffOption[];

  // Apply filters
  const filtered = allItems.filter((item) => {
    if (filters.status && item.status !== filters.status) return false;
    if (filters.type && item.issueType !== filters.type) return false;
    if (filters.priority && item.priority !== filters.priority) return false;
    if (filters.staff && item.staffName !== staffOptions.find((s) => s.id === filters.staff)?.full_name)
      return false;
    if (filters.date) {
      const bounds = getDateBounds(filters.date);
      const itemDate = new Date(item.date).toISOString();
      if (itemDate < bounds.start || itemDate >= bounds.end) return false;
    }
    if (filters.q && !matchesSearch(item, filters.q)) return false;
    return true;
  });

  // Sort by priority then date
  filtered.sort((a, b) => {
    const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (priorityDiff !== 0) return priorityDiff;
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });

  // Summary counts
  const highCount = filtered.filter((i) => i.priority === "high").length;
  const mediumCount = filtered.filter((i) => i.priority === "medium").length;
  const lowCount = filtered.filter((i) => i.priority === "low").length;
  const openCount = filtered.filter((i) => i.status === "open").length;
  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  return (
    <div className="page-enter space-y-6">
      {/* Header */}
      <div className="grid gap-5 lg:grid-cols-[1fr_19rem]">
        <Card className="relative overflow-hidden">
          <div className="relative">
            <div className="flex size-14 items-center justify-center rounded-lg bg-n-ink text-white">
              <ClipboardList aria-hidden="true" className="size-7" />
            </div>
            <p className="mt-7 text-xs font-semibold text-n-dim">Owner Review</p>
            <h2 className="mt-3 text-xl font-bold leading-tight text-n-ink sm:text-2xl">
              Review Queue
            </h2>
            <p className="mt-5 max-w-3xl text-lg leading-8 text-n-dim">
              Grey-area items that need your attention: cash variances, GCash issues, unpaid utang, expired member entries, and exceptions.
            </p>
          </div>
        </Card>

        <Card className="flex flex-col justify-between">
          <div>
            <p className="text-xs font-semibold text-n-dim">Needs Action</p>
            <p className="mt-3 text-5xl font-bold text-n-ink">
              {openCount.toLocaleString("en-PH")}
            </p>
          </div>
          <p className="mt-6 text-sm font-medium leading-6 text-n-dim">
            {roleLabels[profile.role]} access. {activeFilterCount ? `${activeFilterCount} filter${activeFilterCount === 1 ? "" : "s"} active.` : "No filters active."}
          </p>
        </Card>
      </div>

      {/* Priority summary */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <AlertTriangle aria-hidden="true" className="size-6 text-red-600" />
          <p className="mt-4 text-xs font-semibold text-n-dim">High Priority</p>
          <p className="mt-2 text-xl font-bold sm:text-2xl text-n-ink">
            {highCount.toLocaleString("en-PH")}
          </p>
        </Card>
        <Card>
          <Clock3 aria-hidden="true" className="size-6 text-amber-600" />
          <p className="mt-4 text-xs font-semibold text-n-dim">Medium Priority</p>
          <p className="mt-2 text-xl font-bold sm:text-2xl text-n-ink">
            {mediumCount.toLocaleString("en-PH")}
          </p>
        </Card>
        <Card>
          <ShieldCheck aria-hidden="true" className="size-6 text-green-600" />
          <p className="mt-4 text-xs font-semibold text-n-dim">Low Priority</p>
          <p className="mt-2 text-xl font-bold sm:text-2xl text-n-ink">
            {lowCount.toLocaleString("en-PH")}
          </p>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <form className="grid gap-4" action="/owner-review">
          <div className="grid gap-3 lg:grid-cols-[1.5fr_repeat(5,minmax(0,1fr))]">
            <label className="space-y-2">
              <span className="text-sm font-bold text-n-ink">Search</span>
              <span className="relative block">
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-n-dark"
                />
                <Input
                  className="pl-11"
                  name="q"
                  placeholder="Name, reason, note"
                  defaultValue={filters.q}
                />
              </span>
            </label>
            <label className="space-y-2">
              <span className="text-sm font-bold text-n-ink">Date</span>
              <Input name="date" type="date" defaultValue={filters.date} />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-bold text-n-ink">Priority</span>
              <Select name="priority" defaultValue={filters.priority}>
                <option value="">All priorities</option>
                {priorityOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </Select>
            </label>
            <label className="space-y-2">
              <span className="text-sm font-bold text-n-ink">Type</span>
              <Select name="type" defaultValue={filters.type}>
                <option value="">All types</option>
                {issueTypeOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </Select>
            </label>
            <label className="space-y-2">
              <span className="text-sm font-bold text-n-ink">Staff</span>
              <Select name="staff" defaultValue={filters.staff}>
                <option value="">All staff</option>
                {staffOptions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name}
                  </option>
                ))}
              </Select>
            </label>
            <label className="space-y-2">
              <span className="text-sm font-bold text-n-ink">Status</span>
              <Select name="status" defaultValue={filters.status}>
                <option value="">All statuses</option>
                {statusFilterOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </Select>
            </label>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3">
            <Link
              className="inline-flex min-h-11 items-center justify-center rounded-lg border border-n-border bg-white/75 px-5 text-sm font-bold text-n-ink transition hover:border-n-dark"
              href="/owner-review"
            >
              Clear
            </Link>
            <button
              className="inline-flex min-h-11 items-center justify-center rounded-lg bg-n-ink px-5 text-sm font-bold text-white transition hover:bg-n-dark"
              type="submit"
            >
              Apply Filters
            </button>
          </div>
        </form>
      </Card>

      {/* Review cards */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-n-ink">Review Items</h3>
            <p className="mt-1 text-sm font-medium text-n-dim">
              {filtered.length} item{filtered.length === 1 ? "" : "s"} · Sorted by priority then date
            </p>
          </div>
          {openCount > 0 && filtered.length > 0 ? (
            <DollarSign aria-hidden="true" className="hidden size-6 text-n-dark sm:block" />
          ) : null}
        </div>

        {filtered.length > 0 ? (
          filtered.map((item) => <ReviewCard item={item} key={item.id} />)
        ) : (
          <Card>
            <div className="py-14 text-center">
              <CheckCircle2 aria-hidden="true" className="mx-auto size-10 text-green-600" />
              <p className="mt-4 font-bold text-n-ink">
                {allItems.length === 0 ? "Nothing needs review" : "No items match filters"}
              </p>
              <p className="mt-1 text-sm font-medium text-n-dim">
                {allItems.length === 0
                  ? "All clear — no grey-area items pending."
                  : "Try adjusting your filters or clear them to see all items."}
              </p>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
