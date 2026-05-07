begin;

create or replace function private.staff_pin_has_permission(
  p_role public.app_role,
  p_permission_key text
)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    p_role in ('owner', 'admin')
    or exists (
      select 1
      from public.role_permissions rp
      where rp.role = p_role
        and rp.permission_key = p_permission_key
        and rp.enabled
    ),
    false
  )
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

  select s.id
  into active_shift
  from public.shifts s
  join public.staff_profiles sp on sp.id = s.staff_profile_id
  where sp.profile_id = auth.uid()
    and sp.status = 'active'
    and s.opened_by = auth.uid()
    and s.status = 'open'
    and s.closed_at is null
  order by s.opened_at desc
  limit 1
  for update of s;

  if active_shift.id is null then
    raise exception 'Start an active shift before checking in members.';
  end if;

  select m.id, m.full_name, m.member_code, m.status
  into target_member
  from public.members m
  where m.id = p_member_id
  for update;

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
  limit 1
  for update of ms;

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

create or replace function public.create_staff_pin_member_check_in(
  p_actor_id uuid,
  p_staff_profile_id uuid,
  p_member_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  active_shift record;
  target_staff record;
  target_member record;
  active_subscription record;
  created_entry_id uuid;
begin
  select sp.id, sp.profile_id, sp.status, p.role, p.status as profile_status
  into target_staff
  from public.staff_profiles sp
  join public.profiles p on p.id = sp.profile_id
  where sp.id = p_staff_profile_id
    and sp.profile_id = p_actor_id;

  if target_staff.id is null
    or target_staff.status <> 'active'::public.staff_status
    or target_staff.profile_status <> 'active'::public.profile_status
    or target_staff.role not in ('owner', 'admin', 'manager', 'front_desk')
  then
    raise exception 'Staff PIN session is not active.';
  end if;

  select s.id
  into active_shift
  from public.shifts s
  where s.staff_profile_id = target_staff.id
    and s.opened_by = p_actor_id
    and s.status = 'open'
    and s.closed_at is null
  order by s.opened_at desc
  limit 1
  for update of s;

  if active_shift.id is null then
    raise exception 'Start an active shift before checking in members.';
  end if;

  select m.id, m.full_name, m.member_code, m.status
  into target_member
  from public.members m
  where m.id = p_member_id
  for update;

  if target_member.id is null then
    insert into public.audit_logs (actor_id, action, action_type, entity_table, entity_type, entity_id, new_data)
    values (
      p_actor_id,
      'staff_pin_member_check_in_blocked',
      'staff_pin_member_check_in_blocked',
      'members',
      'members',
      p_member_id,
      jsonb_build_object('result', 'blocked', 'reason', 'member_not_found')
    );

    return jsonb_build_object(
      'status', 'blocked',
      'reason', 'member_not_found',
      'message', 'Member was not found.'
    );
  end if;

  if target_member.status = 'banned' then
    insert into public.audit_logs (actor_id, action, action_type, entity_table, entity_type, entity_id, new_data)
    values (
      p_actor_id,
      'staff_pin_member_check_in_blocked',
      'staff_pin_member_check_in_blocked',
      'members',
      'members',
      target_member.id,
      jsonb_build_object('result', 'blocked', 'reason', 'banned_member')
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
  limit 1
  for update of ms;

  if active_subscription.id is null then
    insert into public.audit_logs (actor_id, action, action_type, entity_table, entity_type, entity_id, new_data)
    values (
      p_actor_id,
      'staff_pin_member_check_in_blocked',
      'staff_pin_member_check_in_blocked',
      'members',
      'members',
      target_member.id,
      jsonb_build_object('result', 'blocked', 'reason', 'expired_or_missing_active_subscription')
    );

    perform private.notify_member_check_in_blocked(
      target_member.id,
      'expired_or_missing_active_subscription',
      'This member is expired or has no active subscription.'
    );

    return jsonb_build_object(
      'status', 'blocked',
      'reason', 'expired_or_missing_active_subscription',
      'message', 'This member is expired. Choose Pay Walk-In, Record Utang, or Owner Override.'
    );
  end if;

  if not active_subscription.is_unlimited
    and active_subscription.entries_used >= active_subscription.entry_limit
  then
    insert into public.audit_logs (actor_id, action, action_type, entity_table, entity_type, entity_id, new_data)
    values (
      p_actor_id,
      'staff_pin_member_check_in_blocked',
      'staff_pin_member_check_in_blocked',
      'members',
      'members',
      target_member.id,
      jsonb_build_object('result', 'blocked', 'reason', 'entry_limit_reached')
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
    p_actor_id,
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

  insert into public.audit_logs (
    actor_id,
    action,
    action_type,
    entity_table,
    entity_type,
    entity_id,
    new_data
  )
  values (
    p_actor_id,
    'staff_pin_member_check_in_created',
    'staff_pin_member_check_in_created',
    'members',
    'members',
    target_member.id,
    jsonb_build_object(
      'entry_id', created_entry_id,
      'member_id', target_member.id,
      'shift_id', active_shift.id,
      'staff_profile_id', target_staff.id
    )
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

create or replace function public.create_staff_pin_walk_in(
  p_actor_id uuid,
  p_staff_profile_id uuid,
  p_customer_name text,
  p_amount numeric,
  p_payment_method text,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  active_shift record;
  target_staff record;
  clean_customer_name text := nullif(btrim(p_customer_name), '');
  clean_note text := nullif(btrim(p_note), '');
  created_entry_id uuid;
  created_payment_id uuid;
  created_balance_id uuid;
  created_proof_id uuid;
  entry_status public.entry_status;
  settlement public.entry_settlement_type;
begin
  select
    sp.id,
    sp.profile_id,
    sp.status,
    sp.can_accept_cash,
    sp.can_accept_gcash,
    p.role,
    p.status as profile_status
  into target_staff
  from public.staff_profiles sp
  join public.profiles p on p.id = sp.profile_id
  where sp.id = p_staff_profile_id
    and sp.profile_id = p_actor_id;

  if target_staff.id is null
    or target_staff.status <> 'active'::public.staff_status
    or target_staff.profile_status <> 'active'::public.profile_status
    or not private.staff_pin_has_permission(target_staff.role, 'record_payments')
  then
    raise exception 'This role is not allowed to record payments.';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be greater than zero.';
  end if;

  if p_payment_method not in ('cash', 'gcash', 'pending') then
    raise exception 'Invalid payment method.';
  end if;

  select s.id, s.opening_cash, s.expected_cash
  into active_shift
  from public.shifts s
  where s.staff_profile_id = target_staff.id
    and s.opened_by = p_actor_id
    and s.status = 'open'
    and s.closed_at is null
  order by s.opened_at desc
  limit 1
  for update of s;

  if active_shift.id is null then
    raise exception 'Start an active shift before recording a walk-in.';
  end if;

  if p_payment_method = 'cash' and not target_staff.can_accept_cash then
    raise exception 'This staff profile is not allowed to accept cash.';
  end if;

  if p_payment_method = 'gcash' and not target_staff.can_accept_gcash then
    raise exception 'This staff profile is not allowed to accept GCash.';
  end if;

  settlement := p_payment_method::public.entry_settlement_type;
  entry_status := case p_payment_method
    when 'cash' then 'settled'::public.entry_status
    when 'gcash' then 'gcash_pending_review'::public.entry_status
    else 'pending'::public.entry_status
  end;

  if p_payment_method in ('cash', 'gcash') then
    insert into public.payments (
      shift_id,
      received_by,
      payment_type,
      purpose,
      amount,
      status,
      paid_at,
      notes
    )
    values (
      active_shift.id,
      p_actor_id,
      p_payment_method::public.payment_type,
      'walk_in_entry',
      p_amount,
      case
        when p_payment_method = 'gcash' then 'pending_proof'::public.payment_status
        else 'completed'::public.payment_status
      end,
      now(),
      clean_note
    )
    returning id into created_payment_id;
  end if;

  insert into public.entries (
    guest_name,
    checked_in_by,
    shift_id,
    settlement_type,
    payment_id,
    status,
    notes
  )
  values (
    clean_customer_name,
    p_actor_id,
    active_shift.id,
    settlement,
    created_payment_id,
    entry_status,
    clean_note
  )
  returning id into created_entry_id;

  if p_payment_method = 'cash' then
    update public.shifts
    set expected_cash = coalesce(expected_cash, opening_cash) + p_amount
    where id = active_shift.id;
  elsif p_payment_method = 'gcash' then
    insert into public.gcash_proofs (
      payment_id,
      uploaded_by,
      storage_path,
      file_name,
      proof_status
    )
    values (
      created_payment_id,
      p_actor_id,
      'pending-proofs/' || created_payment_id::text,
      'Pending proof',
      'pending_proof'
    )
    returning id into created_proof_id;
  else
    insert into public.walk_in_balances (
      entry_id,
      shift_id,
      customer_name,
      amount,
      note,
      created_by
    )
    values (
      created_entry_id,
      active_shift.id,
      clean_customer_name,
      p_amount,
      clean_note,
      p_actor_id
    )
    returning id into created_balance_id;
  end if;

  insert into public.audit_logs (
    actor_id,
    action,
    action_type,
    entity_table,
    entity_type,
    entity_id,
    new_data
  )
  values (
    p_actor_id,
    'staff_pin_walk_in_created',
    'staff_pin_walk_in_created',
    'entries',
    'entries',
    created_entry_id,
    jsonb_build_object(
      'entry_id', created_entry_id,
      'payment_id', created_payment_id,
      'balance_id', created_balance_id,
      'gcash_proof_id', created_proof_id,
      'shift_id', active_shift.id,
      'staff_profile_id', target_staff.id
    )
  );

  return jsonb_build_object(
    'entry_id', created_entry_id,
    'payment_id', created_payment_id,
    'balance_id', created_balance_id,
    'gcash_proof_id', created_proof_id,
    'entry_status', entry_status
  );
end;
$$;

create or replace function public.handle_staff_pin_expired_member_entry(
  p_actor_id uuid,
  p_staff_profile_id uuid,
  p_member_id uuid,
  p_action_type text,
  p_amount numeric,
  p_payment_method text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  active_shift record;
  target_staff record;
  target_member record;
  current_subscription record;
  clean_reason text := nullif(btrim(p_reason), '');
  created_entry_id uuid;
  created_payment_id uuid;
  created_balance_id uuid;
  created_exception_id uuid;
begin
  select
    sp.id,
    sp.profile_id,
    sp.status,
    sp.can_accept_cash,
    sp.can_accept_gcash,
    p.role,
    p.status as profile_status
  into target_staff
  from public.staff_profiles sp
  join public.profiles p on p.id = sp.profile_id
  where sp.id = p_staff_profile_id
    and sp.profile_id = p_actor_id;

  if target_staff.id is null
    or target_staff.status <> 'active'::public.staff_status
    or target_staff.profile_status <> 'active'::public.profile_status
    or target_staff.role not in ('owner', 'admin', 'manager', 'front_desk')
  then
    raise exception 'Staff PIN session is not active.';
  end if;

  if p_action_type not in ('pay_walk_in', 'record_utang', 'owner_override') then
    raise exception 'Choose a valid expired member action.';
  end if;

  select s.id, s.opening_cash, s.expected_cash
  into active_shift
  from public.shifts s
  where s.staff_profile_id = target_staff.id
    and s.opened_by = p_actor_id
    and s.status = 'open'
    and s.closed_at is null
  order by s.opened_at desc
  limit 1
  for update of s;

  if active_shift.id is null then
    raise exception 'Start an active shift before handling expired member entry.';
  end if;

  select m.id, m.full_name, m.member_code, m.status
  into target_member
  from public.members m
  where m.id = p_member_id
  for update;

  if target_member.id is null then
    raise exception 'Member was not found.';
  end if;

  if target_member.status = 'banned' then
    perform private.notify_member_check_in_blocked(
      target_member.id,
      'banned_member',
      'Banned members cannot be checked in or overridden at the front desk.'
    );
    raise exception 'Banned members cannot be checked in or overridden at the front desk.';
  end if;

  if target_member.status not in ('active'::public.member_status, 'inactive'::public.member_status) then
    raise exception 'Only active or inactive member records can use this workflow.';
  end if;

  select
    ms.id,
    ms.entries_used,
    mp.entry_limit,
    mp.is_unlimited
  into current_subscription
  from public.member_subscriptions ms
  join public.membership_plans mp on mp.id = ms.plan_id
  where ms.member_id = target_member.id
    and ms.status = 'active'
    and ms.starts_at <= current_date
    and ms.ends_at >= current_date
  order by ms.ends_at desc
  limit 1
  for update of ms;

  if current_subscription.id is not null
    and (
      current_subscription.is_unlimited
      or current_subscription.entries_used < current_subscription.entry_limit
    )
  then
    raise exception 'This member has an active membership. Use regular member check-in.';
  end if;

  if p_action_type in ('pay_walk_in', 'record_utang') and (p_amount is null or p_amount <= 0) then
    raise exception 'Amount must be greater than zero.';
  end if;

  if p_action_type in ('record_utang', 'owner_override') and clean_reason is null then
    raise exception 'A reason is required for utang and owner override.';
  end if;

  if p_action_type = 'pay_walk_in' then
    if p_payment_method not in ('cash', 'gcash', 'other') then
      raise exception 'Choose a valid payment method.';
    end if;

    if p_payment_method = 'cash' and not target_staff.can_accept_cash then
      raise exception 'This staff profile is not allowed to accept cash.';
    end if;

    if p_payment_method = 'gcash' and not target_staff.can_accept_gcash then
      raise exception 'This staff profile is not allowed to accept GCash.';
    end if;

    insert into public.payments (
      member_id,
      shift_id,
      received_by,
      payment_type,
      purpose,
      amount,
      status,
      paid_at,
      notes
    )
    values (
      target_member.id,
      active_shift.id,
      p_actor_id,
      p_payment_method::public.payment_type,
      'walk_in_entry',
      p_amount,
      case
        when p_payment_method = 'gcash' then 'pending_proof'::public.payment_status
        else 'completed'::public.payment_status
      end,
      now(),
      coalesce(clean_reason, 'Expired member walk-in payment')
    )
    returning id into created_payment_id;

    insert into public.entries (
      member_id,
      checked_in_by,
      shift_id,
      settlement_type,
      payment_id,
      status,
      notes
    )
    values (
      target_member.id,
      p_actor_id,
      active_shift.id,
      case
        when p_payment_method = 'gcash' then 'gcash'::public.entry_settlement_type
        else 'cash'::public.entry_settlement_type
      end,
      created_payment_id,
      case
        when p_payment_method = 'gcash' then 'gcash_pending_review'::public.entry_status
        else 'settled'::public.entry_status
      end,
      coalesce(clean_reason, 'Expired member paid walk-in')
    )
    returning id into created_entry_id;

    if p_payment_method = 'cash' then
      update public.shifts
      set expected_cash = coalesce(expected_cash, opening_cash) + p_amount
      where id = active_shift.id;
    elsif p_payment_method = 'gcash' then
      insert into public.gcash_proofs (
        payment_id,
        uploaded_by,
        storage_path,
        file_name,
        proof_status
      )
      values (
        created_payment_id,
        p_actor_id,
        'pending-proofs/' || created_payment_id::text,
        'Pending proof',
        'pending_proof'
      );
    end if;
  elsif p_action_type = 'record_utang' then
    insert into public.entries (
      member_id,
      checked_in_by,
      shift_id,
      settlement_type,
      status,
      notes
    )
    values (
      target_member.id,
      p_actor_id,
      active_shift.id,
      'pending'::public.entry_settlement_type,
      'pending'::public.entry_status,
      clean_reason
    )
    returning id into created_entry_id;

    insert into public.walk_in_balances (
      entry_id,
      shift_id,
      member_id,
      customer_name,
      amount,
      note,
      created_by
    )
    values (
      created_entry_id,
      active_shift.id,
      target_member.id,
      target_member.full_name,
      p_amount,
      clean_reason,
      p_actor_id
    )
    returning id into created_balance_id;
  else
    insert into public.exceptions (
      member_id,
      exception_type,
      reason,
      created_by,
      shift_id,
      staff_profile_id,
      status
    )
    values (
      target_member.id,
      'owner_approved_free_entry',
      clean_reason,
      p_actor_id,
      active_shift.id,
      target_staff.id,
      'pending'
    )
    returning id into created_exception_id;

    insert into public.entries (
      member_id,
      checked_in_by,
      shift_id,
      settlement_type,
      exception_id,
      status,
      notes
    )
    values (
      target_member.id,
      p_actor_id,
      active_shift.id,
      'exception'::public.entry_settlement_type,
      created_exception_id,
      'needs_review'::public.entry_status,
      clean_reason
    )
    returning id into created_entry_id;

    update public.exceptions
    set entry_id = created_entry_id
    where id = created_exception_id;
  end if;

  insert into public.audit_logs (
    actor_id,
    action,
    action_type,
    entity_table,
    entity_type,
    entity_id,
    new_data
  )
  values (
    p_actor_id,
    'staff_pin_expired_member_' || p_action_type,
    'staff_pin_expired_member_' || p_action_type,
    'members',
    'members',
    target_member.id,
    jsonb_build_object(
      'balance_id', created_balance_id,
      'entry_id', created_entry_id,
      'exception_id', created_exception_id,
      'member_id', target_member.id,
      'payment_id', created_payment_id,
      'shift_id', active_shift.id,
      'staff_profile_id', target_staff.id
    )
  );

  return jsonb_build_object(
    'status', 'created',
    'action_type', p_action_type,
    'entry_id', created_entry_id,
    'payment_id', created_payment_id,
    'balance_id', created_balance_id,
    'exception_id', created_exception_id,
    'member_id', target_member.id,
    'shift_id', active_shift.id
  );
end;
$$;

create or replace function public.mark_staff_pin_gcash_proof_uploaded(
  p_actor_id uuid,
  p_staff_profile_id uuid,
  p_proof_id uuid,
  p_storage_path text,
  p_file_name text,
  p_mime_type text,
  p_file_size bigint,
  p_gcash_reference_number text,
  p_sender_name text,
  p_sender_mobile text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_staff record;
  target_proof record;
  clean_reference text := nullif(btrim(p_gcash_reference_number), '');
  clean_sender_name text := nullif(btrim(p_sender_name), '');
  clean_sender_mobile text := nullif(btrim(p_sender_mobile), '');
begin
  select sp.id, sp.profile_id, sp.status, p.role, p.status as profile_status
  into target_staff
  from public.staff_profiles sp
  join public.profiles p on p.id = sp.profile_id
  where sp.id = p_staff_profile_id
    and sp.profile_id = p_actor_id;

  if target_staff.id is null
    or target_staff.status <> 'active'::public.staff_status
    or target_staff.profile_status <> 'active'::public.profile_status
    or target_staff.role not in ('owner', 'admin', 'manager', 'front_desk')
  then
    raise exception 'Staff PIN session is not active.';
  end if;

  if p_storage_path is null or btrim(p_storage_path) = '' then
    raise exception 'Proof storage path is required.';
  end if;

  if p_mime_type not in ('image/jpeg', 'image/png', 'image/webp') then
    raise exception 'Upload a JPEG, PNG, or WebP image.';
  end if;

  if p_file_size is null or p_file_size <= 0 or p_file_size > 5242880 then
    raise exception 'Proof image must be 5 MB or smaller.';
  end if;

  select gp.id, gp.payment_id, gp.uploaded_by, gp.proof_status, p.payment_type
  into target_proof
  from public.gcash_proofs gp
  join public.payments p on p.id = gp.payment_id
  where gp.id = p_proof_id
  for update of gp, p;

  if target_proof.id is null then
    raise exception 'GCash proof was not found.';
  end if;

  if target_proof.payment_type <> 'gcash'::public.payment_type then
    raise exception 'Proof can only be attached to a GCash payment.';
  end if;

  if target_proof.uploaded_by is distinct from p_actor_id then
    raise exception 'This proof is not assigned to your staff profile.';
  end if;

  if target_proof.proof_status not in ('pending_proof', 'needs_follow_up', 'disputed') then
    raise exception 'This GCash proof is not waiting for upload.';
  end if;

  update public.gcash_proofs
  set
    storage_path = p_storage_path,
    file_name = nullif(btrim(p_file_name), ''),
    mime_type = p_mime_type,
    file_size = p_file_size,
    gcash_reference_number = clean_reference,
    sender_name = clean_sender_name,
    sender_mobile = clean_sender_mobile,
    proof_status = 'staff_checked',
    reviewed_by = null,
    reviewed_at = null,
    rejection_reason = null
  where id = target_proof.id;

  update public.payments
  set status = 'staff_checked'
  where id = target_proof.payment_id
    and payment_type = 'gcash'::public.payment_type;

  insert into public.audit_logs (
    actor_id,
    action,
    action_type,
    entity_table,
    entity_type,
    entity_id,
    new_data
  )
  values (
    p_actor_id,
    'staff_pin_gcash_proof_uploaded',
    'staff_pin_gcash_proof_uploaded',
    'gcash_proofs',
    'gcash_proofs',
    target_proof.id,
    jsonb_build_object(
      'payment_id', target_proof.payment_id,
      'proof_id', target_proof.id,
      'storage_path', p_storage_path,
      'file_name', p_file_name,
      'mime_type', p_mime_type,
      'file_size', p_file_size,
      'gcash_reference_number', clean_reference,
      'sender_name', clean_sender_name,
      'sender_mobile', clean_sender_mobile,
      'staff_profile_id', target_staff.id
    )
  );

  return jsonb_build_object('status', 'staff_checked', 'proof_id', target_proof.id);
end;
$$;

create or replace function public.close_staff_pin_shift_reconciliation(
  p_actor_id uuid,
  p_staff_profile_id uuid,
  p_shift_id uuid,
  p_actual_cash numeric,
  p_notes text,
  p_variance_note text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_shift record;
  actual_cash_value numeric(12,2);
  clean_notes text := nullif(btrim(p_notes), '');
  clean_variance_note text := nullif(btrim(p_variance_note), '');
  cash_sales_value numeric(12,2);
  cash_expenses_value numeric(12,2);
  owner_pickups_value numeric(12,2);
  cash_adjustments_value numeric(12,2);
  expected_cash_value numeric(12,2);
  variance_value numeric(12,2);
begin
  if p_actual_cash is null or p_actual_cash < 0 then
    raise exception 'Actual cash must be zero or greater.';
  end if;

  actual_cash_value := round(p_actual_cash, 2);

  select
    s.id,
    s.staff_profile_id,
    s.opened_by,
    s.opening_cash,
    s.status,
    s.closed_at,
    sp.profile_id as assigned_profile_id,
    sp.can_close_shift,
    sp.status as staff_status,
    p.status as profile_status
  into target_shift
  from public.shifts s
  join public.staff_profiles sp on sp.id = s.staff_profile_id
  join public.profiles p on p.id = sp.profile_id
  where s.id = p_shift_id
  for update of s;

  if target_shift.id is null then
    raise exception 'Shift was not found.';
  end if;

  if target_shift.staff_profile_id <> p_staff_profile_id
    or target_shift.assigned_profile_id <> p_actor_id
    or target_shift.opened_by <> p_actor_id
    or target_shift.staff_status <> 'active'::public.staff_status
    or target_shift.profile_status <> 'active'::public.profile_status
  then
    raise exception 'Only the assigned staff member can close this shift in PIN mode.';
  end if;

  if not target_shift.can_close_shift then
    raise exception 'Your staff profile is not allowed to close shifts.';
  end if;

  if target_shift.status <> 'open'::public.shift_status or target_shift.closed_at is not null then
    raise exception 'Only an active shift can be closed.';
  end if;

  select coalesce(sum(p.amount), 0)::numeric(12,2)
  into cash_sales_value
  from public.payments p
  where p.shift_id = target_shift.id
    and p.payment_type = 'cash'::public.payment_type
    and p.status = 'completed'::public.payment_status;

  select
    coalesce(sum(case when cm.movement_type = 'cash_out' and cm.category = 'expense' then cm.amount else 0 end), 0)::numeric(12,2),
    coalesce(sum(case when cm.movement_type = 'cash_out' and cm.category = 'owner_pickup' then cm.amount else 0 end), 0)::numeric(12,2),
    coalesce(sum(case when cm.movement_type = 'cash_in' then cm.amount else 0 end), 0)::numeric(12,2)
  into cash_expenses_value, owner_pickups_value, cash_adjustments_value
  from public.cash_movements cm
  where cm.shift_id = target_shift.id
    and cm.status = 'approved'::public.review_status;

  expected_cash_value :=
    target_shift.opening_cash
    + cash_sales_value
    + cash_adjustments_value
    - cash_expenses_value
    - owner_pickups_value;
  variance_value := actual_cash_value - expected_cash_value;

  if variance_value <> 0 and clean_variance_note is null then
    raise exception 'Variance explanation is required when variance is not zero.';
  end if;

  update public.shifts
  set
    closed_by = p_actor_id,
    closed_at = now(),
    expected_cash = expected_cash_value,
    actual_cash = actual_cash_value,
    cash_difference = variance_value,
    cash_sales = cash_sales_value,
    cash_expenses = cash_expenses_value,
    owner_cash_pickups = owner_pickups_value,
    cash_adjustments = cash_adjustments_value,
    closing_note = clean_notes,
    variance_note = clean_variance_note,
    status = 'closed'::public.shift_status
  where id = target_shift.id;

  insert into public.audit_logs (
    actor_id,
    action,
    action_type,
    entity_table,
    entity_type,
    entity_id,
    old_data,
    new_data
  )
  values (
    p_actor_id,
    'staff_pin_shift_closed',
    'staff_pin_shift_closed',
    'shifts',
    'shifts',
    target_shift.id,
    jsonb_build_object(
      'status', target_shift.status,
      'closed_at', target_shift.closed_at
    ),
    jsonb_build_object(
      'status', 'closed',
      'starting_cash', target_shift.opening_cash,
      'cash_sales', cash_sales_value,
      'cash_expenses', cash_expenses_value,
      'owner_cash_pickups', owner_pickups_value,
      'cash_adjustments', cash_adjustments_value,
      'expected_cash', expected_cash_value,
      'actual_cash', actual_cash_value,
      'variance', variance_value,
      'notes', clean_notes,
      'variance_note', clean_variance_note,
      'staff_profile_id', p_staff_profile_id
    )
  );

  if variance_value <> 0 then
    insert into public.notifications (
      recipient_id,
      notification_type,
      title,
      body,
      entity_table,
      entity_id
    )
    select
      p.id,
      'shift_discrepancy'::public.notification_type,
      'Shift variance needs review',
      format('Shift %s closed with a cash variance of %s.', target_shift.id, variance_value),
      'shifts',
      target_shift.id
    from public.profiles p
    where p.status = 'active'
      and p.role in ('owner', 'admin');
  end if;

  return jsonb_build_object(
    'shift_id', target_shift.id,
    'starting_cash', target_shift.opening_cash,
    'cash_sales', cash_sales_value,
    'expenses', cash_expenses_value,
    'owner_cash_pickup', owner_pickups_value,
    'cash_adjustments', cash_adjustments_value,
    'expected_cash', expected_cash_value,
    'actual_cash', actual_cash_value,
    'variance', variance_value
  );
end;
$$;

revoke execute on function private.staff_pin_has_permission(public.app_role, text) from public, authenticated, anon;

revoke execute on function public.create_staff_pin_member_check_in(uuid, uuid, uuid) from public, authenticated, anon;
revoke execute on function public.create_staff_pin_walk_in(uuid, uuid, text, numeric, text, text) from public, authenticated, anon;
revoke execute on function public.handle_staff_pin_expired_member_entry(uuid, uuid, uuid, text, numeric, text, text) from public, authenticated, anon;
revoke execute on function public.mark_staff_pin_gcash_proof_uploaded(uuid, uuid, uuid, text, text, text, bigint, text, text, text) from public, authenticated, anon;
revoke execute on function public.close_staff_pin_shift_reconciliation(uuid, uuid, uuid, numeric, text, text) from public, authenticated, anon;

grant execute on function public.create_member_check_in(uuid) to authenticated;
grant execute on function public.create_staff_pin_member_check_in(uuid, uuid, uuid) to service_role;
grant execute on function public.create_staff_pin_walk_in(uuid, uuid, text, numeric, text, text) to service_role;
grant execute on function public.handle_staff_pin_expired_member_entry(uuid, uuid, uuid, text, numeric, text, text) to service_role;
grant execute on function public.mark_staff_pin_gcash_proof_uploaded(uuid, uuid, uuid, text, text, text, bigint, text, text, text) to service_role;
grant execute on function public.close_staff_pin_shift_reconciliation(uuid, uuid, uuid, numeric, text, text) to service_role;

commit;
