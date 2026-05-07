# Production Readiness Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Audit and harden GymLedger for a small real gym pilot, prioritizing access control, data integrity, Supabase security, production configuration, and verification.

**Architecture:** Execute this as a staged risk-based audit. First capture baseline verification and findings in a dedicated audit report, then add focused regression coverage for discovered gaps, implement targeted fixes only where needed, and finish with full verification. Preserve the existing dirty worktree and do not revert unrelated changes.

**Tech Stack:** Next.js App Router, TypeScript, React, Supabase Auth/Postgres/RLS/Storage/RPC, Node.js `node:test`, ESLint, npm, Supabase CLI.

---

## File Structure

- Create: `docs/audits/2026-05-07-production-readiness.md`
  - Owns the running audit record: baseline results, findings, decisions, fixes, verification, and remaining risks.
- Modify: `tests/critical-workflows.test.mjs`
  - Add source and migration assertions for high-risk safeguards found during the audit.
- Modify as needed: `src/proxy.ts`
  - Route middleware access checks.
- Modify as needed: `src/lib/auth/server.ts`
  - Server-side profile and module guard behavior.
- Modify as needed: `src/lib/auth/permissions.ts`
  - Role and module permission matrix.
- Modify as needed: `src/lib/auth/configured-permissions.ts`
  - Database-backed permission lookup behavior.
- Modify as needed: `src/lib/auth/staff-pin.ts`
  - Staff PIN hash, cookie, and session verification behavior.
- Modify as needed: `src/lib/supabase/server.ts`
  - Supabase SSR and service-role client creation.
- Modify as needed: `src/app/(auth)/login/actions.ts`
  - Email/password and staff PIN login actions.
- Modify as needed: `src/app/(app)/front-desk/actions.ts`
  - Walk-in, member check-in, expired member, and GCash proof workflows.
- Modify as needed: `src/app/(app)/shifts/actions.ts`
  - Shift start and close workflows.
- Modify as needed: `src/app/(app)/settings/actions.ts`
  - Owner/admin settings and staff management actions.
- Modify as needed: `src/app/(app)/payments/gcash-review/actions.ts`
  - Owner/management GCash proof review.
- Modify as needed: `src/app/(app)/exceptions/actions.ts`
  - Exception creation and review.
- Modify as needed: `src/app/(app)/balances/actions.ts`
  - Balance settlement behavior.
- Modify as needed: `src/app/(app)/notifications/actions.ts`
  - Notification read/update behavior.
- Modify as needed: `src/app/(app)/front-desk/gcash-proofs/[id]/image/route.ts`
  - Protected GCash proof image route.
- Modify as needed: `supabase/migrations/*.sql`
  - RLS, RPC, storage, audit, and data-integrity fixes.
- Modify as needed: `README.md`
  - Production environment and pilot deployment checklist.

## Task 1: Capture Baseline Verification

**Files:**
- Create: `docs/audits/2026-05-07-production-readiness.md`

- [ ] **Step 1: Check current worktree before touching files**

Run:

```bash
git status --short
```

Expected: Shows the existing dirty worktree. Do not revert or clean unrelated files.

- [ ] **Step 2: Run source tests**

Run:

```bash
npm test
```

Expected: Either PASS, or failures are copied into the audit report under "Baseline Verification".

- [ ] **Step 3: Run lint**

Run:

```bash
npm run lint
```

Expected: Either PASS, or ESLint failures are copied into the audit report under "Baseline Verification".

- [ ] **Step 4: Run production build**

Run:

```bash
npm run build
```

Expected: Either PASS, or build/type failures are copied into the audit report under "Baseline Verification".

- [ ] **Step 5: Run dependency audit**

Run:

```bash
npm audit --omit=dev
```

Expected: Either no production vulnerabilities, or vulnerability summary is copied into the audit report under "Dependency Risk".

- [ ] **Step 6: Try Supabase verification**

Run:

```bash
supabase db lint
```

Expected: PASS if local Supabase is configured. If the command cannot run because Supabase is unavailable, record the blocker in the audit report.

- [ ] **Step 7: Create the initial audit report**

Create `docs/audits/2026-05-07-production-readiness.md` with this structure:

```markdown
# GymLedger Production Readiness Audit

## Baseline Verification

| Check | Result | Notes |
|---|---|---|
| `npm test` | Not run | Run in Task 1. |
| `npm run lint` | Not run | Run in Task 1. |
| `npm run build` | Not run | Run in Task 1. |
| `npm audit --omit=dev` | Not run | Run in Task 1. |
| `supabase db lint` | Not run | Run in Task 1 if Supabase is available. |

## Findings

No findings recorded yet.

## Fixes Applied

No fixes applied yet.

## Verification After Fixes

Not run yet.

## Remaining Pilot Risks

No remaining risks recorded yet.
```

- [ ] **Step 8: Update baseline results**

Replace each `Not run` result in `docs/audits/2026-05-07-production-readiness.md` with `Pass`, `Fail`, or `Blocked`, and add the important failure output or blocker details in the `Notes` column.

- [ ] **Step 9: Commit the baseline audit report**

Run:

```bash
git add docs/audits/2026-05-07-production-readiness.md
git commit -m "Add production readiness audit baseline"
```

Expected: A commit containing only the audit report.

## Task 2: Audit Access Control

**Files:**
- Modify: `docs/audits/2026-05-07-production-readiness.md`
- Modify if needed: `tests/critical-workflows.test.mjs`
- Modify if needed: `src/proxy.ts`
- Modify if needed: `src/lib/auth/server.ts`
- Modify if needed: `src/lib/auth/permissions.ts`
- Modify if needed: `src/lib/auth/configured-permissions.ts`
- Modify if needed: `src/lib/auth/staff-pin.ts`
- Modify if needed: `src/app/(auth)/login/actions.ts`

- [ ] **Step 1: Inspect route and module declarations**

Run:

```bash
sed -n '1,220p' src/proxy.ts
sed -n '1,240p' src/lib/modules.ts
sed -n '1,260p' src/lib/auth/permissions.ts
```

Expected: Every protected app route in `src/lib/modules.ts` is protected by `src/proxy.ts`, and every protected route has a server-side `requireModuleAccess(...)` check.

- [ ] **Step 2: Inspect server-side auth helpers**

Run:

```bash
sed -n '1,220p' src/lib/auth/server.ts
sed -n '1,260p' src/lib/auth/configured-permissions.ts
sed -n '1,260p' src/lib/auth/staff-pin.ts
sed -n '1,180p' 'src/app/(auth)/login/actions.ts'
```

Expected: Email auth, staff PIN auth, active profile checks, inactive staff checks, cookie signing, and module restrictions are enforced server-side.

- [ ] **Step 3: Inspect server actions for direct-call protection**

Run:

```bash
rg -n "export async function|requireModuleAccess|requireCurrentProfile|canManageSystemSettings|hasConfiguredPermission|createServiceClient" 'src/app/(app)' 'src/app/(auth)' src/lib
```

Expected: Every exported server action that reads or mutates protected data requires a current profile or module access before using Supabase.

- [ ] **Step 4: Add access-control findings to the audit report**

For each issue found, add a finding under `## Findings` using one of these severity words in the heading: `Critical`, `High`, `Medium`, or `Low`. This is an example of the exact structure to use:

```markdown
### High Staff PIN Session Can Reach Settings Action

- Area: Access control
- Files: `src/app/(app)/settings/actions.ts`
- Risk: A low-privilege front-desk PIN session can change owner-only settings through a direct server action call.
- Evidence: `rg` showed an exported settings action using Supabase before `requireModuleAccess("/settings")`.
- Recommendation: Require `/settings` module access and owner/admin role validation before reading input or using Supabase.
- Status: Open
```

If no issue is found, add:

```markdown
### No Access Control Findings

No access-control gaps were found in middleware, module guards, staff PIN session checks, or exported protected server actions.
```

- [ ] **Step 5: Add regression assertions for any access-control fix**

If an access-control issue is found, first add a failing assertion to `tests/critical-workflows.test.mjs`. Use this pattern:

```js
it("keeps protected routes and server actions behind explicit access checks", () => {
  assert.match(proxy, /"\/settings": true/);
  assert.match(proxy, /"\/audit-logs": true/);
  assert.match(permissions, /front_desk: \[[^\]]*"\/front-desk"/);
  assert.doesNotMatch(permissions.match(/front_desk: \[(?<routes>[^\]]+)\]/)?.groups?.routes ?? "", /\/settings/);
});
```

Run:

```bash
npm test
```

Expected: FAIL before the fix if the test captures a real gap.

- [ ] **Step 6: Implement access-control fixes if needed**

Make the minimal targeted edits in the relevant access file. Examples of acceptable fixes:

```ts
const profile = await requireModuleAccess("/settings");

if (!canManageSystemSettings(profile.role)) {
  return { error: "Only owner or admin accounts can manage settings." };
}
```

or:

```ts
if (profile.accessMode === "staff_pin" && href !== "/front-desk") {
  redirect(`/unauthorized?next=${encodeURIComponent(href)}`);
}
```

- [ ] **Step 7: Verify access-control changes**

Run:

```bash
npm test
npm run lint
```

Expected: PASS for the updated test and no lint regressions.

- [ ] **Step 8: Commit access-control work**

Run:

```bash
git add docs/audits/2026-05-07-production-readiness.md tests/critical-workflows.test.mjs src/proxy.ts src/lib/auth/server.ts src/lib/auth/permissions.ts src/lib/auth/configured-permissions.ts src/lib/auth/staff-pin.ts 'src/app/(auth)/login/actions.ts'
git commit -m "Harden access control checks"
```

Expected: Commit includes only files changed for access-control findings and the audit report.

## Task 3: Audit Data Integrity

**Files:**
- Modify: `docs/audits/2026-05-07-production-readiness.md`
- Modify if needed: `tests/critical-workflows.test.mjs`
- Modify if needed: `src/app/(app)/front-desk/actions.ts`
- Modify if needed: `src/app/(app)/shifts/actions.ts`
- Modify if needed: `src/app/(app)/payments/gcash-review/actions.ts`
- Modify if needed: `src/app/(app)/exceptions/actions.ts`
- Modify if needed: `src/app/(app)/balances/actions.ts`
- Modify if needed: `supabase/migrations/*.sql`

- [ ] **Step 1: Inspect money and attendance server actions**

Run:

```bash
sed -n '1,860p' 'src/app/(app)/front-desk/actions.ts'
sed -n '1,340p' 'src/app/(app)/shifts/actions.ts'
sed -n '1,180p' 'src/app/(app)/payments/gcash-review/actions.ts'
sed -n '1,140p' 'src/app/(app)/exceptions/actions.ts'
sed -n '1,120p' 'src/app/(app)/balances/actions.ts'
```

Expected: Critical multi-record writes are either inside Supabase RPCs or have explicit compensating safeguards, validation, and audit logging.

- [ ] **Step 2: Inspect workflow RPCs**

Run:

```bash
rg -n "create or replace function public\\.(create_walk_in|create_member_check_in|handle_expired_member_entry|review_gcash_proof|close_shift_reconciliation|record_balance_payment)|for update|insert into public\\.audit_logs|entries_used|expected_cash|proof_status|status = 'open'" supabase/migrations
```

Expected: RPCs validate role, active shift, member status, payment status, and audit trails before privileged writes. Subscription and shift updates that can race should use database-side logic.

- [ ] **Step 3: Compare staff PIN paths with RPC paths**

Run:

```bash
rg -n "accessMode === \"staff_pin\"|createWalkInWithPin|getActivePinShift|createServiceClient\\(\\)" 'src/app/(app)/front-desk/actions.ts' 'src/app/(app)/shifts/actions.ts'
```

Expected: Staff PIN service-role paths enforce the same business rules as the authenticated RPC paths, including active shift, staff status, banned members, payment permissions, audit logging, and GCash proof state transitions.

- [ ] **Step 4: Add data-integrity findings to the audit report**

For each issue found, add a finding under `## Findings` using one of these severity words in the heading: `Critical`, `High`, `Medium`, or `Low`. This is an example of the exact structure to use:

```markdown
### Critical Active Member Check-In Can Double Increment Usage

- Area: Data integrity
- Files: `src/app/(app)/front-desk/actions.ts`, `supabase/migrations/20260507123305_notifications_alerts.sql`
- Risk: Concurrent check-ins can overuse a limited subscription and create duplicate attendance records.
- Evidence: The code increments `entries_used` outside a locked database-side workflow.
- Recommendation: Move the check and increment into a single RPC transaction using row locking.
- Status: Open
```

If no issue is found, add:

```markdown
### No Data Integrity Findings

No critical data-integrity gaps were found in member check-in, walk-in, expired-member, GCash proof, shift, balance, exception, or audit-log workflows.
```

- [ ] **Step 5: Add regression assertions for any data-integrity fix**

If a data-integrity issue is found, add a focused assertion to `tests/critical-workflows.test.mjs`. Use this pattern:

```js
it("keeps staff PIN front desk writes behind active shift and audit safeguards", () => {
  assert.match(frontDeskActions, /getActivePinShift\(profile,\s*supabase\)/);
  assert.match(frontDeskActions, /staffProfile\.status !== "active"/);
  assert.match(frontDeskActions, /staff_pin_member_check_in_created/);
  assert.match(frontDeskActions, /staff_pin_walk_in_created/);
});
```

Run:

```bash
npm test
```

Expected: FAIL before the fix if the assertion captures a real gap.

- [ ] **Step 6: Implement data-integrity fixes if needed**

Prefer database RPC fixes for multi-table writes. Use this pattern for migration changes that must be atomic:

```sql
create or replace function public.some_workflow_function(...)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  -- Validate role, staff status, active shift, target row state, then write related rows.
  -- Keep all related inserts and updates inside this function transaction.

  return jsonb_build_object('status', 'created');
end;
$$;
```

For TypeScript fixes, validate before using the service-role client and update audit logs in the same workflow:

```ts
const activeShift = await getActivePinShift(profile, supabase);

if (!activeShift) {
  return { error: "Staff PIN session is not active." };
}
```

- [ ] **Step 7: Verify data-integrity changes**

Run:

```bash
npm test
npm run lint
```

If migration files changed and Supabase is available, also run:

```bash
supabase db reset
supabase db lint
```

Expected: PASS, or Supabase blocker recorded in the audit report.

- [ ] **Step 8: Commit data-integrity work**

Run:

```bash
git add docs/audits/2026-05-07-production-readiness.md tests/critical-workflows.test.mjs 'src/app/(app)/front-desk/actions.ts' 'src/app/(app)/shifts/actions.ts' 'src/app/(app)/payments/gcash-review/actions.ts' 'src/app/(app)/exceptions/actions.ts' 'src/app/(app)/balances/actions.ts' supabase/migrations
git commit -m "Harden critical workflow integrity"
```

Expected: Commit includes only data-integrity changes and the audit report.

## Task 4: Audit Supabase Security

**Files:**
- Modify: `docs/audits/2026-05-07-production-readiness.md`
- Modify if needed: `tests/critical-workflows.test.mjs`
- Modify if needed: `supabase/migrations/*.sql`
- Modify if needed: `src/app/(app)/front-desk/gcash-proofs/[id]/image/route.ts`

- [ ] **Step 1: Inspect RLS coverage**

Run:

```bash
rg -n "alter table public\\.[a-z_]+ enable row level security|create policy|drop policy" supabase/migrations
```

Expected: Every public application table has RLS enabled and policies that match intended roles.

- [ ] **Step 2: Inspect privileged function safety**

Run:

```bash
rg -n "security definer|set search_path|grant execute|auth\\.uid\\(\\)|private\\.current_app_role|private\\.has_permission|private\\.is_management|private\\.is_front_desk_or_management" supabase/migrations
```

Expected: `security definer` functions set `search_path`, validate caller identity and permissions, and are granted only as intended.

- [ ] **Step 3: Inspect GCash proof storage**

Run:

```bash
sed -n '1,140p' supabase/migrations/20260506000200_gcash_storage.sql
sed -n '1,240p' supabase/migrations/20260507002505_gcash_proof_review_logic.sql
sed -n '1,120p' 'src/app/(app)/front-desk/gcash-proofs/[id]/image/route.ts'
```

Expected: Bucket is private, MIME-limited, size-limited, and readable only by allowed staff or management. The image route must require module access before creating signed URLs or streaming protected files.

- [ ] **Step 4: Add Supabase security findings to the audit report**

For each issue found, add a finding under `## Findings` using one of these severity words in the heading: `Critical`, `High`, `Medium`, or `Low`. This is an example of the exact structure to use:

```markdown
### High Privileged RPC Missing Caller Permission Check

- Area: Supabase security
- Files: `supabase/migrations/20260507001001_exception_module_objects.sql`
- Risk: An authenticated user could execute a privileged review function outside the intended role boundary.
- Evidence: `rg` showed `security definer` and `grant execute` without a matching `private.has_permission(...)` or management-role check.
- Recommendation: Add authenticated caller, active profile, and permission checks inside the RPC before any write.
- Status: Open
```

If no issue is found, add:

```markdown
### No Supabase Security Findings

No Supabase RLS, RPC, storage, function grant, or audit-log policy gaps were found during this pass.
```

- [ ] **Step 5: Add regression assertions for any Supabase security fix**

If a Supabase security issue is found, add an assertion to `tests/critical-workflows.test.mjs`. Use this pattern:

```js
it("keeps privileged RPCs permission checked and search-path pinned", () => {
  assert.match(migrations, /security definer/);
  assert.match(migrations, /set search_path = public/);
  assert.match(migrations, /auth\.uid\(\) is null/);
  assert.match(migrations, /grant execute on function public\./);
});
```

Run:

```bash
npm test
```

Expected: FAIL before the fix if the assertion captures a real gap.

- [ ] **Step 6: Implement Supabase security fixes if needed**

For policy fixes, use explicit `drop policy if exists` before replacement:

```sql
drop policy if exists "policy name" on public.table_name;
create policy "policy name"
on public.table_name for select
to authenticated
using (private.is_management());
```

For function fixes, ensure `security definer`, `set search_path = public`, and caller checks are present:

```sql
create or replace function public.safe_function()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  if not private.is_management() then
    raise exception 'You do not have permission to perform this action.';
  end if;
end;
$$;
```

- [ ] **Step 7: Verify Supabase security changes**

Run:

```bash
npm test
```

If Supabase is available, also run:

```bash
supabase db reset
supabase db lint
```

Expected: PASS, or Supabase blocker recorded in the audit report.

- [ ] **Step 8: Commit Supabase security work**

Run:

```bash
git add docs/audits/2026-05-07-production-readiness.md tests/critical-workflows.test.mjs supabase/migrations 'src/app/(app)/front-desk/gcash-proofs/[id]/image/route.ts'
git commit -m "Harden Supabase security policies"
```

Expected: Commit includes only Supabase security changes and the audit report.

## Task 5: Audit Production Configuration

**Files:**
- Modify: `docs/audits/2026-05-07-production-readiness.md`
- Modify if needed: `README.md`
- Modify if needed: `src/lib/auth/staff-pin.ts`
- Modify if needed: `src/lib/supabase/server.ts`
- Modify if needed: `package.json`

- [ ] **Step 1: Inspect environment and secret usage**

Run:

```bash
rg -n "process\\.env|NEXT_PUBLIC_|SUPABASE_SERVICE_ROLE_KEY|STAFF_PIN_SESSION_SECRET|NODE_ENV" src README.md package.json supabase
```

Expected: Public env vars are limited to values safe for the browser. Service-role keys and staff PIN secrets are server-only.

- [ ] **Step 2: Inspect seed data risk**

Run:

```bash
sed -n '1,260p' supabase/seed.sql
rg -n "password|pin|@|seed|demo|local|service_role|anon" README.md supabase/seed.sql supabase/config.toml
```

Expected: Any local/demo accounts, staff PINs, or seeded credentials are clearly documented as non-production and not used for pilot deployment.

- [ ] **Step 3: Inspect dependency posture**

Run:

```bash
npm audit --omit=dev
npm outdated
```

Expected: Production vulnerabilities are either absent or recorded with severity and upgrade recommendation. Outdated packages are recorded only if they affect pilot safety or build stability.

- [ ] **Step 4: Add production configuration findings to the audit report**

For each issue found, add a finding under `## Findings` using one of these severity words in the heading: `Critical`, `High`, `Medium`, or `Low`. This is an example of the exact structure to use:

```markdown
### Medium Staff PIN Cookie Secret Falls Back To Service Role Key

- Area: Production configuration
- Files: `src/lib/auth/staff-pin.ts`, `README.md`
- Risk: Reusing the service-role key as a cookie signing secret increases blast radius if the cookie secret is exposed.
- Evidence: `getSessionSecret()` falls back to `SUPABASE_SERVICE_ROLE_KEY`.
- Recommendation: Require `STAFF_PIN_SESSION_SECRET` in production and document it in the pilot checklist.
- Status: Open
```

If no issue is found, add:

```markdown
### No Production Configuration Findings

No blocking pilot deployment configuration gaps were found in env handling, secret usage, cookies, seed data, or production dependencies.
```

- [ ] **Step 5: Update README if configuration gaps are found**

Add a "Pilot Deployment Checklist" section to `README.md` if missing:

```markdown
## Pilot Deployment Checklist

- Set `NEXT_PUBLIC_SUPABASE_URL` to the production Supabase project URL.
- Set `NEXT_PUBLIC_SUPABASE_ANON_KEY` to the production Supabase anon key.
- Set `SUPABASE_SERVICE_ROLE_KEY` only in the server runtime environment.
- Set `STAFF_PIN_SESSION_SECRET` to a long random value that is different from the Supabase service-role key.
- Do not load local seed users, demo passwords, or demo staff PINs into the pilot database.
- Confirm the `gcash-proofs` bucket is private before accepting real proof images.
- Confirm database backups are enabled before recording real member, payment, and shift data.
- Run `npm run lint`, `npm run build`, and `npm test` before deploying.
```

- [ ] **Step 6: Implement code fixes if configuration gaps are found**

If production code currently falls back to `SUPABASE_SERVICE_ROLE_KEY` for staff PIN cookies, prefer requiring `STAFF_PIN_SESSION_SECRET` in production:

```ts
function getSessionSecret() {
  const secret = process.env.STAFF_PIN_SESSION_SECRET;

  if (secret) {
    return secret;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("Missing STAFF_PIN_SESSION_SECRET.");
  }

  const fallback = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!fallback) {
    throw new Error("Missing STAFF_PIN_SESSION_SECRET or SUPABASE_SERVICE_ROLE_KEY.");
  }

  return fallback;
}
```

- [ ] **Step 7: Verify production configuration changes**

Run:

```bash
npm test
npm run lint
npm run build
```

Expected: PASS, or failures recorded in the audit report.

- [ ] **Step 8: Commit production configuration work**

Run:

```bash
git add docs/audits/2026-05-07-production-readiness.md README.md src/lib/auth/staff-pin.ts src/lib/supabase/server.ts package.json package-lock.json
git commit -m "Document pilot deployment requirements"
```

Expected: Commit includes only production configuration changes and the audit report.

## Task 6: Final Verification and Handoff

**Files:**
- Modify: `docs/audits/2026-05-07-production-readiness.md`

- [ ] **Step 1: Run final source tests**

Run:

```bash
npm test
```

Expected: PASS. If it fails, fix the failing audit-related issue before continuing or record the blocker if unrelated to this plan.

- [ ] **Step 2: Run final lint**

Run:

```bash
npm run lint
```

Expected: PASS. If it fails, fix the failing audit-related issue before continuing or record the blocker if unrelated to this plan.

- [ ] **Step 3: Run final build**

Run:

```bash
npm run build
```

Expected: PASS. If it fails, fix the failing audit-related issue before continuing or record the blocker if unrelated to this plan.

- [ ] **Step 4: Run final dependency audit**

Run:

```bash
npm audit --omit=dev
```

Expected: No unaccepted production vulnerabilities. Any accepted vulnerabilities must be listed under "Remaining Pilot Risks".

- [ ] **Step 5: Run final Supabase checks if available**

Run:

```bash
supabase db lint
```

Expected: PASS if Supabase is available. If Supabase is unavailable, record it as a verification blocker.

- [ ] **Step 6: Update final audit report sections**

In `docs/audits/2026-05-07-production-readiness.md`, update:

```markdown
## Fixes Applied

- `abc1234 Harden access control checks`: closed the direct settings action access-control risk.

## Verification After Fixes

| Check | Result | Notes |
|---|---|---|
| `npm test` | Pass | Final run passed. |
| `npm run lint` | Pass | Final run passed. |
| `npm run build` | Pass | Final run passed. |
| `npm audit --omit=dev` | Pass | No unaccepted production vulnerabilities. |
| `supabase db lint` | Pass or Blocked | Include result or blocker. |

## Remaining Pilot Risks

- `supabase db lint` was blocked because the local Supabase stack was not running.
```

- [ ] **Step 7: Check final worktree**

Run:

```bash
git status --short
```

Expected: Only intended audit, test, source, migration, and documentation files are changed. Existing unrelated dirty files may still appear; do not revert them.

- [ ] **Step 8: Commit final audit handoff**

Run:

```bash
git add docs/audits/2026-05-07-production-readiness.md
git commit -m "Finalize production readiness audit"
```

Expected: Commit includes the final audit report update.

- [ ] **Step 9: Prepare final response**

Summarize:

```markdown
Implemented the production readiness audit and hardening pass.

Fixed:
- Hardened staff PIN production cookie secret handling in `src/lib/auth/staff-pin.ts`.

Verification:
- `npm test`: Pass
- `npm run lint`: Pass
- `npm run build`: Pass
- `npm audit --omit=dev`: Pass
- `supabase db lint`: Blocked, local Supabase was not running

Remaining pilot risks:
- Supabase lint must be rerun against the pilot project before deployment.
```
