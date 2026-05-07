"use server";

import { revalidatePath } from "next/cache";

import { canManageSystemSettings } from "@/lib/auth/permissions";
import { requireModuleAccess } from "@/lib/auth/server";
import { hashStaffPin } from "@/lib/auth/staff-pin";
import { createClient } from "@/lib/supabase/server";

type ActionResult = {
  error?: string;
  message?: string;
};

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
