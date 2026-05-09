begin;

update public.members
set status = 'inactive'::public.member_status
where status = 'expired'::public.member_status;

alter table public.members
  drop constraint if exists members_status_not_expired;

alter table public.members
  add constraint members_status_not_expired
  check (status in (
    'active'::public.member_status,
    'inactive'::public.member_status,
    'banned'::public.member_status,
    'archived'::public.member_status
  ));

commit;
