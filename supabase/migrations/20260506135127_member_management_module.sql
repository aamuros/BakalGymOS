alter type public.member_status add value if not exists 'expired' after 'active';

drop policy if exists "members operational insert" on public.members;
create policy "members management insert"
on public.members for insert
to authenticated
with check (private.is_management());

drop policy if exists "members operational update" on public.members;
create policy "members management update"
on public.members for update
to authenticated
using (private.is_management())
with check (private.is_management());
