begin;

create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, role, status)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(new.email, '@', 1), 'Staff user'),
    new.email,
    'member',
    'active'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists auth_users_create_profile on auth.users;

create trigger auth_users_create_profile
  after insert on auth.users
  for each row execute function private.handle_new_auth_user();

drop policy if exists "staff profiles management read" on public.staff_profiles;
create policy "staff profiles management read"
on public.staff_profiles for select
to authenticated
using (private.current_app_role() in ('owner', 'admin', 'manager'));

drop policy if exists "members operational read" on public.members;
create policy "members operational read"
on public.members for select
to authenticated
using (
  private.is_front_desk_or_management()
  or profile_id = auth.uid()
);

drop policy if exists "subscriptions operational read" on public.member_subscriptions;
create policy "subscriptions operational read"
on public.member_subscriptions for select
to authenticated
using (
  private.is_front_desk_or_management()
  or exists (
    select 1 from public.members m
    where m.id = member_subscriptions.member_id
      and m.profile_id = auth.uid()
  )
);

drop policy if exists "entries operational read" on public.entries;
create policy "entries operational read"
on public.entries for select
to authenticated
using (
  private.is_front_desk_or_management()
  or exists (
    select 1 from public.members m
    where m.id = entries.member_id
      and m.profile_id = auth.uid()
  )
);

drop policy if exists "exceptions operational read" on public.exceptions;
create policy "exceptions operational read"
on public.exceptions for select
to authenticated
using (private.is_front_desk_or_management());

drop policy if exists "shifts operational read" on public.shifts;
create policy "shifts operational read"
on public.shifts for select
to authenticated
using (
  private.is_management()
  or opened_by = auth.uid()
  or closed_by = auth.uid()
);

drop policy if exists "cash movements operational read" on public.cash_movements;
create policy "cash movements operational read"
on public.cash_movements for select
to authenticated
using (
  private.is_management()
  or exists (
    select 1 from public.shifts s
    where s.id = cash_movements.shift_id
      and s.opened_by = auth.uid()
  )
);

drop policy if exists "audit logs reporting read" on public.audit_logs;
create policy "audit logs management read"
on public.audit_logs for select
to authenticated
using (private.current_app_role() in ('owner', 'admin', 'manager'));

drop policy if exists "settings management read" on public.settings;
create policy "settings management read"
on public.settings for select
to authenticated
using (private.is_management());

commit;
