"use server";

import { revalidatePath } from "next/cache";

import {
  closeShiftSchema,
  startShiftSchema,
  type CloseShiftValues,
  type StartShiftValues,
} from "@/app/(app)/shifts/schema";
import { roleLabels, type AppRole } from "@/lib/auth/permissions";
import { requireCurrentProfile, requireModuleAccess } from "@/lib/auth/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

type ActionResult = {
  error?: string;
};

const shiftStarterRoles = new Set<AppRole>(["owner", "admin", "manager", "front_desk"]);
const managementRoles = new Set<AppRole>(["owner", "admin", "manager"]);

export async function startShift(input: StartShiftValues): Promise<ActionResult> {
  const profile = await requireModuleAccess("/front-desk");

  if (!shiftStarterRoles.has(profile.role)) {
    return { error: "You do not have permission to start shifts." };
  }

  const parsed = startShiftSchema.safeParse(input);

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid shift details." };
  }

  const supabase = profile.accessMode === "staff_pin" ? createServiceClient() : await createClient();
  const { data: existingStaffProfile, error: staffError } = await supabase
    .from("staff_profiles")
    .select("id, can_open_shift, status")
    .eq("profile_id", profile.id)
    .maybeSingle();

  if (staffError) {
    return { error: staffError.message };
  }

  let staffProfileId = existingStaffProfile?.id;

  if (!staffProfileId) {
    if (!managementRoles.has(profile.role)) {
      return { error: "Your account is missing an active staff profile." };
    }

    const { data: createdStaffProfile, error: createStaffError } = await supabase
      .from("staff_profiles")
      .insert({
        can_accept_cash: true,
        can_accept_gcash: true,
        can_close_shift: true,
        can_open_shift: true,
        job_title: roleLabels[profile.role],
        profile_id: profile.id,
      })
      .select("id")
      .single();

    if (createStaffError) {
      return { error: createStaffError.message };
    }

    staffProfileId = createdStaffProfile.id;
  }

  if (existingStaffProfile && existingStaffProfile.status !== "active") {
    return { error: "Your staff profile is not active." };
  }

  if (existingStaffProfile && !existingStaffProfile.can_open_shift) {
    return { error: "Your staff profile is not allowed to open shifts." };
  }

  const { data: activeShift, error: activeShiftError } = await supabase
    .from("shifts")
    .select("id")
    .eq("staff_profile_id", staffProfileId)
    .eq("status", "open")
    .is("closed_at", null)
    .maybeSingle();

  if (activeShiftError) {
    return { error: activeShiftError.message };
  }

  if (activeShift) {
    return { error: "You already have an active shift." };
  }

  const { error } = await supabase.from("shifts").insert({
    notes: parsed.data.note || null,
    opened_by: profile.id,
    opening_cash: parsed.data.starting_cash,
    staff_profile_id: staffProfileId,
    status: "open",
  });

  if (error) {
    return {
      error:
        error.code === "23505"
          ? "You already have an active shift."
          : error.message,
    };
  }

  revalidatePath("/front-desk");
  revalidatePath("/shifts");

  return {};
}

export async function closeShift(input: CloseShiftValues): Promise<ActionResult> {
  const profile = await requireCurrentProfile();

  const parsed = closeShiftSchema.safeParse(input);

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid shift reconciliation." };
  }

  if (profile.accessMode === "staff_pin") {
    if (!profile.staffProfileId) {
      return { error: "Staff PIN session is not active." };
    }

    const supabase = createServiceClient();
    const { data: targetShift, error: shiftError } = await supabase
      .from("shifts")
      .select("id, opening_cash, status, closed_at, staff_profile_id, staff_profiles!shifts_staff_profile_id_fkey(profile_id, can_close_shift, status)")
      .eq("id", parsed.data.shift_id)
      .maybeSingle();

    if (shiftError || !targetShift) {
      return { error: shiftError?.message ?? "Shift was not found." };
    }

    const staffProfile = Array.isArray(targetShift.staff_profiles)
      ? targetShift.staff_profiles[0]
      : targetShift.staff_profiles;

    if (
      targetShift.staff_profile_id !== profile.staffProfileId ||
      staffProfile?.profile_id !== profile.id ||
      staffProfile?.status !== "active"
    ) {
      return { error: "Only the assigned staff member can close this shift in PIN mode." };
    }

    if (!staffProfile.can_close_shift) {
      return { error: "Your staff profile is not allowed to close shifts." };
    }

    if (targetShift.status !== "open" || targetShift.closed_at) {
      return { error: "Only an active shift can be closed." };
    }

    const [paymentsResult, cashMovementsResult] = await Promise.all([
      supabase
        .from("payments")
        .select("amount")
        .eq("shift_id", targetShift.id)
        .eq("payment_type", "cash")
        .eq("status", "completed"),
      supabase
        .from("cash_movements")
        .select("amount, category, movement_type")
        .eq("shift_id", targetShift.id)
        .eq("status", "approved"),
    ]);

    const summaryError = paymentsResult.error ?? cashMovementsResult.error;

    if (summaryError) {
      return { error: summaryError.message };
    }

    const cashSales = (paymentsResult.data ?? []).reduce(
      (total, payment) => total + Number(payment.amount),
      0,
    );
    const cashMovements = cashMovementsResult.data ?? [];
    const expenses = cashMovements
      .filter((movement) => movement.movement_type === "cash_out" && movement.category === "expense")
      .reduce((total, movement) => total + Number(movement.amount), 0);
    const ownerCashPickups = cashMovements
      .filter((movement) => movement.movement_type === "cash_out" && movement.category === "owner_pickup")
      .reduce((total, movement) => total + Number(movement.amount), 0);
    const cashAdjustments = cashMovements
      .filter((movement) => movement.movement_type === "cash_in")
      .reduce((total, movement) => total + Number(movement.amount), 0);
    const expectedCash =
      Number(targetShift.opening_cash) + cashSales + cashAdjustments - expenses - ownerCashPickups;
    const variance = parsed.data.actual_cash - expectedCash;

    if (variance !== 0 && !parsed.data.variance_note) {
      return { error: "Variance explanation is required when variance is not zero." };
    }

    const { error } = await supabase
      .from("shifts")
      .update({
        actual_cash: parsed.data.actual_cash,
        cash_adjustments: cashAdjustments,
        cash_difference: variance,
        cash_expenses: expenses,
        cash_sales: cashSales,
        closed_at: new Date().toISOString(),
        closed_by: profile.id,
        closing_note: parsed.data.note || null,
        expected_cash: expectedCash,
        owner_cash_pickups: ownerCashPickups,
        status: "closed",
        variance_note: parsed.data.variance_note || null,
      })
      .eq("id", targetShift.id);

    if (error) {
      return { error: error.message };
    }

    await supabase.from("audit_logs").insert({
      action: "staff_pin_shift_closed",
      action_type: "staff_pin_shift_closed",
      actor_id: profile.id,
      entity_id: targetShift.id,
      entity_table: "shifts",
      entity_type: "shifts",
      new_data: {
        actual_cash: parsed.data.actual_cash,
        expected_cash: expectedCash,
        shift_id: targetShift.id,
        staff_profile_id: profile.staffProfileId,
        variance,
      },
    });

    revalidatePath("/front-desk");
    revalidatePath("/shifts");
    revalidatePath("/reports");
    revalidatePath("/owner-dashboard");

    return {};
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("close_shift_reconciliation", {
    p_actual_cash: parsed.data.actual_cash,
    p_notes: parsed.data.note || null,
    p_shift_id: parsed.data.shift_id,
    p_variance_note: parsed.data.variance_note || null,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/front-desk");
  revalidatePath("/shifts");
  revalidatePath("/reports");
  revalidatePath("/owner-dashboard");

  return {};
}
