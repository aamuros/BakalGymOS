import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import {
  canAccessModule,
  getDefaultPathForRole,
  isAppRole,
  type AppProfile,
} from "@/lib/auth/permissions";
import type { ModuleHref } from "@/lib/modules";

export async function getCurrentProfile(): Promise<AppProfile | null> {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return null;
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, role, status")
    .eq("id", user.id)
    .single();

  if (error || !data || data.status !== "active" || !isAppRole(data.role)) {
    return null;
  }

  return data as AppProfile;
}

export async function requireCurrentProfile() {
  const profile = await getCurrentProfile();

  if (!profile) {
    redirect("/login");
  }

  return profile;
}

export async function requireModuleAccess(href: ModuleHref) {
  const profile = await requireCurrentProfile();

  if (!canAccessModule(profile.role, href)) {
    redirect(`/unauthorized?next=${encodeURIComponent(href)}`);
  }

  return profile;
}

export async function redirectToRoleHome() {
  const profile = await requireCurrentProfile();
  redirect(getDefaultPathForRole(profile.role));
}
