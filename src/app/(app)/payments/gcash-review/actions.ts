"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { hasConfiguredPermission } from "@/lib/auth/configured-permissions";
import { requireModuleAccess } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";

type ActionResult = {
  error?: string;
};

const gcashReviewSchema = z.object({
  action: z.enum(["verify", "reject", "follow_up"], {
    error: "Choose a valid GCash review action.",
  }),
  note: z.string().trim().max(1000, "Note is too long.").optional(),
  proofId: z.string().uuid("Invalid GCash proof ID."),
});

export type GcashReviewValues = z.infer<typeof gcashReviewSchema>;

export async function reviewGcashProof(input: GcashReviewValues): Promise<ActionResult> {
  const profile = await requireModuleAccess("/payments");
  const canCorrectPayments = await hasConfiguredPermission(profile.role, "correct_payments");

  if (!canCorrectPayments) {
    return { error: "You do not have permission to review GCash proofs." };
  }

  const parsed = gcashReviewSchema.safeParse(input);

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid GCash review action." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("review_gcash_proof", {
    p_action: parsed.data.action,
    p_owner_note: parsed.data.note || null,
    p_proof_id: parsed.data.proofId,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/payments");
  revalidatePath("/payments/gcash-review");
  revalidatePath("/front-desk");
  revalidatePath("/reports");

  return {};
}
