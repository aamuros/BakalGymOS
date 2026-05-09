import {
  AlertTriangle,
  BadgeCheck,
  ClipboardList,
  Clock3,
  Search,
  ShieldCheck,
  UserRoundCheck,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { roleLabels, type AppRole } from "@/lib/auth/permissions";
import { requireModuleAccess } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

type EntryReconciliationPageProps = {
  searchParams?: Promise<{
    date?: string;
    entry?: string;
    method?: string;
    q?: string;
    staff?: string;
    status?: string;
    type?: string;
  }>;
};

type RelatedMember = {
  email: string | null;
  full_name: string;
  member_code: string;
  phone: string | null;
  status: string;
};

type RelatedPayment = {
  amount: number | string;
  paid_at: string | null;
  payment_type: "cash" | "gcash" | "other";
  purpose: string;
  reference_number: string | null;
  status: string;
};

type RelatedException = {
  amount: number | string | null;
  exception_type: string;
  reason: string;
  owner_note: string | null;
  resolution_notes: string | null;
  status: string;
};

type RelatedPlan = {
  name: string;
};

type RelatedSubscription = {
  ends_at: string;
  entries_used: number;
  starts_at: string;
  status: string;
  membership_plans: RelatedPlan | RelatedPlan[] | null;
};

type RelatedProfile = {
  full_name: string;
};

type RelatedStaffProfile = {
  employee_code: string | null;
  job_title: string | null;
  profiles: RelatedProfile | RelatedProfile[] | null;
};

type RelatedShift = {
  closed_at: string | null;
  id: string;
  opened_at: string;
  status: string;
  staff_profiles: RelatedStaffProfile | RelatedStaffProfile[] | null;
};

type EntryRow = {
  checked_in_by: string | null;
  checked_by_profile: RelatedProfile | RelatedProfile[] | null;
  created_at: string;
  entered_at: string;
  exception_id: string | null;
  exceptions: RelatedException | RelatedException[] | null;
  guest_name: string | null;
  id: string;
  member_id: string | null;
  members: RelatedMember | RelatedMember[] | null;
  notes: string | null;
  payment_id: string | null;
  payments: RelatedPayment | RelatedPayment[] | null;
  settlement_type: string;
  shift_id: string | null;
  shifts: RelatedShift | RelatedShift[] | null;
  status: string;
  subscription_id: string | null;
  member_subscriptions: RelatedSubscription | RelatedSubscription[] | null;
};

type StaffOption = {
  full_name: string;
  id: string;
  role: AppRole;
};

type ReconciliationStatus =
  | "active_member"
  | "paid_walk_in"
  | "renewed_member"
  | "pending_payment"
  | "exception"
  | "needs_review"
  | "blocked";

const managementRoles = new Set<AppRole>(["owner", "admin", "manager"]);

const statusOptions: Array<{ label: string; value: ReconciliationStatus }> = [
  { label: "Active Member", value: "active_member" },
  { label: "Paid Walk-In", value: "paid_walk_in" },
  { label: "Renewed Member", value: "renewed_member" },
  { label: "Utang / Pay later", value: "pending_payment" },
  { label: "Exception", value: "exception" },
  { label: "Needs Review", value: "needs_review" },
  { label: "Blocked", value: "blocked" },
];

const entryTypeOptions = ["active_member", "membership", "cash", "gcash", "pending", "exception"];
const paymentMethodOptions = ["cash", "gcash", "other", "none"];

const statusToneMap: Record<ReconciliationStatus, "active" | "warn" | "danger" | "neutral"> = {
  active_member: "active",
  blocked: "danger",
  exception: "warn",
  needs_review: "warn",
  paid_walk_in: "active",
  pending_payment: "warn",
  renewed_member: "active",
};

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

const dateFormatter = new Intl.DateTimeFormat("en-PH", {
  dateStyle: "medium",
  timeZone: "Asia/Manila",
});

function relatedOne<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function labelize(value: string) {
  return value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatAmount(value: number | string | null | undefined) {
  if (value === null || value === undefined) {
    return "No amount";
  }

  return pesoFormatter.format(Number(value));
}

function getDateBounds(date: string) {
  const start = new Date(`${date}T00:00:00+08:00`);
  const end = new Date(start);

  end.setUTCDate(end.getUTCDate() + 1);

  return {
    end: end.toISOString(),
    start: start.toISOString(),
  };
}

function getPersonName(entry: EntryRow) {
  const member = relatedOne(entry.members);

  return member?.full_name ?? entry.guest_name ?? "Unknown person";
}

function getStaffName(entry: EntryRow) {
  return relatedOne(entry.checked_by_profile)?.full_name ?? "Unknown staff";
}

function getShiftStaff(entry: EntryRow) {
  const shift = relatedOne(entry.shifts);
  const staffProfile = relatedOne(shift?.staff_profiles);
  const staffOwner = relatedOne(staffProfile?.profiles);

  return staffOwner?.full_name ?? staffProfile?.employee_code ?? "Unassigned shift";
}

function getReconciliationStatus(entry: EntryRow): ReconciliationStatus {
  const payment = relatedOne(entry.payments);
  const exception = relatedOne(entry.exceptions);

  if (entry.status === "voided") {
    return "blocked";
  }

  if (
    entry.status === "needs_review" ||
    entry.status === "gcash_pending_review" ||
    exception?.status === "needs_review" ||
    exception?.status === "pending"
  ) {
    return "needs_review";
  }

  if (entry.settlement_type === "exception" || entry.exception_id || exception) {
    return "exception";
  }

  if (
    entry.settlement_type === "pending" ||
    payment?.status === "pending" ||
    payment?.status === "awaiting_proof"
  ) {
    return "pending_payment";
  }

  if (payment?.purpose === "membership_renewal" || payment?.purpose === "membership_purchase") {
    return "renewed_member";
  }

  if (entry.settlement_type === "cash" || entry.settlement_type === "gcash") {
    return "paid_walk_in";
  }

  return "active_member";
}

function getAllowedReason(entry: EntryRow) {
  const payment = relatedOne(entry.payments);
  const exception = relatedOne(entry.exceptions);
  const subscription = relatedOne(entry.member_subscriptions);
  const plan = relatedOne(subscription?.membership_plans);
  const status = getReconciliationStatus(entry);

  if (status === "active_member") {
    return subscription
      ? `Allowed by active ${plan?.name ?? "membership"} from ${dateFormatter.format(new Date(`${subscription.starts_at}T00:00:00+08:00`))} to ${dateFormatter.format(new Date(`${subscription.ends_at}T00:00:00+08:00`))}.`
      : "Allowed as a member entry linked to a subscription.";
  }

  if (status === "paid_walk_in") {
    return payment
      ? `Allowed after ${formatAmount(payment.amount)} ${labelize(payment.payment_type)} payment marked ${labelize(payment.status)}.`
      : "Allowed as a paid walk-in entry.";
  }

  if (status === "renewed_member") {
    return payment
      ? `Allowed after ${labelize(payment.purpose)} payment of ${formatAmount(payment.amount)}.`
      : "Allowed through a membership renewal flow.";
  }

  if (status === "pending_payment") {
    return payment
      ? `Allowed with payment still marked ${labelize(payment.status)} for ${formatAmount(payment.amount)}.`
      : "Allowed with pending/utang settlement recorded for owner follow-up.";
  }

  if (status === "needs_review") {
    return exception
      ? `Allowed through ${labelize(exception.exception_type)} and awaiting review: ${exception.reason}`
      : "Allowed, but the entry is still marked for review.";
  }

  if (status === "exception") {
    return exception
      ? `Allowed by exception: ${exception.reason}`
      : "Allowed through an exception entry.";
  }

  return "Entry was blocked or voided and should not count as admitted access.";
}

function matchesSearch(entry: EntryRow, query: string) {
  const member = relatedOne(entry.members);
  const payment = relatedOne(entry.payments);
  const exception = relatedOne(entry.exceptions);
  const haystack = [
    entry.id,
    getPersonName(entry),
    member?.member_code,
    member?.phone,
    getStaffName(entry),
    entry.notes,
    payment?.reference_number,
    exception?.reason,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(query.toLowerCase());
}

function buildHref(params: Record<string, string | undefined>, entryId?: string) {
  const next = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value) {
      next.set(key, value);
    }
  }

  if (entryId) {
    next.set("entry", entryId);
  }

  const query = next.toString();

  return query ? `/entry-reconciliation?${query}` : "/entry-reconciliation";
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-n-hover p-4">
      <p className="text-xs font-semibold text-n-dim">{label}</p>
      <p className="mt-1 break-words text-sm font-bold text-n-ink">{value}</p>
    </div>
  );
}

export default async function EntryReconciliationPage({ searchParams }: EntryReconciliationPageProps) {
  const profile = await requireModuleAccess("/entry-reconciliation");

  if (!managementRoles.has(profile.role)) {
    redirect("/unauthorized?next=/entry-reconciliation");
  }

  const params = await searchParams;
  const filters = {
    date: params?.date?.trim() ?? "",
    method: params?.method?.trim() ?? "",
    q: params?.q?.trim() ?? "",
    staff: params?.staff?.trim() ?? "",
    status: params?.status?.trim() ?? "",
    type: params?.type?.trim() ?? "",
  };
  const selectedEntryId = params?.entry?.trim();
  const supabase = await createClient();
  let entriesQuery = supabase
    .from("entries")
    .select(
      "id, member_id, guest_name, entered_at, checked_in_by, shift_id, settlement_type, subscription_id, payment_id, exception_id, status, notes, created_at, members(full_name, member_code, phone, email, status), checked_by_profile:profiles!entries_checked_in_by_fkey(full_name), payments(amount, payment_type, purpose, status, paid_at, reference_number), exceptions!entries_exception_id_fkey(exception_type, reason, amount, status, owner_note, resolution_notes), member_subscriptions(starts_at, ends_at, status, entries_used, membership_plans(name)), shifts!entries_shift_id_fkey(id, opened_at, closed_at, status, staff_profiles!shifts_staff_profile_id_fkey(employee_code, job_title, profiles!staff_profiles_profile_id_fkey(full_name)))",
    )
    .order("entered_at", { ascending: false });

  if (filters.date) {
    const bounds = getDateBounds(filters.date);
    entriesQuery = entriesQuery.gte("entered_at", bounds.start).lt("entered_at", bounds.end);
  }

  if (filters.staff) {
    entriesQuery = entriesQuery.eq("checked_in_by", filters.staff);
  }

  if (filters.type) {
    entriesQuery = entriesQuery.eq("settlement_type", filters.type);
  }

  if (filters.method === "none") {
    entriesQuery = entriesQuery.is("payment_id", null);
  }

  const [entriesResult, staffResult] = await Promise.all([
    entriesQuery,
    supabase
      .from("profiles")
      .select("id, full_name, role")
      .in("role", ["owner", "admin", "manager", "front_desk"])
      .eq("status", "active")
      .order("full_name", { ascending: true }),
  ]);

  const error = entriesResult.error ?? staffResult.error;

  if (error) {
    throw new Error(error.message);
  }

  const allEntries = (entriesResult.data ?? []) as EntryRow[];
  const staffOptions = (staffResult.data ?? []) as StaffOption[];
  const entries = allEntries.filter((entry) => {
    const status = getReconciliationStatus(entry);
    const payment = relatedOne(entry.payments);

    if (filters.status && status !== filters.status) {
      return false;
    }

    if (filters.method && filters.method !== "none" && payment?.payment_type !== filters.method) {
      return false;
    }

    if (filters.q && !matchesSearch(entry, filters.q)) {
      return false;
    }

    return true;
  });
  const selectedEntry = selectedEntryId ? entries.find((entry) => entry.id === selectedEntryId) : null;
  const filterParams = {
    date: filters.date,
    method: filters.method,
    q: filters.q,
    staff: filters.staff,
    status: filters.status,
    type: filters.type,
  };
  const activeFilterCount = Object.values(filterParams).filter(Boolean).length;
  const needsReviewCount = entries.filter((entry) => getReconciliationStatus(entry) === "needs_review").length;
  const pendingPaymentCount = entries.filter((entry) => getReconciliationStatus(entry) === "pending_payment").length;

  return (
    <div className="page-enter space-y-6">
      <div className="grid gap-5 lg:grid-cols-[1fr_19rem]">
        <Card className="relative overflow-hidden">
          <div className="relative">
            <div className="flex size-14 items-center justify-center rounded-lg bg-n-ink text-white">
              <ClipboardList aria-hidden="true" className="size-7" />
            </div>
            <p className="mt-7 text-xs font-semibold text-n-dim">
              Owner Review
            </p>
            <h2 className="mt-3 text-xl font-bold leading-tight text-n-ink sm:text-2xl">
              Owner Review
            </h2>
            <p className="mt-5 max-w-3xl text-lg leading-8 text-n-dim">
              Inspect every gym entry, who allowed it, the shift it belongs to, and the payment, membership, or exception reason that permitted access.
            </p>
          </div>
        </Card>

        <Card className="flex flex-col justify-between">
          <div>
            <p className="text-xs font-semibold text-n-dim">
              Visible Entries
            </p>
            <p className="mt-3 text-5xl font-bold text-n-ink">
              {entries.length.toLocaleString("en-PH")}
            </p>
          </div>
          <p className="mt-6 text-sm font-medium leading-6 text-n-dim">
            {roleLabels[profile.role]} access. {activeFilterCount ? `${activeFilterCount} filter${activeFilterCount === 1 ? "" : "s"} active.` : "No filters active."}
          </p>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <ShieldCheck aria-hidden="true" className="size-6 text-green-700" />
          <p className="mt-4 text-xs font-semibold text-n-dim">
            Membership / Paid
          </p>
          <p className="mt-2 text-xl font-bold sm:text-2xl text-n-ink">
            {entries.filter((entry) => ["active_member", "paid_walk_in", "renewed_member"].includes(getReconciliationStatus(entry))).length.toLocaleString("en-PH")}
          </p>
        </Card>
        <Card>
          <Clock3 aria-hidden="true" className="size-6 text-yellow-700" />
          <p className="mt-4 text-xs font-semibold text-n-dim">
            Utang / Pay later
          </p>
          <p className="mt-2 text-xl font-bold sm:text-2xl text-n-ink">
            {pendingPaymentCount.toLocaleString("en-PH")}
          </p>
        </Card>
        <Card>
          <AlertTriangle aria-hidden="true" className="size-6 text-amber-700" />
          <p className="mt-4 text-xs font-semibold text-n-dim">
            Needs Review
          </p>
          <p className="mt-2 text-xl font-bold sm:text-2xl text-n-ink">
            {needsReviewCount.toLocaleString("en-PH")}
          </p>
        </Card>
      </div>

      <Card>
        <form className="grid gap-4" action="/entry-reconciliation">
          <div className="grid gap-3 lg:grid-cols-[1.5fr_repeat(5,minmax(0,1fr))]">
            <label className="space-y-2">
              <span className="text-sm font-bold text-n-ink">Search</span>
              <span className="relative block">
                <Search aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-n-dark" />
                <Input className="pl-11" name="q" placeholder="Name, member code, note, reference" defaultValue={filters.q} />
              </span>
            </label>
            <label className="space-y-2">
              <span className="text-sm font-bold text-n-ink">Date</span>
              <Input name="date" type="date" defaultValue={filters.date} />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-bold text-n-ink">Status</span>
              <Select name="status" defaultValue={filters.status}>
                <option value="">All statuses</option>
                {statusOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </Select>
            </label>
            <label className="space-y-2">
              <span className="text-sm font-bold text-n-ink">Staff</span>
              <Select name="staff" defaultValue={filters.staff}>
                <option value="">All staff</option>
                {staffOptions.map((staff) => (
                  <option key={staff.id} value={staff.id}>{staff.full_name}</option>
                ))}
              </Select>
            </label>
            <label className="space-y-2">
              <span className="text-sm font-bold text-n-ink">Payment Method</span>
              <Select name="method" defaultValue={filters.method}>
                <option value="">All methods</option>
                {paymentMethodOptions.map((method) => (
                  <option key={method} value={method}>{labelize(method)}</option>
                ))}
              </Select>
            </label>
            <label className="space-y-2">
              <span className="text-sm font-bold text-n-ink">Entry Type</span>
              <Select name="type" defaultValue={filters.type}>
                <option value="">All types</option>
                {entryTypeOptions.map((type) => (
                  <option key={type} value={type}>{labelize(type)}</option>
                ))}
              </Select>
            </label>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3">
            <Link className="inline-flex min-h-11 items-center justify-center rounded-lg border border-n-border bg-white/75 px-5 text-sm font-bold text-n-ink transition hover:border-n-dark" href="/entry-reconciliation">
              Clear
            </Link>
            <button className="inline-flex min-h-11 items-center justify-center rounded-lg bg-n-ink px-5 text-sm font-bold text-white transition hover:bg-n-dark" type="submit">
              Apply Filters
            </button>
          </div>
        </form>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[1fr_24rem]">
        <Card className="p-0">
          <div className="flex items-center justify-between gap-4 border-b border-n-border px-5 py-4">
            <div>
              <h3 className="text-lg font-bold text-n-ink">
                Entries
              </h3>
              <p className="mt-1 text-sm font-medium text-n-dim">
                Showing RLS-visible entries sorted by latest entry time.
              </p>
            </div>
            <BadgeCheck aria-hidden="true" className="hidden size-6 text-n-dark sm:block" />
          </div>

          {entries.length ? (
            <div className="divide-y divide-n-border">
              {entries.map((entry) => {
                const status = getReconciliationStatus(entry);
                const member = relatedOne(entry.members);
                const payment = relatedOne(entry.payments);
                const exception = relatedOne(entry.exceptions);
                const isSelected = selectedEntry?.id === entry.id;

                return (
                  <Link
                    className={cn(
                      "block px-5 py-4 transition hover:bg-n-hover",
                      isSelected ? "bg-blue-50" : "",
                    )}
                    href={buildHref(filterParams, entry.id)}
                    key={entry.id}
                  >
                    <div className="grid gap-4 lg:grid-cols-[1.1fr_0.8fr_0.8fr_0.8fr_auto] lg:items-center">
                      <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-2">
                          <UserRoundCheck aria-hidden="true" className="size-5 shrink-0 text-n-dark" />
                          <p className="truncate font-bold text-n-ink">{getPersonName(entry)}</p>
                        </div>
                        <p className="mt-1 text-xs font-semibold text-n-dim">
                          {member?.member_code ?? "Guest / walk-in"} · {labelize(entry.settlement_type)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-n-dim">Entry Time</p>
                        <p className="mt-1 text-sm font-bold text-n-ink">{dateTimeFormatter.format(new Date(entry.entered_at))}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-n-dim">Staff / Shift</p>
                        <p className="mt-1 text-sm font-bold text-n-ink">{getStaffName(entry)}</p>
                        <p className="text-xs font-medium text-n-dim">Shift {entry.shift_id?.slice(0, 8) ?? "none"}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-n-dim">Payment</p>
                        <p className="mt-1 text-sm font-bold text-n-ink">
                          {payment ? `${labelize(payment.status)} · ${formatAmount(payment.amount)}` : "No payment"}
                        </p>
                        <p className="text-xs font-medium text-n-dim">{payment ? labelize(payment.payment_type) : "Membership / exception"}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                        <StatusBadge tone={statusToneMap[status]}>
                          {labelize(status)}
                        </StatusBadge>
                        {exception ? (
                          <StatusBadge tone="warn">
                            {labelize(exception.status)}
                          </StatusBadge>
                        ) : null}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="px-5 py-16 text-center">
              <ClipboardList aria-hidden="true" className="mx-auto size-10 text-n-dark" />
              <p className="font-bold text-n-ink">No entries found</p>
              <p className="mt-1 text-sm font-medium text-n-dim">
                Adjust the date, staff, payment method, status, entry type, or search text.
              </p>
            </div>
          )}
        </Card>

        <Card className="xl:sticky xl:top-28 xl:self-start">
          {selectedEntry ? (
            <div>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-n-dim">
                    Entry Detail
                  </p>
                  <h3 className="mt-2 text-xl font-bold sm:text-2xl text-n-ink">
                    {getPersonName(selectedEntry)}
                  </h3>
                </div>
                <StatusBadge tone={statusToneMap[getReconciliationStatus(selectedEntry)]}>
                  {labelize(getReconciliationStatus(selectedEntry))}
                </StatusBadge>
              </div>

              <div className="mt-5 rounded-lg border border-n-border bg-white/65 p-4">
                <p className="text-xs font-semibold text-n-dim">
                  Why Allowed In
                </p>
                <p className="mt-2 text-sm font-bold leading-6 text-n-ink">
                  {getAllowedReason(selectedEntry)}
                </p>
              </div>

              <div className="mt-5 grid gap-3">
                <DetailItem label="Entry Time" value={dateTimeFormatter.format(new Date(selectedEntry.entered_at))} />
                <DetailItem label="Staff" value={getStaffName(selectedEntry)} />
                <DetailItem label="Shift" value={`${selectedEntry.shift_id?.slice(0, 8) ?? "No shift"} · ${getShiftStaff(selectedEntry)}`} />
                <DetailItem label="Entry Type" value={labelize(selectedEntry.settlement_type)} />
                <DetailItem label="Raw Entry Status" value={labelize(selectedEntry.status)} />
                <DetailItem
                  label="Payment Status"
                  value={relatedOne(selectedEntry.payments)
                    ? `${labelize(relatedOne(selectedEntry.payments)?.status ?? "")} · ${labelize(relatedOne(selectedEntry.payments)?.payment_type ?? "")} · ${formatAmount(relatedOne(selectedEntry.payments)?.amount)}`
                    : "No payment linked"}
                />
                <DetailItem
                  label="Exception Status"
                  value={relatedOne(selectedEntry.exceptions)
                    ? `${labelize(relatedOne(selectedEntry.exceptions)?.status ?? "")} · ${labelize(relatedOne(selectedEntry.exceptions)?.exception_type ?? "")}`
                    : "No exception linked"}
                />
                {selectedEntry.notes ? <DetailItem label="Entry Note" value={selectedEntry.notes} /> : null}
              </div>

              {relatedOne(selectedEntry.exceptions)?.reason ? (
                <div className="mt-5 rounded-lg bg-amber-50 p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-amber-900">
                    Exception Reason
                  </p>
                  <p className="mt-2 text-sm font-bold leading-6 text-amber-950">
                    {relatedOne(selectedEntry.exceptions)?.reason}
                  </p>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="py-8 text-center">
              <ClipboardList aria-hidden="true" className="mx-auto size-10 text-n-dark" />
              <h3 className="mt-4 text-lg font-bold text-n-ink">
                Open an entry
              </h3>
              <p className="mt-2 text-sm font-medium leading-6 text-n-dim">
                Select a row to see the membership, payment, utang balance, or exception reason that allowed access.
              </p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
