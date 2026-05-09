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
import { createClient } from "@/lib/supabase/server";

type ActionResult = {
  error?: string;
  warning?: string;
};

type MemberCheckInRpcResult = {
  duplicate_reference_count?: number;
  existing_unpaid_balance_amount?: number | string;
  existing_unpaid_balance_count?: number;
  message?: string;
  status?: "blocked" | "created";
};

const defaultMaxUtangWarningAmount = 500;

async function getMaxUtangWarningAmount() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "operational_settings")
    .maybeSingle();

  if (!data?.value || typeof data.value !== "object") {
    return defaultMaxUtangWarningAmount;
  }

  const amount = Number((data.value as { max_utang_warning_amount?: unknown }).max_utang_warning_amount);

  return Number.isFinite(amount) && amount > 0 ? amount : defaultMaxUtangWarningAmount;
}

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

export async function createWalkIn(input: WalkInValues): Promise<ActionResult> {
  const profile = await requireModuleAccess("/front-desk");
  const canRecordPayments = await hasConfiguredPermission(profile.role, "record_payments");

  if (!canRecordPayments) {
    return { error: "This role is not allowed to record payments." };
  }

  const parsed = walkInSchema.safeParse(input);

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid walk-in details." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_walk_in", {
    p_amount: parsed.data.amount,
    p_customer_name: parsed.data.customer_name || null,
    p_gcash_reference_number: parsed.data.gcash_reference_number || null,
    p_note: parsed.data.note || null,
    p_payment_method: parsed.data.payment_method,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/front-desk");
  revalidatePath("/payments");
  revalidatePath("/reports");

  const result = data as MemberCheckInRpcResult | null;

  if (result?.duplicate_reference_count) {
    return { warning: "This GCash reference already exists. Entry was recorded and flagged for review." };
  }

  if (result?.existing_unpaid_balance_count) {
    const amount = Number(result.existing_unpaid_balance_amount ?? 0);
    const maxUtangWarningAmount = await getMaxUtangWarningAmount();
    const thresholdWarning = amount >= maxUtangWarningAmount ? ` This is at or above the ${maxUtangWarningAmount.toLocaleString("en-PH", { currency: "PHP", style: "currency" })} warning amount.` : "";

    return {
      warning: `This customer already has ${result.existing_unpaid_balance_count} unpaid utang record${result.existing_unpaid_balance_count === 1 ? "" : "s"} totaling ${amount.toLocaleString("en-PH", { currency: "PHP", style: "currency" })}.${thresholdWarning}`,
    };
  }

  return {};
}

export async function handleExpiredMemberEntry(
  memberId: string,
  input: ExpiredMemberActionValues,
): Promise<ActionResult> {
  await requireModuleAccess("/front-desk");

  const parsed = expiredMemberRpcSchema.safeParse({ ...input, memberId });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid expired member action." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("handle_expired_member_entry", {
    p_action_type: parsed.data.action_type,
    p_amount: parsed.data.action_type === "owner_override" ? null : parsed.data.amount,
    p_gcash_reference_number: parsed.data.gcash_reference_number || null,
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

  const result = data as MemberCheckInRpcResult | null;

  return result?.duplicate_reference_count
    ? { warning: "This GCash reference already exists. Entry was recorded and flagged for review." }
    : {};
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

export async function uploadGcashProof(formData: FormData): Promise<ActionResult> {
  await requireModuleAccess("/front-desk");

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

  const supabase = await createClient();
  const { data: proof, error: proofError } = await supabase
    .from("gcash_proofs")
    .select("id, payment_id")
    .eq("id", parsed.data.proofId)
    .single();

  if (proofError || !proof) {
    return { error: proofError?.message ?? "GCash proof was not found." };
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

  const { data, error } = await supabase.rpc("mark_gcash_proof_uploaded", {
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

  const result = data as MemberCheckInRpcResult | null;

  return result?.duplicate_reference_count
    ? { warning: "This GCash reference already exists. Proof was uploaded and flagged for review." }
    : {};
}

export async function checkGcashReferenceDuplicate(referenceNumber: string, currentProofId?: string): Promise<ActionResult> {
  await requireModuleAccess("/front-desk");

  const cleanReference = referenceNumber.trim();

  if (!cleanReference) {
    return {};
  }

  const supabase = await createClient();
  let query = supabase
    .from("gcash_proofs")
    .select("id", { count: "exact", head: true })
    .eq("gcash_reference_number", cleanReference);

  if (currentProofId) {
    query = query.neq("id", currentProofId);
  }

  const { count, error } = await query;

  if (error) {
    return { error: error.message };
  }

  return count ? { warning: "This GCash reference already exists. Continue only after checking the customer confirmation." } : {};
}

export async function checkUnpaidBalanceWarning(customerName: string): Promise<ActionResult> {
  await requireModuleAccess("/front-desk");

  const cleanName = customerName.trim();

  if (!cleanName) {
    return {};
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("walk_in_balances")
    .select("amount, paid_amount")
    .eq("customer_name", cleanName)
    .is("settled_at", null);

  if (error) {
    return { error: error.message };
  }

  const balances = data ?? [];
  const total = balances.reduce((sum, balance) => {
    return sum + Math.max(Number(balance.amount ?? 0) - Number(balance.paid_amount ?? 0), 0);
  }, 0);

  if (total <= 0) {
    return {};
  }

  const maxUtangWarningAmount = await getMaxUtangWarningAmount();
  const thresholdWarning = total >= maxUtangWarningAmount ? ` This is at or above the ${maxUtangWarningAmount.toLocaleString("en-PH", { currency: "PHP", style: "currency" })} warning amount.` : "";

  return {
    warning: `Existing unpaid utang: ${total.toLocaleString("en-PH", { currency: "PHP", style: "currency" })} across ${balances.length} record${balances.length === 1 ? "" : "s"}.${thresholdWarning}`,
  };
}
