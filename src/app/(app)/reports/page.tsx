import {
  AlertTriangle,
  Banknote,
  CalendarDays,
  CalendarRange,
  CalendarSearch,
  HandCoins,
  ReceiptText,
  Smartphone,
  UserRoundCheck,
  Users,
} from "lucide-react";
import { redirect } from "next/navigation";
import type { ComponentType, SVGProps } from "react";

import { ReportsExportButton } from "@/app/(app)/reports/reports-export-button";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { roleLabels, type AppRole } from "@/lib/auth/permissions";
import { hasConfiguredPermission } from "@/lib/auth/configured-permissions";
import { requireModuleAccess } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

type ReportsPageProps = {
  searchParams?: Promise<{ end?: string; start?: string }>;
};

type RelatedMember = {
  full_name: string;
  member_code: string;
};

type RelatedProfile = {
  email: string | null;
  full_name: string;
};

type PaymentRow = {
  amount: number | string;
  created_at: string;
  id: string;
  members: RelatedMember | RelatedMember[] | null;
  notes: string | null;
  paid_at: string | null;
  payment_type: "cash" | "gcash" | "other";
  purpose: string;
  received_by: string | null;
  received_by_profile: RelatedProfile | RelatedProfile[] | null;
  reference_number: string | null;
  status: string;
};

type EntryRow = {
  entered_at: string;
  guest_name: string | null;
  id: string;
  members: RelatedMember | RelatedMember[] | null;
  payments: { amount: number | string; payment_type: string; purpose: string; status: string } | Array<{
    amount: number | string;
    payment_type: string;
    purpose: string;
    status: string;
  }> | null;
  settlement_type: string;
  status: string;
};

type ExceptionRow = {
  amount: number | string | null;
  created_at: string;
  created_by_profile: Pick<RelatedProfile, "full_name"> | Array<Pick<RelatedProfile, "full_name">> | null;
  exception_type: string;
  id: string;
  members: RelatedMember | RelatedMember[] | null;
  owner_note: string | null;
  person_name: string | null;
  reason: string;
  reviewed_at: string | null;
  status: string;
};

type BalanceRow = {
  amount: number | string;
  created_at: string;
  customer_name: string | null;
  due_at: string | null;
  id: string;
  last_payment_at: string | null;
  members: RelatedMember | RelatedMember[] | null;
  paid_amount: number | string;
  settled_at: string | null;
};

type SummaryCard = {
  label: string;
  value: string;
  detail: string;
};

type ReportDefinition = {
  cards: SummaryCard[];
  csvRows: Array<Record<string, string | number | null>>;
  description: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  id: string;
  rows: Array<Record<string, string | number | null>>;
  tableHeaders: string[];
  title: string;
};

const reportAccess: Record<AppRole, string[]> = {
  admin: [
    "daily",
    "weekly",
    "monthly",
    "cash-gcash",
    "walk-in",
    "membership",
    "staff",
    "exceptions",
    "utang",
  ],
  owner: [
    "daily",
    "weekly",
    "monthly",
    "cash-gcash",
    "walk-in",
    "membership",
    "staff",
    "exceptions",
    "utang",
  ],
  accountant: [
    "daily",
    "weekly",
    "monthly",
    "cash-gcash",
    "walk-in",
    "membership",
    "staff",
    "exceptions",
    "utang",
  ],
  manager: ["walk-in", "staff", "exceptions", "utang"],
  front_desk: [],
};

const pesoFormatter = new Intl.NumberFormat("en-PH", {
  currency: "PHP",
  maximumFractionDigits: 2,
  style: "currency",
});

const dateFormatter = new Intl.DateTimeFormat("en-PH", {
  dateStyle: "medium",
  timeZone: "Asia/Manila",
});

const dateTimeFormatter = new Intl.DateTimeFormat("en-PH", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Manila",
});

function relatedOne<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatAmount(value: number | string | null | undefined) {
  return pesoFormatter.format(Number(value ?? 0));
}

function formatDate(value: string) {
  return dateFormatter.format(new Date(value));
}

function formatDateTime(value: string | null) {
  return value ? dateTimeFormatter.format(new Date(value)) : "Not recorded";
}

function labelize(value: string) {
  return value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function getManilaToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Manila",
    year: "numeric",
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((item) => item.type === type)?.value;

  return `${part("year")}-${part("month")}-${part("day")}`;
}

function getDefaultRange() {
  const today = getManilaToday();

  return {
    end: today,
    start: `${today.slice(0, 8)}01`,
  };
}

function isDateInput(value: string | undefined) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function getDateRange(params: { end?: string; start?: string }) {
  const fallback = getDefaultRange();
  const start = isDateInput(params.start) ? params.start! : fallback.start;
  const end = isDateInput(params.end) ? params.end! : fallback.end;
  const sortedStart = start <= end ? start : end;
  const sortedEnd = start <= end ? end : start;

  return {
    end: sortedEnd,
    endExclusiveIso: new Date(`${sortedEnd}T24:00:00+08:00`).toISOString(),
    start: sortedStart,
    startIso: new Date(`${sortedStart}T00:00:00+08:00`).toISOString(),
  };
}

function getLocalDateKey(value: string) {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Manila",
    year: "numeric",
  }).format(new Date(value));
}

function getWeekKey(value: string) {
  const localDate = getLocalDateKey(value);
  const date = new Date(`${localDate}T00:00:00+08:00`);
  const day = date.getUTCDay() || 7;

  date.setUTCDate(date.getUTCDate() - day + 1);

  return date.toISOString().slice(0, 10);
}

function addToGroup(groups: Map<string, { count: number; total: number }>, key: string, amount: number) {
  const current = groups.get(key) ?? { count: 0, total: 0 };

  groups.set(key, {
    count: current.count + 1,
    total: current.total + amount,
  });
}

function totalAmount(rows: PaymentRow[]) {
  return rows.reduce((total, row) => total + Number(row.amount), 0);
}

function getCustomerName(payment: PaymentRow) {
  return relatedOne(payment.members)?.full_name ?? "Walk-in guest";
}

function getMemberCode(payment: PaymentRow) {
  return relatedOne(payment.members)?.member_code ?? "";
}

function getStaffName(payment: Pick<PaymentRow, "received_by_profile">) {
  return relatedOne(payment.received_by_profile)?.full_name ?? "Unassigned";
}

function getBalanceStatus(balance: BalanceRow) {
  const remaining = Math.max(Number(balance.amount) - Number(balance.paid_amount ?? 0), 0);

  if (remaining <= 0) {
    return "paid";
  }

  if (balance.due_at && new Date(balance.due_at).getTime() < Date.now()) {
    return "overdue";
  }

  if (Number(balance.paid_amount ?? 0) > 0) {
    return "partially_paid";
  }

  return "unpaid";
}

function aggregateByPeriod(payments: PaymentRow[], period: "day" | "month" | "week") {
  const groups = new Map<string, { count: number; total: number }>();

  for (const payment of payments) {
    if (!payment.paid_at) {
      continue;
    }

    const dayKey = getLocalDateKey(payment.paid_at);
    const key =
      period === "day" ? dayKey : period === "week" ? getWeekKey(payment.paid_at) : dayKey.slice(0, 7);

    addToGroup(groups, key, Number(payment.amount));
  }

  return Array.from(groups.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([periodKey, group]) => ({
      Average: formatAmount(group.count ? group.total / group.count : 0),
      Count: group.count,
      Period: period === "week" ? `Week of ${formatDate(`${periodKey}T00:00:00+08:00`)}` : periodKey,
      Revenue: formatAmount(group.total),
    }));
}

function buildReportDefinitions({
  balances,
  entries,
  exceptions,
  payments,
  range,
}: {
  balances: BalanceRow[];
  entries: EntryRow[];
  exceptions: ExceptionRow[];
  payments: PaymentRow[];
  range: ReturnType<typeof getDateRange>;
}) {
  const revenuePayments = payments.filter((payment) =>
    ["completed", "verified"].includes(payment.status),
  );
  const walkInPayments = revenuePayments.filter((payment) => payment.purpose === "walk_in_entry");
  const membershipPayments = revenuePayments.filter((payment) =>
    ["membership_purchase", "membership_renewal"].includes(payment.purpose),
  );
  const cashPayments = revenuePayments.filter((payment) => payment.payment_type === "cash");
  const gcashPayments = revenuePayments.filter((payment) => payment.payment_type === "gcash");
  const pendingGcash = payments.filter(
    (payment) =>
      payment.payment_type === "gcash" &&
      ["awaiting_proof", "for_review", "follow_up", "rejected"].includes(payment.status),
  );
  const walkInEntries = entries.filter((entry) => ["cash", "gcash", "pending"].includes(entry.settlement_type));
  const openBalances = balances.filter((balance) => getBalanceStatus(balance) !== "paid");
  const overdueBalances = balances.filter((balance) => getBalanceStatus(balance) === "overdue");

  const paymentRows = revenuePayments.map((payment) => ({
    Amount: formatAmount(payment.amount),
    Customer: getCustomerName(payment),
    Date: formatDateTime(payment.paid_at),
    Method: labelize(payment.payment_type),
    Purpose: labelize(payment.purpose),
    Reference: payment.reference_number ?? "",
    Staff: getStaffName(payment),
    Status: labelize(payment.status),
  }));
  const staffGroups = new Map<string, { cash: number; count: number; gcash: number; other: number; total: number }>();

  for (const payment of revenuePayments) {
    const staff = getStaffName(payment);
    const current = staffGroups.get(staff) ?? { cash: 0, count: 0, gcash: 0, other: 0, total: 0 };
    const amount = Number(payment.amount);

    staffGroups.set(staff, {
      cash: current.cash + (payment.payment_type === "cash" ? amount : 0),
      count: current.count + 1,
      gcash: current.gcash + (payment.payment_type === "gcash" ? amount : 0),
      other: current.other + (payment.payment_type === "other" ? amount : 0),
      total: current.total + amount,
    });
  }

  const staffRows = Array.from(staffGroups.entries())
    .sort(([, left], [, right]) => right.total - left.total)
    .map(([staff, group]) => ({
      Cash: formatAmount(group.cash),
      Collections: group.count,
      GCash: formatAmount(group.gcash),
      Other: formatAmount(group.other),
      Staff: staff,
      Total: formatAmount(group.total),
    }));

  const exceptionRows = exceptions.map((exception) => ({
    Amount: exception.amount === null ? "" : formatAmount(exception.amount),
    Created: formatDateTime(exception.created_at),
    Customer:
      relatedOne(exception.members)?.full_name ?? exception.person_name ?? "Unassigned customer",
    Reason: exception.reason,
    Reporter: relatedOne(exception.created_by_profile)?.full_name ?? "Unassigned",
    Status: labelize(exception.status),
    Type: labelize(exception.exception_type),
  }));

  const utangRows = balances.map((balance) => {
    const amount = Number(balance.amount);
    const paid = Number(balance.paid_amount ?? 0);

    return {
      Created: formatDateTime(balance.created_at),
      Customer: relatedOne(balance.members)?.full_name ?? balance.customer_name ?? "Walk-in guest",
      Due: formatDateTime(balance.due_at),
      Paid: formatAmount(paid),
      Remaining: formatAmount(Math.max(amount - paid, 0)),
      Status: labelize(getBalanceStatus(balance)),
      Total: formatAmount(amount),
    };
  });

  return [
    {
      cards: [
        { detail: "Confirmed payment rows", label: "Revenue", value: formatAmount(totalAmount(revenuePayments)) },
        { detail: "Average confirmed payment", label: "Average", value: formatAmount(totalAmount(revenuePayments) / Math.max(revenuePayments.length, 1)) },
        { detail: `${range.start} to ${range.end}`, label: "Rows", value: revenuePayments.length.toLocaleString("en-PH") },
      ],
      csvRows: aggregateByPeriod(revenuePayments, "day"),
      description: "Confirmed revenue grouped by Manila calendar day.",
      icon: CalendarDays,
      id: "daily",
      rows: aggregateByPeriod(revenuePayments, "day"),
      tableHeaders: ["Period", "Revenue", "Count", "Average"],
      title: "Daily Revenue Report",
    },
    {
      cards: [
        { detail: "Confirmed payment rows", label: "Revenue", value: formatAmount(totalAmount(revenuePayments)) },
        { detail: "Monday-based Manila weeks", label: "Weeks", value: aggregateByPeriod(revenuePayments, "week").length.toLocaleString("en-PH") },
        { detail: `${range.start} to ${range.end}`, label: "Rows", value: revenuePayments.length.toLocaleString("en-PH") },
      ],
      csvRows: aggregateByPeriod(revenuePayments, "week"),
      description: "Confirmed revenue grouped into Monday-start weeks.",
      icon: CalendarRange,
      id: "weekly",
      rows: aggregateByPeriod(revenuePayments, "week"),
      tableHeaders: ["Period", "Revenue", "Count", "Average"],
      title: "Weekly Revenue Report",
    },
    {
      cards: [
        { detail: "Confirmed payment rows", label: "Revenue", value: formatAmount(totalAmount(revenuePayments)) },
        { detail: "Calendar months in range", label: "Months", value: aggregateByPeriod(revenuePayments, "month").length.toLocaleString("en-PH") },
        { detail: `${range.start} to ${range.end}`, label: "Rows", value: revenuePayments.length.toLocaleString("en-PH") },
      ],
      csvRows: aggregateByPeriod(revenuePayments, "month"),
      description: "Confirmed revenue grouped by month.",
      icon: CalendarSearch,
      id: "monthly",
      rows: aggregateByPeriod(revenuePayments, "month"),
      tableHeaders: ["Period", "Revenue", "Count", "Average"],
      title: "Monthly Revenue Report",
    },
    {
      cards: [
        { detail: `${cashPayments.length.toLocaleString("en-PH")} cash payments`, label: "Cash", value: formatAmount(totalAmount(cashPayments)) },
        { detail: `${gcashPayments.length.toLocaleString("en-PH")} confirmed GCash payments`, label: "GCash", value: formatAmount(totalAmount(gcashPayments)) },
        { detail: "Not counted as confirmed revenue", label: "Pending GCash", value: pendingGcash.length.toLocaleString("en-PH") },
      ],
      csvRows: paymentRows.filter((row) => row.Method === "Cash" || row.Method === "Gcash"),
      description: "Confirmed cash and GCash collections, with pending GCash called out separately.",
      icon: Smartphone,
      id: "cash-gcash",
      rows: [
        { Count: cashPayments.length, Method: "Cash", Revenue: formatAmount(totalAmount(cashPayments)) },
        { Count: gcashPayments.length, Method: "GCash", Revenue: formatAmount(totalAmount(gcashPayments)) },
        { Count: pendingGcash.length, Method: "Pending GCash", Revenue: formatAmount(totalAmount(pendingGcash)) },
      ],
      tableHeaders: ["Method", "Revenue", "Count"],
      title: "Cash vs GCash Report",
    },
    {
      cards: [
        { detail: "Confirmed walk-in entry payments", label: "Walk-in revenue", value: formatAmount(totalAmount(walkInPayments)) },
        { detail: "Paid and unpaid walk-in entries", label: "Entries", value: walkInEntries.length.toLocaleString("en-PH") },
        { detail: "Recorded as pending/utang", label: "Utang entries", value: entries.filter((entry) => entry.settlement_type === "pending").length.toLocaleString("en-PH") },
      ],
      csvRows: walkInPayments.map((payment) => ({
        Amount: formatAmount(payment.amount),
        Customer: getCustomerName(payment),
        Date: formatDateTime(payment.paid_at),
        Method: labelize(payment.payment_type),
        Staff: getStaffName(payment),
        Status: labelize(payment.status),
      })),
      description: "Walk-in payments and walk-in entry volume over the selected dates.",
      icon: UserRoundCheck,
      id: "walk-in",
      rows: walkInPayments.map((payment) => ({
        Amount: formatAmount(payment.amount),
        Customer: getCustomerName(payment),
        Date: formatDateTime(payment.paid_at),
        Method: labelize(payment.payment_type),
        Staff: getStaffName(payment),
        Status: labelize(payment.status),
      })),
      tableHeaders: ["Date", "Customer", "Method", "Amount", "Staff", "Status"],
      title: "Walk-In Revenue Report",
    },
    {
      cards: [
        { detail: "Membership purchase and renewal payments", label: "Membership revenue", value: formatAmount(totalAmount(membershipPayments)) },
        { detail: "Confirmed membership payments", label: "Payments", value: membershipPayments.length.toLocaleString("en-PH") },
        { detail: "Average membership collection", label: "Average", value: formatAmount(totalAmount(membershipPayments) / Math.max(membershipPayments.length, 1)) },
      ],
      csvRows: membershipPayments.map((payment) => ({
        Amount: formatAmount(payment.amount),
        Date: formatDateTime(payment.paid_at),
        Member: getCustomerName(payment),
        "Member Code": getMemberCode(payment),
        Method: labelize(payment.payment_type),
        Purpose: labelize(payment.purpose),
        Staff: getStaffName(payment),
      })),
      description: "Membership purchases and renewals collected in the selected period.",
      icon: Users,
      id: "membership",
      rows: membershipPayments.map((payment) => ({
        Amount: formatAmount(payment.amount),
        Date: formatDateTime(payment.paid_at),
        Member: getCustomerName(payment),
        "Member Code": getMemberCode(payment),
        Method: labelize(payment.payment_type),
        Purpose: labelize(payment.purpose),
        Staff: getStaffName(payment),
      })),
      tableHeaders: ["Date", "Member", "Member Code", "Purpose", "Method", "Amount", "Staff"],
      title: "Membership Revenue Report",
    },
    {
      cards: [
        { detail: "Confirmed collections by staff", label: "Total collected", value: formatAmount(totalAmount(revenuePayments)) },
        { detail: "Staff with collections", label: "Collectors", value: staffRows.length.toLocaleString("en-PH") },
        { detail: "Confirmed payment rows", label: "Payments", value: revenuePayments.length.toLocaleString("en-PH") },
      ],
      csvRows: staffRows,
      description: "Collections grouped by staff member for accountability review.",
      icon: ReceiptText,
      id: "staff",
      rows: staffRows,
      tableHeaders: ["Staff", "Total", "Cash", "GCash", "Other", "Collections"],
      title: "Staff Collection Report",
    },
    {
      cards: [
        { detail: "All exception rows in range", label: "Exceptions", value: exceptions.length.toLocaleString("en-PH") },
        { detail: "Still pending review", label: "Pending", value: exceptions.filter((item) => item.status === "pending").length.toLocaleString("en-PH") },
        { detail: "Exception amounts when recorded", label: "Amount", value: formatAmount(exceptions.reduce((total, item) => total + Number(item.amount ?? 0), 0)) },
      ],
      csvRows: exceptionRows,
      description: "Unusual entries, disputes, staff errors, and owner-approved exceptions.",
      icon: AlertTriangle,
      id: "exceptions",
      rows: exceptionRows,
      tableHeaders: ["Created", "Type", "Customer", "Amount", "Status", "Reporter", "Reason"],
      title: "Exception Report",
    },
    {
      cards: [
        { detail: "Unpaid and partially paid balances", label: "Outstanding", value: formatAmount(openBalances.reduce((total, balance) => total + Math.max(Number(balance.amount) - Number(balance.paid_amount ?? 0), 0), 0)) },
        { detail: "Open balances", label: "Open", value: openBalances.length.toLocaleString("en-PH") },
        { detail: "Past due balances", label: "Overdue", value: overdueBalances.length.toLocaleString("en-PH") },
      ],
      csvRows: utangRows,
      description: "Walk-in balances, partial settlements, overdue items, and remaining amounts.",
      icon: HandCoins,
      id: "utang",
      rows: utangRows,
      tableHeaders: ["Created", "Customer", "Total", "Paid", "Remaining", "Due", "Status"],
      title: "Utang Report",
    },
  ] satisfies ReportDefinition[];
}

function ReportSection({ canExport, report }: { canExport: boolean; report: ReportDefinition }) {
  const Icon = report.icon;

  return (
    <Card className="overflow-hidden" id={report.id}>
      <div className="flex flex-col gap-4 border-b border-n-border pb-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-n-ink text-white">
              <Icon aria-hidden="true" className="size-5" />
            </span>
            <div>
              <h3 className="text-lg font-bold text-n-ink">
                {report.title}
              </h3>
              <p className="mt-1 text-sm font-medium leading-6 text-n-dim">{report.description}</p>
            </div>
          </div>
        </div>
        {canExport ? (
          <ReportsExportButton filename={`${report.id}-report.csv`} rows={report.csvRows} />
        ) : null}
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        {report.cards.map((card) => (
          <div className="rounded-lg border border-n-border bg-white/70 p-4" key={card.label}>
            <p className="text-xs font-semibold text-n-muted">{card.label}</p>
            <p className="mt-2 text-xl font-bold sm:text-2xl text-n-ink">
              {card.value}
            </p>
            <p className="mt-2 text-xs font-medium leading-5 text-n-dim">{card.detail}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[600px] border-separate border-spacing-0 text-left text-sm">
          <thead>
            <tr>
              {report.tableHeaders.map((header) => (
                <th
                  className="border-b border-n-border bg-white px-3 py-3 text-xs font-semibold text-n-muted"
                  key={header}
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {report.rows.length ? (
              report.rows.slice(0, 12).map((row, index) => (
                <tr className="align-top" key={`${report.id}-${index}`}>
                  {report.tableHeaders.map((header) => (
                    <td className="border-b border-n-border/70 px-3 py-3 font-bold text-n-ink" key={header}>
                      {row[header] ?? ""}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td className="px-3 py-8 text-center font-medium text-n-dim" colSpan={report.tableHeaders.length}>
                  No report rows for this date range.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export default async function ReportsPage({ searchParams }: ReportsPageProps) {
  const profile = await requireModuleAccess("/reports");
  const canViewReports = await hasConfiguredPermission(profile.role, "view_reports");
  const canExportReports = await hasConfiguredPermission(profile.role, "export_data");
  const allowedReportIds = new Set(reportAccess[profile.role]);

  if (!allowedReportIds.size || !canViewReports) {
    redirect("/unauthorized?next=/reports");
  }

  const params = (await searchParams) ?? {};
  const range = getDateRange(params);
  const supabase = await createClient();

  const [
    paymentsResult,
    entriesResult,
    exceptionsResult,
    balancesResult,
  ] = await Promise.all([
    supabase
      .from("payments")
      .select(
        "id, amount, payment_type, purpose, status, paid_at, created_at, reference_number, notes, received_by, members(full_name, member_code), received_by_profile:profiles!payments_received_by_fkey(full_name, email)",
      )
      .gte("paid_at", range.startIso)
      .lt("paid_at", range.endExclusiveIso)
      .not("status", "in", "(voided,refunded)")
      .order("paid_at", { ascending: false })
      .limit(1000),
    supabase
      .from("entries")
      .select("id, entered_at, guest_name, settlement_type, status, members(full_name, member_code), payments(amount, payment_type, purpose, status)")
      .gte("entered_at", range.startIso)
      .lt("entered_at", range.endExclusiveIso)
      .neq("status", "voided")
      .order("entered_at", { ascending: false })
      .limit(1000),
    supabase
      .from("exceptions")
      .select("id, created_at, exception_type, reason, amount, status, person_name, owner_note, reviewed_at, members(full_name, member_code), created_by_profile:profiles!exceptions_created_by_fkey(full_name)")
      .gte("created_at", range.startIso)
      .lt("created_at", range.endExclusiveIso)
      .order("created_at", { ascending: false })
      .limit(1000),
    supabase
      .from("walk_in_balances")
      .select("id, amount, paid_amount, due_at, settled_at, last_payment_at, customer_name, created_at, members(full_name, member_code)")
      .gte("created_at", range.startIso)
      .lt("created_at", range.endExclusiveIso)
      .order("created_at", { ascending: false })
      .limit(1000),
  ]);

  const error = paymentsResult.error ?? entriesResult.error ?? exceptionsResult.error ?? balancesResult.error;

  if (error) {
    throw new Error(error.message);
  }

  const reports = buildReportDefinitions({
    balances: (balancesResult.data ?? []) as BalanceRow[],
    entries: (entriesResult.data ?? []) as EntryRow[],
    exceptions: (exceptionsResult.data ?? []) as ExceptionRow[],
    payments: (paymentsResult.data ?? []) as PaymentRow[],
    range,
  }).filter((report) => allowedReportIds.has(report.id));

  const visibleRevenue = reports
    .filter((report) => ["daily", "weekly", "monthly"].includes(report.id))
    .at(0)?.cards[0]?.value ?? "Limited";

  return (
    <div className="page-enter space-y-6">
      <Card className="relative overflow-hidden">
        <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-4xl">
            <div className="flex size-14 items-center justify-center rounded-lg bg-n-ink text-white">
              <Banknote aria-hidden="true" className="size-7" />
            </div>
            <p className="mt-7 text-xs font-semibold text-n-muted">
              Reports / {roleLabels[profile.role]} access
            </p>
            <h2 className="mt-3 text-2xl font-bold leading-tight text-n-ink sm:text-3xl">
              Review revenue and operations over time.
            </h2>
            <p className="mt-5 max-w-3xl text-lg leading-8 text-n-dim">
              CSV exports are generated from the same role-filtered data visible on this page when export access is enabled.
              Managers see operational reports only; owners, admins, and accountants see financial reports.
            </p>
          </div>

          <form className="rounded-lg border border-n-border bg-white/75 p-4" id="report-filters">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="start">Start date</Label>
                <Input className="mt-2 bg-white" defaultValue={range.start} id="start" name="start" type="date" />
              </div>
              <div>
                <Label htmlFor="end">End date</Label>
                <Input className="mt-2 bg-white" defaultValue={range.end} id="end" name="end" type="date" />
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <Button className="flex-1" type="submit">
                Apply
              </Button>
              <a
                className="inline-flex min-h-11 items-center justify-center rounded-lg border border-n-border bg-white px-5 py-2.5 text-sm font-bold text-n-ink transition hover:bg-white"
                href="/reports"
              >
                Reset
              </a>
            </div>
          </form>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <p className="text-xs font-semibold text-n-muted">Date range</p>
          <p className="mt-3 text-xl font-bold sm:text-2xl text-n-ink">
            {range.start} to {range.end}
          </p>
          <p className="mt-3 text-sm font-medium leading-6 text-n-dim">Manila calendar dates.</p>
        </Card>
        <Card>
          <p className="text-xs font-semibold text-n-muted">Visible reports</p>
          <p className="mt-3 text-5xl font-bold text-n-ink">
            {reports.length.toLocaleString("en-PH")}
          </p>
          <p className="mt-3 text-sm font-medium leading-6 text-n-dim">Role-gated report sections.</p>
        </Card>
        <Card>
          <p className="text-xs font-semibold text-n-muted">Revenue access</p>
          <p className="mt-3 text-xl font-bold sm:text-2xl text-n-ink">{visibleRevenue}</p>
          <p className="mt-3 text-sm font-medium leading-6 text-n-dim">
            Confirmed payments only, excluding voids and refunds.
          </p>
        </Card>
      </div>

      <Card>
        <div className="flex flex-wrap gap-2">
          {reports.map((report) => (
            <a
              className={cn(
                "inline-flex min-h-10 items-center rounded-lg border border-n-border bg-white/75 px-4 text-sm font-bold text-n-ink transition hover:border-n-dark",
              )}
              href={`#${report.id}`}
              key={report.id}
            >
              {report.title}
            </a>
          ))}
        </div>
      </Card>

      {reports.map((report) => (
        <ReportSection canExport={canExportReports} key={report.id} report={report} />
      ))}
    </div>
  );
}
