import { createClient } from "@/lib/supabase/server";
import type { AppProfile, AppRole } from "@/lib/auth/permissions";

export type NotificationRow = {
  id: string;
  notification_type: string;
  title: string;
  body: string | null;
  entity_table: string | null;
  entity_id: string | null;
  related_path: string | null;
  status: "unread" | "read" | "archived";
  created_at: string;
  read_at: string | null;
};

const managementRoles = new Set<AppRole>(["owner", "admin", "manager"]);

export async function refreshOperationalNotifications(profile: AppProfile) {
  if (!managementRoles.has(profile.role)) {
    return;
  }

  const supabase = await createClient();
  await supabase.rpc("refresh_operational_notifications");
}

export async function getUnreadNotificationCount() {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("status", "unread");

  if (error) {
    throw new Error(error.message);
  }

  return count ?? 0;
}

export async function getNotifications() {
  const selectColumns =
    "id, notification_type, title, body, entity_table, entity_id, related_path, status, created_at, read_at";

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notifications")
    .select(selectColumns)
    .order("created_at", { ascending: false })
    .limit(80);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as NotificationRow[];
}
