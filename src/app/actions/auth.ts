"use server";

import { redirect } from "next/navigation";

import { clearStaffPinSession } from "@/lib/auth/staff-pin";
import { createClient } from "@/lib/supabase/server";

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  await clearStaffPinSession();
  redirect("/login");
}
