"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { hasConfiguredPermission } from "@/lib/auth/configured-permissions";
import { requireModuleAccess } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";

type ActionResult = { error?: string };

const reviewSchema = z.object({
  action: z.enum(["approve", "reject", "resolve", "verify", "follow_up", "acknowledge"], {
    error: "Choose a valid review action.",
  }),
  note: z.string().trim().max(1000, "Note is too long.").optional(),
  sourceId: z.string().uuid("Invalid record ID."),
  sourceType: z.enum(["exception", "gcash_proof", "shift"], {
    error: "Invalid source type.",
  }),
});

export type ReviewOwnerItemValues = z.infer<typeof reviewSchema>;

export async function reviewOwnerItem(input: ReviewOwnerItemValues): Promise<ActionResult> {
  const profile = await requireModuleAccess("/owner-review");
  const parsed = reviewSchema.safeParse(input);

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid review action." };
  }

  const { action, note, sourceId, sourceType } = parsed.data;
  const supabase = await createClient();

  switch (sourceType) {
    case "exception": {
      const canApprove = await hasConfiguredPermission(profile.role, "approve_exceptions");

      if (!canApprove) {
        return { error: "You do not have permission to review exceptions." };
      }

      const { error } = await supabase.rpc("review_exception", {
        p_action: action === "verify" ? "approve" : action,
        p_exception_id: sourceId,
        p_owner_note: note || null,
      });

      if (error) return { error: error.message };
      break;
    }

    case "gcash_proof": {
      const canCorrect = await hasConfiguredPermission(profile.role, "correct_payments");

      if (!canCorrect) {
        return { error: "You do not have permission to review GCash proofs." };
      }

      const { error } = await supabase.rpc("review_gcash_proof", {
        p_action: action,
        p_owner_note: note || null,
        p_proof_id: sourceId,
      });

      if (error) return { error: error.message };
      break;
    }

    case "shift": {
      const { data: shift, error: fetchError } = await supabase
        .from("shifts")
        .select("notes")
        .eq("id", sourceId)
        .maybeSingle();

      if (fetchError) return { error: fetchError.message };
      if (!shift) return { error: "Shift not found." };

      const updatedNotes = [shift.notes, note ? `[Owner: ${note}]` : "[Owner acknowledged variance]"]
        .filter(Boolean)
        .join("\n");

      const { error } = await supabase
        .from("shifts")
        .update({ notes: updatedNotes, status: "reviewed" })
        .eq("id", sourceId);

      if (error) return { error: error.message };

      await supabase.from("audit_logs").insert({
        action: "review_shift_variance",
        action_type: "shift_reviewed",
        actor_id: profile.id,
        actor_role: profile.role,
        entity_id: sourceId,
        entity_table: "shifts",
        entity_type: "shift",
        note: note || "Owner acknowledged cash variance.",
      });
      break;
    }
  }

  revalidatePath("/owner-review");
  revalidatePath("/exceptions");
  revalidatePath("/payments");
  revalidatePath("/payments/gcash-review");
  revalidatePath("/front-desk");
  revalidatePath("/reports");
  revalidatePath("/entry-reconciliation");

  return {};
}
