begin;

create unique index if not exists shifts_one_open_per_staff_idx
on public.shifts (staff_profile_id)
where status = 'open';

create or replace function private.has_active_shift(profile_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.shifts s
    join public.staff_profiles sp on sp.id = s.staff_profile_id
    where sp.profile_id = has_active_shift.profile_id
      and sp.status = 'active'
      and s.status = 'open'
      and s.closed_at is null
  )
$$;

create or replace function private.is_own_active_shift(shift_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.shifts s
    join public.staff_profiles sp on sp.id = s.staff_profile_id
    where s.id = is_own_active_shift.shift_id
      and sp.profile_id = auth.uid()
      and sp.status = 'active'
      and s.opened_by = auth.uid()
      and s.status = 'open'
      and s.closed_at is null
  )
$$;

create policy "staff profiles read own"
on public.staff_profiles for select
to authenticated
using (profile_id = auth.uid());

drop policy if exists "shifts front desk open" on public.shifts;
create policy "shifts authorized staff open"
on public.shifts for insert
to authenticated
with check (
  private.current_app_role() in ('owner', 'admin', 'manager', 'front_desk')
  and opened_by = auth.uid()
  and closed_by is null
  and status = 'open'
  and closed_at is null
  and exists (
    select 1
    from public.staff_profiles sp
    where sp.id = shifts.staff_profile_id
      and sp.profile_id = auth.uid()
      and sp.status = 'active'
      and sp.can_open_shift
  )
);

drop policy if exists "entries front desk insert" on public.entries;
create policy "entries active shift insert"
on public.entries for insert
to authenticated
with check (
  private.is_front_desk_or_management()
  and shift_id is not null
  and checked_in_by = auth.uid()
  and private.is_own_active_shift(shift_id)
);

drop policy if exists "payments front desk insert" on public.payments;
create policy "payments active shift insert"
on public.payments for insert
to authenticated
with check (
  private.is_front_desk_or_management()
  and shift_id is not null
  and received_by = auth.uid()
  and private.is_own_active_shift(shift_id)
);

commit;
