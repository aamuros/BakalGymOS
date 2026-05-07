alter table public.members
  add column if not exists qr_token uuid not null default gen_random_uuid();

create unique index if not exists members_qr_token_key on public.members(qr_token);
create index if not exists members_qr_token_idx on public.members(qr_token);

create or replace function public.rotate_member_qr_token(p_member_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_token uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  if not private.is_management() then
    raise exception 'Only management can rotate member QR tokens.';
  end if;

  update public.members
  set qr_token = gen_random_uuid()
  where id = p_member_id
  returning qr_token into new_token;

  if new_token is null then
    raise exception 'Member was not found.';
  end if;

  insert into public.audit_logs (
    actor_id,
    action,
    entity_table,
    entity_id,
    new_data
  )
  values (
    auth.uid(),
    'member_qr_token_rotated',
    'members',
    p_member_id,
    jsonb_build_object('rotated_at', now())
  );

  return new_token;
end;
$$;

grant execute on function public.rotate_member_qr_token(uuid) to authenticated;
