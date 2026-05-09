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
const gcashProofImageRoute = read("src/app/(app)/front-desk/gcash-proofs/[id]/image/route.ts");
const notificationsPage = read("src/app/(app)/notifications/page.tsx");
const permissions = read("src/lib/auth/permissions.ts");
const proxy = read("src/proxy.ts");
const staffPinAuth = read("src/lib/auth/staff-pin.ts");
const supabaseServer = read("src/lib/supabase/server.ts");
const loginActions = read("src/app/(auth)/login/actions.ts");
const authServer = read("src/lib/auth/server.ts");
const membersActions = read("src/app/(app)/members/actions.ts");
const ownerReviewActions = read("src/app/(app)/owner-review/actions.ts");
const balanceActions = read("src/app/(app)/balances/actions.ts");
const settingsActions = read("src/app/(app)/settings/actions.ts");
const walkInSchema = read("src/app/(app)/front-desk/walk-in-schema.ts");
const expiredMemberSchema = read("src/app/(app)/front-desk/expired-member-schema.ts");
const shiftSchema = read("src/app/(app)/shifts/schema.ts");
const membersSchema = read("src/app/(app)/members/schema.ts");
const balanceSchema = read("src/app/(app)/balances/schema.ts");
const seed = read("supabase/seed.sql");
const modules = read("src/lib/modules.ts");

// ---------------------------------------------------------------------------
// 1. Login / Profile Validation
// ---------------------------------------------------------------------------
describe("login and profile validation", () => {
  it("requires email and password before calling Supabase Auth", () => {
    assert.match(loginActions, /if\s*\(!email\s*\|\|\s*!password\)/);
    assert.match(loginActions, /Enter your email and password/);
  });

  it("validates credentials through Supabase Auth signInWithPassword", () => {
    assert.match(loginActions, /supabase\.auth\.signInWithPassword/);
  });

  it("maps invalid_credentials to a user-safe message", () => {
    assert.match(loginActions, /invalid_credentials/);
    assert.match(loginActions, /Invalid email or password/);
  });

  it("fetches and validates the staff profile after successful login", () => {
    assert.match(loginActions, /getCurrentProfile\(\)/);
    assert.match(authServer, /"profiles"/);
    assert.match(authServer, /"id, full_name, email, role, status"/);
  });

  it("rejects inactive or non-staff profiles after auth", () => {
    assert.match(authServer, /data\.status !== "active"/);
    assert.match(authServer, /!isAppRole\(data\.role\)/);
  });

  it("signs out users with no valid profile instead of leaving them in limbo", () => {
    assert.match(loginActions, /supabase\.auth\.signOut\(\)/);
    assert.match(loginActions, /No active staff profile/);
  });

  it("redirects to the role-specific default module after login", () => {
    assert.match(loginActions, /getDefaultPathForRole\(profile\.role\)/);
    assert.match(permissions, /function getDefaultPathForRole/);
  });
});

// ---------------------------------------------------------------------------
// 2. Role Access
// ---------------------------------------------------------------------------
describe("role access control", () => {
  it("defines five staff roles", () => {
    const roles = permissions.match(/appRoles\s*=\s*\[([^\]]+)\]/)?.[1] ?? "";
    assert.match(roles, /"owner"/);
    assert.match(roles, /"admin"/);
    assert.match(roles, /"manager"/);
    assert.match(roles, /"front_desk"/);
    assert.match(roles, /"accountant"/);
  });

  it("gives owner and admin access to all modules including settings and audit logs", () => {
    const ownerAccess = permissions.match(/owner:\s*\[([^\]]+)\]/)?.[1] ?? "";
    const adminAccess = permissions.match(/admin:\s*\[([^\]]+)\]/)?.[1] ?? "";

    for (const access of [ownerAccess, adminAccess]) {
      assert.match(access, /"\/front-desk"/);
      assert.match(access, /"\/members"/);
      assert.match(access, /"\/settings"/);
      assert.match(access, /"\/audit-logs"/);
      assert.match(access, /"\/reports"/);
      assert.match(access, /"\/owner-review"/);
    }
  });

  it("restricts front_desk from owner-only modules", () => {
    const frontDeskAccess = permissions.match(/front_desk:\s*\[([^\]]+)\]/)?.[1] ?? "";

    assert.match(frontDeskAccess, /"\/front-desk"/);
    assert.match(frontDeskAccess, /"\/members"/);
    assert.doesNotMatch(frontDeskAccess, /\/owner-dashboard/);
    assert.doesNotMatch(frontDeskAccess, /\/audit-logs/);
    assert.doesNotMatch(frontDeskAccess, /\/settings/);
    assert.doesNotMatch(frontDeskAccess, /\/reports/);
  });

  it("restricts accountant to payments, balances, reports, and notifications", () => {
    const accountantAccess = permissions.match(/accountant:\s*\[([^\]]+)\]/)?.[1] ?? "";

    assert.match(accountantAccess, /"\/payments"/);
    assert.match(accountantAccess, /"\/balances"/);
    assert.match(accountantAccess, /"\/reports"/);
    assert.match(accountantAccess, /"\/notifications"/);
    assert.doesNotMatch(accountantAccess, /\/front-desk/);
    assert.doesNotMatch(accountantAccess, /\/members/);
    assert.doesNotMatch(accountantAccess, /\/settings/);
  });

  it("checks module access in middleware for all protected routes", () => {
    assert.match(proxy, /canAccessModule/);
    assert.match(proxy, /redirect.*unauthorized/);
  });

  it("redirects unauthenticated users to login with a next parameter", () => {
    assert.match(proxy, /pathname = "\/login"/);
    assert.match(proxy, /searchParams\.set\("next"/);
  });

  it("gives owner and admin all built-in permissions", () => {
    assert.match(permissions, /record_payments/);
    assert.match(permissions, /correct_payments/);
    assert.match(permissions, /approve_exceptions/);
    assert.match(permissions, /manage_staff/);
    assert.match(permissions, /change_rates/);
    assert.match(permissions, /export_data/);
    assert.match(permissions, /view_reports/);
  });

  it("limits front_desk to record_payments only", () => {
    const frontDeskPermissions = permissions.match(/front_desk:\s*\["record_payments"\]/)?.[0] ?? "";
    assert.match(frontDeskPermissions, /"record_payments"/);
    const defaults = permissions.match(/const defaults[\s\S]*?front_desk:\s*\[([^\]]+)\]/)?.[1] ?? "";
    assert.match(defaults, /"record_payments"/);
    assert.doesNotMatch(defaults, /"correct_payments"/);
    assert.doesNotMatch(defaults, /"approve_exceptions"/);
    assert.doesNotMatch(defaults, /"manage_staff"/);
  });

  it("protects settings behind owner or admin role check", () => {
    assert.match(settingsActions, /canManageSystemSettings\(profile\.role\)/);
    assert.match(permissions, /role === "owner" \|\| role === "admin"/);
  });

  it("protects member management behind role check", () => {
    assert.match(membersActions, /canManageMembers\(role\)/);
    assert.match(permissions, /role === "owner" \|\| role === "admin" \|\| role === "manager"/);
  });
});

// ---------------------------------------------------------------------------
// 3. Start Shift
// ---------------------------------------------------------------------------
describe("start shift", () => {
  it("requires front-desk module access", () => {
    assert.match(shiftActions, /requireModuleAccess\("\/front-desk"\)/);
  });

  it("restricts shift starting to allowed roles", () => {
    assert.match(shiftActions, /shiftStarterRoles/);
    assert.match(shiftActions, /"owner", "admin", "manager", "front_desk"/);
  });

  it("validates starting cash with zod schema", () => {
    assert.match(shiftSchema, /startShiftSchema/);
    assert.match(shiftSchema, /starting_cash/);
    assert.match(shiftSchema, /\.min\(0/);
  });

  it("checks for existing active shift before creating a new one", () => {
    assert.match(shiftActions, /status.*open/);
    assert.match(shiftActions, /already have an active shift/);
  });

  it("validates staff profile exists and is active", () => {
    assert.match(shiftActions, /staff_profiles/);
    assert.match(shiftActions, /staff profile is not active/);
  });

  it("checks can_open_shift permission on staff profile", () => {
    assert.match(shiftActions, /can_open_shift/);
    assert.match(shiftActions, /not allowed to open shifts/);
  });

  it("auto-creates staff profile for management roles if missing", () => {
    assert.match(shiftActions, /managementRoles/);
    assert.match(shiftActions, /"owner", "admin", "manager"/);
    assert.match(shiftActions, /staff_profiles[\s\S]*insert/);
  });
});

// ---------------------------------------------------------------------------
// 4. Cash Walk-In
// ---------------------------------------------------------------------------
describe("cash walk-in", () => {
  it("requires front-desk module access and record_payments permission", () => {
    assert.match(frontDeskActions, /requireModuleAccess\("\/front-desk"\)/);
    assert.match(frontDeskActions, /hasConfiguredPermission\(profile\.role,\s*"record_payments"\)/);
  });

  it("validates walk-in input through zod schema", () => {
    assert.match(walkInSchema, /walkInSchema/);
    assert.match(walkInSchema, /\.positive/);
    assert.match(walkInSchema, /payment_method.*enum/);
  });

  it("includes cash as a valid payment method", () => {
    assert.match(walkInSchema, /"cash"/);
  });

  it("calls create_walk_in RPC for database-level validation and recording", () => {
    assert.match(frontDeskActions, /supabase\.rpc\("create_walk_in"/);
    assert.match(migrations, /create or replace function public\.create_walk_in/);
  });

  it("revalidates front-desk, payments, and reports after walk-in", () => {
    assert.match(frontDeskActions, /revalidatePath\("\/front-desk"\)/);
    assert.match(frontDeskActions, /revalidatePath\("\/payments"\)/);
    assert.match(frontDeskActions, /revalidatePath\("\/reports"\)/);
  });
});

// ---------------------------------------------------------------------------
// 5. GCash Walk-In
// ---------------------------------------------------------------------------
describe("gcash walk-in", () => {
  it("includes gcash as a valid walk-in payment method", () => {
    assert.match(walkInSchema, /"gcash"/);
  });

  it("accepts an optional gcash reference number in walk-in schema", () => {
    assert.match(walkInSchema, /gcash_reference_number.*optional/);
  });

  it("flags duplicate GCash references for review instead of blocking", () => {
    assert.match(frontDeskActions, /duplicate_reference_count/);
    assert.match(frontDeskActions, /GCash reference already exists.*flagged for review/);
  });

  it("creates GCash proof metadata through the create_walk_in RPC", () => {
    assert.match(migrations, /create or replace function public\.create_walk_in/);
    assert.match(migrations, /gcash_proofs/);
  });

  it("supports separate GCash proof upload after walk-in creation", () => {
    assert.match(frontDeskActions, /uploadGcashProof/);
    assert.match(frontDeskActions, /proofUploadSchema/);
  });

  it("validates GCash proof image MIME types", () => {
    assert.match(frontDeskActions, /allowedProofMimeTypes/);
    assert.match(frontDeskActions, /image\/jpeg/);
    assert.match(frontDeskActions, /image\/png/);
    assert.match(frontDeskActions, /image\/webp/);
  });

  it("enforces 5MB proof image size limit", () => {
    assert.match(frontDeskActions, /maxProofImageSize/);
    assert.match(frontDeskActions, /5 MB or smaller/);
  });

  it("stores proof in gcash-proofs bucket and marks via RPC", () => {
    assert.match(frontDeskActions, /"gcash-proofs"/);
    assert.match(frontDeskActions, /\.upload\(/);
    assert.match(frontDeskActions, /mark_gcash_proof_uploaded/);
  });

  it("provides duplicate reference check endpoint for frontend validation", () => {
    assert.match(frontDeskActions, /checkGcashReferenceDuplicate/);
  });
});

// ---------------------------------------------------------------------------
// 6. Utang Walk-In (Pending Payment)
// ---------------------------------------------------------------------------
describe("utang walk-in", () => {
  it("includes pending as a walk-in payment method", () => {
    assert.match(walkInSchema, /"pending"/);
  });

  it("requires customer name when payment method is pending", () => {
    assert.match(walkInSchema, /payment_method === "pending" && !value\.customer_name/);
    assert.match(walkInSchema, /Customer name is required for utang/);
  });

  it("requires a note/reason when payment method is pending", () => {
    assert.match(walkInSchema, /payment_method === "pending" && !value\.note/);
    assert.match(walkInSchema, /Reason is required for utang/);
  });

  it("creates walk-in balance records through the create_walk_in RPC", () => {
    assert.match(migrations, /record_utang/);
    assert.match(migrations, /walk_in_balances/);
  });

  it("warns about existing unpaid balances for same customer name", () => {
    assert.match(frontDeskActions, /checkUnpaidBalanceWarning/);
    assert.match(frontDeskActions, /Existing unpaid utang/);
  });

  it("shows threshold warning when utang reaches configured amount", () => {
    assert.match(frontDeskActions, /max_utang_warning_amount/);
    assert.match(frontDeskActions, /warning amount/);
  });

  it("records member utang with entry, balance, and shift linkage", () => {
    assert.match(membersActions, /recordMemberUtang/);
    assert.match(membersActions, /memberUtangSchema/);
    assert.match(membersActions, /walk_in_balances[\s\S]*insert/);
    assert.match(membersActions, /settlement_type: "pending"/);
  });

  it("requires active shift before recording member utang", () => {
    assert.match(membersActions, /active shift before recording utang/);
  });
});

// ---------------------------------------------------------------------------
// 7. Active Member Check-In
// ---------------------------------------------------------------------------
describe("active member check-in", () => {
  it("requires front-desk module access", () => {
    assert.match(frontDeskActions, /checkInActiveMember/);
    assert.match(frontDeskActions, /requireModuleAccess\("\/front-desk"\)/);
  });

  it("validates member ID as UUID", () => {
    assert.match(frontDeskActions, /memberCheckInSchema/);
    assert.match(frontDeskActions, /\.uuid\(/);
  });

  it("calls create_member_check_in RPC", () => {
    assert.match(frontDeskActions, /supabase\.rpc\("create_member_check_in"/);
  });

  it("blocks banned members at the database level", () => {
    assert.match(migrations, /target_member\.status = 'banned'/);
  });

  it("blocks expired or missing active subscription", () => {
    assert.match(migrations, /expired_or_missing_active_subscription/);
  });

  it("blocks when entry limit is reached", () => {
    assert.match(migrations, /entry_limit_reached/);
  });

  it("locks subscription row for update before incrementing usage", () => {
    assert.match(migrations, /for update of ms/);
  });

  it("returns blocked status with message on failed check-in", () => {
    assert.match(frontDeskActions, /status === "blocked"/);
    assert.match(frontDeskActions, /result\.message/);
  });

  it("logs blocked check-in attempts to audit", () => {
    assert.match(migrations, /log_member_check_in_attempt/);
  });

  it("supports staff PIN member check-in path at the database level", () => {
    assert.match(migrations, /create_staff_pin_member_check_in/);
  });
});

// ---------------------------------------------------------------------------
// 8. Expired Member Handling
// ---------------------------------------------------------------------------
describe("expired member handling", () => {
  it("provides pay_walk_in, record_utang, and owner_override actions", () => {
    assert.match(expiredMemberSchema, /"pay_walk_in"/);
    assert.match(expiredMemberSchema, /"record_utang"/);
    assert.match(expiredMemberSchema, /"owner_override"/);
  });

  it("requires amount for pay_walk_in and record_utang actions", () => {
    assert.match(expiredMemberSchema, /action_type !== "owner_override" && \(!value\.amount/);
  });

  it("requires reason for record_utang and owner_override", () => {
    assert.match(expiredMemberSchema, /action_type !== "pay_walk_in" && !value\.reason/);
  });

  it("calls handle_expired_member_entry RPC", () => {
    assert.match(frontDeskActions, /supabase\.rpc\("handle_expired_member_entry"/);
    assert.match(migrations, /create or replace function public\.handle_expired_member_entry/);
  });

  it("supports cash, gcash, and other payment methods", () => {
    assert.match(expiredMemberSchema, /"cash"/);
    assert.match(expiredMemberSchema, /"gcash"/);
    assert.match(expiredMemberSchema, /"other"/);
  });

  it("revalidates member profile and related pages after action", () => {
    assert.match(frontDeskActions, /revalidatePath\(`\/members\/\$\{parsed\.data\.memberId\}`\)/);
    assert.match(frontDeskActions, /revalidatePath\("\/exceptions"\)/);
  });

  it("handles staff PIN expired member entry path at the database level", () => {
    assert.match(migrations, /handle_staff_pin_expired_member_entry/);
  });
});

// ---------------------------------------------------------------------------
// 9. Member Renewal
// ---------------------------------------------------------------------------
describe("member renewal", () => {
  it("requires members module access and record_payments permission", () => {
    assert.match(membersActions, /renewMember/);
    assert.match(membersActions, /requireModuleAccess\("\/members"\)/);
    assert.match(membersActions, /hasConfiguredPermission\(profile\.role,\s*"record_payments"\)/);
  });

  it("validates renewal input through memberRenewalSchema", () => {
    assert.match(membersSchema, /memberRenewalSchema/);
    assert.match(membersSchema, /plan_id.*uuid/);
    assert.match(membersSchema, /start_date.*regex/);
  });

  it("accepts cash, gcash, and other payment methods for renewal", () => {
    assert.match(membersSchema, /"cash", "gcash", "other"/);
  });

  it("calls renew_member_subscription RPC", () => {
    assert.match(membersActions, /supabase\.rpc\("renew_member_subscription"/);
    assert.match(migrations, /create or replace function public\.renew_member_subscription/);
  });

  it("flags duplicate GCash references during renewal", () => {
    assert.match(membersActions, /duplicate_reference_count/);
    assert.match(membersActions, /GCash reference already exists.*Renewal was recorded/);
  });

  it("revalidates member, front-desk, payments, and reports after renewal", () => {
    assert.match(membersActions, /revalidatePath\("\/members"\)/);
    assert.match(membersActions, /revalidatePath\("\/front-desk"\)/);
    assert.match(membersActions, /revalidatePath\("\/payments"\)/);
    assert.match(membersActions, /revalidatePath\("\/reports"\)/);
  });
});

// ---------------------------------------------------------------------------
// 10. Shift Closing
// ---------------------------------------------------------------------------
describe("shift closing", () => {
  it("requires authenticated profile", () => {
    assert.match(shiftActions, /requireCurrentProfile\(\)/);
  });

  it("validates close shift input through closeShiftSchema", () => {
    assert.match(shiftSchema, /closeShiftSchema/);
    assert.match(shiftSchema, /actual_cash/);
    assert.match(shiftSchema, /\.min\(0/);
  });

  it("requires variance explanation when cash does not match expected", () => {
    assert.match(shiftSchema, /actual_cash - values\.expected_cash/);
    assert.match(shiftSchema, /Explain the variance before closing/);
  });

  it("calls close_shift_reconciliation RPC", () => {
    assert.match(shiftActions, /supabase\.rpc\("close_shift_reconciliation"/);
    assert.match(migrations, /create or replace function public\.close_shift_reconciliation/);
  });

  it("enforces variance notes at the database level when variance is non-zero", () => {
    assert.match(migrations, /variance_value <> 0 and clean_variance_note is null/);
  });

  it("revalidates front-desk, shifts, reports, and owner-dashboard after close", () => {
    assert.match(shiftActions, /revalidatePath\("\/front-desk"\)/);
    assert.match(shiftActions, /revalidatePath\("\/shifts"\)/);
    assert.match(shiftActions, /revalidatePath\("\/reports"\)/);
    assert.match(shiftActions, /revalidatePath\("\/owner-dashboard"\)/);
  });

  it("supports staff PIN shift closing path at the database level", () => {
    assert.match(migrations, /close_staff_pin_shift_reconciliation/);
  });
});

// ---------------------------------------------------------------------------
// 11. Owner Review Actions
// ---------------------------------------------------------------------------
describe("owner review actions", () => {
  it("requires owner-review module access", () => {
    assert.match(ownerReviewActions, /requireModuleAccess\("\/owner-review"\)/);
  });

  it("supports reviewing exceptions, gcash_proofs, and shifts", () => {
    assert.match(ownerReviewActions, /"exception"/);
    assert.match(ownerReviewActions, /"gcash_proof"/);
    assert.match(ownerReviewActions, /"shift"/);
  });

  it("requires approve_exceptions permission for exception review", () => {
    assert.match(ownerReviewActions, /hasConfiguredPermission\(profile\.role,\s*"approve_exceptions"\)/);
  });

  it("requires correct_payments permission for GCash proof review", () => {
    assert.match(ownerReviewActions, /hasConfiguredPermission\(profile\.role,\s*"correct_payments"\)/);
  });

  it("calls review_exception RPC for exception items", () => {
    assert.match(ownerReviewActions, /supabase\.rpc\("review_exception"/);
    assert.match(migrations, /create or replace function public\.review_exception/);
  });

  it("calls review_gcash_proof RPC for GCash proof items", () => {
    assert.match(ownerReviewActions, /supabase\.rpc\("review_gcash_proof"/);
  });

  it("acknowledges shift variance with owner note and audit log", () => {
    assert.match(ownerReviewActions, /status: "reviewed"/);
    assert.match(ownerReviewActions, /audit_logs.*insert/);
    assert.match(ownerReviewActions, /review_shift_variance/);
  });

  it("supports approve, reject, resolve, verify, follow_up, and acknowledge actions", () => {
    assert.match(ownerReviewActions, /"approve", "reject", "resolve", "verify", "follow_up", "acknowledge"/);
  });
});

// ---------------------------------------------------------------------------
// 12. Balance Payment
// ---------------------------------------------------------------------------
describe("balance / utang payment", () => {
  it("requires balances module access and record_payments permission", () => {
    assert.match(balanceActions, /requireModuleAccess\("\/balances"\)/);
    assert.match(balanceActions, /hasConfiguredPermission\(profile\.role,\s*"record_payments"\)/);
  });

  it("supports full and partial payment modes", () => {
    assert.match(balanceSchema, /"full", "partial"/);
  });

  it("requires amount for partial payments", () => {
    assert.match(balanceSchema, /payment_mode === "partial" && \(!value\.amount/);
  });

  it("calls record_balance_payment RPC", () => {
    assert.match(balanceActions, /supabase\.rpc\("record_balance_payment"/);
    assert.match(migrations, /create or replace function public\.record_balance_payment/);
  });
});

// ---------------------------------------------------------------------------
// 13. Exception Handling
// ---------------------------------------------------------------------------
describe("exception handling", () => {
  it("requires exceptions module access for creation", () => {
    assert.match(exceptionActions, /createException/);
    assert.match(exceptionActions, /requireModuleAccess\("\/exceptions"\)/);
  });

  it("requires approve_exceptions permission for review", () => {
    assert.match(exceptionActions, /reviewException/);
    assert.match(exceptionActions, /hasConfiguredPermission\(profile\.role,\s*"approve_exceptions"\)/);
  });

  it("calls create_exception and review_exception RPCs", () => {
    assert.match(exceptionActions, /supabase\.rpc\("create_exception"/);
    assert.match(exceptionActions, /supabase\.rpc\("review_exception"/);
    assert.match(migrations, /create or replace function public\.create_exception/);
    assert.match(migrations, /create or replace function public\.review_exception/);
  });

  it("validates review action through zod schema", () => {
    assert.match(exceptionActions, /exceptionReviewSchema\.safeParse/);
  });
});

// ---------------------------------------------------------------------------
// 14. GCash Review
// ---------------------------------------------------------------------------
describe("gcash proof review", () => {
  it("requires payments module access and correct_payments permission", () => {
    assert.match(gcashReviewActions, /requireModuleAccess\("\/payments"\)/);
    assert.match(gcashReviewActions, /hasConfiguredPermission\(profile\.role,\s*"correct_payments"\)/);
  });

  it("supports verify, reject, and follow_up actions", () => {
    assert.match(gcashReviewActions, /"verify", "reject", "follow_up"/);
  });

  it("calls review_gcash_proof RPC", () => {
    assert.match(gcashReviewActions, /supabase\.rpc\("review_gcash_proof"/);
  });

  it("validates review input through zod schema", () => {
    assert.match(gcashReviewActions, /gcashReviewSchema\.safeParse/);
  });
});

// ---------------------------------------------------------------------------
// 15. Settings
// ---------------------------------------------------------------------------
describe("settings", () => {
  it("restricts all settings actions to owner or admin", () => {
    assert.match(settingsActions, /canManageSystemSettings\(profile\.role\)/);
  });

  it("supports gym profile, walk-in rate, and operational settings", () => {
    assert.match(settingsActions, /saveGymProfile/);
    assert.match(settingsActions, /saveWalkInRate/);
    assert.match(settingsActions, /saveOperationalSettings/);
  });

  it("supports role permissions, staff access, and membership rates", () => {
    assert.match(settingsActions, /saveRolePermissions/);
    assert.match(settingsActions, /saveStaffAccess/);
    assert.match(settingsActions, /saveMembershipRate/);
  });

  it("supports staff PIN management", () => {
    assert.match(settingsActions, /saveStaffPin/);
    assert.match(settingsActions, /hashStaffPin/);
    assert.match(settingsActions, /PIN must be 4 to 8 digits/);
  });

  it("supports staff deactivation with PIN clearing", () => {
    assert.match(settingsActions, /deactivateStaff/);
    assert.match(settingsActions, /pin_hash: null/);
    assert.match(settingsActions, /status: "inactive"/);
  });
});

// ---------------------------------------------------------------------------
// 16. Member Management
// ---------------------------------------------------------------------------
describe("member management", () => {
  it("requires member manager role for create and update", () => {
    assert.match(membersActions, /createMember/);
    assert.match(membersActions, /updateMember/);
    assert.match(membersActions, /requireMemberManager/);
  });

  it("validates member form through zod schema", () => {
    assert.match(membersSchema, /memberFormSchema/);
    assert.match(membersSchema, /full_name.*min\(2/);
    assert.match(membersSchema, /phone.*min\(5/);
    assert.match(membersSchema, /member_code.*min\(2/);
  });

  it("supports member status changes", () => {
    assert.match(membersActions, /setMemberStatus/);
    assert.match(membersActions, /"active" \| "banned" \| "archived"/);
  });

  it("handles duplicate member codes with user-friendly message", () => {
    assert.match(membersActions, /23505.*Member ID is already in use/);
  });
});

// ---------------------------------------------------------------------------
// 17. Seed Data Integrity
// ---------------------------------------------------------------------------
describe("seed data integrity", () => {
  it("creates staff accounts for all five roles", () => {
    assert.match(seed, /owner@gymledger\.local/);
    assert.match(seed, /manager@gymledger\.local/);
    assert.match(seed, /frontdesk1@gymledger\.local/);
    assert.match(seed, /frontdesk2@gymledger\.local/);
    assert.match(seed, /accountant@gymledger\.local/);
  });

  it("creates member test accounts", () => {
    assert.match(seed, /active\.member@gymledger\.local/);
    assert.match(seed, /expired\.member@gymledger\.local/);
  });

  it("seeds membership plans", () => {
    assert.match(seed, /membership_plans/);
  });

  it("seeds member subscriptions", () => {
    assert.match(seed, /member_subscriptions/);
  });
});

// ---------------------------------------------------------------------------
// 18. Module Registry
// ---------------------------------------------------------------------------
describe("module registry", () => {
  it("registers all 13 modules", () => {
    const hrefs = modules.match(/href: "[^"]+"/g) ?? [];
    assert.equal(hrefs.length, 13);
  });

  it("includes core operational modules", () => {
    assert.match(modules, /"\/front-desk"/);
    assert.match(modules, /"\/members"/);
    assert.match(modules, /"\/payments"/);
    assert.match(modules, /"\/shifts"/);
    assert.match(modules, /"\/owner-review"/);
    assert.match(modules, /"\/settings"/);
    assert.match(modules, /"\/owner-dashboard"/);
    assert.match(modules, /"\/balances"/);
    assert.match(modules, /"\/exceptions"/);
    assert.match(modules, /"\/entry-reconciliation"/);
    assert.match(modules, /"\/notifications"/);
    assert.match(modules, /"\/reports"/);
    assert.match(modules, /"\/audit-logs"/);
  });
});

// ---------------------------------------------------------------------------
// 19. Security Checklist
// ---------------------------------------------------------------------------
describe("security checklist", () => {
  it("does not expose the Supabase service role key through public env names", () => {
    assert.doesNotMatch(supabaseServer, /NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY/);
    assert.match(supabaseServer, /NEXT_PUBLIC_SUPABASE_URL/);
    assert.match(supabaseServer, /NEXT_PUBLIC_SUPABASE_ANON_KEY/);
  });

  it("keeps staff PIN hashing server-only with scrypt", () => {
    assert.match(staffPinAuth, /"server-only"/);
    assert.match(staffPinAuth, /scrypt/);
    assert.match(staffPinAuth, /hashStaffPin/);
    assert.match(staffPinAuth, /clearStaffPinSession/);
  });

  it("protects owner-only modules from staff roles", () => {
    const frontDeskAccess = permissions.match(/front_desk: \[(?<routes>[^\]]+)\]/)?.groups?.routes ?? "";

    assert.match(frontDeskAccess, /"\/front-desk"/);
    assert.match(frontDeskAccess, /"\/members"/);
    assert.doesNotMatch(frontDeskAccess, /\/owner-dashboard/);
    assert.doesNotMatch(frontDeskAccess, /\/audit-logs/);
    assert.doesNotMatch(frontDeskAccess, /\/settings/);
  });

  it("keeps staff PIN sessions limited to front desk routes and actions", () => {
    assert.doesNotMatch(proxy, /requestedModule === "\/notifications"[\s\S]*gymledger_staff_pin_session/);
    assert.match(notificationsPage, /requireModuleAccess\("\/notifications"\)/);
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
    assert.match(migrations, /allowed_mime_types = array\['image\/jpeg', 'image\/png', 'image\/webp'\]/);
    assert.match(migrations, /on storage\.objects for select/);
    assert.match(migrations, /bucket_id = 'gcash-proofs'/);
  });

  it("keeps privileged GCash proof RPCs permission checked", () => {
    assert.match(
      migrations,
      /create or replace function public\.mark_gcash_proof_uploaded[\s\S]*private\.has_permission\('record_payments'\)[\s\S]*grant execute on function public\.mark_gcash_proof_uploaded/
    );
    assert.match(migrations, /revoke execute on function public\.mark_gcash_proof_uploaded[\s\S]*from public, anon, authenticated/);
    assert.match(
      migrations,
      /create or replace function public\.review_gcash_proof[\s\S]*private\.has_permission\('correct_payments'\)[\s\S]*grant execute on function public\.review_gcash_proof/
    );
    assert.match(migrations, /revoke execute on function public\.review_gcash_proof\(uuid, text, text\) from public, anon, authenticated/);
  });

  it("keeps GCash proof storage mutations dynamically permission checked", () => {
    assert.match(
      migrations,
      /drop policy if exists "gcash proofs storage update management" on storage\.objects[\s\S]*create policy "gcash proofs storage update management"[\s\S]*on storage\.objects for update[\s\S]*private\.has_permission\('correct_payments'\)/
    );
    assert.match(
      migrations,
      /drop policy if exists "gcash proofs storage delete management" on storage\.objects[\s\S]*create policy "gcash proofs storage delete management"[\s\S]*on storage\.objects for delete[\s\S]*private\.has_permission\('correct_payments'\)/
    );
  });

  it("keeps GCash proof review constrained to uploaded reviewable states", () => {
    assert.match(migrations, /target_proof\.storage_path is null[\s\S]*pending-proofs\//);
    assert.match(migrations, /target_proof\.file_name is null[\s\S]*Pending proof/);
    assert.match(
      migrations,
      /p_action = 'confirm'[\s\S]*target_proof\.proof_status not in \('staff_checked', 'needs_follow_up'\)/
    );
    assert.match(
      migrations,
      /p_action = 'dispute'[\s\S]*target_proof\.proof_status not in \('staff_checked', 'needs_follow_up'\)/
    );
    assert.match(
      migrations,
      /p_action = 'follow_up'[\s\S]*target_proof\.proof_status not in \('staff_checked', 'disputed'\)/
    );
  });

  it("keeps GCash proof image streaming behind module access", () => {
    assert.match(gcashProofImageRoute, /requireModuleAccess\("\/front-desk"\)/);
  });

  it("keeps audit logs append-only for normal users", () => {
    assert.match(migrations, /create trigger audit_logs_block_update before update on public\.audit_logs/);
    assert.match(migrations, /create trigger audit_logs_block_delete before delete on public\.audit_logs/);
    assert.match(migrations, /raise exception 'audit_logs are append-only'/);
    assert.match(migrations, /drop policy if exists "audit logs update" on public\.audit_logs/);
    assert.match(migrations, /drop policy if exists "audit logs delete" on public\.audit_logs/);
  });

  it("keeps staff PIN service-role writes inside guarded RPC workflows", () => {
    assert.match(migrations, /create_staff_pin_walk_in/);
    assert.match(migrations, /handle_staff_pin_expired_member_entry/);
    assert.match(migrations, /mark_staff_pin_gcash_proof_uploaded/);
    assert.match(migrations, /close_staff_pin_shift_reconciliation/);
    assert.match(migrations, /private\.staff_pin_has_permission/);
  });

  it("keeps staff PIN notifications actor-safe and non-duplicated", () => {
    assert.match(staffPinIntegrityMigration, /create or replace function private\.notify_staff_pin_member_check_in_blocked/);
    assert.match(staffPinIntegrityMigration, /p_actor_id uuid/);
    assert.doesNotMatch(staffPinIntegrityMigration, /perform private\.notify_member_check_in_blocked\(/);
    assert.match(staffPinIntegrityMigration, /'banned_member'[\s\S]+return jsonb_build_object\(\s+'status', 'blocked'/);
  });
});
