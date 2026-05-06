begin;

create schema if not exists private;

create extension if not exists pgcrypto;

create type public.app_role as enum (
  'owner',
  'admin',
  'manager',
  'front_desk',
  'accountant',
  'member'
);

create type public.profile_status as enum ('active', 'disabled');
create type public.staff_status as enum ('active', 'inactive', 'terminated');
create type public.member_status as enum ('active', 'inactive', 'banned', 'archived');
create type public.plan_status as enum ('active', 'inactive', 'archived');
create type public.subscription_status as enum ('active', 'expired', 'cancelled', 'paused');
create type public.entry_settlement_type as enum ('membership', 'cash', 'gcash', 'pending', 'exception');
create type public.entry_status as enum ('completed', 'voided');
create type public.payment_type as enum ('cash', 'gcash', 'other');
create type public.payment_purpose as enum (
  'walk_in_entry',
  'membership_purchase',
  'membership_renewal',
  'balance_payment',
  'other'
);
create type public.payment_status as enum ('pending', 'completed', 'voided', 'refunded', 'partially_refunded');
create type public.correction_type as enum ('void', 'refund', 'amount_adjustment', 'method_correction');
create type public.review_status as enum ('pending', 'approved', 'rejected');
create type public.exception_type as enum (
  'owner_approved_free_entry',
  'staff_error',
  'system_issue',
  'member_dispute',
  'payment_to_follow',
  'other'
);
create type public.shift_status as enum ('open', 'closed', 'reviewed');
create type public.cash_movement_type as enum ('cash_in', 'cash_out');
create type public.proof_status as enum ('pending_review', 'verified', 'rejected');
create type public.balance_status as enum ('draft', 'submitted', 'reviewed', 'locked');
create type public.notification_type as enum (
  'exception_review',
  'payment_review',
  'shift_discrepancy',
  'membership_expiring',
  'system'
);
create type public.notification_status as enum ('unread', 'read', 'archived');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text,
  phone text,
  role public.app_role not null default 'member',
  status public.profile_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.staff_profiles (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles(id) on delete cascade,
  employee_code text unique,
  job_title text,
  can_open_shift boolean not null default false,
  can_close_shift boolean not null default false,
  can_accept_cash boolean not null default false,
  can_accept_gcash boolean not null default false,
  hired_at date,
  status public.staff_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.members (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid unique references public.profiles(id) on delete set null,
  member_code text not null unique,
  full_name text not null,
  phone text,
  email text,
  birthdate date,
  emergency_contact_name text,
  emergency_contact_phone text,
  status public.member_status not null default 'active',
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.membership_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  duration_days integer not null check (duration_days > 0),
  price numeric(12,2) not null check (price >= 0),
  entry_limit integer check (entry_limit is null or entry_limit > 0),
  is_unlimited boolean not null default true,
  status public.plan_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (is_unlimited or entry_limit is not null)
);

create table public.shifts (
  id uuid primary key default gen_random_uuid(),
  staff_profile_id uuid not null references public.staff_profiles(id),
  opened_by uuid references public.profiles(id) on delete set null,
  closed_by uuid references public.profiles(id) on delete set null,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  opening_cash numeric(12,2) not null default 0 check (opening_cash >= 0),
  expected_cash numeric(12,2),
  actual_cash numeric(12,2),
  cash_difference numeric(12,2),
  status public.shift_status not null default 'open',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (closed_at is null or closed_at >= opened_at)
);

create table public.member_subscriptions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  plan_id uuid not null references public.membership_plans(id),
  starts_at date not null,
  ends_at date not null,
  status public.subscription_status not null default 'active',
  entries_used integer not null default 0 check (entries_used >= 0),
  purchased_payment_id uuid,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at >= starts_at)
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references public.members(id) on delete set null,
  subscription_id uuid references public.member_subscriptions(id) on delete set null,
  shift_id uuid references public.shifts(id) on delete set null,
  received_by uuid references public.profiles(id) on delete set null,
  payment_type public.payment_type not null,
  purpose public.payment_purpose not null,
  amount numeric(12,2) not null check (amount >= 0),
  status public.payment_status not null default 'completed',
  paid_at timestamptz,
  due_at timestamptz,
  reference_number text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'completed' or paid_at is not null),
  check (status <> 'pending' or due_at is not null)
);

alter table public.member_subscriptions
  add constraint member_subscriptions_purchased_payment_fk
  foreign key (purchased_payment_id) references public.payments(id) on delete set null;

create table public.payment_corrections (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id) on delete cascade,
  correction_type public.correction_type not null,
  original_amount numeric(12,2),
  corrected_amount numeric(12,2),
  reason text not null,
  requested_by uuid references public.profiles(id) on delete set null,
  approved_by uuid references public.profiles(id) on delete set null,
  status public.review_status not null default 'pending',
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.exceptions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references public.members(id) on delete set null,
  entry_id uuid unique,
  exception_type public.exception_type not null,
  reason text not null,
  created_by uuid references public.profiles(id) on delete set null,
  reviewed_by uuid references public.profiles(id) on delete set null,
  status public.review_status not null default 'pending',
  reviewed_at timestamptz,
  resolution_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.entries (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references public.members(id) on delete set null,
  guest_name text,
  entered_at timestamptz not null default now(),
  checked_in_by uuid references public.profiles(id) on delete set null,
  shift_id uuid references public.shifts(id) on delete set null,
  settlement_type public.entry_settlement_type not null,
  subscription_id uuid references public.member_subscriptions(id) on delete set null,
  payment_id uuid references public.payments(id) on delete set null,
  exception_id uuid references public.exceptions(id) on delete set null,
  status public.entry_status not null default 'completed',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (member_id is not null or guest_name is not null),
  check (
    (settlement_type = 'membership' and subscription_id is not null and payment_id is null and exception_id is null)
    or (settlement_type in ('cash', 'gcash', 'pending') and payment_id is not null and exception_id is null)
    or (settlement_type = 'exception' and exception_id is not null and payment_id is null)
  )
);

alter table public.exceptions
  add constraint exceptions_entry_fk
  foreign key (entry_id) references public.entries(id) on delete set null;

create table public.cash_movements (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references public.shifts(id) on delete cascade,
  movement_type public.cash_movement_type not null,
  amount numeric(12,2) not null check (amount > 0),
  reason text not null,
  recorded_by uuid references public.profiles(id) on delete set null,
  approved_by uuid references public.profiles(id) on delete set null,
  status public.review_status not null default 'approved',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.gcash_proofs (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id) on delete cascade,
  uploaded_by uuid references public.profiles(id) on delete set null,
  bucket_id text not null default 'gcash-proofs',
  storage_path text not null unique,
  file_name text,
  mime_type text,
  file_size bigint check (file_size is null or file_size > 0),
  gcash_reference_number text,
  sender_name text,
  sender_mobile text,
  proof_status public.proof_status not null default 'pending_review',
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (bucket_id = 'gcash-proofs')
);

create table public.balances (
  id uuid primary key default gen_random_uuid(),
  balance_date date not null,
  shift_id uuid references public.shifts(id) on delete set null,
  expected_cash numeric(12,2) not null default 0,
  actual_cash numeric(12,2),
  cash_difference numeric(12,2),
  expected_gcash numeric(12,2) not null default 0,
  verified_gcash numeric(12,2) not null default 0,
  gcash_difference numeric(12,2),
  total_sales numeric(12,2) not null default 0,
  total_corrections numeric(12,2) not null default 0,
  status public.balance_status not null default 'draft',
  prepared_by uuid references public.profiles(id) on delete set null,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (balance_date, shift_id)
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_table text not null,
  entity_id uuid,
  old_data jsonb,
  new_data jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
);

create table public.settings (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  value jsonb not null,
  description text,
  is_owner_only boolean not null default true,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid references public.profiles(id) on delete cascade,
  notification_type public.notification_type not null,
  title text not null,
  body text,
  entity_table text,
  entity_id uuid,
  status public.notification_status not null default 'unread',
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index profiles_role_idx on public.profiles(role);
create index staff_profiles_profile_id_idx on public.staff_profiles(profile_id);
create index members_member_code_idx on public.members(member_code);
create index members_status_idx on public.members(status);
create index members_name_idx on public.members(full_name);
create index member_subscriptions_member_id_idx on public.member_subscriptions(member_id);
create index member_subscriptions_status_idx on public.member_subscriptions(status);
create index member_subscriptions_dates_idx on public.member_subscriptions(starts_at, ends_at);
create index entries_member_id_idx on public.entries(member_id);
create index entries_entered_at_idx on public.entries(entered_at);
create index entries_shift_id_idx on public.entries(shift_id);
create index entries_settlement_type_idx on public.entries(settlement_type);
create index entries_payment_id_idx on public.entries(payment_id);
create index payments_member_id_idx on public.payments(member_id);
create index payments_shift_id_idx on public.payments(shift_id);
create index payments_received_by_idx on public.payments(received_by);
create index payments_type_status_idx on public.payments(payment_type, status);
create index payments_paid_at_idx on public.payments(paid_at);
create index payment_corrections_payment_id_idx on public.payment_corrections(payment_id);
create index payment_corrections_status_idx on public.payment_corrections(status);
create index exceptions_status_idx on public.exceptions(status);
create index exceptions_created_by_idx on public.exceptions(created_by);
create index shifts_staff_profile_id_idx on public.shifts(staff_profile_id);
create index shifts_status_idx on public.shifts(status);
create index shifts_opened_at_idx on public.shifts(opened_at);
create index cash_movements_shift_id_idx on public.cash_movements(shift_id);
create index gcash_proofs_payment_id_idx on public.gcash_proofs(payment_id);
create index gcash_proofs_proof_status_idx on public.gcash_proofs(proof_status);
create index gcash_proofs_reference_idx on public.gcash_proofs(gcash_reference_number);
create index balances_date_idx on public.balances(balance_date);
create index balances_status_idx on public.balances(status);
create index audit_logs_actor_id_idx on public.audit_logs(actor_id);
create index audit_logs_entity_idx on public.audit_logs(entity_table, entity_id);
create index audit_logs_created_at_idx on public.audit_logs(created_at);
create index notifications_recipient_status_idx on public.notifications(recipient_id, status);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function private.current_app_role()
returns public.app_role
language sql
security definer
stable
set search_path = public
as $$
  select role from public.profiles where id = auth.uid() and status = 'active'
$$;

create or replace function private.is_management()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(private.current_app_role() in ('owner', 'admin', 'manager'), false)
$$;

create or replace function private.is_reporting_role()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(private.current_app_role() in ('owner', 'admin', 'manager', 'accountant'), false)
$$;

create or replace function private.is_front_desk_or_management()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(private.current_app_role() in ('owner', 'admin', 'manager', 'front_desk'), false)
$$;

create or replace function private.member_profile_id(member_row public.members)
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select member_row.profile_id
$$;

create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  row_id uuid;
begin
  if tg_op = 'INSERT' then
    row_id = new.id;
  else
    row_id = old.id;
  end if;

  insert into public.audit_logs (
    actor_id,
    action,
    entity_table,
    entity_id,
    old_data,
    new_data
  )
  values (
    auth.uid(),
    lower(tg_op),
    tg_table_name,
    row_id,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end
  );

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

create or replace function public.block_audit_log_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit_logs are append-only';
end;
$$;

create or replace function public.prevent_profile_role_status_self_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() = old.id
    and not private.is_management()
    and (new.role is distinct from old.role or new.status is distinct from old.status)
  then
    raise exception 'users cannot change their own role or status';
  end if;

  return new;
end;
$$;

create trigger profiles_prevent_role_status_self_change before update on public.profiles
  for each row execute function public.prevent_profile_role_status_self_change();

create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger staff_profiles_set_updated_at before update on public.staff_profiles
  for each row execute function public.set_updated_at();
create trigger members_set_updated_at before update on public.members
  for each row execute function public.set_updated_at();
create trigger membership_plans_set_updated_at before update on public.membership_plans
  for each row execute function public.set_updated_at();
create trigger shifts_set_updated_at before update on public.shifts
  for each row execute function public.set_updated_at();
create trigger member_subscriptions_set_updated_at before update on public.member_subscriptions
  for each row execute function public.set_updated_at();
create trigger payments_set_updated_at before update on public.payments
  for each row execute function public.set_updated_at();
create trigger payment_corrections_set_updated_at before update on public.payment_corrections
  for each row execute function public.set_updated_at();
create trigger exceptions_set_updated_at before update on public.exceptions
  for each row execute function public.set_updated_at();
create trigger entries_set_updated_at before update on public.entries
  for each row execute function public.set_updated_at();
create trigger cash_movements_set_updated_at before update on public.cash_movements
  for each row execute function public.set_updated_at();
create trigger gcash_proofs_set_updated_at before update on public.gcash_proofs
  for each row execute function public.set_updated_at();
create trigger balances_set_updated_at before update on public.balances
  for each row execute function public.set_updated_at();
create trigger settings_set_updated_at before update on public.settings
  for each row execute function public.set_updated_at();

create trigger audit_logs_block_update before update on public.audit_logs
  for each row execute function public.block_audit_log_mutation();
create trigger audit_logs_block_delete before delete on public.audit_logs
  for each row execute function public.block_audit_log_mutation();

create trigger audit_profiles after insert or update or delete on public.profiles
  for each row execute function public.audit_row_change();
create trigger audit_staff_profiles after insert or update or delete on public.staff_profiles
  for each row execute function public.audit_row_change();
create trigger audit_members after insert or update or delete on public.members
  for each row execute function public.audit_row_change();
create trigger audit_membership_plans after insert or update or delete on public.membership_plans
  for each row execute function public.audit_row_change();
create trigger audit_shifts after insert or update or delete on public.shifts
  for each row execute function public.audit_row_change();
create trigger audit_member_subscriptions after insert or update or delete on public.member_subscriptions
  for each row execute function public.audit_row_change();
create trigger audit_payments after insert or update or delete on public.payments
  for each row execute function public.audit_row_change();
create trigger audit_payment_corrections after insert or update or delete on public.payment_corrections
  for each row execute function public.audit_row_change();
create trigger audit_exceptions after insert or update or delete on public.exceptions
  for each row execute function public.audit_row_change();
create trigger audit_entries after insert or update or delete on public.entries
  for each row execute function public.audit_row_change();
create trigger audit_cash_movements after insert or update or delete on public.cash_movements
  for each row execute function public.audit_row_change();
create trigger audit_gcash_proofs after insert or update or delete on public.gcash_proofs
  for each row execute function public.audit_row_change();
create trigger audit_balances after insert or update or delete on public.balances
  for each row execute function public.audit_row_change();
create trigger audit_settings after insert or update or delete on public.settings
  for each row execute function public.audit_row_change();

alter table public.profiles enable row level security;
alter table public.staff_profiles enable row level security;
alter table public.members enable row level security;
alter table public.membership_plans enable row level security;
alter table public.member_subscriptions enable row level security;
alter table public.entries enable row level security;
alter table public.payments enable row level security;
alter table public.payment_corrections enable row level security;
alter table public.exceptions enable row level security;
alter table public.shifts enable row level security;
alter table public.cash_movements enable row level security;
alter table public.gcash_proofs enable row level security;
alter table public.balances enable row level security;
alter table public.audit_logs enable row level security;
alter table public.settings enable row level security;
alter table public.notifications enable row level security;

create policy "profiles read own or staff directory"
on public.profiles for select
to authenticated
using (
  id = auth.uid()
  or private.current_app_role() in ('owner', 'admin', 'manager', 'front_desk', 'accountant')
);

create policy "profiles update own limited fields"
on public.profiles for update
to authenticated
using (id = auth.uid())
with check (
  id = auth.uid()
  and role = (select role from public.profiles where id = auth.uid())
  and status = (select status from public.profiles where id = auth.uid())
);

create policy "profiles management write"
on public.profiles for all
to authenticated
using (private.is_management())
with check (private.is_management());

create policy "staff profiles management read"
on public.staff_profiles for select
to authenticated
using (private.current_app_role() in ('owner', 'admin', 'manager', 'accountant'));

create policy "staff profiles management write"
on public.staff_profiles for all
to authenticated
using (private.is_management())
with check (private.is_management());

create policy "members operational read"
on public.members for select
to authenticated
using (
  private.is_front_desk_or_management()
  or private.current_app_role() = 'accountant'
  or profile_id = auth.uid()
);

create policy "members operational insert"
on public.members for insert
to authenticated
with check (private.is_front_desk_or_management());

create policy "members operational update"
on public.members for update
to authenticated
using (private.is_front_desk_or_management())
with check (private.is_front_desk_or_management());

create policy "membership plans read active"
on public.membership_plans for select
to authenticated
using (status = 'active' or private.is_reporting_role());

create policy "membership plans management write"
on public.membership_plans for all
to authenticated
using (private.is_management())
with check (private.is_management());

create policy "subscriptions operational read"
on public.member_subscriptions for select
to authenticated
using (
  private.is_front_desk_or_management()
  or private.current_app_role() = 'accountant'
  or exists (
    select 1 from public.members m
    where m.id = member_subscriptions.member_id
      and m.profile_id = auth.uid()
  )
);

create policy "subscriptions operational insert"
on public.member_subscriptions for insert
to authenticated
with check (private.is_front_desk_or_management());

create policy "subscriptions operational update"
on public.member_subscriptions for update
to authenticated
using (private.is_front_desk_or_management())
with check (private.is_front_desk_or_management());

create policy "entries operational read"
on public.entries for select
to authenticated
using (
  private.is_front_desk_or_management()
  or private.current_app_role() = 'accountant'
  or exists (
    select 1 from public.members m
    where m.id = entries.member_id
      and m.profile_id = auth.uid()
  )
);

create policy "entries front desk insert"
on public.entries for insert
to authenticated
with check (private.is_front_desk_or_management());

create policy "entries management update"
on public.entries for update
to authenticated
using (private.is_management())
with check (private.is_management());

create policy "payments operational read"
on public.payments for select
to authenticated
using (
  private.is_front_desk_or_management()
  or private.current_app_role() = 'accountant'
  or exists (
    select 1 from public.members m
    where m.id = payments.member_id
      and m.profile_id = auth.uid()
  )
);

create policy "payments front desk insert"
on public.payments for insert
to authenticated
with check (private.is_front_desk_or_management());

create policy "payments management update"
on public.payments for update
to authenticated
using (private.is_management())
with check (private.is_management());

create policy "payment corrections reporting read"
on public.payment_corrections for select
to authenticated
using (private.is_reporting_role());

create policy "payment corrections request"
on public.payment_corrections for insert
to authenticated
with check (private.is_front_desk_or_management());

create policy "payment corrections management review"
on public.payment_corrections for update
to authenticated
using (private.is_management())
with check (private.is_management());

create policy "exceptions operational read"
on public.exceptions for select
to authenticated
using (private.is_front_desk_or_management() or private.current_app_role() = 'accountant');

create policy "exceptions front desk create"
on public.exceptions for insert
to authenticated
with check (private.is_front_desk_or_management());

create policy "exceptions management review"
on public.exceptions for update
to authenticated
using (private.is_management())
with check (private.is_management());

create policy "shifts operational read"
on public.shifts for select
to authenticated
using (
  private.is_reporting_role()
  or opened_by = auth.uid()
  or closed_by = auth.uid()
);

create policy "shifts front desk open"
on public.shifts for insert
to authenticated
with check (private.is_front_desk_or_management());

create policy "shifts front desk close own or management"
on public.shifts for update
to authenticated
using (private.is_management() or opened_by = auth.uid())
with check (private.is_management() or opened_by = auth.uid());

create policy "cash movements operational read"
on public.cash_movements for select
to authenticated
using (
  private.is_reporting_role()
  or exists (
    select 1 from public.shifts s
    where s.id = cash_movements.shift_id
      and s.opened_by = auth.uid()
  )
);

create policy "cash movements front desk record"
on public.cash_movements for insert
to authenticated
with check (private.is_front_desk_or_management());

create policy "cash movements management update"
on public.cash_movements for update
to authenticated
using (private.is_management())
with check (private.is_management());

create policy "gcash proofs operational read"
on public.gcash_proofs for select
to authenticated
using (private.is_reporting_role() or private.current_app_role() = 'front_desk');

create policy "gcash proofs front desk upload metadata"
on public.gcash_proofs for insert
to authenticated
with check (private.is_front_desk_or_management());

create policy "gcash proofs management review"
on public.gcash_proofs for update
to authenticated
using (private.is_management())
with check (private.is_management());

create policy "balances reporting read"
on public.balances for select
to authenticated
using (private.is_reporting_role());

create policy "balances accountant prepare"
on public.balances for insert
to authenticated
with check (private.current_app_role() in ('owner', 'admin', 'manager', 'accountant'));

create policy "balances management review"
on public.balances for update
to authenticated
using (private.is_management())
with check (private.is_management());

create policy "audit logs reporting read"
on public.audit_logs for select
to authenticated
using (private.current_app_role() in ('owner', 'admin', 'manager', 'accountant'));

create policy "settings management read"
on public.settings for select
to authenticated
using (
  private.is_management()
  or (private.current_app_role() = 'accountant' and not is_owner_only)
);

create policy "settings owner admin write"
on public.settings for all
to authenticated
using (private.current_app_role() in ('owner', 'admin'))
with check (private.current_app_role() in ('owner', 'admin'));

create policy "notifications own read"
on public.notifications for select
to authenticated
using (recipient_id = auth.uid() or private.is_management());

create policy "notifications own update"
on public.notifications for update
to authenticated
using (recipient_id = auth.uid() or private.is_management())
with check (recipient_id = auth.uid() or private.is_management());

create policy "notifications management create"
on public.notifications for insert
to authenticated
with check (private.is_management());

commit;
