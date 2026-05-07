"use server";

import { revalidatePath } from "next/cache";

import {
  exceptionTypeSettingsSchema,
  gymProfileSchema,
  membershipRateSchema,
  paymentSettingsSchema,
  rolePermissionSchema,
  staffAccessSchema,
  type ExceptionTypeSettingsValues,
  type GymProfileValues,
  type MembershipRateValues,
  type PaymentSettingsValues,
  type RolePermissionValues,
  type StaffAccessValues,
} from "@/app/(app)/settings/schema";
import { canManageSystemSettings } from "@/lib/auth/permissions";
import { requireModuleAccess } from "@/lib/auth/server";
import { hashStaffPin } from "@/lib/auth/staff-pin";
import { createClient } from "@/lib/supabase/server";

type ActionResult = {
  error?: string;
  message?: string;
};

async function requireSettingsManager() {
  const profile = await requireModuleAccess("/settings");

  if (!canManageSystemSettings(profile.role)) {
    throw new Error("Only owner or admin accounts can manage settings.");
  }

  return profile;
}

function firstError(error: { issues: Array<{ message: string }> }) {
  return error.issues[0]?.message ?? "Invalid settings.";
}

function parseStaffProfileId(formData: FormData) {
  const staffProfileId = String(formData.get("staffProfileId") ?? "").trim();

  if (!/^[0-9a-f-]{36}$/i.test(staffProfileId)) {
    return null;
  }

  return staffProfileId;
}

export async function saveStaffPin(_previousState: ActionResult, formData: FormData): Promise<ActionResult> {
  const profile = await requireModuleAccess("/settings");

  if (!canManageSystemSettings(profile.role)) {
    return { error: "Only owner or admin accounts can manage staff PINs." };
  }

  const staffProfileId = parseStaffProfileId(formData);
  const pin = String(formData.get("pin") ?? "").trim();

  if (!staffProfileId) {
    return { error: "Invalid staff profile." };
  }

  if (!/^\d{4,8}$/.test(pin)) {
    return { error: "PIN must be 4 to 8 digits." };
  }

  const supabase = await createClient();
  const { data: existingStaffProfile, error: readError } = await supabase
    .from("staff_profiles")
    .select("id, pin_hash")
    .eq("id", staffProfileId)
    .maybeSingle();

  if (readError || !existingStaffProfile) {
    return { error: readError?.message ?? "Staff profile was not found." };
  }

  const hasExistingPin = Boolean(existingStaffProfile.pin_hash);
  const pinHash = await hashStaffPin(pin);
  const now = new Date().toISOString();
  const updateValues: {
    pin_hash: string;
    pin_reset_at: string | null;
    pin_set_at?: string;
    pin_updated_by: string;
  } = {
    pin_hash: pinHash,
    pin_reset_at: hasExistingPin ? now : null,
    pin_updated_by: profile.id,
  };

  if (!hasExistingPin) {
    updateValues.pin_set_at = now;
  }

  const { error } = await supabase
    .from("staff_profiles")
    .update(updateValues)
    .eq("id", staffProfileId);

  if (error) {
    return { error: error.message };
  }

  const { error: auditError } = await supabase.rpc("record_staff_pin_changed", {
    p_note: hasExistingPin ? "Staff PIN reset" : "Staff PIN set",
    p_staff_profile_id: staffProfileId,
  });

  if (auditError) {
    return { error: auditError.message };
  }

  revalidatePath("/settings");

  return { message: hasExistingPin ? "PIN reset." : "PIN set." };
}

export async function saveRolePermissions(input: RolePermissionValues): Promise<ActionResult> {
  try {
    await requireSettingsManager();
    const parsed = rolePermissionSchema.safeParse(input);

    if (!parsed.success) {
      return { error: firstError(parsed.error) };
    }

    const supabase = await createClient();
    const { error } = await supabase.rpc("update_role_permissions", {
      p_permissions: parsed.data.permissions,
      p_role: parsed.data.role,
    });

    if (error) {
      return { error: error.message };
    }

    revalidatePath("/settings");
    revalidatePath("/reports");

    return { message: "Role permissions saved." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unable to save role permissions." };
  }
}

export async function saveGymProfile(input: GymProfileValues): Promise<ActionResult> {
  try {
    await requireSettingsManager();
    const parsed = gymProfileSchema.safeParse(input);

    if (!parsed.success) {
      return { error: firstError(parsed.error) };
    }

    const supabase = await createClient();
    const { error } = await supabase.rpc("update_admin_setting", {
      p_description: "Gym identity shown on operations and receipts.",
      p_key: "gym_profile",
      p_note: "Gym profile changed",
      p_value: parsed.data,
    });

    if (error) {
      return { error: error.message };
    }

    revalidatePath("/settings");

    return { message: "Gym profile saved." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unable to save gym profile." };
  }
}

export async function savePaymentSettings(input: PaymentSettingsValues): Promise<ActionResult> {
  try {
    await requireSettingsManager();
    const parsed = paymentSettingsSchema.safeParse(input);

    if (!parsed.success) {
      return { error: firstError(parsed.error) };
    }

    const supabase = await createClient();
    const { error } = await supabase.rpc("update_admin_setting", {
      p_description: "Payment method and receipt policy.",
      p_key: "payment_settings",
      p_note: "Payment settings changed",
      p_value: parsed.data,
    });

    if (error) {
      return { error: error.message };
    }

    revalidatePath("/settings");
    revalidatePath("/front-desk");
    revalidatePath("/payments");

    return { message: "Payment settings saved." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unable to save payment settings." };
  }
}

export async function saveExceptionTypes(input: ExceptionTypeSettingsValues): Promise<ActionResult> {
  try {
    await requireSettingsManager();
    const parsed = exceptionTypeSettingsSchema.safeParse(input);

    if (!parsed.success) {
      return { error: firstError(parsed.error) };
    }

    const keys = new Set<string>();

    for (const item of parsed.data.types) {
      if (keys.has(item.key)) {
        return { error: "Exception type keys must be unique." };
      }

      keys.add(item.key);
    }

    const supabase = await createClient();
    const { error } = await supabase.rpc("update_admin_setting", {
      p_description: "Configurable exception labels used by staff.",
      p_key: "exception_type_settings",
      p_note: "Exception type settings changed",
      p_value: parsed.data,
    });

    if (error) {
      return { error: error.message };
    }

    revalidatePath("/settings");
    revalidatePath("/exceptions");

    return { message: "Exception types saved." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unable to save exception types." };
  }
}

export async function saveMembershipRate(input: MembershipRateValues): Promise<ActionResult> {
  try {
    await requireSettingsManager();
    const parsed = membershipRateSchema.safeParse(input);

    if (!parsed.success) {
      return { error: firstError(parsed.error) };
    }

    const supabase = await createClient();
    const { error } = await supabase
      .from("membership_plans")
      .update({
        description: parsed.data.description || null,
        duration_days: parsed.data.duration_days,
        entry_limit: parsed.data.is_unlimited ? null : Number(parsed.data.entry_limit),
        is_unlimited: parsed.data.is_unlimited,
        name: parsed.data.name,
        price: parsed.data.price,
        status: parsed.data.status,
      })
      .eq("id", parsed.data.id);

    if (error) {
      return { error: error.message };
    }

    revalidatePath("/settings");
    revalidatePath("/members");
    revalidatePath("/reports");

    return { message: "Membership rate saved." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unable to save membership rate." };
  }
}

export async function saveStaffAccess(input: StaffAccessValues): Promise<ActionResult> {
  try {
    await requireSettingsManager();
    const parsed = staffAccessSchema.safeParse(input);

    if (!parsed.success) {
      return { error: firstError(parsed.error) };
    }

    const supabase = await createClient();
    const { error } = await supabase.rpc("update_staff_access", {
      p_can_accept_cash: parsed.data.can_accept_cash,
      p_can_accept_gcash: parsed.data.can_accept_gcash,
      p_can_close_shift: parsed.data.can_close_shift,
      p_can_open_shift: parsed.data.can_open_shift,
      p_employee_code: parsed.data.employee_code || null,
      p_full_name: parsed.data.full_name,
      p_job_title: parsed.data.job_title || null,
      p_profile_id: parsed.data.profile_id,
      p_profile_status: parsed.data.profile_status,
      p_role: parsed.data.role,
      p_staff_status: parsed.data.staff_status,
    });

    if (error) {
      return { error: error.message };
    }

    revalidatePath("/settings");
    revalidatePath("/front-desk");

    return { message: "Staff access saved." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unable to save staff access." };
  }
}

export async function deactivateStaff(
  _previousState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const profile = await requireModuleAccess("/settings");

  if (!canManageSystemSettings(profile.role)) {
    return { error: "Only owner or admin accounts can deactivate staff." };
  }

  const staffProfileId = parseStaffProfileId(formData);

  if (!staffProfileId) {
    return { error: "Invalid staff profile." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("staff_profiles")
    .update({
      pin_hash: null,
      status: "inactive",
    })
    .eq("id", staffProfileId);

  if (error) {
    return { error: error.message };
  }

  const { error: auditError } = await supabase.rpc("record_staff_deactivated", {
    p_note: "Staff account deactivated and PIN cleared",
    p_staff_profile_id: staffProfileId,
  });

  if (auditError) {
    return { error: auditError.message };
  }

  revalidatePath("/settings");
  revalidatePath("/front-desk");

  return { message: "Staff account deactivated." };
}
