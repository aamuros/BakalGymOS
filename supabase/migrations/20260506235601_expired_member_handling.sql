alter type public.entry_status add value if not exists 'needs_review';

alter table public.walk_in_balances
  add column if not exists member_id uuid references public.members(id) on delete set null;

create index if not exists walk_in_balances_member_id_idx on public.walk_in_balances(member_id);

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

create or replace function private.log_expired_member_entry_action(
  p_member_id uuid,
  p_action_type text,
  p_result text,
  p_reason text,
  p_entry_id uuid,
  p_payment_id uuid,
  p_balance_id uuid,
  p_exception_id uuid,
  p_shift_id uuid
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
    'expired_member_entry_' || p_action_type,
    'members',
    p_member_id,
    jsonb_build_object(
      'result', p_result,
      'reason', p_reason,
      'entry_id', p_entry_id,
      'payment_id', p_payment_id,
      'balance_id', p_balance_id,
      'exception_id', p_exception_id,
      'shift_id', p_shift_id,
      'staff_id', auth.uid(),
      'recorded_at', now()
    )
  );
end;
$$;

create or replace function public.handle_expired_member_entry(
  p_member_id uuid,
  p_action_type text,
  p_amount numeric,
  p_payment_method text,
  p_reason text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  active_shift record;
  target_member record;
  current_subscription record;
  clean_reason text := nullif(btrim(p_reason), '');
  created_entry_id uuid;
  created_payment_id uuid;
  created_balance_id uuid;
  created_exception_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  if not private.is_front_desk_or_management() then
    raise exception 'You do not have permission to handle expired member entries.';
  end if;

  if p_action_type not in ('pay_walk_in', 'record_utang', 'owner_override') then
    raise exception 'Choose a valid expired member action.';
  end if;

  select
    s.id,
    s.opening_cash,
    s.expected_cash,
    sp.can_accept_cash,
    sp.can_accept_gcash
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
    raise exception 'Start an active shift before handling expired member entry.';
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
    raise exception 'Member was not found.';
  end if;

  if target_member.status = 'banned' then
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
  limit 1;

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

    if p_payment_method = 'cash' and not active_shift.can_accept_cash then
      raise exception 'This staff profile is not allowed to accept cash.';
    end if;

    if p_payment_method = 'gcash' and not active_shift.can_accept_gcash then
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
      auth.uid(),
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
      auth.uid(),
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
        auth.uid(),
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
      auth.uid(),
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
      auth.uid()
    )
    returning id into created_balance_id;
  else
    insert into public.exceptions (
      member_id,
      exception_type,
      reason,
      created_by,
      status
    )
    values (
      target_member.id,
      'owner_approved_free_entry',
      clean_reason,
      auth.uid(),
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
      auth.uid(),
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

  perform private.log_expired_member_entry_action(
    target_member.id,
    p_action_type,
    'created',
    coalesce(clean_reason, p_action_type),
    created_entry_id,
    created_payment_id,
    created_balance_id,
    created_exception_id,
    active_shift.id
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

grant execute on function public.handle_expired_member_entry(uuid, text, numeric, text, text) to authenticated;
