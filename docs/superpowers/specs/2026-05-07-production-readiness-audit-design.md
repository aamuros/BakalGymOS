# GymLedger Production Readiness Audit Design

## Purpose

Prepare GymLedger for a small real gym pilot by finding and prioritizing bugs, security gaps, data-integrity risks, and production configuration problems before implementation hardening begins.

The audit is risk-based. It focuses first on workflows that can expose private data, bypass authorization, corrupt operational records, or misstate money-related activity.

## Target Readiness Level

The target is small real gym pilot readiness:

- A single gym can run the app with real staff, members, entries, shifts, payments, and GCash proof records.
- Staff roles cannot access owner, accounting, settings, audit, or reporting functionality outside their permissions.
- Money and attendance workflows preserve consistent records across entries, payments, shifts, balances, exceptions, and audit logs.
- Supabase RLS, RPCs, and storage policies protect operational data even when requests are made outside the intended UI.
- Required local verification passes before handoff.

This pass is not intended to make the product public SaaS-ready.

## Scope

In scope:

- Authentication and staff profile validation.
- Role and module authorization.
- Staff PIN session behavior.
- Server actions and route handlers.
- Service-role client usage.
- Supabase RLS policies, RPC functions, grants, and storage policies.
- Member check-in, walk-in, expired-member handling, GCash proof review, shifts, balances, exceptions, reports, notifications, and audit logs.
- Input validation and error handling for critical workflows.
- Production environment and deployment assumptions.
- Dependency and secret handling checks.
- Verification commands and focused regression tests.

Out of scope:

- Multi-tenant SaaS isolation.
- Formal privacy or financial compliance certification.
- Payment gateway integration.
- Advanced observability and incident response tooling.
- Large UI redesigns.
- Mobile app support.

## Current System Context

GymLedger is a Next.js App Router app using TypeScript, Tailwind CSS, and Supabase. The app already has several protection layers:

- Middleware route checks in `src/proxy.ts`.
- Server-side access helpers in `src/lib/auth/server.ts`.
- Role and module metadata in `src/lib/auth/permissions.ts` and `src/lib/modules.ts`.
- Supabase migrations with RLS, RPC functions, storage bucket policies, audit triggers, and seed data.
- A staff PIN path that uses a signed HTTP-only cookie and a Supabase service-role client for front-desk access.
- A small `node:test` suite that asserts critical workflow safeguards by scanning app source and migrations.

The worktree contains substantial uncommitted application, migration, and test changes. The audit must preserve those changes and avoid reverting unrelated work.

## Recommended Approach

Use a risk-based hardening pass.

This approach prioritizes access control, money workflows, attendance records, service-role paths, Supabase policies, storage privacy, and production configuration before lower-risk polish. It should produce a prioritized findings list and targeted fixes rather than a broad rewrite.

Alternatives considered:

- Full-system exhaustive review: more complete, but slower and likely to spend time on low-risk UI or maintainability issues before core pilot risks are resolved.
- Verification-only pass: fast, but likely to miss design-level issues such as service-role bypasses, missing transaction boundaries, weak session policy, or incomplete RLS coverage.

## Workstreams

### 1. Access Control

Review middleware, server-side access helpers, role permission checks, staff PIN access, and direct server action invocation risks.

Key questions:

- Can unauthenticated users access protected routes, route handlers, server actions, or storage files?
- Can a staff PIN session access anything beyond intended front-desk workflows?
- Can `front_desk`, `accountant`, or `manager` roles trigger owner/admin-only behavior through direct action calls?
- Do module navigation rules, middleware rules, and server-side rules match?
- Do disabled profiles and inactive staff profiles lose access immediately?

Expected output:

- A route and action authorization matrix.
- Findings for any missing or inconsistent checks.
- Focused tests or source assertions for the highest-risk paths.

### 2. Data Integrity

Review workflows that create or update entries, payments, shifts, GCash proofs, exceptions, balances, and subscriptions.

Key questions:

- Are related records created atomically where consistency matters?
- Can duplicate submissions create duplicate entries or payments?
- Can subscription usage be incremented incorrectly under concurrent check-ins?
- Can shift expected cash drift from payments and cash movements?
- Are blocked or exceptional cases audit logged consistently?
- Do staff PIN service-role paths enforce the same business rules as authenticated RPC paths?

Expected output:

- Findings for non-atomic updates, race risks, duplicate submission risks, and mismatched records.
- Recommendations for moving critical multi-table writes into RPC transactions where needed.
- Regression tests or SQL checks for critical workflows.

### 3. Supabase Security

Review schema, RLS policies, RPC functions, function grants, storage bucket policies, and `security definer` behavior.

Key questions:

- Is RLS enabled for all public application tables?
- Do policies match the intended role and workflow boundaries?
- Do `security definer` functions validate caller role, staff status, and active shift before privileged writes?
- Are function signatures and grants limited to intended callers?
- Are GCash proofs private, type-limited, and readable only by allowed staff or management?
- Are audit logs append-only for normal users?

Expected output:

- RLS and RPC findings with migration file references.
- A storage policy review for the `gcash-proofs` bucket.
- Supabase verification commands or targeted SQL assertions.

### 4. Production Configuration

Review environment variables, local seed data, secrets, cookies, dependency posture, and deployment assumptions.

Key questions:

- Are required environment variables documented without exposing secrets?
- Is `SUPABASE_SERVICE_ROLE_KEY` server-only and never public?
- Is `STAFF_PIN_SESSION_SECRET` required or strongly recommended for production?
- Are staff PIN cookies secure in production?
- Are seed users, default PINs, or local credentials safe for pilot deployment?
- Are package versions and audit results acceptable for a pilot?
- Are backup and restore expectations documented for Supabase data?

Expected output:

- A deployment readiness checklist.
- Findings for any missing secret, seed-data, cookie, or dependency hardening.
- Documentation updates if configuration gaps are found.

### 5. Verification

Run and extend verification where risk warrants it.

Required commands before handoff:

- `npm run lint`
- `npm run build`
- `npm test`

Supabase verification, if local Supabase is available:

- `supabase db reset`
- `supabase db lint`
- Targeted SQL/RPC checks for critical policy and workflow assumptions.

Expected output:

- A list of verification commands run and their results.
- Any commands that could not be run, with the blocker.
- Focused tests for high-risk fixes.

## Severity Model

Findings should be grouped by severity:

- Critical: auth bypass, data leak, service-role misuse, or money/data corruption.
- High: realistic workflow breakage, missing RLS/RPC guard, weak session behavior, or critical missing audit trail.
- Medium: production reliability issue, incomplete validation, missing verification, or deployment hardening gap.
- Low: maintainability, clarity, minor UX issue, or documentation gap.

Critical and high findings should be fixed before pilot use unless explicitly accepted as known risk.

## Deliverables

The audit should produce:

- A prioritized findings list with file references and severity.
- Targeted code, migration, or documentation fixes for accepted findings.
- Focused regression coverage for high-risk behavior.
- Verification results from lint, build, tests, and Supabase checks where available.
- A final handoff summary that separates fixed issues from remaining known risks.

## Implementation Boundary

No application code changes are part of this design document. After this spec is reviewed and approved, the next step is to create an implementation plan using the `superpowers:writing-plans` workflow.
