"use server";

import { revalidatePath } from "next/cache";

import { requireModuleAccess } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";

type ActionResult = {
  error?: string;
};

export async function markNotificationRead(notificationId: string): Promise<ActionResult> {
  const profile = await requireModuleAccess("/notifications");
  const now = new Date().toISOString();

  const supabase = await createClient();
  const query = supabase
    .from("notifications")
    .update({
      read_at: now,
      status: "read",
    })
    .eq("id", notificationId)
    .eq("recipient_id", profile.id);

  const { error } = await query;

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/notifications");
  revalidatePath("/");

  return {};
}

export async function markAllNotificationsRead(): Promise<ActionResult> {
  const profile = await requireModuleAccess("/notifications");
  const now = new Date().toISOString();

  const supabase = await createClient();
  const { error } = await supabase
    .from("notifications")
    .update({
      read_at: now,
      status: "read",
    })
    .eq("recipient_id", profile.id)
    .eq("status", "unread");

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/notifications");
  revalidatePath("/");

  return {};
}
