import { createClient, createServiceClient } from "@/lib/supabase/server";
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
  if (profile.accessMode === "staff_pin" || !managementRoles.has(profile.role)) {
    return;
  }

  const supabase = await createClient();
  await supabase.rpc("refresh_operational_notifications");
}

export async function getUnreadNotificationCount(profile: AppProfile) {
  if (profile.accessMode === "staff_pin") {
    const supabase = createServiceClient();
    const { count, error } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("recipient_id", profile.id)
      .eq("status", "unread");

    if (error) {
      throw new Error(error.message);
    }

    return count ?? 0;
  }

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

export async function getNotifications(profile: AppProfile) {
  const selectColumns =
    "id, notification_type, title, body, entity_table, entity_id, related_path, status, created_at, read_at";

  if (profile.accessMode === "staff_pin") {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("notifications")
      .select(selectColumns)
      .eq("recipient_id", profile.id)
      .order("created_at", { ascending: false })
      .limit(80);

    if (error) {
      throw new Error(error.message);
    }

    return (data ?? []) as NotificationRow[];
  }

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

export async function createBlockedCheckInNotifications({
  attemptedByProfileId,
  memberCode,
  memberId,
  memberName,
  reason,
}: {
  attemptedByProfileId: string;
  memberCode?: string | null;
  memberId: string;
  memberName: string;
  reason: "banned_member" | "expired_member";
}) {
  const supabase = createServiceClient();
  const [{ data: recipients, error: recipientsError }, { data: actor, error: actorError }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("id")
        .in("role", ["owner", "admin", "manager"])
        .eq("status", "active"),
      supabase
        .from("profiles")
        .select("full_name")
        .eq("id", attemptedByProfileId)
        .maybeSingle(),
    ]);

  const error = recipientsError ?? actorError;

  if (error) {
    throw new Error(error.message);
  }

  const notificationType =
    reason === "banned_member"
      ? "banned_member_check_in_attempt"
      : "expired_member_entry_attempt";
  const title =
    reason === "banned_member"
      ? "Banned member check-in attempt"
      : "Expired member tried to enter";
  const body = `${actor?.full_name ?? "Staff"} attempted check-in for ${memberName}.`;
  const nowKey = new Date()
    .toISOString()
    .slice(0, 16)
    .replaceAll("-", "")
    .replaceAll(":", "")
    .replaceAll("T", "");

  const rows = (recipients ?? []).map((recipient) => ({
    body,
    dedupe_key: `${notificationType}:${memberId}:${nowKey}`,
    entity_id: memberId,
    entity_table: "members",
    metadata: {
      attempted_by: attemptedByProfileId,
      member_code: memberCode,
      member_id: memberId,
      reason,
    },
    notification_type: notificationType,
    recipient_id: recipient.id,
    related_path: `/members/${memberId}`,
    title,
  }));

  if (!rows.length) {
    return;
  }

  const { error: insertError } = await supabase.from("notifications").insert(rows);

  if (insertError && insertError.code !== "23505") {
    throw new Error(insertError.message);
  }
}
