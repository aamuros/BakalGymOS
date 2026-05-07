"use server";

import { revalidatePath } from "next/cache";

import {
  exceptionReviewSchema,
  exceptionSchema,
  type ExceptionReviewValues,
  type ExceptionValues,
} from "@/app/(app)/exceptions/schema";
import { hasConfiguredPermission } from "@/lib/auth/configured-permissions";
import { requireModuleAccess } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";

type ActionResult = {
  error?: string;
};

export async function createException(input: ExceptionValues): Promise<ActionResult> {
  await requireModuleAccess("/exceptions");

  const parsed = exceptionSchema.safeParse(input);

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid exception details." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_exception", {
    p_amount: parsed.data.amount ?? null,
    p_exception_type: parsed.data.exception_type,
    p_member_id: parsed.data.member_id ?? null,
    p_person_name: parsed.data.person_name || null,
    p_reason: parsed.data.reason,
    p_related_entry_id: parsed.data.related_entry_id ?? null,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/exceptions");
  revalidatePath("/front-desk");
  revalidatePath("/reports");

  return {};
}

export async function reviewException(input: ExceptionReviewValues): Promise<ActionResult> {
  const profile = await requireModuleAccess("/exceptions");
  const canApproveExceptions = await hasConfiguredPermission(profile.role, "approve_exceptions");

  if (!canApproveExceptions) {
    return { error: "You do not have permission to review exceptions." };
  }

  const parsed = exceptionReviewSchema.safeParse(input);

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid exception action." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("review_exception", {
    p_action: parsed.data.action,
    p_exception_id: parsed.data.exceptionId,
    p_owner_note: parsed.data.ownerNote || null,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/exceptions");
  revalidatePath("/front-desk");
  revalidatePath("/reports");

  return {};
}
