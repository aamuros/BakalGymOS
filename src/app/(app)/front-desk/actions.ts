"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  expiredMemberActionSchema,
  type ExpiredMemberActionValues,
} from "@/app/(app)/front-desk/expired-member-schema";
import { walkInSchema, type WalkInValues } from "@/app/(app)/front-desk/walk-in-schema";
import { hasConfiguredPermission } from "@/lib/auth/configured-permissions";
import { requireModuleAccess } from "@/lib/auth/server";
import { createBlockedCheckInNotifications } from "@/lib/notifications";
import { createClient, createServiceClient } from "@/lib/supabase/server";

type ActionResult = {
  error?: string;
};

type MemberCheckInRpcResult = {
  message?: string;
  status?: "blocked" | "created";
};

type FrontDeskProfile = Awaited<ReturnType<typeof requireModuleAccess>>;

type ActivePinShift = {
  can_accept_cash: boolean;
  can_accept_gcash: boolean;
  can_close_shift: boolean;
  expected_cash: number | string | null;
  id: string;
  opening_cash: number | string;
  staff_profile_id: string;
};

const memberCheckInSchema = z.object({
  memberId: z.string().uuid("Invalid member ID."),
});

const expiredMemberRpcSchema = expiredMemberActionSchema.extend({
  memberId: z.string().uuid("Invalid member ID."),
});

const proofUploadSchema = z.object({
  proofId: z.string().uuid("Invalid GCash proof ID."),
  referenceNumber: z.string().trim().max(80, "Reference number is too long.").optional(),
  senderMobile: z.string().trim().max(40, "Sender mobile is too long.").optional(),
  senderName: z.string().trim().max(120, "Sender name is too long.").optional(),
});

const allowedProofMimeTypes = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

const maxProofImageSize = 5 * 1024 * 1024;

async function getActivePinShift(profile: FrontDeskProfile, supabase = createServiceClient()) {
  if (profile.accessMode !== "staff_pin" || !profile.staffProfileId) {
    return null;
  }

  const { data: staffProfile, error: staffError } = await supabase
    .from("staff_profiles")
    .select("id, profile_id, status, can_accept_cash, can_accept_gcash, can_close_shift")
    .eq("id", profile.staffProfileId)
    .eq("profile_id", profile.id)
    .maybeSingle();

  if (staffError) {
    throw new Error(staffError.message);
  }

  if (!staffProfile || staffProfile.status !== "active") {
    throw new Error("Your staff profile is not active.");
  }

  const { data: shift, error: shiftError } = await supabase
    .from("shifts")
    .select("id, expected_cash, opening_cash, staff_profile_id")
    .eq("staff_profile_id", staffProfile.id)
    .eq("opened_by", profile.id)
    .eq("status", "open")
    .is("closed_at", null)
    .order("opened_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (shiftError) {
    throw new Error(shiftError.message);
  }

  if (!shift) {
    throw new Error("Start an active shift before recording front desk activity.");
  }

  return {
    can_accept_cash: staffProfile.can_accept_cash,
    can_accept_gcash: staffProfile.can_accept_gcash,
    can_close_shift: staffProfile.can_close_shift,
    id: shift.id,
    expected_cash: shift.expected_cash,
    opening_cash: shift.opening_cash,
    staff_profile_id: shift.staff_profile_id,
  } satisfies ActivePinShift;
}

async function createWalkInWithPin(profile: FrontDeskProfile, input: WalkInValues): Promise<ActionResult> {
  const canRecordPayments = await hasConfiguredPermission(profile.role, "record_payments");

  if (!canRecordPayments) {
    return { error: "This role is not allowed to record payments." };
  }

  const parsed = walkInSchema.safeParse(input);

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid walk-in details." };
  }

  const supabase = createServiceClient();

  try {
    const activeShift = await getActivePinShift(profile, supabase);

    if (!activeShift) {
      return { error: "Staff PIN session is not active." };
    }

    if (parsed.data.payment_method === "cash" && !activeShift.can_accept_cash) {
      return { error: "This staff profile is not allowed to accept cash." };
    }

    if (parsed.data.payment_method === "gcash" && !activeShift.can_accept_gcash) {
      return { error: "This staff profile is not allowed to accept GCash." };
    }

    const note = parsed.data.note || null;
    const customerName = parsed.data.customer_name || null;
    let paymentId: string | null = null;
    let proofId: string | null = null;

    if (parsed.data.payment_method === "cash" || parsed.data.payment_method === "gcash") {
      const { data: payment, error: paymentError } = await supabase
        .from("payments")
        .insert({
          amount: parsed.data.amount,
          notes: note,
          paid_at: new Date().toISOString(),
          payment_type: parsed.data.payment_method,
          purpose: "walk_in_entry",
          received_by: profile.id,
          shift_id: activeShift.id,
          status: parsed.data.payment_method === "gcash" ? "pending_proof" : "completed",
        })
        .select("id")
        .single();

      if (paymentError) {
        return { error: paymentError.message };
      }

      paymentId = payment.id;
    }

    const { data: entry, error: entryError } = await supabase
      .from("entries")
      .insert({
        checked_in_by: profile.id,
        guest_name: customerName,
        notes: note,
        payment_id: paymentId,
        settlement_type: parsed.data.payment_method,
        shift_id: activeShift.id,
        status:
          parsed.data.payment_method === "cash"
            ? "settled"
            : parsed.data.payment_method === "gcash"
              ? "gcash_pending_review"
              : "pending",
      })
      .select("id")
      .single();

    if (entryError) {
      return { error: entryError.message };
    }

    if (parsed.data.payment_method === "cash") {
      const { error } = await supabase
        .from("shifts")
        .update({
          expected_cash: Number(activeShift.expected_cash ?? activeShift.opening_cash) + parsed.data.amount,
        })
        .eq("id", activeShift.id);

      if (error) {
        return { error: error.message };
      }
    } else if (parsed.data.payment_method === "gcash" && paymentId) {
      const { data: proof, error } = await supabase
        .from("gcash_proofs")
        .insert({
          file_name: "Pending proof",
          payment_id: paymentId,
          proof_status: "pending_proof",
          storage_path: `pending-proofs/${paymentId}`,
          uploaded_by: profile.id,
        })
        .select("id")
        .single();

      if (error) {
        return { error: error.message };
      }

      proofId = proof.id;
    } else {
      const { error } = await supabase.from("walk_in_balances").insert({
        amount: parsed.data.amount,
        created_by: profile.id,
        customer_name: customerName,
        entry_id: entry.id,
        note,
        shift_id: activeShift.id,
      });

      if (error) {
        return { error: error.message };
      }
    }

    await supabase.from("audit_logs").insert({
      action: "staff_pin_walk_in_created",
      action_type: "staff_pin_walk_in_created",
      actor_id: profile.id,
      entity_id: entry.id,
      entity_table: "entries",
      entity_type: "entries",
      new_data: {
        entry_id: entry.id,
        gcash_proof_id: proofId,
        payment_id: paymentId,
        shift_id: activeShift.id,
        staff_profile_id: activeShift.staff_profile_id,
      },
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unable to record walk-in." };
  }

  revalidatePath("/front-desk");
  revalidatePath("/payments");
  revalidatePath("/reports");

  return {};
}

export async function createWalkIn(input: WalkInValues): Promise<ActionResult> {
  const profile = await requireModuleAccess("/front-desk");
  const canRecordPayments = await hasConfiguredPermission(profile.role, "record_payments");

  if (!canRecordPayments) {
    return { error: "This role is not allowed to record payments." };
  }

  if (profile.accessMode === "staff_pin") {
    return createWalkInWithPin(profile, input);
  }

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

export async function handleExpiredMemberEntry(
  memberId: string,
  input: ExpiredMemberActionValues,
): Promise<ActionResult> {
  const profile = await requireModuleAccess("/front-desk");

  const parsed = expiredMemberRpcSchema.safeParse({ ...input, memberId });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid expired member action." };
  }

  if (profile.accessMode === "staff_pin") {
    const supabase = createServiceClient();

    try {
      const activeShift = await getActivePinShift(profile, supabase);

      if (!activeShift) {
        return { error: "Staff PIN session is not active." };
      }

      const { data: member, error: memberError } = await supabase
        .from("members")
        .select("id, full_name, member_code, status")
        .eq("id", parsed.data.memberId)
        .maybeSingle();

      if (memberError || !member) {
        return { error: memberError?.message ?? "Member was not found." };
      }

      if (member.status === "banned") {
        await createBlockedCheckInNotifications({
          attemptedByProfileId: profile.id,
          memberCode: member.member_code,
          memberId: member.id,
          memberName: member.full_name,
          reason: "banned_member",
        });

        return { error: "Banned members cannot be checked in or overridden at the front desk." };
      }

      const reason = parsed.data.reason || null;
      let paymentId: string | null = null;
      let entryId: string | null = null;
      let balanceId: string | null = null;
      let exceptionId: string | null = null;

      if (parsed.data.action_type === "pay_walk_in") {
        const amount = Number(parsed.data.amount ?? 0);

        if (amount <= 0) {
          return { error: "Amount must be greater than zero." };
        }

        if (parsed.data.payment_method === "cash" && !activeShift.can_accept_cash) {
          return { error: "This staff profile is not allowed to accept cash." };
        }

        if (parsed.data.payment_method === "gcash" && !activeShift.can_accept_gcash) {
          return { error: "This staff profile is not allowed to accept GCash." };
        }

        const { data: payment, error: paymentError } = await supabase
          .from("payments")
          .insert({
            amount,
            member_id: member.id,
            notes: reason ?? "Expired member walk-in payment",
            paid_at: new Date().toISOString(),
            payment_type: parsed.data.payment_method,
            purpose: "walk_in_entry",
            received_by: profile.id,
            shift_id: activeShift.id,
            status: parsed.data.payment_method === "gcash" ? "pending_proof" : "completed",
          })
          .select("id")
          .single();

        if (paymentError) {
          return { error: paymentError.message };
        }

        paymentId = payment.id;

        const { data: entry, error: entryError } = await supabase
          .from("entries")
          .insert({
            checked_in_by: profile.id,
            member_id: member.id,
            notes: reason ?? "Expired member paid walk-in",
            payment_id: paymentId,
            settlement_type: parsed.data.payment_method === "gcash" ? "gcash" : "cash",
            shift_id: activeShift.id,
            status: parsed.data.payment_method === "gcash" ? "gcash_pending_review" : "settled",
          })
          .select("id")
          .single();

        if (entryError) {
          return { error: entryError.message };
        }

        entryId = entry.id;

        if (parsed.data.payment_method === "cash") {
          const { error } = await supabase
            .from("shifts")
            .update({
              expected_cash: Number(activeShift.expected_cash ?? activeShift.opening_cash) + amount,
            })
            .eq("id", activeShift.id);

          if (error) {
            return { error: error.message };
          }
        } else if (parsed.data.payment_method === "gcash") {
          const { error } = await supabase.from("gcash_proofs").insert({
            file_name: "Pending proof",
            payment_id: paymentId,
            proof_status: "pending_proof",
            storage_path: `pending-proofs/${paymentId}`,
            uploaded_by: profile.id,
          });

          if (error) {
            return { error: error.message };
          }
        }
      } else if (parsed.data.action_type === "record_utang") {
        const amount = Number(parsed.data.amount ?? 0);

        if (amount <= 0) {
          return { error: "Amount must be greater than zero." };
        }

        const { data: entry, error: entryError } = await supabase
          .from("entries")
          .insert({
            checked_in_by: profile.id,
            member_id: member.id,
            notes: reason,
            settlement_type: "pending",
            shift_id: activeShift.id,
            status: "pending",
          })
          .select("id")
          .single();

        if (entryError) {
          return { error: entryError.message };
        }

        entryId = entry.id;

        const { data: balance, error: balanceError } = await supabase
          .from("walk_in_balances")
          .insert({
            amount,
            created_by: profile.id,
            customer_name: member.full_name,
            entry_id: entry.id,
            member_id: member.id,
            note: reason,
            shift_id: activeShift.id,
          })
          .select("id")
          .single();

        if (balanceError) {
          return { error: balanceError.message };
        }

        balanceId = balance.id;
      } else {
        const { data: exception, error: exceptionError } = await supabase
          .from("exceptions")
          .insert({
            created_by: profile.id,
            exception_type: "owner_approved_free_entry",
            member_id: member.id,
            reason,
            shift_id: activeShift.id,
            staff_profile_id: activeShift.staff_profile_id,
            status: "pending",
          })
          .select("id")
          .single();

        if (exceptionError) {
          return { error: exceptionError.message };
        }

        exceptionId = exception.id;

        const { data: entry, error: entryError } = await supabase
          .from("entries")
          .insert({
            checked_in_by: profile.id,
            exception_id: exception.id,
            member_id: member.id,
            notes: reason,
            settlement_type: "exception",
            shift_id: activeShift.id,
            status: "needs_review",
          })
          .select("id")
          .single();

        if (entryError) {
          return { error: entryError.message };
        }

        entryId = entry.id;
        await supabase.from("exceptions").update({ entry_id: entry.id }).eq("id", exception.id);
      }

      await supabase.from("audit_logs").insert({
        action: `staff_pin_expired_member_${parsed.data.action_type}`,
        action_type: `staff_pin_expired_member_${parsed.data.action_type}`,
        actor_id: profile.id,
        entity_id: member.id,
        entity_table: "members",
        entity_type: "members",
        new_data: {
          balance_id: balanceId,
          entry_id: entryId,
          exception_id: exceptionId,
          member_id: member.id,
          payment_id: paymentId,
          shift_id: activeShift.id,
          staff_profile_id: activeShift.staff_profile_id,
        },
      });
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "Unable to handle expired member entry.",
      };
    }

    revalidatePath("/front-desk");
    revalidatePath(`/members/${parsed.data.memberId}`);
    revalidatePath("/payments");
    revalidatePath("/exceptions");
    revalidatePath("/reports");

    return {};
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("handle_expired_member_entry", {
    p_action_type: parsed.data.action_type,
    p_amount: parsed.data.action_type === "owner_override" ? null : parsed.data.amount,
    p_member_id: parsed.data.memberId,
    p_payment_method: parsed.data.payment_method,
    p_reason: parsed.data.reason || null,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/front-desk");
  revalidatePath(`/members/${parsed.data.memberId}`);
  revalidatePath("/payments");
  revalidatePath("/exceptions");
  revalidatePath("/reports");

  return {};
}

export async function checkInActiveMember(memberId: string): Promise<ActionResult> {
  const profile = await requireModuleAccess("/front-desk");

  const parsed = memberCheckInSchema.safeParse({ memberId });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid member check-in." };
  }

  if (profile.accessMode === "staff_pin") {
    const supabase = createServiceClient();

    try {
      const activeShift = await getActivePinShift(profile, supabase);

      if (!activeShift) {
        return { error: "Staff PIN session is not active." };
      }

      const { data: member, error: memberError } = await supabase
        .from("members")
        .select("id, full_name, member_code, status")
        .eq("id", parsed.data.memberId)
        .maybeSingle();

      if (memberError || !member) {
        return { error: memberError?.message ?? "Member was not found." };
      }

      if (member.status === "banned") {
        await createBlockedCheckInNotifications({
          attemptedByProfileId: profile.id,
          memberCode: member.member_code,
          memberId: member.id,
          memberName: member.full_name,
          reason: "banned_member",
        });

        return { error: "Banned members cannot be checked in." };
      }

      const { data: subscription, error: subscriptionError } = await supabase
        .from("member_subscriptions")
        .select("id, entries_used, membership_plans(entry_limit, is_unlimited)")
        .eq("member_id", member.id)
        .eq("status", "active")
        .lte("starts_at", new Date().toISOString().slice(0, 10))
        .gte("ends_at", new Date().toISOString().slice(0, 10))
        .order("ends_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (subscriptionError) {
        return { error: subscriptionError.message };
      }

      const plan = Array.isArray(subscription?.membership_plans)
        ? subscription?.membership_plans[0]
        : subscription?.membership_plans;

      if (!subscription || (!plan?.is_unlimited && subscription.entries_used >= Number(plan?.entry_limit ?? 0))) {
        await createBlockedCheckInNotifications({
          attemptedByProfileId: profile.id,
          memberCode: member.member_code,
          memberId: member.id,
          memberName: member.full_name,
          reason: "expired_member",
        });

        return { error: "This member is expired. Choose Pay Walk-In, Record Utang, or Owner Override." };
      }

      const { data: entry, error: entryError } = await supabase
        .from("entries")
        .insert({
          checked_in_by: profile.id,
          member_id: member.id,
          notes: "Active member check-in",
          settlement_type: "active_member",
          shift_id: activeShift.id,
          status: "completed",
          subscription_id: subscription.id,
        })
        .select("id")
        .single();

      if (entryError) {
        return { error: entryError.message };
      }

      const { error: updateError } = await supabase
        .from("member_subscriptions")
        .update({ entries_used: subscription.entries_used + 1 })
        .eq("id", subscription.id);

      if (updateError) {
        return { error: updateError.message };
      }

      await supabase.from("audit_logs").insert({
        action: "staff_pin_member_check_in_created",
        action_type: "staff_pin_member_check_in_created",
        actor_id: profile.id,
        entity_id: member.id,
        entity_table: "members",
        entity_type: "members",
        new_data: {
          entry_id: entry.id,
          member_id: member.id,
          shift_id: activeShift.id,
          staff_profile_id: activeShift.staff_profile_id,
        },
      });
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Unable to check in member." };
    }

    revalidatePath("/front-desk");
    revalidatePath(`/members/${parsed.data.memberId}`);
    revalidatePath("/reports");

    return {};
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

export async function uploadGcashProof(formData: FormData): Promise<ActionResult> {
  const profile = await requireModuleAccess("/front-desk");

  const parsed = proofUploadSchema.safeParse({
    proofId: formData.get("proofId"),
    referenceNumber: formData.get("referenceNumber") || undefined,
    senderMobile: formData.get("senderMobile") || undefined,
    senderName: formData.get("senderName") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid GCash proof details." };
  }

  const proofImage = formData.get("proofImage");

  if (!(proofImage instanceof File) || proofImage.size === 0) {
    return { error: "Choose a proof image to upload." };
  }

  const extension = allowedProofMimeTypes.get(proofImage.type);

  if (!extension) {
    return { error: "Upload a JPEG, PNG, or WebP image." };
  }

  if (proofImage.size > maxProofImageSize) {
    return { error: "Proof image must be 5 MB or smaller." };
  }

  const supabase = profile.accessMode === "staff_pin" ? createServiceClient() : await createClient();
  const { data: proof, error: proofError } = await supabase
    .from("gcash_proofs")
    .select("id, payment_id, uploaded_by")
    .eq("id", parsed.data.proofId)
    .single();

  if (proofError || !proof) {
    return { error: proofError?.message ?? "GCash proof was not found." };
  }

  if (profile.accessMode === "staff_pin" && proof.uploaded_by !== profile.id) {
    return { error: "This proof is not assigned to your staff profile." };
  }

  const storagePath = `${proof.payment_id}/${randomUUID()}.${extension}`;
  const { error: uploadError } = await supabase.storage
    .from("gcash-proofs")
    .upload(storagePath, proofImage, {
      cacheControl: "3600",
      contentType: proofImage.type,
      upsert: false,
    });

  if (uploadError) {
    return { error: uploadError.message };
  }

  const { error } =
    profile.accessMode === "staff_pin"
      ? await supabase
          .from("gcash_proofs")
          .update({
            file_name: proofImage.name,
            file_size: proofImage.size,
            gcash_reference_number: parsed.data.referenceNumber || null,
            mime_type: proofImage.type,
            proof_status: "staff_checked",
            sender_mobile: parsed.data.senderMobile || null,
            sender_name: parsed.data.senderName || null,
            storage_path: storagePath,
          })
          .eq("id", parsed.data.proofId)
      : await supabase.rpc("mark_gcash_proof_uploaded", {
          p_file_name: proofImage.name,
          p_file_size: proofImage.size,
          p_gcash_reference_number: parsed.data.referenceNumber || null,
          p_mime_type: proofImage.type,
          p_proof_id: parsed.data.proofId,
          p_sender_mobile: parsed.data.senderMobile || null,
          p_sender_name: parsed.data.senderName || null,
          p_storage_path: storagePath,
        });

  if (error) {
    return { error: error.message };
  }

  if (profile.accessMode === "staff_pin") {
    const { error: paymentStatusError } = await supabase
      .from("payments")
      .update({ status: "staff_checked" })
      .eq("id", proof.payment_id)
      .eq("payment_type", "gcash");

    if (paymentStatusError) {
      return { error: paymentStatusError.message };
    }

    await supabase.from("audit_logs").insert({
      action: "staff_pin_gcash_proof_uploaded",
      action_type: "staff_pin_gcash_proof_uploaded",
      actor_id: profile.id,
      entity_id: parsed.data.proofId,
      entity_table: "gcash_proofs",
      entity_type: "gcash_proofs",
      new_data: {
        payment_id: proof.payment_id,
        proof_id: parsed.data.proofId,
        storage_path: storagePath,
        staff_profile_id: profile.staffProfileId,
      },
    });
  }

  revalidatePath("/front-desk");
  revalidatePath("/payments");
  revalidatePath("/payments/gcash-review");
  revalidatePath("/reports");

  return {};
}
