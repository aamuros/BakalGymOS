import { hasBuiltInPermission, type AppRole, type PermissionKey } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";

export async function hasConfiguredPermission(role: AppRole, permission: PermissionKey) {
  if (role === "owner" || role === "admin") {
    return true;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("role_permissions")
    .select("enabled")
    .eq("role", role)
    .eq("permission_key", permission)
    .maybeSingle();

  if (error) {
    return hasBuiltInPermission(role, permission);
  }

  return data?.enabled ?? hasBuiltInPermission(role, permission);
}

export async function getConfiguredPermissionMap(role: AppRole) {
  if (role === "owner" || role === "admin") {
    return {
      approve_exceptions: true,
      change_rates: true,
      correct_payments: true,
      export_data: true,
      manage_staff: true,
      record_payments: true,
      view_reports: true,
    } satisfies Record<PermissionKey, boolean>;
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("role_permissions")
    .select("permission_key, enabled")
    .eq("role", role);

  const map = {
    approve_exceptions: hasBuiltInPermission(role, "approve_exceptions"),
    change_rates: hasBuiltInPermission(role, "change_rates"),
    correct_payments: hasBuiltInPermission(role, "correct_payments"),
    export_data: hasBuiltInPermission(role, "export_data"),
    manage_staff: hasBuiltInPermission(role, "manage_staff"),
    record_payments: hasBuiltInPermission(role, "record_payments"),
    view_reports: hasBuiltInPermission(role, "view_reports"),
  } satisfies Record<PermissionKey, boolean>;

  for (const row of data ?? []) {
    if (row.permission_key in map) {
      map[row.permission_key as PermissionKey] = Boolean(row.enabled);
    }
  }

  return map;
}
