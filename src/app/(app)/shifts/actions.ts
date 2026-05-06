"use server";

import { revalidatePath } from "next/cache";

import { startShiftSchema, type StartShiftValues } from "@/app/(app)/shifts/schema";
import { roleLabels, type AppRole } from "@/lib/auth/permissions";
import { requireModuleAccess } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";

type ActionResult = {
  error?: string;
};

const shiftStarterRoles = new Set<AppRole>(["owner", "admin", "manager", "front_desk"]);
const managementRoles = new Set<AppRole>(["owner", "admin", "manager"]);

export async function startShift(input: StartShiftValues): Promise<ActionResult> {
  const profile = await requireModuleAccess("/front-desk");

  if (!shiftStarterRoles.has(profile.role)) {
    return { error: "You do not have permission to start shifts." };
  }

  const parsed = startShiftSchema.safeParse(input);

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid shift details." };
  }

  const supabase = await createClient();
  const { data: existingStaffProfile, error: staffError } = await supabase
    .from("staff_profiles")
    .select("id, can_open_shift, status")
    .eq("profile_id", profile.id)
    .maybeSingle();

  if (staffError) {
    return { error: staffError.message };
  }

  let staffProfileId = existingStaffProfile?.id;

  if (!staffProfileId) {
    if (!managementRoles.has(profile.role)) {
      return { error: "Your account is missing an active staff profile." };
    }

    const { data: createdStaffProfile, error: createStaffError } = await supabase
      .from("staff_profiles")
      .insert({
        can_accept_cash: true,
        can_accept_gcash: true,
        can_close_shift: true,
        can_open_shift: true,
        job_title: roleLabels[profile.role],
        profile_id: profile.id,
      })
      .select("id")
      .single();

    if (createStaffError) {
      return { error: createStaffError.message };
    }

    staffProfileId = createdStaffProfile.id;
  }

  if (existingStaffProfile && existingStaffProfile.status !== "active") {
    return { error: "Your staff profile is not active." };
  }

  if (existingStaffProfile && !existingStaffProfile.can_open_shift) {
    return { error: "Your staff profile is not allowed to open shifts." };
  }

  const { data: activeShift, error: activeShiftError } = await supabase
    .from("shifts")
    .select("id")
    .eq("staff_profile_id", staffProfileId)
    .eq("status", "open")
    .is("closed_at", null)
    .maybeSingle();

  if (activeShiftError) {
    return { error: activeShiftError.message };
  }

  if (activeShift) {
    return { error: "You already have an active shift." };
  }

  const { error } = await supabase.from("shifts").insert({
    notes: parsed.data.note || null,
    opened_by: profile.id,
    opening_cash: parsed.data.starting_cash,
    staff_profile_id: staffProfileId,
    status: "open",
  });

  if (error) {
    return {
      error:
        error.code === "23505"
          ? "You already have an active shift."
          : error.message,
    };
  }

  revalidatePath("/front-desk");
  revalidatePath("/shifts");

  return {};
}
