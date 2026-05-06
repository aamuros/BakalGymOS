"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { memberFormSchema, type MemberFormValues } from "@/app/(app)/members/schema";
import { canManageMembers } from "@/lib/auth/permissions";
import { requireModuleAccess } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";

type ActionResult = {
  error?: string;
};

function requireMemberManager(role: Parameters<typeof canManageMembers>[0]) {
  if (!canManageMembers(role)) {
    return { error: "You do not have permission to manage members." };
  }

  return null;
}

export async function createMember(input: MemberFormValues): Promise<ActionResult> {
  const profile = await requireModuleAccess("/members");
  const permissionError = requireMemberManager(profile.role);

  if (permissionError) {
    return permissionError;
  }

  const parsed = memberFormSchema.safeParse(input);

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid member details." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("members")
    .insert({ ...parsed.data, created_by: profile.id })
    .select("id")
    .single();

  if (error) {
    return { error: error.code === "23505" ? "Member ID is already in use." : error.message };
  }

  revalidatePath("/members");
  redirect(`/members/${data.id}`);
}

export async function updateMember(
  memberId: string,
  input: MemberFormValues,
): Promise<ActionResult> {
  const profile = await requireModuleAccess("/members");
  const permissionError = requireMemberManager(profile.role);

  if (permissionError) {
    return permissionError;
  }

  const parsed = memberFormSchema.safeParse(input);

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid member details." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("members").update(parsed.data).eq("id", memberId);

  if (error) {
    return { error: error.code === "23505" ? "Member ID is already in use." : error.message };
  }

  revalidatePath("/members");
  revalidatePath(`/members/${memberId}`);
  redirect(`/members/${memberId}`);
}
