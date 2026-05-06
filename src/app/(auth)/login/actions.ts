"use server";

import { redirect } from "next/navigation";

import { getCurrentProfile } from "@/lib/auth/server";
import { getDefaultPathForRole } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";

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
