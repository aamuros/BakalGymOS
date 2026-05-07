import { AlertTriangle, CalendarClock, ClipboardList, UserRoundCheck } from "lucide-react";

import { EndShiftForm } from "@/app/(app)/shifts/end-shift-form";
import { Card } from "@/components/ui/card";
import { roleLabels, type AppRole } from "@/lib/auth/permissions";
import { requireModuleAccess } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";

type RelatedProfile = {
  full_name: string;
  email: string | null;
  role: keyof typeof roleLabels;
};

type RelatedStaffProfile = {
  employee_code: string | null;
  job_title: string | null;
  profiles: RelatedProfile | RelatedProfile[] | null;
};

type ShiftRow = {
  actual_cash: number | string | null;
  cash_difference: number | string | null;
  cash_expenses: number | string | null;
  cash_sales: number | string | null;
  closed_at: string | null;
  closing_note: string | null;
  expected_cash: number | string | null;
  id: string;
  opened_by: string | null;
  opened_at: string;
  opening_cash: number | string;
  owner_cash_pickups: number | string | null;
  notes: string | null;
  status: "open" | "closed" | "reviewed";
  staff_profiles: RelatedStaffProfile | RelatedStaffProfile[] | null;
  variance_note: string | null;
};

type PaymentRow = {
  amount: number | string;
  payment_type: "cash" | "gcash" | "other";
  status: string;
};

type CashMovementRow = {
  amount: number | string;
  category: "expense" | "owner_pickup" | "cash_adjustment" | null;
  movement_type: "cash_in" | "cash_out";
};

type ShiftReport = {
  cashCollected: number;
  exceptionsCreated: number;
  expectedCash: number;
  gcashCollected: number;
  pendingUtang: number;
  totalEntries: number;
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

function formatAmount(value: number | string | null | undefined) {
  return pesoFormatter.format(Number(value ?? 0));
}

function numeric(value: number | string | null | undefined) {
  return Number(value ?? 0);
}

function getStaffProfile(staffProfile: RelatedStaffProfile | RelatedStaffProfile[] | null) {
  return Array.isArray(staffProfile) ? staffProfile[0] : staffProfile;
}

function getProfile(profile: RelatedProfile | RelatedProfile[] | null | undefined) {
  return Array.isArray(profile) ? profile[0] : profile;
}

function canCloseShift(profileId: string, role: AppRole, shift: ShiftRow) {
  return role === "owner" || role === "admin" || role === "manager" || shift.opened_by === profileId;
}

export default async function ShiftsPage() {
  const profile = await requireModuleAccess("/shifts");
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("shifts")
    .select("id, opened_by, opened_at, closed_at, opening_cash, expected_cash, actual_cash, cash_difference, cash_sales, cash_expenses, owner_cash_pickups, notes, closing_note, variance_note, status, staff_profiles!shifts_staff_profile_id_fkey(employee_code, job_title, profiles!staff_profiles_profile_id_fkey(full_name, email, role))")
    .in("status", ["open", "closed", "reviewed"])
    .order("opened_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  const shifts = (data ?? []) as ShiftRow[];
  const activeShifts = shifts.filter((shift) => shift.status === "open" && !shift.closed_at);
  const completedShifts = shifts.filter((shift) => shift.status !== "open" || shift.closed_at).slice(0, 12);
  const shiftIds = shifts.map((shift) => shift.id);
  const reports = new Map<string, ShiftReport>();
  const activeSummaries = new Map<string, {
    cashSales: number;
    expectedCash: number;
    expenses: number;
    ownerCashPickup: number;
    startingCash: number;
  }>();

  if (shiftIds.length) {
    const [entriesResult, paymentsResult, cashMovementsResult, exceptionsResult, balancesResult] = await Promise.all([
      supabase
        .from("entries")
        .select("id, shift_id, settlement_type, status")
        .in("shift_id", shiftIds),
      supabase
        .from("payments")
        .select("shift_id, payment_type, status, amount")
        .in("shift_id", shiftIds),
      supabase
        .from("cash_movements")
        .select("shift_id, amount, category, movement_type, status")
        .in("shift_id", shiftIds),
      supabase
        .from("exceptions")
        .select("id, shift_id")
        .in("shift_id", shiftIds),
      supabase
        .from("walk_in_balances")
        .select("shift_id, amount, status")
        .in("shift_id", shiftIds),
    ]);

    const reportError =
      entriesResult.error ??
      paymentsResult.error ??
      cashMovementsResult.error ??
      exceptionsResult.error ??
      balancesResult.error;

    if (reportError) {
      throw new Error(reportError.message);
    }

    for (const shift of shifts) {
      const shiftPayments = ((paymentsResult.data ?? []) as Array<PaymentRow & { shift_id: string | null }>)
        .filter((payment) => payment.shift_id === shift.id);
      const shiftMovements = ((cashMovementsResult.data ?? []) as Array<CashMovementRow & { shift_id: string | null; status: string }>)
        .filter((movement) => movement.shift_id === shift.id && movement.status === "approved");
      const cashSales = shiftPayments
        .filter((payment) => payment.payment_type === "cash" && payment.status === "completed")
        .reduce((total, payment) => total + Number(payment.amount), 0);
      const gcashCollected = shiftPayments
        .filter((payment) => payment.payment_type === "gcash" && !["voided", "refunded"].includes(payment.status))
        .reduce((total, payment) => total + Number(payment.amount), 0);
      const pendingUtang = shiftPayments
        .filter((payment) => payment.status === "pending")
        .reduce((total, payment) => total + Number(payment.amount), 0);
      const pendingBalances = ((balancesResult.data ?? []) as Array<{
        amount: number | string;
        shift_id: string | null;
        status: string;
      }>)
        .filter((balance) => balance.shift_id === shift.id && balance.status === "pending")
        .reduce((total, balance) => total + Number(balance.amount), 0);
      const expenses = shiftMovements
        .filter((movement) => movement.movement_type === "cash_out" && movement.category !== "owner_pickup")
        .reduce((total, movement) => total + Number(movement.amount), 0);
      const ownerCashPickup = shiftMovements
        .filter((movement) => movement.movement_type === "cash_out" && movement.category === "owner_pickup")
        .reduce((total, movement) => total + Number(movement.amount), 0);
      const cashAdjustments = shiftMovements
        .filter((movement) => movement.movement_type === "cash_in")
        .reduce((total, movement) => total + Number(movement.amount), 0);
      const expectedCash =
        numeric(shift.expected_cash) || numeric(shift.opening_cash) + cashSales + cashAdjustments - expenses - ownerCashPickup;

      reports.set(shift.id, {
        cashCollected: cashSales,
        exceptionsCreated: ((exceptionsResult.data ?? []) as Array<{ shift_id: string | null }>)
          .filter((exception) => exception.shift_id === shift.id).length,
        expectedCash,
        gcashCollected,
        pendingUtang: pendingUtang + pendingBalances,
        totalEntries: ((entriesResult.data ?? []) as Array<{ shift_id: string | null; status: string }>)
          .filter((entry) => entry.shift_id === shift.id && entry.status !== "voided").length,
      });

      activeSummaries.set(shift.id, {
        cashSales,
        expectedCash,
        expenses,
        ownerCashPickup,
        startingCash: numeric(shift.opening_cash),
      });
    }
  }

  return (
    <div className="ledger-rise space-y-6">
      <div>
        <p className="text-sm font-black uppercase tracking-[0.24em] text-ledger-moss">
          Shift Accountability
        </p>
        <h2 className="mt-2 font-[var(--font-heading)] text-4xl font-black text-ledger-ink">
          Shift Reports
        </h2>
        <p className="mt-2 text-sm font-bold text-ledger-moss">
          {roleLabels[profile.role]} view of active and completed staff shifts.
        </p>
      </div>

      <section className="space-y-4">
        <div>
          <p className="text-sm font-black uppercase tracking-[0.18em] text-ledger-moss">
            Active Shifts
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {activeShifts.map((shift) => {
            const staffProfile = getStaffProfile(shift.staff_profiles);
            const staff = getProfile(staffProfile?.profiles);
            const summary = activeSummaries.get(shift.id);

            return (
              <Card className="rounded-3xl shadow-none" key={shift.id}>
                <div className="flex items-start justify-between gap-3">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-ledger-lime text-ledger-ink">
                    <UserRoundCheck aria-hidden="true" className="size-5" />
                  </span>
                  <p className="text-right text-xs font-black uppercase tracking-[0.14em] text-ledger-moss">
                    Open
                  </p>
                </div>
                <h3 className="mt-5 font-[var(--font-heading)] text-2xl font-black text-ledger-ink">
                  {staff?.full_name ?? "Staff member"}
                </h3>
                <p className="mt-1 text-sm font-bold text-ledger-moss">
                  {staffProfile?.employee_code ?? staffProfile?.job_title ?? staff?.email ?? "No staff code"}
                </p>
                <div className="mt-5 grid gap-3 rounded-2xl bg-ledger-paper/70 p-4">
                  <ShiftMetric label="Started" value={dateTimeFormatter.format(new Date(shift.opened_at))} />
                  <ShiftMetric label="Opening cash" value={formatAmount(shift.opening_cash)} />
                  <ShiftMetric label="Cash collected" value={formatAmount(summary?.cashSales)} />
                  <ShiftMetric label="Expected cash" value={formatAmount(summary?.expectedCash)} />
                </div>
                {summary && canCloseShift(profile.id, profile.role, shift) ? (
                  <div className="mt-5">
                    <EndShiftForm
                      cashSales={summary.cashSales}
                      expectedCash={summary.expectedCash}
                      expenses={summary.expenses}
                      ownerCashPickup={summary.ownerCashPickup}
                      shiftId={shift.id}
                      startingCash={summary.startingCash}
                    />
                  </div>
                ) : null}
                {shift.notes ? (
                  <p className="mt-4 text-sm font-bold leading-6 text-ledger-moss">{shift.notes}</p>
                ) : null}
              </Card>
            );
          })}
        </div>

        {activeShifts.length === 0 ? (
          <Card className="rounded-3xl py-14 text-center shadow-none">
            <CalendarClock aria-hidden="true" className="mx-auto size-10 text-ledger-moss" />
            <p className="mt-4 font-black text-ledger-ink">No active shifts</p>
            <p className="mt-1 text-sm font-bold text-ledger-moss">
              Open shifts will appear here as staff start their day.
            </p>
          </Card>
        ) : null}
      </section>

      <section className="space-y-4">
        <div>
          <p className="text-sm font-black uppercase tracking-[0.18em] text-ledger-moss">
            Completed Shift Reports
          </p>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          {completedShifts.map((shift) => {
            const staffProfile = getStaffProfile(shift.staff_profiles);
            const staff = getProfile(staffProfile?.profiles);
            const report = reports.get(shift.id);
            const variance = numeric(shift.cash_difference);

            return (
              <Card className="rounded-3xl shadow-none" key={shift.id}>
                <div className="flex items-start justify-between gap-3">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-ledger-ink text-ledger-lime">
                    <ClipboardList aria-hidden="true" className="size-5" />
                  </span>
                  <p className="text-right text-xs font-black uppercase tracking-[0.14em] text-ledger-moss">
                    {shift.status}
                  </p>
                </div>
                <h3 className="mt-5 font-[var(--font-heading)] text-2xl font-black text-ledger-ink">
                  {staff?.full_name ?? "Staff member"}
                </h3>
                <div className="mt-5 grid gap-3 rounded-2xl bg-ledger-paper/70 p-4">
                  <ShiftMetric label="Start time" value={dateTimeFormatter.format(new Date(shift.opened_at))} />
                  <ShiftMetric
                    label="End time"
                    value={shift.closed_at ? dateTimeFormatter.format(new Date(shift.closed_at)) : "Not closed"}
                  />
                  <ShiftMetric label="Total entries" value={(report?.totalEntries ?? 0).toLocaleString("en-PH")} />
                  <ShiftMetric label="Cash collected" value={formatAmount(report?.cashCollected)} />
                  <ShiftMetric label="GCash collected" value={formatAmount(report?.gcashCollected)} />
                  <ShiftMetric label="Pending / Utang" value={formatAmount(report?.pendingUtang)} />
                  <ShiftMetric label="Expected cash" value={formatAmount(shift.expected_cash ?? report?.expectedCash)} />
                  <ShiftMetric label="Actual cash" value={formatAmount(shift.actual_cash)} />
                  <ShiftMetric label="Variance" value={formatAmount(shift.cash_difference)} />
                  <ShiftMetric
                    label="Exceptions created"
                    value={(report?.exceptionsCreated ?? 0).toLocaleString("en-PH")}
                  />
                </div>
                {variance !== 0 ? (
                  <p className="mt-4 flex gap-2 rounded-2xl bg-amber-50 p-4 text-sm font-bold leading-6 text-amber-800">
                    <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                    {shift.variance_note ?? "Variance requires owner review."}
                  </p>
                ) : null}
                {shift.closing_note ? (
                  <p className="mt-4 text-sm font-bold leading-6 text-ledger-moss">{shift.closing_note}</p>
                ) : null}
              </Card>
            );
          })}
        </div>

        {completedShifts.length === 0 ? (
          <Card className="rounded-3xl py-14 text-center shadow-none">
            <ClipboardList aria-hidden="true" className="mx-auto size-10 text-ledger-moss" />
            <p className="mt-4 font-black text-ledger-ink">No completed shifts</p>
            <p className="mt-1 text-sm font-bold text-ledger-moss">
              Closed shift reports will appear here for owner review.
            </p>
          </Card>
        ) : null}
      </section>
    </div>
  );
}

function ShiftMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm font-bold text-ledger-moss">{label}</span>
      <span className="text-right text-sm font-black text-ledger-ink">{value}</span>
    </div>
  );
}
