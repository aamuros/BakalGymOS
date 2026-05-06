"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { walkInSchema, type WalkInValues } from "@/app/(app)/front-desk/walk-in-schema";
import { requireModuleAccess } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";

type ActionResult = {
  error?: string;
};

type MemberCheckInRpcResult = {
  message?: string;
  status?: "blocked" | "created";
};

const memberCheckInSchema = z.object({
  memberId: z.string().uuid("Invalid member ID."),
});

export async function createWalkIn(input: WalkInValues): Promise<ActionResult> {
  await requireModuleAccess("/front-desk");

  const parsed = walkInSchema.safeParse(input);

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid walk-in details." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_walk_in", {
    p_amount: parsed.data.amount,
    p_customer_name: parsed.data.customer_name || null,
    p_note: parsed.data.note || null,
    p_payment_method: parsed.data.payment_method,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/front-desk");
  revalidatePath("/payments");
  revalidatePath("/reports");

  return {};
}

export async function checkInActiveMember(memberId: string): Promise<ActionResult> {
  await requireModuleAccess("/front-desk");

  const parsed = memberCheckInSchema.safeParse({ memberId });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid member check-in." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_member_check_in", {
    p_member_id: parsed.data.memberId,
  });

  if (error) {
    return { error: error.message };
  }

  const result = data as MemberCheckInRpcResult | null;

  if (result?.status === "blocked") {
    return { error: result.message ?? "Member check-in was blocked." };
  }

  revalidatePath("/front-desk");
  revalidatePath(`/members/${parsed.data.memberId}`);
  revalidatePath("/reports");

  return {};
}
