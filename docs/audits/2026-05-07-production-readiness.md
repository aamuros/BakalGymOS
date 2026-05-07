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

## Fixes Applied

- Removed the `/notifications` staff PIN proxy exception.
- Updated the notifications page and mark-read server actions to call `requireModuleAccess("/notifications")`.
- Added a critical workflow source assertion that staff PIN sessions stay limited to front desk routes and actions.

## Verification After Fixes

- `npm test`: Pass, 12 tests across 2 suites.
- `npm run lint`: Pass with the existing `<img>` warning in `src/app/(app)/payments/gcash-review/page.tsx`.

## Remaining Pilot Risks

No remaining risks recorded yet.
