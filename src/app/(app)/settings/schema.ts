import { z } from "zod";

import { appRoles } from "@/lib/auth/permissions";

export const permissionKeys = [
  "record_payments",
  "correct_payments",
  "approve_exceptions",
  "view_reports",
  "manage_staff",
  "change_rates",
  "export_data",
] as const;

export const permissionLabels: Record<(typeof permissionKeys)[number], string> = {
  approve_exceptions: "Approve exceptions",
  change_rates: "Change rates",
  correct_payments: "Correct payments",
  export_data: "Export data",
  manage_staff: "Manage staff",
  record_payments: "Record payments",
  view_reports: "View reports",
};

export const editablePermissionRoles = ["manager", "front_desk", "accountant"] as const;

export const rolePermissionSchema = z.object({
  role: z.enum(editablePermissionRoles),
  permissions: z.object(
    Object.fromEntries(permissionKeys.map((key) => [key, z.boolean()])) as Record<
      (typeof permissionKeys)[number],
      z.ZodBoolean
    >,
  ),
});

export const gymProfileSchema = z.object({
  address: z.string().trim().max(240, "Address is too long."),
  email: z.union([z.literal(""), z.string().trim().email("Enter a valid email.")]),
  name: z.string().trim().min(2, "Gym name is required.").max(120, "Gym name is too long."),
  phone: z.string().trim().max(40, "Phone is too long."),
  tax_id: z.string().trim().max(80, "Tax ID is too long."),
});

export const paymentSettingsSchema = z.object({
  allow_partial_payments: z.boolean(),
  cash_enabled: z.boolean(),
  currency: z.string().trim().min(3).max(3),
  gcash_account_name: z.string().trim().max(120, "GCash account name is too long."),
  gcash_enabled: z.boolean(),
  gcash_number: z.string().trim().max(40, "GCash number is too long."),
  require_gcash_proof: z.boolean(),
});

export const exceptionTypeSchema = z.object({
  enabled: z.boolean(),
  key: z.string().trim().min(2).max(60).regex(/^[a-z0-9_]+$/, "Use lowercase letters, numbers, and underscores."),
  label: z.string().trim().min(2, "Label is required.").max(80, "Label is too long."),
  requiresApproval: z.boolean(),
});

export const exceptionTypeSettingsSchema = z.object({
  types: z.array(exceptionTypeSchema).min(1, "Add at least one exception type.").max(12, "Use 12 types or fewer."),
});

export const membershipRateSchema = z.object({
  description: z.string().trim().max(240, "Description is too long."),
  duration_days: z.number().int().min(1, "Duration must be at least 1 day."),
  entry_limit: z.union([z.literal(""), z.number().int().min(1)]).optional(),
  id: z.string().uuid("Invalid membership plan."),
  is_unlimited: z.boolean(),
  name: z.string().trim().min(2, "Plan name is required.").max(100, "Plan name is too long."),
  price: z.number().min(0, "Price cannot be negative."),
  status: z.enum(["active", "inactive", "archived"]),
}).refine((value) => value.is_unlimited || value.entry_limit, {
  message: "Limited plans need an entry limit.",
  path: ["entry_limit"],
});

export const staffAccessSchema = z.object({
  can_accept_cash: z.boolean(),
  can_accept_gcash: z.boolean(),
  can_close_shift: z.boolean(),
  can_open_shift: z.boolean(),
  employee_code: z.string().trim().max(40, "Employee code is too long."),
  full_name: z.string().trim().min(2, "Staff name is required.").max(120, "Staff name is too long."),
  job_title: z.string().trim().max(120, "Job title is too long."),
  profile_id: z.string().uuid("Invalid staff profile."),
  profile_status: z.enum(["active", "disabled"]),
  role: z.enum(appRoles),
  staff_status: z.enum(["active", "inactive", "terminated"]),
});

export type ExceptionTypeSettingsValues = z.infer<typeof exceptionTypeSettingsSchema>;
export type GymProfileValues = z.infer<typeof gymProfileSchema>;
export type MembershipRateValues = z.infer<typeof membershipRateSchema>;
export type PaymentSettingsValues = z.infer<typeof paymentSettingsSchema>;
export type RolePermissionValues = z.infer<typeof rolePermissionSchema>;
export type StaffAccessValues = z.infer<typeof staffAccessSchema>;
