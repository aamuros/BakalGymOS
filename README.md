# GymLedger

GymLedger is a role-based gym operations system for small local gyms. It helps gym staff manage front-desk activity, member records, walk-in entries, payments, shifts, and entry reconciliation from a protected web dashboard.

The GitHub repository is named **BakalGymOS**, while the application itself is branded as **GymLedger**.

## Project Status

GymLedger is currently an **MVP / school project prototype** with a working full-stack foundation.

The strongest implemented areas are:

- Staff authentication with Supabase Auth
- Role-based protected app shell
- Front Desk dashboard
- Staff shift start workflow
- Member search and member check-in
- Walk-in logging with cash, GCash, and pending/utang options
- Member list, creation, editing, and profile pages
- Entry Reconciliation / owner audit screen
- Supabase database schema, RLS policies, RPC functions, storage bucket policies, and seed data

Some modules are still scaffolded or partially implemented. See [Known Limitations](#known-limitations).

## Features

### Authentication and Authorization

- Email/password login through Supabase Auth
- Active staff profile validation after login
- Role-based redirects after login
- Protected app layout for authenticated users
- Unauthorized redirect when a user accesses a module outside their role
- Role-based sidebar navigation

### User Roles

The system currently supports these application roles:

| Role | Purpose |
|---|---|
| `admin` | Full system access |
| `owner` | Oversees operations, settings, reports, members, payments, shifts, exceptions, and front desk |
| `manager` | Manages daily operations, members, payments, shifts, exceptions, reports, and front desk |
| `front_desk` | Handles front-desk operations, member lookup, member check-ins, and exceptions |
| `accountant` | Reviews payments and reports |
| `member` | Seeded as auth users, but not currently part of the protected staff app shell |

### Module Access

| Role | Current Module Access |
|---|---|
| `admin` | Front Desk, Owner Dashboard, Members, Payments, Entry Reconciliation, Shifts, Exceptions, Reports, Settings |
| `owner` | Owner Dashboard, Reports, Members, Payments, Entry Reconciliation, Shifts, Exceptions, Settings, Front Desk |
| `manager` | Front Desk, Owner Dashboard, Members, Payments, Entry Reconciliation, Shifts, Exceptions, Reports |
| `front_desk` | Front Desk, Members, Exceptions |
| `accountant` | Reports, Payments |

## Main Routes

| Route | Status | Description |
|---|---|---|
| `/` | Implemented | Public landing page |
| `/login` | Implemented | Supabase login screen |
| `/front-desk` | Implemented | Main operational dashboard for check-ins, walk-ins, payments, balances, active shift, and recent activity |
| `/members` | Implemented | Searchable member list |
| `/members/new` | Implemented | Create member form |
| `/members/[id]` | Implemented | Member profile with subscription and balance summary |
| `/members/[id]/edit` | Implemented | Edit member form |
| `/entry-reconciliation` | Implemented | Owner/management audit screen for checking why each entry was allowed |
| `/shifts` | Implemented | Active shift list |
| `/owner-dashboard` | Scaffolded | Protected placeholder module |
| `/payments` | Scaffolded | Protected placeholder module |
| `/exceptions` | Scaffolded | Protected placeholder module |
| `/reports` | Scaffolded | Protected placeholder module |
| `/settings` | Scaffolded | Protected placeholder module |
| `/unauthorized` | Implemented | Access-denied screen |

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

1. Staff searches a member by name, phone number, or member ID.
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

### Entry Reconciliation

The Entry Reconciliation page is intended for owner/management audit.

It shows:

- All visible entries
- Entry time
- Member or guest name
- Staff member who allowed the entry
- Related shift
- Settlement type
- Payment information
- Exception information
- Derived reconciliation status
- Explanation of why the person was allowed in

Supported filters include:

- Search text
- Date
- Status
- Staff
- Payment method
- Entry type

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
| Utilities | `clsx`, `tailwind-merge` |
| Linting | ESLint |

## Database Overview

The project uses Supabase PostgreSQL with migrations, row-level security, database functions, triggers, and seed data.

### Main Tables

| Table | Purpose |
|---|---|
| `profiles` | Application users and roles |
| `staff_profiles` | Staff employment details and operational permissions |
| `members` | Gym member records |
| `membership_plans` | Available membership plans |
| `member_subscriptions` | Member plan ownership, validity dates, and usage count |
| `entries` | Member and walk-in gym entries |
| `payments` | Cash, GCash, and other payment records |
| `payment_corrections` | Payment correction requests and review status |
| `exceptions` | Owner approvals, disputes, staff errors, and unusual cases |
| `shifts` | Open/closed staff shifts and cash accountability |
| `cash_movements` | Cash-in and cash-out records |
| `gcash_proofs` | GCash proof metadata |
| `walk_in_balances` | Pending walk-in / utang balances |
| `balances` | Shift/date reconciliation records |
| `audit_logs` | Append-only audit records |
| `settings` | System configuration values |
| `notifications` | User/system notifications |

### Security Features

- Row-level security enabled on operational tables
- Role-based RLS helper functions
- Append-only audit log protection
- Database triggers for `updated_at`
- Audit triggers for major entity changes
- Protected GCash proof storage bucket
- Storage policies for staff upload/read and management review/delete

### Important RPC Functions

| Function | Purpose |
|---|---|
| `create_walk_in` | Creates walk-in entries, payments, GCash proof metadata, or pending balances |
| `create_member_check_in` | Validates and records active member check-ins |
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
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
STAFF_PIN_SESSION_SECRET=your_long_random_pin_session_secret
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
│   │   │   ├── entry-reconciliation
│   │   │   ├── shifts
│   │   │   ├── owner-dashboard
│   │   │   ├── payments
│   │   │   ├── exceptions
│   │   │   ├── reports
│   │   │   └── settings
│   │   └── page.tsx
│   ├── components
│   │   ├── app
│   │   └── ui
│   └── lib
│       ├── auth
│       ├── supabase
│       ├── modules.ts
│       └── utils.ts
├── supabase
│   ├── migrations
│   ├── seed.sql
│   └── config.toml
├── package.json
└── README.md
```

## Known Limitations

This project is currently an MVP. The following areas are not yet complete:

- Owner Dashboard is still a protected placeholder page.
- Payments page is still a protected placeholder page.
- Exceptions page is still a protected placeholder page.
- Reports page is still a protected placeholder page.
- Settings page is still a protected placeholder page.
- End Shift / shift closing is intentionally not implemented in the current MVP UI.
- GCash proof metadata is created, but a full upload/review UI is not yet complete.
- Member profile check-in history and payment history are placeholders.
- Payment correction review UI is not yet complete.
- Reconciliation summary reports are not yet complete.
- Formal automated tests are not currently defined in `package.json`.
- The member form currently includes an `expired` status option, while the database tracks expiration primarily through `member_subscriptions`. This should be reviewed before production use.

## Suggested Next Steps

Good next development tasks include:

1. Implement shift closing and cash reconciliation.
2. Complete the Payments page with payment lists, filters, and review actions.
3. Add GCash proof upload and review workflow.
4. Build the Exceptions review page.
5. Build Reports for attendance, revenue, pending balances, and GCash verification.
6. Complete Settings for gym profile, walk-in rate, roles, and account preferences.
7. Add automated tests for server actions, role access, and RPC workflows.
8. Align member status handling between the form and database enum.
9. Add screenshots or a demo section for school presentation.

## School Project Summary

GymLedger demonstrates a practical full-stack information system for a local gym. It includes authentication, authorization, role-based navigation, database-backed workflows, operational business rules, RLS security, audit logging, and seeded demo data.

The current system is best presented as:

> A role-based gym operations MVP with a completed Front Desk, Members, Shift Start, and Entry Reconciliation workflow, plus a Supabase database foundation for payments, reports, exceptions, settings, and reconciliation.
