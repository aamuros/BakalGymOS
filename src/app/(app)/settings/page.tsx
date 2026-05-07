import { KeyRound, ShieldCheck } from "lucide-react";

import { StaffPinControls } from "@/app/(app)/settings/staff-pin-controls";
import { Card } from "@/components/ui/card";
import { canManageSystemSettings, roleLabels } from "@/lib/auth/permissions";
import { requireModuleAccess } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";

type StaffProfileRow = {
  employee_code: string | null;
  id: string;
  job_title: string | null;
  pin_reset_at: string | null;
  pin_set_at: string | null;
  status: "active" | "inactive" | "terminated";
  profiles: {
    email: string | null;
    full_name: string;
    role: keyof typeof roleLabels;
    status: "active" | "disabled";
  } | {
    email: string | null;
    full_name: string;
    role: keyof typeof roleLabels;
    status: "active" | "disabled";
  }[] | null;
};

const dateTimeFormatter = new Intl.DateTimeFormat("en-PH", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Manila",
});

function relatedOne<T>(value: T | T[] | null) {
  return Array.isArray(value) ? value[0] : value;
}

function formatDateTime(value: string | null) {
  return value ? dateTimeFormatter.format(new Date(value)) : "Not set";
}

export default async function SettingsPage() {
  const profile = await requireModuleAccess("/settings");
  const canManageStaffPins = canManageSystemSettings(profile.role);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("staff_profiles")
    .select("id, employee_code, job_title, status, pin_set_at, pin_reset_at, profiles(full_name, email, role, status)")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  const staffProfiles = (data ?? []) as StaffProfileRow[];

  return (
    <div className="ledger-rise space-y-6">
      <div>
        <p className="text-sm font-black uppercase tracking-[0.24em] text-ledger-moss">
          System Settings
        </p>
        <h2 className="mt-2 font-[var(--font-heading)] text-4xl font-black text-ledger-ink">
          Staff Access
        </h2>
        <p className="mt-2 text-sm font-bold text-ledger-moss">
          {roleLabels[profile.role]} controls for front desk PIN access.
        </p>
      </div>

      <Card className="rounded-3xl shadow-none">
        <div className="mb-5 flex items-start gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-ledger-lime text-ledger-ink">
            <ShieldCheck aria-hidden="true" className="size-5" />
          </span>
          <div>
            <h3 className="font-[var(--font-heading)] text-2xl font-black text-ledger-ink">
              Front desk PIN policy
            </h3>
            <p className="mt-1 text-sm font-bold leading-6 text-ledger-moss">
              PIN sessions are limited to the Front Desk Portal and actions remain attached to the staff profile.
            </p>
          </div>
        </div>
        {!canManageStaffPins ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">
            Only owner or admin accounts can set PINs, reset PINs, or deactivate staff accounts.
          </div>
        ) : null}
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        {staffProfiles.map((staffProfile) => {
          const staff = relatedOne(staffProfile.profiles);
          const isActive = staffProfile.status === "active" && staff?.status === "active";
          const hasPin = Boolean(staffProfile.pin_set_at);

          return (
            <Card className="rounded-3xl shadow-none" key={staffProfile.id}>
              <div className="mb-5 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="break-words font-[var(--font-heading)] text-2xl font-black text-ledger-ink">
                      {staff?.full_name ?? "Staff member"}
                    </h3>
                    <span className="inline-flex h-8 items-center rounded-full bg-ledger-paper px-3 text-xs font-black uppercase text-ledger-moss">
                      {staffProfile.status}
                    </span>
                  </div>
                  <p className="mt-1 text-sm font-bold text-ledger-moss">
                    {staffProfile.employee_code ?? staffProfile.job_title ?? staff?.email ?? "No staff code"}
                  </p>
                </div>
                <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-ledger-lime text-ledger-ink">
                  <KeyRound aria-hidden="true" className="size-5" />
                </span>
              </div>

              <dl className="mb-5 grid gap-3 sm:grid-cols-3">
                <StaffFact label="Role" value={staff?.role ? roleLabels[staff.role] : "Staff"} />
                <StaffFact label="PIN set" value={formatDateTime(staffProfile.pin_set_at)} />
                <StaffFact label="Last reset" value={formatDateTime(staffProfile.pin_reset_at)} />
              </dl>

              {canManageStaffPins ? (
                <StaffPinControls
                  hasPin={hasPin}
                  isActive={isActive}
                  staffProfileId={staffProfile.id}
                />
              ) : null}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function StaffFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-ledger-line bg-ledger-paper/70 px-4 py-3">
      <dt className="text-xs font-black uppercase tracking-[0.14em] text-ledger-moss">{label}</dt>
      <dd className="mt-1 break-words text-sm font-black text-ledger-ink">{value}</dd>
    </div>
  );
}
