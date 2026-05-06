alter type public.entry_settlement_type add value if not exists 'active_member' after 'membership';

alter table public.entries
  drop constraint if exists entries_settlement_link_check;

alter table public.entries
  add constraint entries_settlement_link_check
  check (
    (settlement_type::text in ('membership', 'active_member') and subscription_id is not null and payment_id is null and exception_id is null)
    or (settlement_type in ('cash', 'gcash') and payment_id is not null and exception_id is null)
    or (settlement_type = 'pending' and exception_id is null)
    or (settlement_type = 'exception' and exception_id is not null and payment_id is null)
  );

create or replace function private.log_member_check_in_attempt(
  p_action text,
  p_member_id uuid,
  p_result text,
  p_reason text
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
    new_data
  )
  values (
    auth.uid(),
    p_action,
    'members',
    p_member_id,
    jsonb_build_object(
      'result', p_result,
      'reason', p_reason,
      'attempted_at', now()
    )
  );
end;
$$;

create or replace function public.create_member_check_in(p_member_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  active_shift record;
  target_member record;
  active_subscription record;
  created_entry_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  if not private.is_front_desk_or_management() then
    raise exception 'You do not have permission to check in members.';
  end if;

  select
    s.id
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
    raise exception 'Start an active shift before checking in members.';
  end if;

  select
    m.id,
    m.full_name,
    m.member_code,
    m.status
  into target_member
  from public.members m
  where m.id = p_member_id;

  if target_member.id is null then
    perform private.log_member_check_in_attempt(
      'member_check_in_blocked',
      p_member_id,
      'blocked',
      'member_not_found'
    );
    return jsonb_build_object(
      'status', 'blocked',
      'reason', 'member_not_found',
      'message', 'Member was not found.'
    );
  end if;

  if target_member.status = 'banned' then
    perform private.log_member_check_in_attempt(
      'member_check_in_blocked',
      target_member.id,
      'blocked',
      'banned_member'
    );
    return jsonb_build_object(
      'status', 'blocked',
      'reason', 'banned_member',
      'message', 'Banned members cannot be checked in.'
    );
  end if;

  select
    ms.id,
    ms.ends_at,
    ms.entries_used,
    mp.entry_limit,
    mp.is_unlimited
  into active_subscription
  from public.member_subscriptions ms
  join public.membership_plans mp on mp.id = ms.plan_id
  where ms.member_id = target_member.id
    and ms.status = 'active'
    and ms.starts_at <= current_date
    and ms.ends_at >= current_date
  order by ms.ends_at desc
  limit 1;

  if active_subscription.id is null then
    perform private.log_member_check_in_attempt(
      'member_check_in_blocked',
      target_member.id,
      'blocked',
      'expired_or_missing_active_subscription'
    );
    return jsonb_build_object(
      'status', 'blocked',
      'reason', 'expired_or_missing_active_subscription',
      'message', 'This member is expired. Choose Renew Now, Pay Walk-In, Record Utang, or Owner Override.'
    );
  end if;

  if not active_subscription.is_unlimited
    and active_subscription.entries_used >= active_subscription.entry_limit
  then
    perform private.log_member_check_in_attempt(
      'member_check_in_blocked',
      target_member.id,
      'blocked',
      'entry_limit_reached'
    );
    return jsonb_build_object(
      'status', 'blocked',
      'reason', 'entry_limit_reached',
      'message', 'This member has no remaining entries. Choose a paid or override action.'
    );
  end if;

  insert into public.entries (
    member_id,
    checked_in_by,
    shift_id,
    settlement_type,
    subscription_id,
    status,
    notes
  )
  values (
    target_member.id,
    auth.uid(),
    active_shift.id,
    'active_member'::public.entry_settlement_type,
    active_subscription.id,
    'completed',
    'Active member check-in'
  )
  returning id into created_entry_id;

  update public.member_subscriptions
  set entries_used = entries_used + 1
  where id = active_subscription.id;

  perform private.log_member_check_in_attempt(
    'member_check_in_created',
    target_member.id,
    'created',
    'active_member'
  );

  return jsonb_build_object(
    'status', 'created',
    'entry_id', created_entry_id,
    'member_id', target_member.id,
    'subscription_id', active_subscription.id,
    'settlement_type', 'active_member'
  );
end;
$$;

grant execute on function public.create_member_check_in(uuid) to authenticated;
