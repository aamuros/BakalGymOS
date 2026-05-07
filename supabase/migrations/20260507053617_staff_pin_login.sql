begin;

alter table public.staff_profiles
  add column if not exists pin_hash text,
  add column if not exists pin_set_at timestamptz,
  add column if not exists pin_reset_at timestamptz,
  add column if not exists pin_updated_by uuid references public.profiles(id) on delete set null;

create index if not exists staff_profiles_pin_enabled_idx
on public.staff_profiles(id)
where pin_hash is not null and status = 'active';

create or replace function public.record_staff_deactivated(
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
  clean_note text := coalesce(nullif(btrim(p_note), ''), 'Staff account deactivated');
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  if private.current_app_role() not in ('owner', 'admin', 'manager') then
    raise exception 'Only owner, admin, or manager accounts can deactivate staff.';
  end if;

  select sp.id, sp.profile_id, sp.status, p.role
  into target_staff
  from public.staff_profiles sp
  join public.profiles p on p.id = sp.profile_id
  where sp.id = p_staff_profile_id;

  if target_staff.id is null then
    raise exception 'Staff profile was not found.';
  end if;

  perform private.record_audit_log(
    auth.uid(),
    'staff_deactivated',
    'staff_profiles',
    target_staff.id,
    null,
    jsonb_build_object(
      'staff_profile_id', target_staff.id,
      'profile_id', target_staff.profile_id,
      'staff_role', target_staff.role,
      'status', target_staff.status,
      'deactivated_at', now()
    ),
    clean_note
  );

  return jsonb_build_object('status', 'logged', 'staff_profile_id', target_staff.id);
end;
$$;

grant execute on function public.record_staff_deactivated(uuid, text) to authenticated;

commit;
