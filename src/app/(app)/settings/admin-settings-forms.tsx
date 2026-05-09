"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Save, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";

import {
  saveExceptionTypes,
  saveGymProfile,
  saveMembershipRate,
  saveOperationalSettings,
  savePaymentSettings,
  saveRolePermissions,
  saveStaffAccess,
  saveWalkInRate,
} from "@/app/(app)/settings/actions";
import {
  editablePermissionRoles,
  exceptionTypeSettingsSchema,
  gymProfileSchema,
  membershipRateSchema,
  operationalSettingsSchema,
  paymentSettingsSchema,
  permissionKeys,
  permissionLabels,
  rolePermissionSchema,
  staffAccessSchema,
  walkInRateSchema,
  type ExceptionTypeSettingsValues,
  type GymProfileValues,
  type MembershipRateValues,
  type OperationalSettingsValues,
  type PaymentSettingsValues,
  type RolePermissionValues,
  type StaffAccessValues,
  type WalkInRateValues,
} from "@/app/(app)/settings/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { roleLabels, type AppRole } from "@/lib/auth/permissions";

type ActionStatus = {
  error?: string;
  message?: string;
};

function FieldError({ message }: { message?: string }) {
  return message ? <p className="text-xs font-bold text-red-700">{message}</p> : null;
}

function StatusMessage({ status }: { status: ActionStatus }) {
  if (status.error) {
    return (
      <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
        {status.error}
      </p>
    );
  }

  if (status.message) {
    return (
      <p className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm font-bold text-green-800">
        {status.message}
      </p>
    );
  }

  return null;
}

function CheckboxField({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex min-h-11 items-center gap-3 rounded-lg border border-n-border bg-white/70 px-4 py-3 text-sm font-bold text-n-ink">
      <input
        checked={checked}
        className="size-4 accent-n-ink"
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
      />
      {label}
    </label>
  );
}

export function GymProfileForm({ defaultValues }: { defaultValues: GymProfileValues }) {
  const [status, setStatus] = useState<ActionStatus>({});
  const [isPending, startTransition] = useTransition();
  const form = useForm<GymProfileValues>({
    defaultValues,
    resolver: zodResolver(gymProfileSchema),
  });

  function onSubmit(values: GymProfileValues) {
    startTransition(async () => setStatus(await saveGymProfile(values)));
  }

  return (
    <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="gym-name">Gym name</Label>
          <Input id="gym-name" {...form.register("name")} />
          <FieldError message={form.formState.errors.name?.message} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="gym-phone">Phone</Label>
          <Input id="gym-phone" {...form.register("phone")} />
          <FieldError message={form.formState.errors.phone?.message} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="gym-email">Email</Label>
          <Input id="gym-email" type="email" {...form.register("email")} />
          <FieldError message={form.formState.errors.email?.message} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="gym-tax">Tax ID</Label>
          <Input id="gym-tax" {...form.register("tax_id")} />
          <FieldError message={form.formState.errors.tax_id?.message} />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="gym-address">Address</Label>
        <Input id="gym-address" {...form.register("address")} />
        <FieldError message={form.formState.errors.address?.message} />
      </div>
      <StatusMessage status={status} />
      <Button className="gap-2" disabled={isPending} type="submit">
        <Save aria-hidden="true" className="size-4" />
        {isPending ? "Saving" : "Save profile"}
      </Button>
    </form>
  );
}

export function PaymentSettingsForm({ defaultValues }: { defaultValues: PaymentSettingsValues }) {
  const [status, setStatus] = useState<ActionStatus>({});
  const [isPending, startTransition] = useTransition();
  const form = useForm<PaymentSettingsValues>({
    defaultValues,
    resolver: zodResolver(paymentSettingsSchema),
  });
  const values = useWatch({ control: form.control });

  function onSubmit(input: PaymentSettingsValues) {
    startTransition(async () => setStatus(await savePaymentSettings(input)));
  }

  return (
    <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
      <div className="grid gap-3 md:grid-cols-2">
        <CheckboxField
          checked={Boolean(values.cash_enabled)}
          label="Cash enabled"
          onChange={(checked) => form.setValue("cash_enabled", checked)}
        />
        <CheckboxField
          checked={Boolean(values.gcash_enabled)}
          label="GCash enabled"
          onChange={(checked) => form.setValue("gcash_enabled", checked)}
        />
        <CheckboxField
          checked={Boolean(values.require_gcash_proof)}
          label="Require GCash proof"
          onChange={(checked) => form.setValue("require_gcash_proof", checked)}
        />
        <CheckboxField
          checked={Boolean(values.allow_partial_payments)}
          label="Allow partial payments"
          onChange={(checked) => form.setValue("allow_partial_payments", checked)}
        />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="currency">Currency</Label>
          <Input id="currency" maxLength={3} {...form.register("currency")} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="gcash-number">GCash number</Label>
          <Input id="gcash-number" {...form.register("gcash_number")} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="gcash-name">GCash account name</Label>
          <Input id="gcash-name" {...form.register("gcash_account_name")} />
        </div>
      </div>
      <StatusMessage status={status} />
      <Button className="gap-2" disabled={isPending} type="submit">
        <Save aria-hidden="true" className="size-4" />
        {isPending ? "Saving" : "Save payments"}
      </Button>
    </form>
  );
}

export function RolePermissionsForm({ defaultValues }: { defaultValues: RolePermissionValues[] }) {
  return (
    <div className="grid gap-4 xl:grid-cols-3">
      {defaultValues.map((roleValues) => (
        <RolePermissionCard defaultValues={roleValues} key={roleValues.role} />
      ))}
    </div>
  );
}

function RolePermissionCard({ defaultValues }: { defaultValues: RolePermissionValues }) {
  const [status, setStatus] = useState<ActionStatus>({});
  const [isPending, startTransition] = useTransition();
  const form = useForm<RolePermissionValues>({
    defaultValues,
    resolver: zodResolver(rolePermissionSchema),
  });
  const values = useWatch({ control: form.control, name: "permissions" });

  function onSubmit(input: RolePermissionValues) {
    startTransition(async () => setStatus(await saveRolePermissions(input)));
  }

  return (
    <form className="space-y-4 rounded-lg border border-n-border bg-white/60 p-5" onSubmit={form.handleSubmit(onSubmit)}>
      <div>
        <p className="text-xs font-semibold text-n-muted">Role</p>
        <h4 className="mt-1 text-lg font-bold text-n-ink">
          {roleLabels[defaultValues.role]}
        </h4>
      </div>
      <div className="space-y-2">
        {permissionKeys.map((permission) => (
          <CheckboxField
            checked={Boolean(values?.[permission])}
            key={permission}
            label={permissionLabels[permission]}
            onChange={(checked) => form.setValue(`permissions.${permission}`, checked)}
          />
        ))}
      </div>
      <StatusMessage status={status} />
      <Button className="w-full gap-2" disabled={isPending} type="submit">
        <Save aria-hidden="true" className="size-4" />
        {isPending ? "Saving" : "Save role"}
      </Button>
    </form>
  );
}

export function MembershipRateForms({ plans }: { plans: MembershipRateValues[] }) {
  return (
    <div className="grid gap-4 xl:grid-cols-3">
      {plans.map((plan) => (
        <MembershipRateForm defaultValues={plan} key={plan.id} />
      ))}
    </div>
  );
}

function MembershipRateForm({ defaultValues }: { defaultValues: MembershipRateValues }) {
  const [status, setStatus] = useState<ActionStatus>({});
  const [isPending, startTransition] = useTransition();
  const form = useForm<MembershipRateValues>({
    defaultValues,
    resolver: zodResolver(membershipRateSchema),
  });
  const isUnlimited = useWatch({ control: form.control, name: "is_unlimited" });

  function onSubmit(input: MembershipRateValues) {
    startTransition(async () => setStatus(await saveMembershipRate(input)));
  }

  return (
    <form className="space-y-4 rounded-lg border border-n-border bg-white/60 p-5" onSubmit={form.handleSubmit(onSubmit)}>
      <div className="space-y-2">
        <Label htmlFor={`plan-name-${defaultValues.id}`}>Plan name</Label>
        <Input id={`plan-name-${defaultValues.id}`} {...form.register("name")} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`price-${defaultValues.id}`}>Price</Label>
          <Input id={`price-${defaultValues.id}`} min="0" step="0.01" type="number" {...form.register("price", { valueAsNumber: true })} />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`duration-${defaultValues.id}`}>Days</Label>
          <Input id={`duration-${defaultValues.id}`} min="1" type="number" {...form.register("duration_days", { valueAsNumber: true })} />
        </div>
      </div>
      <CheckboxField
        checked={isUnlimited}
        label="Unlimited entries"
        onChange={(checked) => form.setValue("is_unlimited", checked)}
      />
      {!isUnlimited ? (
        <div className="space-y-2">
          <Label htmlFor={`limit-${defaultValues.id}`}>Entry limit</Label>
          <Input
            id={`limit-${defaultValues.id}`}
            min="1"
            type="number"
            {...form.register("entry_limit", {
              setValueAs: (value) => (value === "" ? "" : Number(value)),
            })}
          />
          <FieldError message={form.formState.errors.entry_limit?.message} />
        </div>
      ) : null}
      <div className="space-y-2">
        <Label htmlFor={`status-${defaultValues.id}`}>Status</Label>
        <select
          className="min-h-11 w-full rounded-lg border border-n-border bg-white px-4 text-sm font-bold text-n-ink"
          id={`status-${defaultValues.id}`}
          {...form.register("status")}
        >
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="archived">Archived</option>
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor={`description-${defaultValues.id}`}>Description</Label>
        <Input id={`description-${defaultValues.id}`} {...form.register("description")} />
      </div>
      <StatusMessage status={status} />
      <Button className="w-full gap-2" disabled={isPending} type="submit">
        <Save aria-hidden="true" className="size-4" />
        {isPending ? "Saving" : "Save rate"}
      </Button>
    </form>
  );
}

export function StaffAccessForms({ staff }: { staff: StaffAccessValues[] }) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {staff.map((item) => (
        <StaffAccessForm defaultValues={item} key={item.profile_id} />
      ))}
    </div>
  );
}

function StaffAccessForm({ defaultValues }: { defaultValues: StaffAccessValues }) {
  const [status, setStatus] = useState<ActionStatus>({});
  const [isPending, startTransition] = useTransition();
  const form = useForm<StaffAccessValues>({
    defaultValues,
    resolver: zodResolver(staffAccessSchema),
  });
  const values = useWatch({ control: form.control });

  function onSubmit(input: StaffAccessValues) {
    startTransition(async () => setStatus(await saveStaffAccess(input)));
  }

  return (
    <form className="space-y-4 rounded-lg border border-n-border bg-white/60 p-5" onSubmit={form.handleSubmit(onSubmit)}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`staff-name-${defaultValues.profile_id}`}>Name</Label>
          <Input id={`staff-name-${defaultValues.profile_id}`} {...form.register("full_name")} />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`staff-code-${defaultValues.profile_id}`}>Employee code</Label>
          <Input id={`staff-code-${defaultValues.profile_id}`} {...form.register("employee_code")} />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor={`staff-role-${defaultValues.profile_id}`}>Role</Label>
          <select
            className="min-h-11 w-full rounded-lg border border-n-border bg-white px-4 text-sm font-bold text-n-ink"
            id={`staff-role-${defaultValues.profile_id}`}
            {...form.register("role")}
          >
            {(["owner", "admin", "manager", "front_desk", "accountant"] satisfies AppRole[]).map((role) => (
              <option key={role} value={role}>{roleLabels[role]}</option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`profile-status-${defaultValues.profile_id}`}>Login</Label>
          <select
            className="min-h-11 w-full rounded-lg border border-n-border bg-white px-4 text-sm font-bold text-n-ink"
            id={`profile-status-${defaultValues.profile_id}`}
            {...form.register("profile_status")}
          >
            <option value="active">Active</option>
            <option value="disabled">Disabled</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`staff-status-${defaultValues.profile_id}`}>Staff</Label>
          <select
            className="min-h-11 w-full rounded-lg border border-n-border bg-white px-4 text-sm font-bold text-n-ink"
            id={`staff-status-${defaultValues.profile_id}`}
            {...form.register("staff_status")}
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="terminated">Terminated</option>
          </select>
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor={`staff-title-${defaultValues.profile_id}`}>Job title</Label>
        <Input id={`staff-title-${defaultValues.profile_id}`} {...form.register("job_title")} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <CheckboxField checked={Boolean(values.can_open_shift)} label="Open shifts" onChange={(checked) => form.setValue("can_open_shift", checked)} />
        <CheckboxField checked={Boolean(values.can_close_shift)} label="Close shifts" onChange={(checked) => form.setValue("can_close_shift", checked)} />
        <CheckboxField checked={Boolean(values.can_accept_cash)} label="Accept cash" onChange={(checked) => form.setValue("can_accept_cash", checked)} />
        <CheckboxField checked={Boolean(values.can_accept_gcash)} label="Accept GCash" onChange={(checked) => form.setValue("can_accept_gcash", checked)} />
      </div>
      <StatusMessage status={status} />
      <Button className="w-full gap-2" disabled={isPending} type="submit">
        <Save aria-hidden="true" className="size-4" />
        {isPending ? "Saving" : "Save staff"}
      </Button>
    </form>
  );
}

export function WalkInRateForm({ defaultValues }: { defaultValues: WalkInRateValues }) {
  const [status, setStatus] = useState<ActionStatus>({});
  const [isPending, startTransition] = useTransition();
  const form = useForm<WalkInRateValues>({
    defaultValues,
    resolver: zodResolver(walkInRateSchema),
  });

  function onSubmit(input: WalkInRateValues) {
    startTransition(async () => setStatus(await saveWalkInRate(input)));
  }

  return (
    <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="walk-in-amount">Default walk-in rate</Label>
          <Input
            id="walk-in-amount"
            min="0"
            step="0.01"
            type="number"
            {...form.register("amount", { valueAsNumber: true })}
          />
          <FieldError message={form.formState.errors.amount?.message} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="walk-in-currency">Currency</Label>
          <Input id="walk-in-currency" maxLength={3} {...form.register("currency")} />
        </div>
      </div>
      <StatusMessage status={status} />
      <Button className="gap-2" disabled={isPending} type="submit">
        <Save aria-hidden="true" className="size-4" />
        {isPending ? "Saving" : "Save rate"}
      </Button>
    </form>
  );
}

export function OperationalSettingsForm({ defaultValues }: { defaultValues: OperationalSettingsValues }) {
  const [status, setStatus] = useState<ActionStatus>({});
  const [isPending, startTransition] = useTransition();
  const form = useForm<OperationalSettingsValues>({
    defaultValues,
    resolver: zodResolver(operationalSettingsSchema),
  });
  const values = useWatch({ control: form.control });

  function onSubmit(input: OperationalSettingsValues) {
    startTransition(async () => setStatus(await saveOperationalSettings(input)));
  }

  return (
    <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
      <div className="grid gap-3 md:grid-cols-2">
        <CheckboxField
          checked={Boolean(values.allow_utang)}
          label="Allow utang / Pay later"
          onChange={(checked) => form.setValue("allow_utang", checked)}
        />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="max-utang-warning">Max utang warning amount</Label>
          <Input
            id="max-utang-warning"
            min="0"
            step="0.01"
            type="number"
            {...form.register("max_utang_warning_amount", { valueAsNumber: true })}
          />
          <p className="text-xs font-medium text-n-dim">
            Staff see a stronger warning when a customer&apos;s outstanding utang reaches this amount.
          </p>
          <FieldError message={form.formState.errors.max_utang_warning_amount?.message} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="grace-period">Grace period after expiry (days)</Label>
          <Input
            id="grace-period"
            max="365"
            min="0"
            step="1"
            type="number"
            {...form.register("grace_period_days", { valueAsNumber: true })}
          />
          <p className="text-xs font-medium text-n-dim">
            Members can still check in this many days after their membership expires. 0 means no grace period.
          </p>
          <FieldError message={form.formState.errors.grace_period_days?.message} />
        </div>
      </div>
      <StatusMessage status={status} />
      <Button className="gap-2" disabled={isPending} type="submit">
        <Save aria-hidden="true" className="size-4" />
        {isPending ? "Saving" : "Save settings"}
      </Button>
    </form>
  );
}

export function ExceptionTypesForm({ defaultValues }: { defaultValues: ExceptionTypeSettingsValues }) {
  const [status, setStatus] = useState<ActionStatus>({});
  const [isPending, startTransition] = useTransition();
  const form = useForm<ExceptionTypeSettingsValues>({
    defaultValues,
    resolver: zodResolver(exceptionTypeSettingsSchema),
  });
  const { append, fields, remove } = useFieldArray({ control: form.control, name: "types" });
  const types = useWatch({ control: form.control, name: "types" });

  function onSubmit(input: ExceptionTypeSettingsValues) {
    startTransition(async () => setStatus(await saveExceptionTypes(input)));
  }

  return (
    <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
      {fields.map((field, index) => (
        <div className="grid gap-3 rounded-lg border border-n-border bg-white/60 p-4 lg:grid-cols-[1fr_1fr_auto]" key={field.id}>
          <div className="space-y-2">
            <Label htmlFor={`exception-label-${field.id}`}>Label</Label>
            <Input id={`exception-label-${field.id}`} {...form.register(`types.${index}.label`)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`exception-key-${field.id}`}>Key</Label>
            <Input id={`exception-key-${field.id}`} {...form.register(`types.${index}.key`)} />
          </div>
          <div className="flex items-end gap-2">
            <CheckboxField
              checked={Boolean(types?.[index]?.enabled)}
              label="Enabled"
              onChange={(checked) => form.setValue(`types.${index}.enabled`, checked)}
            />
            <CheckboxField
              checked={Boolean(types?.[index]?.requiresApproval)}
              label="Approval"
              onChange={(checked) => form.setValue(`types.${index}.requiresApproval`, checked)}
            />
            <Button
              aria-label="Remove exception type"
              className="size-11 shrink-0 rounded-lg p-0"
              onClick={() => remove(index)}
              type="button"
              variant="secondary"
            >
              <Trash2 aria-hidden="true" className="size-4" />
            </Button>
          </div>
        </div>
      ))}
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button
          className="gap-2"
          onClick={() => append({ enabled: true, key: "new_type", label: "New type", requiresApproval: true })}
          type="button"
          variant="secondary"
        >
          <Plus aria-hidden="true" className="size-4" />
          Add type
        </Button>
        <Button className="gap-2" disabled={isPending} type="submit">
          <Save aria-hidden="true" className="size-4" />
          {isPending ? "Saving" : "Save types"}
        </Button>
      </div>
      <StatusMessage status={status} />
    </form>
  );
}

export { editablePermissionRoles };
