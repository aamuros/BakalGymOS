alter type public.notification_type add value if not exists 'exception_needs_review';
alter type public.notification_type add value if not exists 'gcash_proof_needs_confirmation';
alter type public.notification_type add value if not exists 'cash_variance';
alter type public.notification_type add value if not exists 'unpaid_balance';
alter type public.notification_type add value if not exists 'expired_member_entry_attempt';
alter type public.notification_type add value if not exists 'banned_member_check_in_attempt';
alter type public.notification_type add value if not exists 'shift_not_closed';
alter type public.notification_type add value if not exists 'high_pending_payments';

alter table public.notifications
  add column if not exists related_path text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists dedupe_key text;

create index if not exists notifications_created_at_idx on public.notifications(created_at desc);
create index if not exists notifications_unread_created_at_idx
on public.notifications(recipient_id, created_at desc)
where status = 'unread'::public.notification_status;

create unique index if not exists notifications_recipient_dedupe_key_idx
on public.notifications(recipient_id, dedupe_key)
where dedupe_key is not null;

drop policy if exists "notifications own read" on public.notifications;
create policy "notifications own read"
on public.notifications for select
to authenticated
using (recipient_id = auth.uid());

drop policy if exists "notifications own update" on public.notifications;
create policy "notifications own update"
on public.notifications for update
to authenticated
using (recipient_id = auth.uid())
with check (
  recipient_id = auth.uid()
  and notification_type = notification_type
  and title = title
  and coalesce(body, '') = coalesce(body, '')
  and coalesce(entity_table, '') = coalesce(entity_table, '')
  and coalesce(entity_id, '00000000-0000-0000-0000-000000000000'::uuid) =
    coalesce(entity_id, '00000000-0000-0000-0000-000000000000'::uuid)
);

drop policy if exists "notifications management create" on public.notifications;

create or replace function private.notify_profiles(
  p_recipient_ids uuid[],
  p_notification_type public.notification_type,
  p_title text,
  p_body text,
  p_entity_table text,
  p_entity_id uuid,
  p_related_path text,
  p_metadata jsonb,
  p_dedupe_key text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (
    recipient_id,
    notification_type,
    title,
    body,
    entity_table,
    entity_id,
    related_path,
    metadata,
    dedupe_key
  )
  select
    recipient_id,
    p_notification_type,
    p_title,
    p_body,
    p_entity_table,
    p_entity_id,
    p_related_path,
    coalesce(p_metadata, '{}'::jsonb),
    p_dedupe_key
  from unnest(coalesce(p_recipient_ids, array[]::uuid[])) as recipient_id
  where recipient_id is not null
  on conflict do nothing;
end;
$$;

create or replace function private.notify_active_roles(
  p_roles public.app_role[],
  p_notification_type public.notification_type,
  p_title text,
  p_body text,
  p_entity_table text,
  p_entity_id uuid,
  p_related_path text,
  p_metadata jsonb,
  p_dedupe_key text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  recipients uuid[];
begin
  select coalesce(array_agg(p.id), array[]::uuid[])
  into recipients
  from public.profiles p
  where p.status = 'active'::public.profile_status
    and p.role = any(p_roles);

  perform private.notify_profiles(
    recipients,
    p_notification_type,
    p_title,
    p_body,
    p_entity_table,
    p_entity_id,
    p_related_path,
    p_metadata,
    p_dedupe_key
  );
end;
$$;

create or replace function private.notify_exception_needs_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  member_name text;
  actor_name text;
begin
  if new.status not in ('needs_review'::public.review_status, 'pending'::public.review_status) then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.status = new.status then
    return new;
  end if;

  select coalesce(m.full_name, new.person_name, 'Unassigned person')
  into member_name
  from public.members m
  where m.id = new.member_id;

  if member_name is null then
    member_name := coalesce(new.person_name, 'Unassigned person');
  end if;

  select p.full_name into actor_name from public.profiles p where p.id = new.created_by;

  perform private.notify_active_roles(
    array['owner'::public.app_role, 'admin'::public.app_role, 'manager'::public.app_role],
    'exception_needs_review'::public.notification_type,
    'Exception needs review',
    format('%s recorded an exception for %s.', coalesce(actor_name, 'Staff'), member_name),
    'exceptions',
    new.id,
    '/exceptions',
    jsonb_build_object(
      'exception_type', new.exception_type,
      'member_id', new.member_id,
      'shift_id', new.shift_id,
      'created_by', new.created_by
    ),
    'exception:' || new.id::text
  );

  return new;
end;
$$;

drop trigger if exists notify_exception_needs_review on public.exceptions;
create trigger notify_exception_needs_review
after insert or update of status on public.exceptions
for each row execute function private.notify_exception_needs_review();

create or replace function private.notify_gcash_proof_needs_confirmation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  amount_text text;
  uploader_name text;
begin
  if new.proof_status not in (
    'pending_review'::public.proof_status,
    'staff_checked'::public.proof_status,
    'disputed'::public.proof_status,
    'needs_follow_up'::public.proof_status
  ) then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.proof_status = new.proof_status then
    return new;
  end if;

  select to_char(p.amount, 'FM999G999G990D00')
  into amount_text
  from public.payments p
  where p.id = new.payment_id;

  select p.full_name into uploader_name from public.profiles p where p.id = new.uploaded_by;

  perform private.notify_active_roles(
    array['owner'::public.app_role, 'admin'::public.app_role, 'manager'::public.app_role],
    'gcash_proof_needs_confirmation'::public.notification_type,
    'GCash proof needs confirmation',
    format('%s uploaded a GCash proof%s.', coalesce(uploader_name, 'Staff'), case when amount_text is null then '' else ' for PHP ' || amount_text end),
    'gcash_proofs',
    new.id,
    '/payments/gcash-review',
    jsonb_build_object(
      'payment_id', new.payment_id,
      'proof_status', new.proof_status,
      'uploaded_by', new.uploaded_by
    ),
    'gcash-proof:' || new.id::text || ':' || new.proof_status::text
  );

  return new;
end;
$$;

drop trigger if exists notify_gcash_proof_needs_confirmation on public.gcash_proofs;
create trigger notify_gcash_proof_needs_confirmation
after insert or update of proof_status on public.gcash_proofs
for each row execute function private.notify_gcash_proof_needs_confirmation();

create or replace function private.notify_unpaid_balance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  staff_recipients uuid[];
begin
  select array_remove(array_agg(distinct recipient_id), null)
  into staff_recipients
  from (
    values (new.created_by)
  ) as recipients(recipient_id);

  perform private.notify_active_roles(
    array['owner'::public.app_role, 'admin'::public.app_role, 'manager'::public.app_role],
    'unpaid_balance'::public.notification_type,
    'Unpaid balance recorded',
    format('%s has an unpaid balance of PHP %s.', coalesce(new.customer_name, 'A customer'), to_char(new.amount, 'FM999G999G990D00')),
    'walk_in_balances',
    new.id,
    '/balances',
    jsonb_build_object(
      'amount', new.amount,
      'customer_name', new.customer_name,
      'member_id', new.member_id,
      'shift_id', new.shift_id,
      'created_by', new.created_by
    ),
    'unpaid-balance:' || new.id::text
  );

  perform private.notify_profiles(
    staff_recipients,
    'unpaid_balance'::public.notification_type,
    'Unpaid balance recorded',
    format('%s has an unpaid balance of PHP %s.', coalesce(new.customer_name, 'A customer'), to_char(new.amount, 'FM999G999G990D00')),
    'walk_in_balances',
    new.id,
    '/balances',
    jsonb_build_object('amount', new.amount, 'shift_id', new.shift_id),
    'unpaid-balance-staff:' || new.id::text
  );

  return new;
end;
$$;

drop trigger if exists notify_unpaid_balance on public.walk_in_balances;
create trigger notify_unpaid_balance
after insert on public.walk_in_balances
for each row execute function private.notify_unpaid_balance();

create or replace function private.notify_cash_variance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  staff_recipient uuid;
begin
  if new.status <> 'closed'::public.shift_status
    or coalesce(new.cash_difference, 0) = 0
    or (tg_op = 'UPDATE' and old.status = new.status and old.cash_difference = new.cash_difference)
  then
    return new;
  end if;

  select sp.profile_id
  into staff_recipient
  from public.staff_profiles sp
  where sp.id = new.staff_profile_id;

  perform private.notify_active_roles(
    array['owner'::public.app_role, 'admin'::public.app_role, 'manager'::public.app_role],
    'cash_variance'::public.notification_type,
    'Cash variance needs review',
    format('Shift %s closed with a PHP %s cash variance.', left(new.id::text, 8), to_char(new.cash_difference, 'FM999G999G990D00')),
    'shifts',
    new.id,
    '/shifts',
    jsonb_build_object(
      'expected_cash', new.expected_cash,
      'actual_cash', new.actual_cash,
      'cash_difference', new.cash_difference,
      'closed_by', new.closed_by
    ),
    'cash-variance:' || new.id::text
  );

  perform private.notify_profiles(
    array[staff_recipient],
    'cash_variance'::public.notification_type,
    'Cash variance recorded',
    format('Your shift closed with a PHP %s cash variance.', to_char(new.cash_difference, 'FM999G999G990D00')),
    'shifts',
    new.id,
    '/shifts',
    jsonb_build_object('cash_difference', new.cash_difference),
    'cash-variance-staff:' || new.id::text
  );

  return new;
end;
$$;

drop trigger if exists notify_cash_variance on public.shifts;
create trigger notify_cash_variance
after update of status, cash_difference on public.shifts
for each row execute function private.notify_cash_variance();

create or replace function private.notify_member_check_in_blocked(
  p_member_id uuid,
  p_reason text,
  p_message text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_member record;
  actor_name text;
  notification_kind public.notification_type;
  title_text text;
begin
  select id, full_name, member_code, status
  into target_member
  from public.members
  where id = p_member_id;

  select full_name into actor_name from public.profiles where id = auth.uid();

  if p_reason = 'banned_member' then
    notification_kind := 'banned_member_check_in_attempt'::public.notification_type;
    title_text := 'Banned member check-in attempt';
  elsif p_reason in ('expired_or_missing_active_subscription', 'entry_limit_reached') then
    notification_kind := 'expired_member_entry_attempt'::public.notification_type;
    title_text := 'Expired member tried to enter';
  else
    return;
  end if;

  perform private.notify_active_roles(
    array['owner'::public.app_role, 'admin'::public.app_role, 'manager'::public.app_role],
    notification_kind,
    title_text,
    format('%s attempted check-in for %s. %s', coalesce(actor_name, 'Staff'), coalesce(target_member.full_name, 'Unknown member'), p_message),
    'members',
    p_member_id,
    case when p_member_id is null then '/front-desk' else '/members/' || p_member_id::text end,
    jsonb_build_object(
      'member_id', p_member_id,
      'member_code', target_member.member_code,
      'reason', p_reason,
      'attempted_by', auth.uid()
    ),
    notification_kind::text || ':' || coalesce(p_member_id::text, gen_random_uuid()::text) || ':' || to_char(now(), 'YYYYMMDDHH24MI')
  );
end;
$$;

create or replace function public.refresh_operational_notifications()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  stale_shift record;
  pending_count integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  if not private.is_management() then
    return jsonb_build_object('status', 'skipped');
  end if;

  for stale_shift in
    select
      s.id,
      s.opened_at,
      s.opened_by,
      p.full_name as staff_name
    from public.shifts s
    left join public.profiles p on p.id = s.opened_by
    where s.status = 'open'::public.shift_status
      and s.closed_at is null
      and s.opened_at < now() - interval '16 hours'
    order by s.opened_at asc
    limit 10
  loop
    perform private.notify_active_roles(
      array['owner'::public.app_role, 'admin'::public.app_role, 'manager'::public.app_role],
      'shift_not_closed'::public.notification_type,
      'Shift has not been closed',
      format('%s has an open shift from %s.', coalesce(stale_shift.staff_name, 'Staff'), to_char(stale_shift.opened_at at time zone 'Asia/Manila', 'Mon DD, HH12:MI AM')),
      'shifts',
      stale_shift.id,
      '/shifts',
      jsonb_build_object('opened_at', stale_shift.opened_at, 'opened_by', stale_shift.opened_by),
      'shift-not-closed:' || stale_shift.id::text
    );

    perform private.notify_profiles(
      array[stale_shift.opened_by],
      'shift_not_closed'::public.notification_type,
      'Close your open shift',
      'Your shift is still open and needs to be closed.',
      'shifts',
      stale_shift.id,
      '/shifts',
      jsonb_build_object('opened_at', stale_shift.opened_at),
      'shift-not-closed-staff:' || stale_shift.id::text
    );
  end loop;

  select count(*)
  into pending_count
  from public.walk_in_balances w
  where w.settled_at is null
    and coalesce(w.paid_amount, 0) < w.amount;

  if pending_count >= 10 then
    perform private.notify_active_roles(
      array['owner'::public.app_role, 'admin'::public.app_role, 'manager'::public.app_role],
      'high_pending_payments'::public.notification_type,
      'High number of pending payments',
      format('There are %s unpaid or partially paid balances waiting for follow-up.', pending_count),
      'walk_in_balances',
      null,
      '/balances',
      jsonb_build_object('pending_count', pending_count),
      'high-pending-payments'
    );
  end if;

  return jsonb_build_object('status', 'refreshed');
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
    perform private.notify_member_check_in_blocked(
      target_member.id,
      'banned_member',
      'Banned members cannot be checked in.'
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
    perform private.notify_member_check_in_blocked(
      target_member.id,
      'expired_or_missing_active_subscription',
      'This member is expired or has no active subscription.'
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
    perform private.notify_member_check_in_blocked(
      target_member.id,
      'entry_limit_reached',
      'This member has no remaining entries.'
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

grant execute on function public.refresh_operational_notifications() to authenticated;
grant execute on function public.create_member_check_in(uuid) to authenticated;

revoke execute on function private.notify_profiles(uuid[], public.notification_type, text, text, text, uuid, text, jsonb, text) from public, authenticated, anon;
revoke execute on function private.notify_active_roles(public.app_role[], public.notification_type, text, text, text, uuid, text, jsonb, text) from public, authenticated, anon;
revoke execute on function private.notify_member_check_in_blocked(uuid, text, text) from public, authenticated, anon;
