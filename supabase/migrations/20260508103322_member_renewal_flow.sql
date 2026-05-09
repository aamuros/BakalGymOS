begin;

create or replace function public.renew_member_subscription(
  p_member_id uuid,
  p_plan_id uuid,
  p_start_date date,
  p_payment_method text,
  p_gcash_reference_number text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  active_shift record;
  clean_reference text := nullif(btrim(p_gcash_reference_number), '');
  created_payment_id uuid;
  created_subscription_id uuid;
  duplicate_reference_count integer := 0;
  target_member record;
  target_plan record;
  subscription_end_date date;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  if not private.has_permission('record_payments') then
    raise exception 'This role is not allowed to record payments.';
  end if;

  if p_payment_method not in ('cash', 'gcash', 'other') then
    raise exception 'Invalid payment method.';
  end if;

  select id, full_name, status
  into target_member
  from public.members
  where id = p_member_id;

  if target_member.id is null then
    raise exception 'Member was not found.';
  end if;

  if target_member.status in ('banned', 'archived') then
    raise exception 'Banned or archived members must be restored before renewal.';
  end if;

  select id, name, duration_days, price
  into target_plan
  from public.membership_plans
  where id = p_plan_id
    and status = 'active';

  if target_plan.id is null then
    raise exception 'Choose an active membership plan.';
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
    raise exception 'Start an active shift before renewing a membership.';
  end if;

  if p_payment_method = 'cash' and not active_shift.can_accept_cash then
    raise exception 'This staff profile is not allowed to accept cash.';
  end if;

  if p_payment_method = 'gcash' and not active_shift.can_accept_gcash then
    raise exception 'This staff profile is not allowed to accept GCash.';
  end if;

  if clean_reference is not null then
    select count(*)
    into duplicate_reference_count
    from public.gcash_proofs
    where lower(gcash_reference_number) = lower(clean_reference);
  end if;

  subscription_end_date := p_start_date + (target_plan.duration_days - 1);

  insert into public.payments (
    member_id,
    shift_id,
    received_by,
    payment_type,
    purpose,
    amount,
    status,
    paid_at,
    reference_number,
    notes
  )
  values (
    target_member.id,
    active_shift.id,
    auth.uid(),
    p_payment_method::public.payment_type,
    'membership_renewal',
    target_plan.price,
    case
      when p_payment_method = 'gcash' and clean_reference is null then 'awaiting_proof'::public.payment_status
      when p_payment_method = 'gcash' then 'for_review'::public.payment_status
      else 'completed'::public.payment_status
    end,
    now(),
    case when p_payment_method = 'gcash' then clean_reference else null end,
    'Membership renewal: ' || target_plan.name
  )
  returning id into created_payment_id;

  insert into public.member_subscriptions (
    member_id,
    plan_id,
    starts_at,
    ends_at,
    status,
    entries_used,
    purchased_payment_id,
    created_by
  )
  values (
    target_member.id,
    target_plan.id,
    p_start_date,
    subscription_end_date,
    'active',
    0,
    created_payment_id,
    auth.uid()
  )
  returning id into created_subscription_id;

  if p_payment_method = 'cash' then
    update public.shifts
    set expected_cash = coalesce(expected_cash, opening_cash) + target_plan.price
    where id = active_shift.id;
  elsif p_payment_method = 'gcash' then
    insert into public.gcash_proofs (
      payment_id,
      uploaded_by,
      storage_path,
      file_name,
      gcash_reference_number,
      proof_status
    )
    values (
      created_payment_id,
      auth.uid(),
      'pending-proofs/' || created_payment_id::text,
      'Pending proof',
      clean_reference,
      case when clean_reference is null then 'awaiting_proof'::public.proof_status else 'for_review'::public.proof_status end
    );
  end if;

  return jsonb_build_object(
    'payment_id', created_payment_id,
    'subscription_id', created_subscription_id,
    'starts_at', p_start_date,
    'ends_at', subscription_end_date,
    'duplicate_reference_count', duplicate_reference_count
  );
end;
$$;

grant execute on function public.renew_member_subscription(uuid, uuid, date, text, text) to authenticated;

commit;
