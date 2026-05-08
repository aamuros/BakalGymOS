# GymLedger Production Readiness Audit

## Baseline Verification

| Check | Result | Notes |
|---|---|---|
| `git status --short` | Pass | Refreshed baseline after importing current project state; clean HEAD had no changes. |
| `npm test` | Pass | Refreshed baseline passed 11 tests across 2 suites with `node --test`. |
| `npm run lint` | Pass | ESLint completed with no errors and 1 warning for `<img>` usage in `src/app/(app)/payments/gcash-review/page.tsx`. |
| `npm run build` | Pass | Next.js 16.2.4/Turbopack production build completed successfully; build still warns about multiple lockfiles and workspace root inference. |
| `npm audit --omit=dev` | Fail | Production dependency audit still reports 2 moderate vulnerabilities: `postcss <8.5.10` advisory GHSA-qx2v-qp2m-jg93 pulled through `next`. npm says the force fix would install `next@9.3.3`, a breaking change. |
| `supabase db lint` | Pass | Connected to the local database and linted `extensions`, `private`, and `public`; no schema errors found. |

## Dependency Risk

`npm audit --omit=dev` reported 2 moderate production vulnerabilities in `postcss` via `next`. Safe patch updates were applied for Next.js, React, React DOM, `eslint-config-next`, and `@supabase/ssr`, but the advisory remains. The automated force fix is not suitable because npm proposes a breaking downgrade to `next@9.3.3`.

## Findings

### Medium Staff PIN Session Can Reach Notifications Module
- Area: Access control
- Files: `src/proxy.ts`, `src/app/(app)/notifications/page.tsx`, `src/app/(app)/notifications/actions.ts`
- Risk: A front-desk staff PIN session can view and mark notifications through the protected notifications module, bypassing the server-side staff PIN restriction that should limit PIN access to `/front-desk`.
- Evidence: `rg` showed the notifications page and actions using `requireCurrentProfile()` instead of `requireModuleAccess("/notifications")`, while proxy allowed unauthenticated staff PIN cookies through for `/notifications`.
- Recommendation: Require `/notifications` module access in the notifications page and server actions, and remove the `/notifications` staff PIN proxy bypass so staff PIN sessions remain front-desk only.
- Status: Fixed

### Critical Active Member Check-In Can Double Increment Usage
- Area: Data integrity
- Files: `src/app/(app)/front-desk/actions.ts`, `supabase/migrations/20260507131000_staff_pin_integrity_rpc.sql`
- Risk: Concurrent active member check-ins can overuse a limited subscription and create attendance records past the plan entry limit.
- Evidence: `create_member_check_in` and the staff PIN service-role path selected `member_subscriptions.entries_used`, inserted an `entries` row, then incremented usage without locking the subscription row.
- Recommendation: Move staff PIN member check-in into a database RPC and lock the selected subscription row before the limit check and increment.
- Status: Fixed

### High Staff PIN Service-Role Writes Can Drift Across Related Tables
- Area: Data integrity
- Files: `src/app/(app)/front-desk/actions.ts`, `src/app/(app)/shifts/actions.ts`, `supabase/migrations/20260507131000_staff_pin_integrity_rpc.sql`
- Risk: Staff PIN walk-ins, expired-member actions, GCash proof uploads, and shift close could partially update entries/payments/proofs/shifts or overwrite state using stale reads.
- Evidence: Staff PIN branches used `createServiceClient()` to perform multi-record writes in TypeScript. Cash paths updated `expected_cash` from a previously-read value, GCash proof upload could overwrite non-uploadable proof states, and shift close calculated cash totals before a separate shift update.
- Recommendation: Route staff PIN money, proof, and shift reconciliation workflows through service-role-only RPCs that validate actor/staff status, active shift ownership, payment permissions, proof status transitions, row locks, and audit logging inside the database workflow.
- Status: Fixed

### High Privileged GCash Proof RPCs Missing Permission Checks
- Area: Supabase security
- Files: `supabase/migrations/20260507002505_gcash_proof_review_logic.sql`, `supabase/migrations/20260507052601_complete_audit_log_system.sql`, `supabase/migrations/20260507131000_staff_pin_integrity_rpc.sql`, `supabase/migrations/20260507224749_harden_gcash_security.sql`
- Risk: Authenticated staff with a role that still matched broad front-desk or management checks could call security-definer GCash proof RPCs directly after dynamic role permissions were disabled.
- Evidence: `rg` showed `public.mark_gcash_proof_uploaded` and `public.review_gcash_proof` were granted to `authenticated`, later altered to `security definer`, and validated `private.is_front_desk_or_management()` or `private.is_management()` without matching `private.has_permission(...)` checks. The staff PIN GCash upload RPC also lacked a `private.staff_pin_has_permission(...)` check.
- Recommendation: Recreate the GCash proof RPCs after `private.has_permission` exists, pin `search_path`, require `record_payments` for proof upload, require `correct_payments` for owner review, and require the same record-payment permission in the staff PIN service-role GCash proof RPC.
- Status: Fixed

### Medium GCash Proof Image Route Bypassed Module Access Gate
- Area: Supabase security
- Files: `src/app/(app)/front-desk/gcash-proofs/[id]/image/route.ts`
- Risk: Protected GCash proof image streaming could drift from the app's module access model because the route used a local hard-coded role set instead of the central `requireModuleAccess(...)` guard.
- Evidence: `sed` showed the route calling `requireCurrentProfile()` and `allowedRoles.has(profile.role)` before reading `gcash_proofs` and downloading from the private `gcash-proofs` bucket.
- Recommendation: Require `/front-desk` module access before querying proof metadata or streaming the private storage object.
- Status: Fixed

### Medium GCash Proof Storage Mutations Used Static Role Checks
- Area: Supabase security
- Files: `supabase/migrations/20260506000200_gcash_storage.sql`, `supabase/migrations/20260507224749_harden_gcash_security.sql`
- Risk: Authenticated owner/admin/manager users could call Supabase Storage APIs directly to replace or delete GCash proof files even after dynamic payment-correction permission was disabled for their role.
- Evidence: `sed` showed `gcash proofs storage update management` and `gcash proofs storage delete management` policies checking only `private.current_app_role() in ('owner', 'admin', 'manager')`.
- Recommendation: Replace the storage update/delete policies after `private.has_permission` exists and require `private.has_permission('correct_payments')` for file mutation.
- Status: Fixed

### High GCash Proof Review RPC Accepted Unuploaded Proof States
- Area: Supabase security
- Files: `supabase/migrations/20260507224749_harden_gcash_security.sql`
- Risk: A direct authenticated caller with `correct_payments` could confirm, dispute, or request follow-up for a `pending_proof` before a real proof image was uploaded.
- Evidence: `review_gcash_proof` locked the proof row and checked only that it existed before updating `gcash_proofs` and `payments`; UI filtering limited rows to reviewable states, but the security-definer RPC did not enforce that boundary.
- Recommendation: Load proof upload metadata in the RPC, reject placeholder storage paths and incomplete upload metadata, and enforce action-specific current statuses before any write.
- Status: Fixed

### Medium Staff PIN Session Secret Fell Back To Service Role Key
- Area: Production configuration
- Files: `src/lib/auth/staff-pin.ts`, `README.md`
- Risk: Production staff PIN cookies could be signed with the Supabase service-role key, increasing blast radius if the cookie signing secret is exposed or rotated.
- Evidence: `getSessionSecret()` used `process.env.STAFF_PIN_SESSION_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY`.
- Recommendation: Require a dedicated `STAFF_PIN_SESSION_SECRET` in production and document it in the pilot deployment checklist.
- Status: Fixed

### Medium Local Seed Credentials Need Explicit Pilot Warning
- Area: Production configuration
- Files: `README.md`, `supabase/seed.sql`
- Risk: Demo accounts using the shared local password `Test1234!` could be loaded into a pilot database if deployment instructions do not clearly separate seed data from pilot data.
- Evidence: `supabase/seed.sql` creates local Auth users with a shared password and the README listed demo accounts without an explicit pilot prohibition.
- Recommendation: Document that local seed accounts and shared passwords are for development/demo use only and must not be loaded into the pilot database.
- Status: Fixed

### Medium Production Dependency Audit Reports Next/PostCSS Advisory
- Area: Production configuration
- Files: `package.json`, `package-lock.json`
- Risk: `npm audit --omit=dev` reports a moderate PostCSS advisory through Next.js, so production dependency risk is not fully clear for pilot deployment.
- Evidence: `npm audit --omit=dev` reports `postcss <8.5.10` advisory `GHSA-qx2v-qp2m-jg93` via `next`; npm's force fix proposes `next@9.3.3`, which is a breaking downgrade and not suitable.
- Recommendation: Keep the audit risk documented, monitor for a safe Next.js release that resolves the advisory, and do not use npm's forced downgrade.
- Status: Accepted risk

## Fixes Applied

- Removed the `/notifications` staff PIN proxy exception.
- Updated the notifications page and mark-read server actions to call `requireModuleAccess("/notifications")`.
- Added a critical workflow source assertion that staff PIN sessions stay limited to front desk routes and actions.
- Added a migration that locks active member subscription usage before incrementing and adds service-role-only staff PIN RPCs for member check-in, walk-ins, expired-member handling, GCash proof upload, and shift close.
- Updated staff PIN server actions to call the guarded RPC workflows instead of writing related records directly from TypeScript.
- Added critical workflow assertions for locked subscription usage and staff PIN RPC routing.
- Removed the staff PIN shift-close manual variance notification insert and rely on the existing `notify_cash_variance` trigger.
- Added an actor-aware staff PIN blocked-check-in notification helper so service-role RPCs preserve `attempted_by` metadata and staff names; banned expired-member attempts now return a blocked result instead of raising after notification.
- Added a final Supabase hardening migration that replaces the GCash proof storage upload/update/delete policies, keeps proof upload/review RPCs `security definer` with `set search_path = public`, explicitly revokes default public/anon execute, and requires `record_payments` or `correct_payments` before privileged writes.
- Added the missing staff PIN GCash proof upload permission check inside the service-role RPC.
- Updated the protected GCash proof image route to use `requireModuleAccess("/front-desk")` before proof metadata lookup or private storage download.
- Added critical workflow assertions for privileged GCash proof RPC permission checks, storage mutation permission checks, and proof image module access.
- Added database-enforced GCash proof review state checks so confirmation/dispute/follow-up actions require uploaded proof metadata and allowed current statuses.
- Required `STAFF_PIN_SESSION_SECRET` in production instead of falling back to the Supabase service-role key.
- Added a pilot deployment checklist and explicit warning not to load local seed demo accounts into pilot or production databases.
- Applied safe patch upgrades for Next.js, React, React DOM, `eslint-config-next`, and `@supabase/ssr`.
- Recorded the unresolved Next/PostCSS production dependency advisory as an accepted pilot risk because npm's automated force fix proposes a breaking downgrade.

## Verification After Fixes

- `npm test`: Pass, 20 tests across 2 suites.
- `npm run lint`: Pass with the existing `<img>` warning in `src/app/(app)/payments/gcash-review/page.tsx`.
- `npm run build`: Pass on Next.js 16.2.6; Next.js still warns about multiple lockfiles and workspace root inference.
- `npm audit --omit=dev`: Fail; the moderate Next/PostCSS advisory remains after safe patch upgrades, and npm's force fix still proposes a breaking downgrade.
- `supabase db lint`: Blocked in the latest run because the local Postgres service on `127.0.0.1:55322` was not running. The previous Task 4 run passed `supabase db lint` before the local database stopped.
- `supabase db reset`: All migrations applied, including `20260507224749_harden_gcash_security.sql`; blocked during `supabase/seed.sql`. The existing profile privilege-escalation trigger rejects seed profile role/status upserts because the seed runs without an authenticated owner/admin actor.

## Remaining Pilot Risks

- `supabase db reset` needs a seed-safe path for demo profile role/status upserts before it can complete end to end.
- `supabase db lint` must be rerun before pilot deployment when the local or target Supabase database is reachable.
- `npm audit --omit=dev` still reports the moderate Next/PostCSS advisory; monitor for a safe Next.js release that resolves it.
