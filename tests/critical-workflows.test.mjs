import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

function readMigrations() {
  const migrationDir = join(root, "supabase/migrations");
  return readdirSync(migrationDir)
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .map((file) => readFileSync(join(migrationDir, file), "utf8"))
    .join("\n");
}

const migrations = readMigrations();
const staffPinIntegrityMigration = read("supabase/migrations/20260507131000_staff_pin_integrity_rpc.sql");
const frontDeskActions = read("src/app/(app)/front-desk/actions.ts");
const shiftActions = read("src/app/(app)/shifts/actions.ts");
const exceptionActions = read("src/app/(app)/exceptions/actions.ts");
const gcashReviewActions = read("src/app/(app)/payments/gcash-review/actions.ts");
const notificationActions = read("src/app/(app)/notifications/actions.ts");
const notificationsPage = read("src/app/(app)/notifications/page.tsx");
const permissions = read("src/lib/auth/permissions.ts");
const proxy = read("src/proxy.ts");
const supabaseServer = read("src/lib/supabase/server.ts");

describe("critical workflow safeguards", () => {
  it("validates and records walk-in payments through a protected server path", () => {
    assert.match(frontDeskActions, /requireModuleAccess\("\/front-desk"\)/);
    assert.match(frontDeskActions, /hasConfiguredPermission\(profile\.role,\s*"record_payments"\)/);
    assert.match(frontDeskActions, /walkInSchema\.safeParse\(input\)/);
    assert.match(migrations, /create or replace function public\.create_walk_in/);
    assert.match(migrations, /p_payment_method/);
  });

  it("blocks expired or banned members during active member check-in", () => {
    assert.match(frontDeskActions, /memberCheckInSchema\.safeParse/);
    assert.match(frontDeskActions, /create_member_check_in/);
    assert.match(migrations, /target_member\.status = 'banned'/);
    assert.match(migrations, /expired_or_missing_active_subscription/);
    assert.match(migrations, /entry_limit_reached/);
  });

  it("locks subscription usage before active member check-in increments", () => {
    assert.match(migrations, /create or replace function public\.create_member_check_in/);
    assert.match(migrations, /for update of ms/);
    assert.match(migrations, /create or replace function public\.create_staff_pin_member_check_in/);
    assert.match(frontDeskActions, /create_staff_pin_member_check_in/);
  });

  it("keeps staff PIN service-role writes inside guarded RPC workflows", () => {
    assert.match(frontDeskActions, /create_staff_pin_walk_in/);
    assert.match(frontDeskActions, /handle_staff_pin_expired_member_entry/);
    assert.match(frontDeskActions, /mark_staff_pin_gcash_proof_uploaded/);
    assert.match(shiftActions, /close_staff_pin_shift_reconciliation/);
    assert.match(migrations, /create or replace function public\.create_staff_pin_walk_in/);
    assert.match(migrations, /create or replace function public\.handle_staff_pin_expired_member_entry/);
    assert.match(migrations, /create or replace function public\.mark_staff_pin_gcash_proof_uploaded/);
    assert.match(migrations, /create or replace function public\.close_staff_pin_shift_reconciliation/);
    assert.match(migrations, /target_proof\.proof_status not in \('pending_proof', 'needs_follow_up', 'disputed'\)/);
  });

  it("keeps staff PIN notifications actor-safe and non-duplicated", () => {
    assert.match(staffPinIntegrityMigration, /create or replace function private\.notify_staff_pin_member_check_in_blocked/);
    assert.match(staffPinIntegrityMigration, /p_actor_id uuid/);
    assert.doesNotMatch(staffPinIntegrityMigration, /perform private\.notify_member_check_in_blocked\(/);
    assert.doesNotMatch(staffPinIntegrityMigration, /if variance_value <> 0 then\s+insert into public\.notifications/);
    assert.match(staffPinIntegrityMigration, /'banned_member'[\s\S]+return jsonb_build_object\(\s+'status', 'blocked'/);
  });

  it("requires controlled expired-member handling paths", () => {
    assert.match(frontDeskActions, /expiredMemberRpcSchema\.safeParse/);
    assert.match(migrations, /create or replace function public\.handle_expired_member_entry/);
    assert.match(migrations, /owner_override/);
    assert.match(migrations, /record_utang/);
    assert.match(migrations, /pay_walk_in/);
  });

  it("keeps exception approval behind explicit permission checks", () => {
    assert.match(exceptionActions, /exceptionReviewSchema\.safeParse/);
    assert.match(exceptionActions, /hasConfiguredPermission\(profile\.role,\s*"approve_exceptions"\)/);
    assert.match(migrations, /create or replace function public\.review_exception/);
    assert.match(migrations, /You do not have permission to review exceptions\./);
    assert.match(migrations, /private\.has_permission\('approve_exceptions'\)/);
  });

  it("moves GCash proof uploads into the owner review queue and confirmation RPC", () => {
    assert.match(frontDeskActions, /proofUploadSchema\.safeParse/);
    assert.match(frontDeskActions, /mark_gcash_proof_uploaded/);
    assert.match(frontDeskActions, /mark_staff_pin_gcash_proof_uploaded/);
    assert.match(gcashReviewActions, /gcashReviewSchema\.safeParse/);
    assert.match(migrations, /create or replace function public\.review_gcash_proof/);
    assert.match(migrations, /when 'confirm' then 'owner_confirmed'/);
  });

  it("requires shift reconciliation variance notes before closing", () => {
    assert.match(shiftActions, /closeShiftSchema\.safeParse/);
    assert.match(migrations, /create or replace function public\.close_shift_reconciliation/);
    assert.match(migrations, /variance_value <> 0 and clean_variance_note is null/);
  });
});

describe("security checklist", () => {
  it("does not expose the Supabase service role key through public env names", () => {
    assert.match(supabaseServer, /process\.env\.SUPABASE_SERVICE_ROLE_KEY/);
    assert.doesNotMatch(supabaseServer, /NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY/);
  });

  it("protects owner-only modules from staff roles", () => {
    const frontDeskAccess = permissions.match(/front_desk: \[(?<routes>[^\]]+)\]/)?.groups?.routes ?? "";

    assert.match(frontDeskAccess, /"\/front-desk"/);
    assert.match(frontDeskAccess, /"\/members"/);
    assert.match(frontDeskAccess, /"\/exceptions"/);
    assert.match(frontDeskAccess, /"\/notifications"/);
    assert.doesNotMatch(frontDeskAccess, /\/owner-dashboard/);
    assert.doesNotMatch(frontDeskAccess, /\/audit-logs/);
    assert.doesNotMatch(frontDeskAccess, /\/settings/);
    assert.doesNotMatch(frontDeskAccess, /\/reports/);
    assert.match(proxy, /"\/owner-dashboard": true/);
    assert.match(proxy, /"\/audit-logs": true/);
    assert.match(proxy, /"\/settings": true/);
    assert.match(proxy, /"\/notifications\/:path\*"/);
  });

  it("keeps staff PIN sessions limited to front desk routes and actions", () => {
    assert.doesNotMatch(proxy, /requestedModule === "\/notifications"[\s\S]*gymledger_staff_pin_session/);
    assert.match(notificationsPage, /requireModuleAccess\("\/notifications"\)/);
    assert.match(notificationActions, /requireModuleAccess\("\/notifications"\)/);
  });

  it("enables RLS for public application tables", () => {
    for (const table of [
      "profiles",
      "staff_profiles",
      "members",
      "member_subscriptions",
      "entries",
      "payments",
      "exceptions",
      "shifts",
      "gcash_proofs",
      "audit_logs",
      "settings",
      "notifications",
      "walk_in_balances",
      "role_permissions",
    ]) {
      assert.match(migrations, new RegExp(`alter table public\\.${table} enable row level security`));
    }
  });

  it("keeps GCash proof files private and type-limited", () => {
    assert.match(migrations, /id,\s*name,\s*public,\s*file_size_limit,\s*allowed_mime_types/);
    assert.match(migrations, /'gcash-proofs'[\s\S]*false/);
    assert.match(migrations, /allowed_mime_types = array\['image\/jpeg', 'image\/png', 'image\/webp'\]/);
    assert.match(migrations, /on storage\.objects for select/);
    assert.match(migrations, /bucket_id = 'gcash-proofs'/);
  });

  it("keeps audit logs append-only for normal users", () => {
    assert.match(migrations, /create trigger audit_logs_block_update before update on public\.audit_logs/);
    assert.match(migrations, /create trigger audit_logs_block_delete before delete on public\.audit_logs/);
    assert.match(migrations, /raise exception 'audit_logs are append-only'/);
    assert.match(migrations, /drop policy if exists "audit logs update" on public\.audit_logs/);
    assert.match(migrations, /drop policy if exists "audit logs delete" on public\.audit_logs/);
  });
});
