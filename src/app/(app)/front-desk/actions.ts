"use server";

import { revalidatePath } from "next/cache";

import { walkInSchema, type WalkInValues } from "@/app/(app)/front-desk/walk-in-schema";
import { requireModuleAccess } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";

type ActionResult = {
  error?: string;
};

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
