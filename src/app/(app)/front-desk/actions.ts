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
import { createClient, createServiceClient } from "@/lib/supabase/server";

type ActionResult = {
  error?: string;
};

type MemberCheckInRpcResult = {
  message?: string;
  status?: "blocked" | "created";
};

type FrontDeskProfile = Awaited<ReturnType<typeof requireModuleAccess>>;

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

async function createWalkInWithPin(profile: FrontDeskProfile, input: WalkInValues): Promise<ActionResult> {
  const canRecordPayments = await hasConfiguredPermission(profile.role, "record_payments");

  if (!canRecordPayments) {
    return { error: "This role is not allowed to record payments." };
  }

  const parsed = walkInSchema.safeParse(input);

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid walk-in details." };
  }

  if (!profile.staffProfileId) {
    return { error: "Staff PIN session is not active." };
  }

  const supabase = createServiceClient();
  const { error } = await supabase.rpc("create_staff_pin_walk_in", {
    p_actor_id: profile.id,
    p_amount: parsed.data.amount,
    p_customer_name: parsed.data.customer_name || null,
    p_note: parsed.data.note || null,
    p_payment_method: parsed.data.payment_method,
    p_staff_profile_id: profile.staffProfileId,
  });

  if (error) {
    return { error: error.message };
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
    if (!profile.staffProfileId) {
      return { error: "Staff PIN session is not active." };
    }

    const supabase = createServiceClient();

    const { error } = await supabase.rpc("handle_staff_pin_expired_member_entry", {
      p_action_type: parsed.data.action_type,
      p_actor_id: profile.id,
      p_amount: parsed.data.action_type === "owner_override" ? null : parsed.data.amount,
      p_member_id: parsed.data.memberId,
      p_payment_method: parsed.data.payment_method,
      p_reason: parsed.data.reason || null,
      p_staff_profile_id: profile.staffProfileId,
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
    if (!profile.staffProfileId) {
      return { error: "Staff PIN session is not active." };
    }

    const supabase = createServiceClient();
    const { data, error } = await supabase.rpc("create_staff_pin_member_check_in", {
      p_actor_id: profile.id,
      p_member_id: parsed.data.memberId,
      p_staff_profile_id: profile.staffProfileId,
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
    .select("id, payment_id, proof_status, uploaded_by")
    .eq("id", parsed.data.proofId)
    .single();

  if (proofError || !proof) {
    return { error: proofError?.message ?? "GCash proof was not found." };
  }

  if (profile.accessMode === "staff_pin" && proof.uploaded_by !== profile.id) {
    return { error: "This proof is not assigned to your staff profile." };
  }

  if (profile.accessMode === "staff_pin" && !profile.staffProfileId) {
    return { error: "Staff PIN session is not active." };
  }

  if (
    profile.accessMode === "staff_pin" &&
    !["pending_proof", "needs_follow_up", "disputed"].includes(proof.proof_status)
  ) {
    return { error: "This GCash proof is not waiting for upload." };
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
      ? await supabase.rpc("mark_staff_pin_gcash_proof_uploaded", {
          p_actor_id: profile.id,
          p_file_name: proofImage.name,
          p_file_size: proofImage.size,
          p_gcash_reference_number: parsed.data.referenceNumber || null,
          p_mime_type: proofImage.type,
          p_proof_id: parsed.data.proofId,
          p_sender_mobile: parsed.data.senderMobile || null,
          p_sender_name: parsed.data.senderName || null,
          p_staff_profile_id: profile.staffProfileId,
          p_storage_path: storagePath,
        })
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

  revalidatePath("/front-desk");
  revalidatePath("/payments");
  revalidatePath("/payments/gcash-review");
  revalidatePath("/reports");

  return {};
}
