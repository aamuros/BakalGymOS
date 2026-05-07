begin;

create table if not exists public.role_permissions (
  id uuid primary key default gen_random_uuid(),
  role public.app_role not null,
  permission_key text not null,
  enabled boolean not null default false,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (role, permission_key),
  check (role <> 'member'),
  check (
    permission_key in (
      'record_payments',
      'correct_payments',
      'approve_exceptions',
      'view_reports',
      'manage_staff',
      'change_rates',
      'export_data'
    )
  )
);

create trigger role_permissions_set_updated_at before update on public.role_permissions
  for each row execute function public.set_updated_at();

create trigger audit_role_permissions after insert or update or delete on public.role_permissions
  for each row execute function public.audit_row_change();

alter table public.role_permissions enable row level security;

create policy "role permissions management read"
on public.role_permissions for select
to authenticated
using (private.current_app_role() in ('owner', 'admin'));

create policy "role permissions owner admin write"
on public.role_permissions for all
to authenticated
using (private.current_app_role() in ('owner', 'admin'))
with check (private.current_app_role() in ('owner', 'admin'));

create or replace function private.has_permission(p_permission_key text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    private.current_app_role() in ('owner', 'admin')
    or exists (
      select 1
      from public.role_permissions rp
      where rp.role = private.current_app_role()
        and rp.permission_key = p_permission_key
        and rp.enabled
    ),
    false
  )
$$;

create or replace function public.update_role_permissions(
  p_role public.app_role,
  p_permissions jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  permission_keys text[] := array[
    'record_payments',
    'correct_payments',
    'approve_exceptions',
    'view_reports',
    'manage_staff',
    'change_rates',
    'export_data'
  ];
  v_permission_key text;
  permission_enabled boolean;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  if not coalesce(private.current_app_role() in ('owner', 'admin'), false) then
    raise exception 'Only owner or admin accounts can manage role permissions.';
  end if;

  if p_role in ('owner', 'admin', 'member') then
    raise exception 'Built-in privileged and member roles cannot be edited here.';
  end if;

  foreach v_permission_key in array permission_keys loop
    permission_enabled := coalesce((p_permissions ->> v_permission_key)::boolean, false);

    insert into public.role_permissions (role, permission_key, enabled, updated_by)
    values (p_role, v_permission_key, permission_enabled, auth.uid())
    on conflict (role, permission_key) do update
    set enabled = excluded.enabled,
        updated_by = excluded.updated_by;
  end loop;

  perform private.record_audit_log(
    auth.uid(),
    'permission_settings_changed',
    'role_permissions',
    null,
    null,
    jsonb_build_object('role', p_role, 'permissions', p_permissions),
    'Role permissions changed'
  );

  return jsonb_build_object('status', 'updated', 'role', p_role);
end;
$$;

grant execute on function public.update_role_permissions(public.app_role, jsonb) to authenticated;

create or replace function public.update_admin_setting(
  p_key text,
  p_value jsonb,
  p_description text default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  if not coalesce(private.current_app_role() in ('owner', 'admin'), false) then
    raise exception 'Only owner or admin accounts can manage settings.';
  end if;

  if p_key not in ('gym_profile', 'payment_settings', 'exception_type_settings') then
    raise exception 'Unsupported setting key.';
  end if;

  insert into public.settings (key, value, description, is_owner_only, updated_by)
  values (p_key, p_value, p_description, true, auth.uid())
  on conflict (key) do update
  set value = excluded.value,
      description = excluded.description,
      is_owner_only = true,
      updated_by = excluded.updated_by;

  perform private.record_audit_log(
    auth.uid(),
    case
      when p_key = 'payment_settings' then 'payment_settings_changed'
      else p_key || '_changed'
    end,
    'settings',
    null,
    null,
    jsonb_build_object('key', p_key, 'value', p_value),
    coalesce(nullif(btrim(p_note), ''), 'Admin setting changed')
  );

  return jsonb_build_object('status', 'updated', 'key', p_key);
end;
$$;

grant execute on function public.update_admin_setting(text, jsonb, text, text) to authenticated;

create or replace function public.prevent_profile_privilege_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_role public.app_role := private.current_app_role();
begin
  if tg_op = 'UPDATE'
    and (new.role is distinct from old.role or new.status is distinct from old.status)
  then
    if not coalesce(actor_role in ('owner', 'admin'), false) then
      raise exception 'Only owner or admin accounts can change staff roles or status.';
    end if;

    if old.role = 'owner' and actor_role <> 'owner' then
      raise exception 'Only an owner can change another owner account.';
    end if;

    if new.role in ('owner', 'admin') and actor_role <> 'owner' then
      raise exception 'Only an owner can assign owner or admin roles.';
    end if;

    if auth.uid() = old.id and new.role is distinct from old.role then
      raise exception 'Users cannot change their own role.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_prevent_privilege_escalation on public.profiles;
create trigger profiles_prevent_privilege_escalation before update on public.profiles
  for each row execute function public.prevent_profile_privilege_escalation();

create or replace function public.update_staff_access(
  p_profile_id uuid,
  p_full_name text,
  p_role public.app_role,
  p_profile_status public.profile_status,
  p_employee_code text,
  p_job_title text,
  p_staff_status public.staff_status,
  p_can_open_shift boolean,
  p_can_close_shift boolean,
  p_can_accept_cash boolean,
  p_can_accept_gcash boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_role public.app_role := private.current_app_role();
  staff_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  if not coalesce(actor_role in ('owner', 'admin'), false) then
    raise exception 'Only owner or admin accounts can manage staff.';
  end if;

  if p_role = 'member' then
    raise exception 'Use member management for member accounts.';
  end if;

  if p_role in ('owner', 'admin') and actor_role <> 'owner' then
    raise exception 'Only an owner can assign owner or admin roles.';
  end if;

  update public.profiles
  set full_name = nullif(btrim(p_full_name), ''),
      role = p_role,
      status = p_profile_status
  where id = p_profile_id;

  if not found then
    raise exception 'Profile was not found.';
  end if;

  insert into public.staff_profiles (
    profile_id,
    employee_code,
    job_title,
    can_open_shift,
    can_close_shift,
    can_accept_cash,
    can_accept_gcash,
    status
  )
  values (
    p_profile_id,
    nullif(btrim(p_employee_code), ''),
    nullif(btrim(p_job_title), ''),
    p_can_open_shift,
    p_can_close_shift,
    p_can_accept_cash,
    p_can_accept_gcash,
    p_staff_status
  )
  on conflict (profile_id) do update
  set employee_code = excluded.employee_code,
      job_title = excluded.job_title,
      can_open_shift = excluded.can_open_shift,
      can_close_shift = excluded.can_close_shift,
      can_accept_cash = excluded.can_accept_cash,
      can_accept_gcash = excluded.can_accept_gcash,
      status = excluded.status
  returning id into staff_id;

  perform private.record_audit_log(
    auth.uid(),
    'staff_settings_changed',
    'staff_profiles',
    staff_id,
    null,
    jsonb_build_object('profile_id', p_profile_id, 'role', p_role, 'staff_status', p_staff_status),
    'Staff access changed'
  );

  return jsonb_build_object('status', 'updated', 'staff_profile_id', staff_id);
end;
$$;

grant execute on function public.update_staff_access(
  uuid,
  text,
  public.app_role,
  public.profile_status,
  text,
  text,
  public.staff_status,
  boolean,
  boolean,
  boolean,
  boolean
) to authenticated;

drop policy if exists "payments front desk insert" on public.payments;
create policy "payments permitted insert"
on public.payments for insert
to authenticated
with check (
  private.is_front_desk_or_management()
  and private.has_permission('record_payments')
);

drop policy if exists "payments management update" on public.payments;
create policy "payments permitted correction update"
on public.payments for update
to authenticated
using (private.has_permission('correct_payments'))
with check (private.has_permission('correct_payments'));

drop policy if exists "payment corrections request" on public.payment_corrections;
create policy "payment corrections permitted request"
on public.payment_corrections for insert
to authenticated
with check (
  private.is_front_desk_or_management()
  and private.has_permission('correct_payments')
);

drop policy if exists "payment corrections management review" on public.payment_corrections;
create policy "payment corrections permitted review"
on public.payment_corrections for update
to authenticated
using (private.has_permission('correct_payments'))
with check (private.has_permission('correct_payments'));

drop policy if exists "exceptions management review" on public.exceptions;
create policy "exceptions permitted review"
on public.exceptions for update
to authenticated
using (private.has_permission('approve_exceptions'))
with check (private.has_permission('approve_exceptions'));

drop policy if exists "profiles management write" on public.profiles;
create policy "profiles permitted staff write"
on public.profiles for all
to authenticated
using (private.has_permission('manage_staff'))
with check (private.has_permission('manage_staff'));

drop policy if exists "staff profiles management write" on public.staff_profiles;
create policy "staff profiles permitted write"
on public.staff_profiles for all
to authenticated
using (private.has_permission('manage_staff'))
with check (private.has_permission('manage_staff'));

drop policy if exists "balances reporting read" on public.balances;
create policy "balances permitted report read"
on public.balances for select
to authenticated
using (private.has_permission('view_reports'));

drop policy if exists "payment corrections reporting read" on public.payment_corrections;
create policy "payment corrections permitted report read"
on public.payment_corrections for select
to authenticated
using (private.has_permission('view_reports'));

drop policy if exists "membership plans management write" on public.membership_plans;
create policy "membership plans owner admin rate write"
on public.membership_plans for all
to authenticated
using (private.current_app_role() in ('owner', 'admin') and private.has_permission('change_rates'))
with check (private.current_app_role() in ('owner', 'admin') and private.has_permission('change_rates'));

insert into public.role_permissions (role, permission_key, enabled, updated_by)
select role_value::public.app_role, permission_key, enabled, null
from (
  values
    ('owner', 'record_payments', true),
    ('owner', 'correct_payments', true),
    ('owner', 'approve_exceptions', true),
    ('owner', 'view_reports', true),
    ('owner', 'manage_staff', true),
    ('owner', 'change_rates', true),
    ('owner', 'export_data', true),
    ('admin', 'record_payments', true),
    ('admin', 'correct_payments', true),
    ('admin', 'approve_exceptions', true),
    ('admin', 'view_reports', true),
    ('admin', 'manage_staff', true),
    ('admin', 'change_rates', true),
    ('admin', 'export_data', true),
    ('manager', 'record_payments', true),
    ('manager', 'correct_payments', true),
    ('manager', 'approve_exceptions', true),
    ('manager', 'view_reports', true),
    ('manager', 'manage_staff', false),
    ('manager', 'change_rates', false),
    ('manager', 'export_data', false),
    ('front_desk', 'record_payments', true),
    ('front_desk', 'correct_payments', false),
    ('front_desk', 'approve_exceptions', false),
    ('front_desk', 'view_reports', false),
    ('front_desk', 'manage_staff', false),
    ('front_desk', 'change_rates', false),
    ('front_desk', 'export_data', false),
    ('accountant', 'record_payments', false),
    ('accountant', 'correct_payments', false),
    ('accountant', 'approve_exceptions', false),
    ('accountant', 'view_reports', true),
    ('accountant', 'manage_staff', false),
    ('accountant', 'change_rates', false),
    ('accountant', 'export_data', true)
) as defaults(role_value, permission_key, enabled)
on conflict (role, permission_key) do nothing;

insert into public.settings (key, value, description, is_owner_only, updated_by)
values
  (
    'gym_profile',
    '{"name":"GymLedger Gym","address":"","phone":"","email":"","tax_id":""}'::jsonb,
    'Gym identity shown on operations and receipts.',
    true,
    null
  ),
  (
    'payment_settings',
    '{"currency":"PHP","cash_enabled":true,"gcash_enabled":true,"gcash_number":"","gcash_account_name":"","require_gcash_proof":true,"allow_partial_payments":true}'::jsonb,
    'Payment method and receipt policy.',
    true,
    null
  ),
  (
    'exception_type_settings',
    '{"types":[{"key":"pending_payment","label":"Pending payment","enabled":true,"requiresApproval":true},{"key":"staff_error","label":"Staff error","enabled":true,"requiresApproval":true},{"key":"system_issue","label":"System issue","enabled":true,"requiresApproval":true},{"key":"member_dispute","label":"Member dispute","enabled":true,"requiresApproval":true},{"key":"owner_approved_free_entry","label":"Owner-approved free entry","enabled":true,"requiresApproval":true},{"key":"other","label":"Other","enabled":true,"requiresApproval":true}]}'::jsonb,
    'Configurable exception labels used by staff.',
    true,
    null
  )
on conflict (key) do nothing;

commit;
