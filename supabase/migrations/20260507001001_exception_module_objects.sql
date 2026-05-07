alter table public.exceptions
  add column if not exists shift_id uuid references public.shifts(id) on delete restrict,
  add column if not exists staff_profile_id uuid references public.staff_profiles(id) on delete restrict,
  add column if not exists person_name text,
  add column if not exists amount numeric(12,2) check (amount is null or amount >= 0),
  add column if not exists owner_note text,
  add column if not exists resolved_by uuid references public.profiles(id) on delete set null,
  add column if not exists resolved_at timestamptz;

update public.exceptions e
set shift_id = coalesce(e.shift_id, en.shift_id)
from public.entries en
where e.entry_id = en.id
  and e.shift_id is null;

update public.exceptions e
set staff_profile_id = coalesce(e.staff_profile_id, sp.id)
from public.staff_profiles sp
where sp.profile_id = e.created_by
  and e.staff_profile_id is null;

update public.exceptions
set status = 'needs_review'::public.review_status
where status = 'pending'::public.review_status;

alter table public.exceptions
  alter column status set default 'needs_review'::public.review_status;

alter table public.exceptions
  drop constraint if exists exceptions_staff_shift_required,
  add constraint exceptions_staff_shift_required
  check (shift_id is not null and staff_profile_id is not null) not valid;

alter table public.exceptions
  drop constraint if exists exceptions_person_required,
  add constraint exceptions_person_required
  check (member_id is not null or nullif(btrim(person_name), '') is not null) not valid;

create index if not exists exceptions_shift_id_idx on public.exceptions(shift_id);
create index if not exists exceptions_staff_profile_id_idx on public.exceptions(staff_profile_id);
create index if not exists exceptions_type_idx on public.exceptions(exception_type);

drop policy if exists "exceptions operational read" on public.exceptions;
create policy "exceptions operational read"
on public.exceptions for select
to authenticated
using (
  private.is_management()
  or created_by = auth.uid()
  or exists (
    select 1
    from public.shifts s
    where s.id = exceptions.shift_id
      and s.opened_by = auth.uid()
  )
);

drop policy if exists "exceptions front desk create" on public.exceptions;
create policy "exceptions active shift create"
on public.exceptions for insert
to authenticated
with check (
  private.is_front_desk_or_management()
  and created_by = auth.uid()
  and shift_id is not null
  and staff_profile_id is not null
  and private.is_own_active_shift(shift_id)
  and exists (
    select 1
    from public.staff_profiles sp
    where sp.id = exceptions.staff_profile_id
      and sp.profile_id = auth.uid()
      and sp.status = 'active'
  )
  and status = 'needs_review'::public.review_status
);

drop policy if exists "exceptions management review" on public.exceptions;
create policy "exceptions management review"
on public.exceptions for update
to authenticated
using (private.is_management())
with check (private.is_management());

create or replace function private.log_exception_action(
  p_exception_id uuid,
  p_action text,
  p_old_status public.review_status,
  p_new_status public.review_status,
  p_owner_note text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
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
    p_action,
    'exceptions',
    p_exception_id,
    case
      when p_old_status is null then null
      else jsonb_build_object('status', p_old_status)
    end,
    jsonb_build_object(
      'status', p_new_status,
      'owner_note', p_owner_note,
      'acted_at', now()
    )
  );
end;
$$;

create or replace function public.create_exception(
  p_member_id uuid,
  p_person_name text,
  p_exception_type public.exception_type,
  p_reason text,
  p_amount numeric,
  p_related_entry_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  active_shift record;
  clean_person_name text := nullif(btrim(p_person_name), '');
  clean_reason text := nullif(btrim(p_reason), '');
  created_exception_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  if not private.is_front_desk_or_management() then
    raise exception 'You do not have permission to create exceptions.';
  end if;

  if p_member_id is null and clean_person_name is null then
    raise exception 'Add the person or member involved.';
  end if;

  if clean_reason is null then
    raise exception 'A reason is required.';
  end if;

  if p_amount is not null and p_amount < 0 then
    raise exception 'Amount cannot be negative.';
  end if;

  select
    s.id,
    sp.id as staff_profile_id
  into active_shift
  from public.shifts s
  join public.staff_profiles sp on sp.id = s.staff_profile_id
  where sp.profile_id = auth.uid()
    and sp.status = 'active'
    and s.opened_by = auth.uid()
    and s.status = 'open'
    and s.closed_at is null
  order by s.opened_at desc
  limit 1;

  if active_shift.id is null then
    raise exception 'Start an active shift before creating an exception.';
  end if;

  if p_member_id is not null and not exists (select 1 from public.members where id = p_member_id) then
    raise exception 'Member was not found.';
  end if;

  if p_related_entry_id is not null and not exists (
    select 1
    from public.entries e
    where e.id = p_related_entry_id
      and e.shift_id = active_shift.id
      and e.checked_in_by = auth.uid()
  ) then
    raise exception 'Related entry must belong to your active shift.';
  end if;

  insert into public.exceptions (
    member_id,
    person_name,
    entry_id,
    exception_type,
    reason,
    amount,
    shift_id,
    staff_profile_id,
    created_by,
    status
  )
  values (
    p_member_id,
    clean_person_name,
    p_related_entry_id,
    p_exception_type,
    clean_reason,
    p_amount,
    active_shift.id,
    active_shift.staff_profile_id,
    auth.uid(),
    'needs_review'
  )
  returning id into created_exception_id;

  perform private.log_exception_action(
    created_exception_id,
    'exception_created',
    null,
    'needs_review',
    null
  );

  return jsonb_build_object(
    'status', 'created',
    'exception_id', created_exception_id,
    'shift_id', active_shift.id
  );
end;
$$;

create or replace function public.review_exception(
  p_exception_id uuid,
  p_action text,
  p_owner_note text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  target_exception record;
  next_status public.review_status;
  clean_owner_note text := nullif(btrim(p_owner_note), '');
  audit_action text;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  if not private.is_management() then
    raise exception 'You do not have permission to review exceptions.';
  end if;

  if p_action = 'approve' then
    next_status := 'approved'::public.review_status;
    audit_action := 'exception_approved';
  elsif p_action = 'reject' then
    next_status := 'rejected'::public.review_status;
    audit_action := 'exception_rejected';
  elsif p_action = 'resolve' then
    next_status := 'resolved'::public.review_status;
    audit_action := 'exception_resolved';
  else
    raise exception 'Choose a valid exception action.';
  end if;

  select
    e.id,
    e.status,
    e.created_by
  into target_exception
  from public.exceptions e
  where e.id = p_exception_id
  for update;

  if target_exception.id is null then
    raise exception 'Exception was not found.';
  end if;

  if target_exception.created_by = auth.uid()
    and private.current_app_role() <> 'owner'::public.app_role
  then
    raise exception 'Staff cannot approve or resolve their own exceptions.';
  end if;

  update public.exceptions
  set status = next_status,
      reviewed_by = case when next_status in ('approved', 'rejected') then auth.uid() else reviewed_by end,
      reviewed_at = case when next_status in ('approved', 'rejected') then now() else reviewed_at end,
      resolved_by = case when next_status = 'resolved' then auth.uid() else resolved_by end,
      resolved_at = case when next_status = 'resolved' then now() else resolved_at end,
      owner_note = clean_owner_note,
      resolution_notes = clean_owner_note
  where id = target_exception.id;

  perform private.log_exception_action(
    target_exception.id,
    audit_action,
    target_exception.status,
    next_status,
    clean_owner_note
  );

  return jsonb_build_object(
    'status', next_status,
    'exception_id', target_exception.id
  );
end;
$$;

grant execute on function public.create_exception(uuid, text, public.exception_type, text, numeric, uuid) to authenticated;
grant execute on function public.review_exception(uuid, text, text) to authenticated;
