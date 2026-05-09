# GymLedger

GymLedger is a role-based gym operations system for small local gyms. It helps gym staff manage front-desk activity, member records, walk-in entries, payments, shifts, and entry reconciliation from a protected web dashboard.

The GitHub repository is named **BakalGymOS**, while the application itself is branded as **GymLedger**.

## Project Status

GymLedger is an **MVP / school project prototype** with a fully working full-stack system covering all core gym operations.

The implemented areas include:

- Staff authentication with Supabase Auth
- Role-based protected app shell with configurable permissions
- Front Desk dashboard with active shift, check-ins, walk-ins, and recent activity
- Staff shift start and shift closing with cash reconciliation
- Member search, creation, editing, profiles, QR cards, and renewal
- Active member check-in with subscription validation and entry limits
- Expired member handling with pay walk-in, utang, and owner override
- Walk-in logging with cash, GCash (with proof upload), and utang options
- GCash proof upload, duplicate detection, and owner review workflow
- Utang tracking with partial and full settlement
- Exception creation and owner review
- Owner Review queue for exceptions, GCash proofs, and shift variances
- Entry Reconciliation for audit-level entry inspection
- Owner Dashboard with operational metrics
- Notifications for operational alerts
- Reports with export capability
- Audit Logs with append-only protection
- Settings for gym profile, walk-in rate, membership rates, payment settings, operational settings, staff access, role permissions, and staff PINs
- Supabase database schema, RLS policies, RPC functions, storage bucket policies, and seed data
- 124 automated tests covering login, role access, all core flows, and security

## Features

### Authentication and Authorization

- Email/password login through Supabase Auth
- Active staff profile validation after login
- Role-based redirects after login
- Protected app layout for authenticated users
- Unauthorized redirect when a user accesses a module outside their role
- Role-based sidebar navigation
- Configurable per-role permission overrides stored in the database

### User Roles

The system supports these application roles:

| Role | Purpose |
|---|---|
| `owner` | Oversees operations, settings, reports, members, payments, shifts, exceptions, and front desk |
| `admin` | Full system access |
| `manager` | Manages daily operations, members, payments, shifts, exceptions, reports, and front desk |
| `front_desk` | Handles front-desk operations, member lookup, member check-ins, walk-ins, and exceptions |
| `accountant` | Reviews payments, balances, and reports |
| `member` | Seeded as auth users, but not currently part of the protected staff app shell |

### Module Access

| Role | Module Access |
|---|---|
| `admin` | Front Desk, Owner Dashboard, Members, Payments, Balances, Shifts, Owner Review, Entry Reconciliation, Exceptions, Notifications, Reports, Audit Logs, Settings |
| `owner` | Owner Review, Front Desk, Members, Payments, Balances, Shifts, Owner Dashboard, Entry Reconciliation, Exceptions, Notifications, Reports, Audit Logs, Settings |
| `manager` | Front Desk, Members, Payments, Balances, Shifts, Owner Review, Owner Dashboard, Entry Reconciliation, Exceptions, Notifications, Reports |
| `front_desk` | Front Desk, Members, Payments, Shifts, Balances, Exceptions, Notifications |
| `accountant` | Payments, Balances, Reports, Notifications |

### Permissions

| Permission | owner | admin | manager | front_desk | accountant |
|---|---|---|---|---|---|
| `record_payments` | Yes | Yes | Yes | Yes | No |
| `correct_payments` | Yes | Yes | Yes | No | No |
| `approve_exceptions` | Yes | Yes | Yes | No | No |
| `view_reports` | Yes | Yes | Yes | No | Yes |
| `manage_staff` | Yes | Yes | No | No | No |
| `change_rates` | Yes | Yes | No | No | No |
| `export_data` | Yes | Yes | No | No | Yes |

Permissions can be overridden per role through the Settings page.

## Main Routes

| Route | Description |
|---|---|
| `/` | Public landing page |
| `/login` | Supabase login screen |
| `/front-desk` | Main operational dashboard for check-ins, walk-ins, payments, balances, active shift, and recent activity |
| `/members` | Searchable member list |
| `/members/new` | Create member form |
| `/members/[id]` | Member profile with subscription, balance summary, QR card, and renewal |
| `/members/[id]/edit` | Edit member form |
| `/shifts` | Active and past shifts with start and close forms |
| `/owner-review` | Consolidated review queue for exceptions, GCash proofs, and shift variances |
| `/owner-dashboard` | Operational metrics and review queues |
| `/payments` | Payment overview |
| `/payments/gcash-review` | GCash proof review controls |
| `/balances` | Pending utang balances with partial and full settlement |
| `/exceptions` | Exception creation and review |
| `/entry-reconciliation` | Audit-level entry inspection with filters |
| `/notifications` | Operational alerts |
| `/reports` | Revenue, attendance, and reconciliation summaries with export |
| `/audit-logs` | Append-only audit log viewer |
| `/settings` | Gym profile, walk-in rate, membership rates, payment settings, operational settings, staff access, role permissions, staff PINs |
| `/unauthorized` | Access-denied screen |

## Core Workflows

### Login

1. Staff member enters email and password.
2. Supabase Auth validates the account.
3. The app fetches the matching profile from the `profiles` table.
4. The profile must be active and must have a valid app role.
5. The user is redirected to the default module for their role.

### Start Shift

1. Staff opens the Front Desk module.
2. If there is no active shift, the system displays the Start Shift form.
3. Staff enters starting cash and an optional note.
4. The system checks role, staff profile status, and shift permissions.
5. If valid, a new open shift is created.
6. Front-desk actions become available.

### Member Check-In

1. Staff searches a member by name, phone number, member ID, or QR code.
2. The system loads the member, current subscription, pending balance, and latest check-in.
3. If the member is active and has a valid subscription, staff can check them in.
4. The database RPC validates:
   - user authentication
   - front-desk/management permission
   - active shift
   - member existence
   - banned status
   - active subscription
   - entry limit
5. A completed entry is created and the subscription usage is updated.
6. Blocked attempts are logged to the audit log.

### Walk-In Entry

1. Staff starts or continues an active shift.
2. Staff records the walk-in customer name, amount, payment method, and optional note.
3. Supported payment methods:
   - Cash
   - GCash
   - Pending / Utang
4. The database RPC validates staff permissions and active shift.
5. Depending on the payment method:
   - Cash creates a completed payment and updates expected shift cash.
   - GCash creates a completed payment and pending proof metadata.
   - Pending / Utang creates a pending walk-in balance.
6. A gym entry is created for the walk-in.

### Expired Member Handling

When a member's subscription has expired, staff can choose from:

- **Pay Walk-In**: Record a one-time walk-in payment (cash, GCash, or other) and allow entry.
- **Record Utang**: Allow entry and record an unpaid balance against the member.
- **Owner Override**: Allow entry with a reason, no payment required.

### Member Renewal

1. Staff opens a member profile page.
2. Staff selects a membership plan, start date, and payment method.
3. The `renew_member_subscription` RPC creates a new subscription and records the payment.
4. The member can now check in under the new subscription.

### GCash Proof Upload

1. After a GCash walk-in, the proof record is in `awaiting_proof` status.
2. Staff uploads a screenshot (JPEG, PNG, or WebP, max 5 MB).
3. The system stores the file in the private `gcash-proofs` bucket and updates the proof record.
4. Duplicate reference numbers are flagged for owner review.

### Shift Closing

1. Staff enters the actual cash counted at end of shift.
2. The system calculates the variance against expected cash.
3. If there is a variance, staff must explain it before closing.
4. The `close_shift_reconciliation` RPC records the closure, variance, and notes.
5. Shifts with variance appear in the owner review queue.

### Owner Review

The Owner Review page consolidates items needing owner attention:

- **Exceptions**: Approve, reject, or resolve with notes.
- **GCash Proofs**: Verify, reject, or request follow-up.
- **Shift Variances**: Acknowledge with notes and mark as reviewed.

### Entry Reconciliation

The Entry Reconciliation page shows all gym entries with:

- Entry time, member or guest name, staff member, related shift
- Settlement type and payment information
- Exception information and reconciliation status
- Explanation of why the person was allowed in

Filters: search text, date, status, staff, payment method, entry type.

### Balance / Utang Settlement

1. Staff opens the Balances page to see all pending utang records.
2. Staff can record a full or partial payment (cash, GCash, or other).
3. The `record_balance_payment` RPC updates the balance and links the payment.

## Demo Flow

Use these steps to demonstrate the full system. All demo accounts use the shared password `Test1234!`.

### 1. Owner Login

- Open `http://localhost:3000/login`
- Log in as `owner@gymledger.local`
- The system redirects to the Owner Review queue
- Browse Owner Dashboard for operational metrics

### 2. Front Desk Login

- Log out and log in as `frontdesk1@gymledger.local`
- The system redirects to the Front Desk

### 3. Start Shift

- On the Front Desk page, fill in the Start Shift form
- Enter starting cash (e.g., `1000`) and an optional note
- Click Start Shift to open a new shift

### 4. Member Check-In

- In the member search box, search for the active member
- Click Check In to admit the member
- The entry count on the subscription updates

### 5. Cash Walk-In

- In the Walk-In section, enter a customer name, amount, and select Cash
- Click Record to log the walk-in entry and payment

### 6. GCash Walk-In

- Enter a customer name, amount, and select GCash
- Optionally enter a GCash reference number
- Click Record to log the walk-in
- If a proof was created, upload a screenshot through the GCash proof form

### 7. Utang Walk-In

- Enter a customer name, amount, and select Pending / Utang
- Add a reason note (required for utang)
- Click Record to log the walk-in and create a pending balance

### 8. Close Shift

- Go to the Shifts page
- Enter the actual cash counted
- If there is a variance, provide an explanation
- Click Close Shift to reconcile

### 9. Owner Review

- Log out and log in as `owner@gymledger.local`
- Open Owner Review to see pending exceptions, GCash proofs, and shift variances
- Approve or reject items with notes

### 10. Balance Settlement

- Log in as `frontdesk1@gymledger.local`
- Start a new shift if needed
- Open the Balances page from the sidebar or navigation
- Record a full or partial payment against an existing utang record

## Tech Stack

| Area | Technology |
|---|---|
| Framework | Next.js App Router |
| Language | TypeScript |
| UI | React |
| Styling | Tailwind CSS |
| Backend/Auth/Database | Supabase |
| Supabase SSR | `@supabase/ssr` |
| Forms | React Hook Form |
| Validation | Zod |
| Icons | Lucide React |
| QR Codes | `qrcode`, `html5-qrcode` |
| Utilities | `clsx`, `tailwind-merge` |
| Testing | Node.js built-in test runner |
| Linting | ESLint |

## Database Overview

The project uses Supabase PostgreSQL with migrations, row-level security, database functions, triggers, and seed data.

### Main Tables

| Table | Purpose |
|---|---|
| `profiles` | Application users and roles |
| `staff_profiles` | Staff employment details, PINs, and operational permissions |
| `members` | Gym member records |
| `membership_plans` | Available membership plans |
| `member_subscriptions` | Member plan ownership, validity dates, and usage count |
| `entries` | Member and walk-in gym entries |
| `payments` | Cash, GCash, and other payment records |
| `exceptions` | Owner approvals, disputes, staff errors, and unusual cases |
| `shifts` | Open/closed staff shifts and cash accountability |
| `cash_movements` | Cash-in and cash-out records |
| `gcash_proofs` | GCash proof metadata and review status |
| `walk_in_balances` | Pending walk-in / utang balances |
| `audit_logs` | Append-only audit records |
| `settings` | System configuration values |
| `notifications` | User/system notifications |
| `role_permissions` | Configurable per-role permission overrides |

### Security Features

- Row-level security enabled on all operational tables
- Role-based RLS helper functions (`private.has_permission`, `private.staff_pin_has_permission`)
- Append-only audit log protection via triggers
- Database triggers for `updated_at`
- Audit triggers for major entity changes
- Protected GCash proof storage bucket with MIME type restrictions
- Storage policies for staff upload/read and management review/delete
- Revoked public execute on all privileged RPC functions
- Permission-checked storage mutation policies

### Important RPC Functions

| Function | Purpose |
|---|---|
| `create_walk_in` | Creates walk-in entries, payments, GCash proof metadata, or pending balances |
| `create_member_check_in` | Validates and records active member check-ins |
| `handle_expired_member_entry` | Handles expired member walk-in, utang, or owner override |
| `renew_member_subscription` | Renews a member's subscription with payment recording |
| `close_shift_reconciliation` | Closes a shift with actual cash, variance calculation, and notes |
| `review_gcash_proof` | Owner review actions on GCash proofs (verify, reject, follow-up) |
| `review_exception` | Owner review actions on exceptions (approve, reject) |
| `create_exception` | Creates a new exception record |
| `mark_gcash_proof_uploaded` | Records GCash proof file upload metadata |
| `record_balance_payment` | Records full or partial payment against a utang balance |
| `update_admin_setting` | Updates system settings with audit logging |
| `update_role_permissions` | Updates configurable per-role permission overrides |
| `update_staff_access` | Updates staff profile details and permissions |
| `private.log_member_check_in_attempt` | Records check-in success or blocked attempts in audit logs |

## Local Development

### Prerequisites

- Node.js
- npm
- Supabase CLI
- Docker, if running Supabase locally

### Install Dependencies

```bash
npm install
```

### Start Supabase Locally

```bash
supabase start
```

Reset the local database and load migrations plus seed data:

```bash
supabase db reset
```

After Supabase starts, copy the local API URL and anon key printed by the Supabase CLI.

Create a `.env.local` file:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_api_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

For the included local Supabase config, the API port is configured as `55321`, but you should still use the values printed by your local Supabase CLI.

### Start the Next.js App

```bash
npm run dev
```

Open the app at:

```text
http://localhost:3000
```

## Verification

Run the automated test suite (124 tests across 19 suites):

```bash
npm test
```

Run linting:

```bash
npm run lint
```

Run a production build:

```bash
npm run build
```

Start the production build locally:

```bash
npm run start
```

Full verification before presentation:

```bash
npm test && npm run lint && npm run build
```

## Pilot Deployment Checklist

- Set `NEXT_PUBLIC_SUPABASE_URL` to the pilot Supabase project URL.
- Set `NEXT_PUBLIC_SUPABASE_ANON_KEY` to the pilot Supabase anon key.
- Do not load local seed users, demo passwords, or demo staff PINs into the pilot database.
- Confirm the `gcash-proofs` bucket is private before accepting real proof images.
- Confirm database backups are enabled before recording real member, payment, shift, and proof data.
- Run `npm test`, `npm run lint`, and `npm run build` before deploying.

## Local Demo Accounts

After reseeding the local Supabase database, these accounts are available with the shared password:

```text
Test1234!
```

| Email | Role |
|---|---|
| `owner@gymledger.local` | Owner |
| `manager@gymledger.local` | Manager |
| `frontdesk1@gymledger.local` | Front Desk |
| `frontdesk2@gymledger.local` | Front Desk |
| `accountant@gymledger.local` | Accountant |

The seed file also creates these member auth users:

| Email | Role |
|---|---|
| `active.member@gymledger.local` | Member |
| `expired.member@gymledger.local` | Member |

These member accounts exist in Auth and `profiles`, but they do not currently access the protected staff app shell.

These accounts are for local development and demos only. Do not seed them into a pilot or production Supabase project.

## Project Structure

```text
.
├── src
│   ├── app
│   │   ├── (auth)
│   │   │   └── login
│   │   ├── (app)
│   │   │   ├── front-desk
│   │   │   ├── members
│   │   │   ├── shifts
│   │   │   ├── owner-review
│   │   │   ├── owner-dashboard
│   │   │   ├── payments
│   │   │   ├── balances
│   │   │   ├── exceptions
│   │   │   ├── entry-reconciliation
│   │   │   ├── notifications
│   │   │   ├── reports
│   │   │   ├── audit-logs
│   │   │   └── settings
│   │   ├── actions
│   │   │   └── auth.ts
│   │   └── page.tsx
│   ├── components
│   │   ├── app
│   │   └── ui
│   └── lib
│       ├── auth
│       ├── supabase
│       ├── modules.ts
│       └── utils.ts
├── tests
│   └── critical-workflows.test.mjs
├── supabase
│   ├── migrations
│   ├── seed.sql
│   └── config.toml
├── package.json
└── README.md
```

## Known Limitations

This project is an MVP. The following areas are not yet complete:

- QR member cards and front-desk QR lookup exist, but this is not a full production scanner workflow.
- Payment correction review UI is not yet complete.
- Member profile check-in history and payment history are simplified views.
- The `member` role exists in the database but has no member-facing app shell.

## School Project Summary

GymLedger demonstrates a practical full-stack information system for a local gym. It includes authentication, authorization, role-based navigation, configurable permissions, database-backed workflows, operational business rules, RLS security, audit logging, GCash proof management, utang tracking, shift reconciliation, owner review, and seeded demo data.

The system covers the full gym operations cycle: staff login, shift management, member check-in, walk-in payments (cash, GCash, utang), expired member handling, member renewal, GCash proof review, shift closing with cash reconciliation, owner review of exceptions and variances, balance settlement, entry reconciliation, and audit logging.
