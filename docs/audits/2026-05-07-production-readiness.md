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

`npm audit --omit=dev` reported 2 moderate production vulnerabilities in `postcss` via `next`. The automated force fix is not suitable for this audit task because npm proposes a breaking downgrade to `next@9.3.3`.

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

## Fixes Applied

- Removed the `/notifications` staff PIN proxy exception.
- Updated the notifications page and mark-read server actions to call `requireModuleAccess("/notifications")`.
- Added a critical workflow source assertion that staff PIN sessions stay limited to front desk routes and actions.
- Added a migration that locks active member subscription usage before incrementing and adds service-role-only staff PIN RPCs for member check-in, walk-ins, expired-member handling, GCash proof upload, and shift close.
- Updated staff PIN server actions to call the guarded RPC workflows instead of writing related records directly from TypeScript.
- Added critical workflow assertions for locked subscription usage and staff PIN RPC routing.
- Removed the staff PIN shift-close manual variance notification insert and rely on the existing `notify_cash_variance` trigger.
- Added an actor-aware staff PIN blocked-check-in notification helper so service-role RPCs preserve `attempted_by` metadata and staff names; banned expired-member attempts now return a blocked result instead of raising after notification.

## Verification After Fixes

- `npm test`: Pass, 15 tests across 2 suites.
- `npm run lint`: Pass with the existing `<img>` warning in `src/app/(app)/payments/gcash-review/page.tsx`.
- `npm run build`: Pass; Next.js still warns about multiple lockfiles and workspace root inference.
- `supabase db lint`: Pass; no schema errors found.
- `supabase db reset`: Blocked after all migrations applied, during `supabase/seed.sql`. The existing profile privilege-escalation trigger rejects seed profile role/status upserts because the seed runs without an authenticated owner/admin actor.

## Remaining Pilot Risks

- `supabase db reset` needs a seed-safe path for demo profile role/status upserts before it can complete end to end.
