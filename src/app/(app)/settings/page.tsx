import {
  BadgeDollarSign,
  Building2,
  KeyRound,
  ReceiptText,
  ShieldCheck,
  SlidersHorizontal,
  UserCog,
} from "lucide-react";

import {
  ExceptionTypesForm,
  GymProfileForm,
  MembershipRateForms,
  OperationalSettingsForm,
  PaymentSettingsForm,
  RolePermissionsForm,
  StaffAccessForms,
  WalkInRateForm,
} from "@/app/(app)/settings/admin-settings-forms";
import {
  editablePermissionRoles,
  permissionKeys,
  type ExceptionTypeSettingsValues,
  type GymProfileValues,
  type MembershipRateValues,
  type OperationalSettingsValues,
  type PaymentSettingsValues,
  type RolePermissionValues,
  type StaffAccessValues,
  type WalkInRateValues,
} from "@/app/(app)/settings/schema";
import { StaffPinControls } from "@/app/(app)/settings/staff-pin-controls";
import { LogoutButton } from "@/components/app/logout-button";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { canManageSystemSettings, roleLabels } from "@/lib/auth/permissions";
import { requireModuleAccess } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";

type StaffProfileRow = {
  can_accept_cash: boolean;
  can_accept_gcash: boolean;
  can_close_shift: boolean;
  can_open_shift: boolean;
  employee_code: string | null;
  id: string;
  job_title: string | null;
  pin_reset_at: string | null;
  pin_set_at: string | null;
  profile_id: string;
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

type PlanRow = {
  description: string | null;
  duration_days: number;
  entry_limit: number | null;
  id: string;
  is_unlimited: boolean;
  name: string;
  price: number | string;
  status: "active" | "inactive" | "archived";
};

type SettingRow = {
  key: string;
  value: unknown;
};

type RolePermissionRow = {
  enabled: boolean;
  permission_key: string;
  role: "manager" | "front_desk" | "accountant";
};

const dateTimeFormatter = new Intl.DateTimeFormat("en-PH", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Manila",
});

const defaultGymProfile: GymProfileValues = {
  address: "",
  email: "",
  name: "GymLedger Gym",
  phone: "",
  tax_id: "",
};

const defaultPaymentSettings: PaymentSettingsValues = {
  allow_partial_payments: true,
  cash_enabled: true,
  currency: "PHP",
  gcash_account_name: "",
  gcash_enabled: true,
  gcash_number: "",
  require_gcash_proof: true,
};

const defaultWalkInRate: WalkInRateValues = {
  amount: 100,
  currency: "PHP",
};

const defaultOperationalSettings: OperationalSettingsValues = {
  allow_utang: true,
  grace_period_days: 0,
  max_utang_warning_amount: 500,
};

const defaultExceptionTypes: ExceptionTypeSettingsValues = {
  types: [
    { enabled: true, key: "pending_payment", label: "Utang / Pay later", requiresApproval: true },
    { enabled: true, key: "staff_error", label: "Staff error", requiresApproval: true },
    { enabled: true, key: "system_issue", label: "System issue", requiresApproval: true },
    { enabled: true, key: "member_dispute", label: "Member dispute", requiresApproval: true },
    { enabled: true, key: "owner_approved_free_entry", label: "Owner-approved free entry", requiresApproval: true },
    { enabled: true, key: "other", label: "Other", requiresApproval: true },
  ],
};

function relatedOne<T>(value: T | T[] | null) {
  return Array.isArray(value) ? value[0] : value;
}

function formatDateTime(value: string | null) {
  return value ? dateTimeFormatter.format(new Date(value)) : "Not set";
}

function asSettingMap(rows: SettingRow[]) {
  return new Map(rows.map((row) => [row.key, row.value]));
}

function asObject<T extends Record<string, unknown>>(value: unknown, fallback: T) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return fallback;
  }

  return { ...fallback, ...value } as T;
}

function buildRolePermissionValues(rows: RolePermissionRow[]): RolePermissionValues[] {
  return editablePermissionRoles.map((role) => {
    const permissions = Object.fromEntries(permissionKeys.map((key) => [key, false])) as RolePermissionValues["permissions"];

    for (const row of rows) {
      if (row.role === role && row.permission_key in permissions) {
        permissions[row.permission_key as keyof typeof permissions] = row.enabled;
      }
    }

    return { permissions, role };
  });
}

function toStaffAccessValues(row: StaffProfileRow): StaffAccessValues | null {
  const profile = relatedOne(row.profiles);

  if (!profile) {
    return null;
  }

  return {
    can_accept_cash: row.can_accept_cash,
    can_accept_gcash: row.can_accept_gcash,
    can_close_shift: row.can_close_shift,
    can_open_shift: row.can_open_shift,
    employee_code: row.employee_code ?? "",
    full_name: profile.full_name,
    job_title: row.job_title ?? "",
    profile_id: row.profile_id,
    profile_status: profile.status,
    role: profile.role,
    staff_status: row.status,
  };
}

function toMembershipRateValues(row: PlanRow): MembershipRateValues {
  return {
    description: row.description ?? "",
    duration_days: row.duration_days,
    entry_limit: row.entry_limit ?? "",
    id: row.id,
    is_unlimited: row.is_unlimited,
    name: row.name,
    price: Number(row.price),
    status: row.status,
  };
}

function SectionHeader({
  description,
  icon: Icon,
  title,
}: {
  description: string;
  icon: typeof ShieldCheck;
  title: string;
}) {
  return (
    <div className="mb-5 flex items-start gap-3">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-n-hover text-n-muted">
        <Icon aria-hidden="true" className="size-5" />
      </span>
      <div>
        <h3 className="text-lg font-bold text-n-ink">
          {title}
        </h3>
        <p className="mt-1 text-sm font-medium leading-6 text-n-dim">{description}</p>
      </div>
    </div>
  );
}

const staffStatusTone = {
  active: "active" as const,
  inactive: "neutral" as const,
  terminated: "danger" as const,
};

export default async function SettingsPage() {
  const profile = await requireModuleAccess("/settings");
  const canManageSettings = canManageSystemSettings(profile.role);
  const supabase = await createClient();
  const [
    staffResult,
    plansResult,
    settingsResult,
    rolePermissionsResult,
  ] = await Promise.all([
    supabase
      .from("staff_profiles")
      .select("id, profile_id, employee_code, job_title, status, can_open_shift, can_close_shift, can_accept_cash, can_accept_gcash, pin_set_at, pin_reset_at, profiles!staff_profiles_profile_id_fkey(full_name, email, role, status)")
      .order("created_at", { ascending: false }),
    supabase
      .from("membership_plans")
      .select("id, name, description, duration_days, price, entry_limit, is_unlimited, status")
      .order("price", { ascending: true }),
    supabase
      .from("settings")
      .select("key, value")
      .in("key", ["gym_profile", "payment_settings", "exception_type_settings", "walk_in_rate", "operational_settings"]),
    supabase
      .from("role_permissions")
      .select("role, permission_key, enabled")
      .in("role", [...editablePermissionRoles]),
  ]);

  const error = staffResult.error ?? plansResult.error ?? settingsResult.error ?? rolePermissionsResult.error;

  if (error) {
    throw new Error(error.message);
  }

  const settingMap = asSettingMap((settingsResult.data ?? []) as SettingRow[]);
  const staffRows = (staffResult.data ?? []) as StaffProfileRow[];
  const staffAccessValues = staffRows.map(toStaffAccessValues).filter(Boolean) as StaffAccessValues[];

  return (
    <div className="page-enter space-y-6">
      <div>
        <p className="text-xs font-semibold text-n-muted">
          System Settings
        </p>
        <h2 className="mt-2 text-2xl font-bold text-n-ink">
          Admin Settings and Permissions
        </h2>
        <p className="mt-2 text-sm font-medium text-n-dim">
          {roleLabels[profile.role]} controls for roles, rates, staff access, and gym operations.
        </p>
      </div>

      {!canManageSettings ? (
        <Card className="border-amber-200 bg-amber-50">
          <p className="font-bold text-amber-900">
            Only owner or admin accounts can change sensitive settings.
          </p>
        </Card>
      ) : null}

      <Card>
        <SectionHeader
          description="Configure the gym identity used across owner/admin workflows."
          icon={Building2}
          title="Gym Profile"
        />
        {canManageSettings ? (
          <GymProfileForm defaultValues={asObject(settingMap.get("gym_profile"), defaultGymProfile)} />
        ) : null}
      </Card>

      <Card>
        <SectionHeader
          description="Control which roles can record payments, correct payments, approve exceptions, view reports, manage staff, change rates, and export data."
          icon={ShieldCheck}
          title="Role Permissions"
        />
        {canManageSettings ? (
          <RolePermissionsForm
            defaultValues={buildRolePermissionValues((rolePermissionsResult.data ?? []) as RolePermissionRow[])}
          />
        ) : null}
      </Card>

      <Card>
        <SectionHeader
          description="Update staff roles, profile status, and operational capabilities without exposing privilege changes to the client."
          icon={UserCog}
          title="Staff Management"
        />
        {canManageSettings ? <StaffAccessForms staff={staffAccessValues} /> : null}
      </Card>

      <Card>
        <SectionHeader
          description="Set plan prices, durations, limits, and availability. Rate changes are audited."
          icon={BadgeDollarSign}
          title="Membership Rate Settings"
        />
        {canManageSettings ? (
          <MembershipRateForms plans={((plansResult.data ?? []) as PlanRow[]).map(toMembershipRateValues)} />
        ) : null}
      </Card>

      <Card>
        <SectionHeader
          description="Default walk-in entry rate used by the Front Desk. Staff can override per entry."
          icon={BadgeDollarSign}
          title="Walk-In Rate"
        />
        {canManageSettings ? (
          <WalkInRateForm defaultValues={asObject(settingMap.get("walk_in_rate"), defaultWalkInRate)} />
        ) : null}
      </Card>

      <Card>
        <SectionHeader
          description="Set accepted payment methods and proof requirements."
          icon={ReceiptText}
          title="Payment Settings"
        />
        {canManageSettings ? (
          <PaymentSettingsForm defaultValues={asObject(settingMap.get("payment_settings"), defaultPaymentSettings)} />
        ) : null}
      </Card>

      <Card>
        <SectionHeader
          description="Control utang behavior, warning thresholds, and membership expiry grace period."
          icon={SlidersHorizontal}
          title="Operational Settings"
        />
        {canManageSettings ? (
          <OperationalSettingsForm defaultValues={asObject(settingMap.get("operational_settings"), defaultOperationalSettings)} />
        ) : null}
      </Card>

      <Card>
        <SectionHeader
          description="Maintain the exception types staff can classify for review and reporting."
          icon={SlidersHorizontal}
          title="Exception Type Settings"
        />
        {canManageSettings ? (
          <ExceptionTypesForm defaultValues={asObject(settingMap.get("exception_type_settings"), defaultExceptionTypes)} />
        ) : null}
      </Card>

      <Card>
        <SectionHeader
          description="PIN sessions are limited to the Front Desk Portal and actions stay attached to the staff profile."
          icon={KeyRound}
          title="Front Desk PIN Access"
        />
        <div className="grid gap-4 xl:grid-cols-2">
          {staffRows.map((staffProfile) => {
            const staff = relatedOne(staffProfile.profiles);
            const isActive = staffProfile.status === "active" && staff?.status === "active";
            const hasPin = Boolean(staffProfile.pin_set_at);

            return (
              <div className="rounded-lg border border-n-border bg-white/60 p-5" key={staffProfile.id}>
                <div className="mb-5 flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h4 className="break-words text-lg font-bold text-n-ink">
                      {staff?.full_name ?? "Staff member"}
                    </h4>
                    <p className="mt-1 text-sm font-medium text-n-dim">
                      {staffProfile.employee_code ?? staffProfile.job_title ?? staff?.email ?? "No staff code"}
                    </p>
                  </div>
                  <StatusBadge tone={staffStatusTone[staffProfile.status] ?? "neutral"}>
                    {staffProfile.status}
                  </StatusBadge>
                </div>
                <dl className="mb-5 grid gap-3 sm:grid-cols-3">
                  <StaffFact label="Role" value={staff?.role ? roleLabels[staff.role] : "Staff"} />
                  <StaffFact label="PIN set" value={formatDateTime(staffProfile.pin_set_at)} />
                  <StaffFact label="Last reset" value={formatDateTime(staffProfile.pin_reset_at)} />
                </dl>
                {canManageSettings ? (
                  <StaffPinControls
                    hasPin={hasPin}
                    isActive={isActive}
                    staffProfileId={staffProfile.id}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      </Card>

      <Card>
        <h2 className="text-lg font-bold text-n-ink">Account</h2>
        <p className="mt-1 text-sm text-n-dim">Sign out of your account.</p>
        <div className="mt-4">
          <LogoutButton />
        </div>
      </Card>
    </div>
  );
}

function StaffFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-n-border bg-n-hover px-4 py-3">
      <dt className="text-xs font-semibold text-n-muted">{label}</dt>
      <dd className="mt-1 break-words text-sm font-bold text-n-ink">{value}</dd>
    </div>
  );
}
