begin;

alter table public.audit_logs
  add column if not exists actor_role public.app_role,
  add column if not exists action_type text,
  add column if not exists entity_type text,
  add column if not exists note text;

alter table public.audit_logs disable trigger audit_logs_block_update;

update public.audit_logs
set
  actor_role = coalesce(
    actor_role,
    (
      select p.role
      from public.profiles p
      where p.id = public.audit_logs.actor_id
    )
  ),
  action_type = coalesce(action_type, action),
  entity_type = coalesce(entity_type, entity_table),
  note = coalesce(
    note,
    nullif(new_data ->> 'note', ''),
    nullif(new_data ->> 'notes', ''),
    nullif(new_data ->> 'owner_note', ''),
    nullif(new_data ->> 'reason', ''),
    nullif(old_data ->> 'note', ''),
    nullif(old_data ->> 'notes', ''),
    nullif(old_data ->> 'owner_note', ''),
    nullif(old_data ->> 'reason', '')
  )
where action_type is null
   or entity_type is null
   or actor_role is null
   or note is null;

alter table public.audit_logs enable trigger audit_logs_block_update;

alter table public.audit_logs
  alter column action_type set not null,
  alter column entity_type set not null;

create index if not exists audit_logs_action_type_idx on public.audit_logs(action_type);
create index if not exists audit_logs_entity_type_idx on public.audit_logs(entity_type);
create index if not exists audit_logs_actor_role_idx on public.audit_logs(actor_role);

create or replace function public.prepare_audit_log_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.action_type = coalesce(nullif(btrim(new.action_type), ''), nullif(btrim(new.action), ''));
  new.entity_type = coalesce(nullif(btrim(new.entity_type), ''), nullif(btrim(new.entity_table), ''));
  new.action = new.action_type;
  new.entity_table = new.entity_type;

  if new.actor_role is null and new.actor_id is not null then
    select p.role
    into new.actor_role
    from public.profiles p
    where p.id = new.actor_id;
  end if;

  new.note = coalesce(nullif(btrim(new.note), ''), private.audit_note(new.old_data, new.new_data));

  if new.action_type is null then
    raise exception 'Audit action type is required.';
  end if;

  if new.entity_type is null then
    raise exception 'Audit entity type is required.';
  end if;

  return new;
end;
$$;

drop trigger if exists audit_logs_prepare_insert on public.audit_logs;
create trigger audit_logs_prepare_insert before insert on public.audit_logs
  for each row execute function public.prepare_audit_log_insert();

create or replace function private.can_view_audit_logs(
  p_action_type text,
  p_entity_type text
)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    private.current_app_role() in ('owner', 'admin')
    or (
      private.current_app_role() = 'manager'::public.app_role
      and p_action_type in (
        'payment_created',
        'payment_corrected',
        'exception_approved',
        'exception_rejected',
        'shift_started',
        'shift_ended',
        'member_renewed',
        'member_banned',
        'rate_changed'
      )
      and p_entity_type not in ('profiles', 'settings', 'audit_logs')
      and coalesce(
        (
          select (s.value ->> 'enabled')::boolean
          from public.settings s
          where s.key = 'manager_audit_log_access'
          limit 1
        ),
        false
      )
    ),
    false
  )
$$;

create or replace function private.audit_action_type(
  p_table_name text,
  p_operation text,
  p_old_data jsonb,
  p_new_data jsonb
)
returns text
language sql
immutable
as $$
  select case
    when p_table_name = 'payments' and p_operation = 'INSERT' then 'payment_created'
    when p_table_name = 'payments' and p_operation = 'UPDATE' then 'payment_corrected'
    when p_table_name = 'payment_corrections'
      and p_operation = 'UPDATE'
      and p_old_data ->> 'status' is distinct from p_new_data ->> 'status'
      and p_new_data ->> 'status' = 'approved'
      then 'payment_corrected'
    when p_table_name = 'exceptions'
      and p_operation = 'UPDATE'
      and p_old_data ->> 'status' is distinct from p_new_data ->> 'status'
      and p_new_data ->> 'status' = 'approved'
      then 'exception_approved'
    when p_table_name = 'exceptions'
      and p_operation = 'UPDATE'
      and p_old_data ->> 'status' is distinct from p_new_data ->> 'status'
      and p_new_data ->> 'status' = 'rejected'
      then 'exception_rejected'
    when p_table_name = 'shifts' and p_operation = 'INSERT' then 'shift_started'
    when p_table_name = 'shifts'
      and p_operation = 'UPDATE'
      and p_old_data ->> 'status' is distinct from p_new_data ->> 'status'
      and p_new_data ->> 'status' = 'closed'
      then 'shift_ended'
    when p_table_name = 'member_subscriptions' and p_operation = 'INSERT' then 'member_renewed'
    when p_table_name = 'members'
      and p_operation = 'UPDATE'
      and p_old_data ->> 'status' is distinct from p_new_data ->> 'status'
      and p_new_data ->> 'status' = 'banned'
      then 'member_banned'
    when p_table_name = 'membership_plans'
      and p_operation = 'UPDATE'
      and p_old_data ->> 'price' is distinct from p_new_data ->> 'price'
      then 'rate_changed'
    else lower(p_operation)
  end
$$;

create or replace function private.audit_note(
  p_old_data jsonb,
  p_new_data jsonb
)
returns text
language sql
immutable
as $$
  select coalesce(
    nullif(p_new_data ->> 'note', ''),
    nullif(p_new_data ->> 'notes', ''),
    nullif(p_new_data ->> 'owner_note', ''),
    nullif(p_new_data ->> 'resolution_notes', ''),
    nullif(p_new_data ->> 'reason', ''),
    nullif(p_old_data ->> 'note', ''),
    nullif(p_old_data ->> 'notes', ''),
    nullif(p_old_data ->> 'owner_note', ''),
    nullif(p_old_data ->> 'resolution_notes', ''),
    nullif(p_old_data ->> 'reason', '')
  )
$$;

create or replace function private.record_audit_log(
  p_actor_id uuid,
  p_action_type text,
  p_entity_type text,
  p_entity_id uuid,
  p_old_value jsonb,
  p_new_value jsonb,
  p_note text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  created_audit_id uuid;
  actor_role_value public.app_role;
  clean_action_type text := nullif(btrim(p_action_type), '');
  clean_entity_type text := nullif(btrim(p_entity_type), '');
begin
  if clean_action_type is null then
    raise exception 'Audit action type is required.';
  end if;

  if clean_entity_type is null then
    raise exception 'Audit entity type is required.';
  end if;

  select p.role
  into actor_role_value
  from public.profiles p
  where p.id = p_actor_id;

  insert into public.audit_logs (
    actor_id,
    actor_role,
    action,
    action_type,
    entity_table,
    entity_type,
    entity_id,
    old_data,
    new_data,
    note
  )
  values (
    p_actor_id,
    actor_role_value,
    clean_action_type,
    clean_action_type,
    clean_entity_type,
    clean_entity_type,
    p_entity_id,
    p_old_value,
    p_new_value,
    nullif(btrim(p_note), '')
  )
  returning id into created_audit_id;

  return created_audit_id;
end;
$$;

revoke execute on function private.record_audit_log(uuid, text, text, uuid, jsonb, jsonb, text)
from public, anon, authenticated;

create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  row_id uuid;
  old_value jsonb;
  new_value jsonb;
  derived_action text;
  derived_note text;
begin
  if tg_op = 'INSERT' then
    row_id = new.id;
    new_value = to_jsonb(new);
  elsif tg_op = 'UPDATE' then
    row_id = new.id;
    old_value = to_jsonb(old);
    new_value = to_jsonb(new);
  else
    row_id = old.id;
    old_value = to_jsonb(old);
  end if;

  derived_action := private.audit_action_type(tg_table_name, tg_op, old_value, new_value);
  derived_note := private.audit_note(old_value, new_value);

  perform private.record_audit_log(
    auth.uid(),
    derived_action,
    tg_table_name,
    row_id,
    old_value,
    new_value,
    derived_note
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

revoke execute on function public.audit_row_change() from public, anon, authenticated;
revoke execute on function public.block_audit_log_mutation() from public, anon, authenticated;

create or replace function public.record_staff_pin_changed(
  p_staff_profile_id uuid,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_staff record;
  clean_note text := coalesce(nullif(btrim(p_note), ''), 'Staff PIN changed');
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  if private.current_app_role() not in ('owner', 'admin', 'manager') then
    raise exception 'Only owner, admin, or manager accounts can change staff PINs.';
  end if;

  select sp.id, sp.profile_id, p.role
  into target_staff
  from public.staff_profiles sp
  join public.profiles p on p.id = sp.profile_id
  where sp.id = p_staff_profile_id;

  if target_staff.id is null then
    raise exception 'Staff profile was not found.';
  end if;

  perform private.record_audit_log(
    auth.uid(),
    'staff_pin_changed',
    'staff_profiles',
    target_staff.id,
    null,
    jsonb_build_object(
      'staff_profile_id', target_staff.id,
      'profile_id', target_staff.profile_id,
      'staff_role', target_staff.role,
      'changed_at', now()
    ),
    clean_note
  );

  return jsonb_build_object('status', 'logged', 'staff_profile_id', target_staff.id);
end;
$$;

grant execute on function public.record_staff_pin_changed(uuid, text) to authenticated;

alter function public.mark_gcash_proof_uploaded(
  uuid,
  text,
  text,
  text,
  bigint,
  text,
  text,
  text
) security definer;

alter function public.review_gcash_proof(uuid, text, text) security definer;

drop policy if exists "audit logs reporting read" on public.audit_logs;
drop policy if exists "audit logs management read" on public.audit_logs;
create policy "audit logs authorized read"
on public.audit_logs for select
to authenticated
using (private.can_view_audit_logs(action_type, entity_type));

drop policy if exists "audit logs insert" on public.audit_logs;
drop policy if exists "audit logs update" on public.audit_logs;
drop policy if exists "audit logs delete" on public.audit_logs;

insert into public.settings (key, value, description, is_owner_only, updated_by)
values (
  'manager_audit_log_access',
  '{"enabled": false}'::jsonb,
  'Allows managers to view limited audit logs when enabled.',
  true,
  null
)
on conflict (key) do nothing;

commit;
