"use server";

import { revalidatePath } from "next/cache";

import { hasConfiguredPermission } from "@/lib/auth/configured-permissions";
import { requireModuleAccess } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";

import { balancePaymentSchema, type BalancePaymentValues } from "./schema";

type ActionResult = {
  error?: string;
};

export async function recordBalancePayment(
  balanceId: string,
  input: BalancePaymentValues,
): Promise<ActionResult> {
  const profile = await requireModuleAccess("/balances");
  const canRecordPayments = await hasConfiguredPermission(profile.role, "record_payments");

  if (!canRecordPayments) {
    return { error: "This role is not allowed to record payments." };
  }

  const parsed = balancePaymentSchema.safeParse(input);

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid balance payment." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("record_balance_payment", {
    p_amount: parsed.data.payment_mode === "partial" ? parsed.data.amount ?? null : null,
    p_balance_id: balanceId,
    p_note: parsed.data.note || null,
    p_payment_method: parsed.data.payment_method,
    p_payment_mode: parsed.data.payment_mode,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/balances");
  revalidatePath("/payments");
  revalidatePath("/owner-dashboard");
  revalidatePath("/reports");
  revalidatePath("/shifts");

  return {};
}
