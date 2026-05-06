import { CalendarClock, UserRoundCheck } from "lucide-react";

import { Card } from "@/components/ui/card";
import { roleLabels } from "@/lib/auth/permissions";
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
  id: string;
  opened_at: string;
  opening_cash: number | string;
  notes: string | null;
  staff_profiles: RelatedStaffProfile | RelatedStaffProfile[] | null;
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

function getStaffProfile(staffProfile: RelatedStaffProfile | RelatedStaffProfile[] | null) {
  return Array.isArray(staffProfile) ? staffProfile[0] : staffProfile;
}

function getProfile(profile: RelatedProfile | RelatedProfile[] | null | undefined) {
  return Array.isArray(profile) ? profile[0] : profile;
}

export default async function ShiftsPage() {
  const profile = await requireModuleAccess("/shifts");
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("shifts")
    .select("id, opened_at, opening_cash, notes, staff_profiles(employee_code, job_title, profiles(full_name, email, role))")
    .eq("status", "open")
    .is("closed_at", null)
    .order("opened_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  const activeShifts = (data ?? []) as ShiftRow[];

  return (
    <div className="ledger-rise space-y-6">
      <div>
        <p className="text-sm font-black uppercase tracking-[0.24em] text-ledger-moss">
          Shift Accountability
        </p>
        <h2 className="mt-2 font-[var(--font-heading)] text-4xl font-black text-ledger-ink">
          Active Shifts
        </h2>
        <p className="mt-2 text-sm font-bold text-ledger-moss">
          {roleLabels[profile.role]} view of currently open staff shifts.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {activeShifts.map((shift) => {
          const staffProfile = getStaffProfile(shift.staff_profiles);
          const staff = getProfile(staffProfile?.profiles);

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
              </div>
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
