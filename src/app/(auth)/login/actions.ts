"use server";

import { redirect } from "next/navigation";

import { getCurrentProfile } from "@/lib/auth/server";
import { getDefaultPathForRole } from "@/lib/auth/permissions";
import { setStaffPinSession, verifyStaffPin } from "@/lib/auth/staff-pin";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export type LoginState = {
  error?: string;
};

export async function login(_previousState: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Enter your email and password." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: "Invalid email or password." };
  }

  const profile = await getCurrentProfile();

  if (!profile) {
    await supabase.auth.signOut();
    return { error: "No active staff profile is assigned to this account." };
  }

  redirect(getDefaultPathForRole(profile.role));
}

export async function loginWithStaffPin(
  _previousState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const pin = String(formData.get("pin") ?? "").trim();

  if (!/^\d{4,8}$/.test(pin)) {
    return { error: "Enter a valid staff PIN." };
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("staff_profiles")
    .select("id, profile_id, status, pin_hash, profiles(id, role, status)")
    .not("pin_hash", "is", null)
    .eq("status", "active");

  if (error) {
    return { error: error.message };
  }

  for (const staffProfile of data ?? []) {
    const profile = Array.isArray(staffProfile.profiles)
      ? staffProfile.profiles[0]
      : staffProfile.profiles;

    if (!profile || profile.status !== "active") {
      continue;
    }

    if (await verifyStaffPin(pin, staffProfile.pin_hash)) {
      await setStaffPinSession(staffProfile.id, staffProfile.profile_id);
      redirect("/front-desk");
    }
  }

  return { error: "Invalid or inactive staff PIN." };
}
