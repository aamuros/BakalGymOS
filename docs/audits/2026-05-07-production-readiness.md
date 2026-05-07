# GymLedger Production Readiness Audit

## Baseline Verification

| Check | Result | Notes |
|---|---|---|
| `git status --short` | Pass | Initial isolated worktree status was clean. |
| `npm test` | Blocked | No test script is configured. Command failed with `npm error Missing script: "test"`. Available scripts are `dev`, `build`, `start`, and `lint`. |
| `npm run lint` | Pass | ESLint completed successfully with no reported issues. |
| `npm run build` | Fail | `next build` failed under Next.js 16.2.4/Turbopack. Errors include missing modules `@/app/(app)/front-desk/expired-member-schema`, `@/app/(app)/front-desk/gcash-proof-upload-form`, `@/app/(app)/front-desk/qr-scanner`, and `@/lib/member-qr`; build also reports missing export `closeShiftSchema` from `@/app/(app)/shifts/schema`. Next.js also warned that multiple lockfiles caused workspace root inference. |
| `npm audit --omit=dev` | Fail | Production dependency audit reported 2 moderate vulnerabilities: `postcss <8.5.10` has XSS advisory GHSA-qx2v-qp2m-jg93, pulled through `next`. npm reports the available fix requires `npm audit fix --force` and would install `next@9.3.3`, a breaking change. |
| `supabase db lint` | Pass | Connected to the local database and linted `extensions`, `private`, and `public`; no schema errors found. |

## Dependency Risk

`npm audit --omit=dev` reported 2 moderate production vulnerabilities in `postcss` via `next`. The automated force fix is not suitable for this audit task because npm proposes a breaking downgrade to `next@9.3.3`.

## Findings

No findings recorded yet.

## Fixes Applied

No fixes applied yet.

## Verification After Fixes

Not run yet.

## Remaining Pilot Risks

No remaining risks recorded yet.
