"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  memberFormSchema,
  memberPaymentSchema,
  memberRenewalSchema,
  memberUtangSchema,
  type MemberFormValues,
  type MemberPaymentValues,
  type MemberRenewalValues,
  type MemberUtangValues,
} from "@/app/(app)/members/schema";
import { hasConfiguredPermission } from "@/lib/auth/configured-permissions";
import { canManageMembers } from "@/lib/auth/permissions";
import { requireModuleAccess } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";

type ActionResult = {
  error?: string;
  warning?: string;
};

type RenewalRpcResult = {
  duplicate_reference_count?: number;
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
    .insert({
      created_by: profile.id,
      full_name: parsed.data.full_name,
      member_code: parsed.data.member_code,
      phone: parsed.data.phone,
      status: parsed.data.status,
    })
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
  const { error } = await supabase
    .from("members")
    .update({
      full_name: parsed.data.full_name,
      member_code: parsed.data.member_code,
      phone: parsed.data.phone,
      status: parsed.data.status,
    })
    .eq("id", memberId);

  if (error) {
    return { error: error.code === "23505" ? "Member ID is already in use." : error.message };
  }

  revalidatePath("/members");
  revalidatePath(`/members/${memberId}`);
  redirect(`/members/${memberId}`);
}

export async function renewMember(
  memberId: string,
  input: MemberRenewalValues,
): Promise<ActionResult> {
  const profile = await requireModuleAccess("/members");
  const canRecordPayments = await hasConfiguredPermission(profile.role, "record_payments");

  if (!canRecordPayments) {
    return { error: "This role is not allowed to record payments." };
  }

  const parsed = memberRenewalSchema.safeParse(input);

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid renewal details." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("renew_member_subscription", {
    p_gcash_reference_number: parsed.data.gcash_reference_number || null,
    p_member_id: memberId,
    p_payment_method: parsed.data.payment_method,
    p_plan_id: parsed.data.plan_id,
    p_start_date: parsed.data.start_date,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/members");
  revalidatePath(`/members/${memberId}`);
  revalidatePath("/front-desk");
  revalidatePath("/payments");
  revalidatePath("/payments/gcash-review");
  revalidatePath("/reports");
  revalidatePath("/shifts");

  const result = data as RenewalRpcResult | null;

  return result?.duplicate_reference_count
    ? { warning: "This GCash reference already exists. Renewal was recorded and flagged for review." }
    : {};
}

export async function recordMemberPayment(
  memberId: string,
  input: MemberPaymentValues,
): Promise<ActionResult> {
  const profile = await requireModuleAccess("/members");
  const canRecordPayments = await hasConfiguredPermission(profile.role, "record_payments");

  if (!canRecordPayments) {
    return { error: "This role is not allowed to record payments." };
  }

  const parsed = memberPaymentSchema.safeParse(input);

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid payment details." };
  }

  const supabase = await createClient();
  const { data: shift, error: shiftError } = await supabase
    .from("shifts")
    .select("id")
    .eq("opened_by", profile.id)
    .eq("status", "open")
    .is("closed_at", null)
    .order("opened_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (shiftError) {
    return { error: shiftError.message };
  }

  if (!shift) {
    return { error: "Start an active shift before recording payments." };
  }

  const status = parsed.data.payment_method === "gcash"
    ? parsed.data.gcash_reference_number
      ? "for_review"
      : "awaiting_proof"
    : "completed";
  const { data: payment, error } = await supabase
    .from("payments")
    .insert({
      amount: parsed.data.amount,
      member_id: memberId,
      notes: parsed.data.note || null,
      paid_at: new Date().toISOString(),
      payment_type: parsed.data.payment_method,
      purpose: "other",
      received_by: profile.id,
      reference_number: parsed.data.payment_method === "gcash" ? parsed.data.gcash_reference_number || null : null,
      shift_id: shift.id,
      status,
    })
    .select("id")
    .single();

  if (error) {
    return { error: error.message };
  }

  if (parsed.data.payment_method === "gcash") {
    const { error: proofError } = await supabase.from("gcash_proofs").insert({
      file_name: "Pending proof",
      gcash_reference_number: parsed.data.gcash_reference_number || null,
      payment_id: payment.id,
      proof_status: parsed.data.gcash_reference_number ? "for_review" : "awaiting_proof",
      storage_path: `pending-proofs/${payment.id}`,
      uploaded_by: profile.id,
    });

    if (proofError) {
      return { error: proofError.message };
    }
  }

  revalidatePath(`/members/${memberId}`);
  revalidatePath("/payments");
  revalidatePath("/reports");
  revalidatePath("/shifts");

  return {};
}

export async function recordMemberUtang(
  memberId: string,
  memberName: string,
  input: MemberUtangValues,
): Promise<ActionResult> {
  const profile = await requireModuleAccess("/members");
  const canRecordPayments = await hasConfiguredPermission(profile.role, "record_payments");

  if (!canRecordPayments) {
    return { error: "This role is not allowed to record utang." };
  }

  const parsed = memberUtangSchema.safeParse(input);

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid utang details." };
  }

  const supabase = await createClient();
  const { data: shift, error: shiftError } = await supabase
    .from("shifts")
    .select("id")
    .eq("opened_by", profile.id)
    .eq("status", "open")
    .is("closed_at", null)
    .order("opened_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (shiftError) {
    return { error: shiftError.message };
  }

  if (!shift) {
    return { error: "Start an active shift before recording utang." };
  }

  const { data: entry, error: entryError } = await supabase
    .from("entries")
    .insert({
      checked_in_by: profile.id,
      member_id: memberId,
      notes: parsed.data.reason,
      settlement_type: "pending",
      shift_id: shift.id,
      status: "pending",
    })
    .select("id")
    .single();

  if (entryError) {
    return { error: entryError.message };
  }

  const { error } = await supabase.from("walk_in_balances").insert({
    amount: parsed.data.amount,
    created_by: profile.id,
    customer_name: memberName,
    entry_id: entry.id,
    member_id: memberId,
    note: parsed.data.reason,
    shift_id: shift.id,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/members/${memberId}`);
  revalidatePath("/front-desk");
  revalidatePath("/balances");
  revalidatePath("/reports");

  return {};
}

export async function setMemberStatus(memberId: string, status: "active" | "banned" | "archived"): Promise<ActionResult> {
  const profile = await requireModuleAccess("/members");
  const permissionError = requireMemberManager(profile.role);

  if (permissionError) {
    return permissionError;
  }

  const supabase = await createClient();
  const { error } = await supabase.from("members").update({ status }).eq("id", memberId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/members");
  revalidatePath(`/members/${memberId}`);
  revalidatePath("/front-desk");

  return {};
}
