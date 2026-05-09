create or replace function public.create_walk_in(
  p_customer_name text,
  p_amount numeric,
  p_payment_method text,
  p_note text,
  p_gcash_reference_number text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  active_shift record;
  clean_customer_name text := nullif(btrim(p_customer_name), '');
  clean_note text := nullif(btrim(p_note), '');
  clean_reference text := nullif(btrim(p_gcash_reference_number), '');
  created_entry_id uuid;
  created_payment_id uuid;
  created_balance_id uuid;
  created_proof_id uuid;
  duplicate_reference_count integer := 0;
  existing_unpaid_balance_count integer := 0;
  existing_unpaid_balance_amount numeric(12,2) := 0;
  entry_status public.entry_status;
  gcash_review_status public.proof_status;
  settlement public.entry_settlement_type;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be greater than zero.';
  end if;

  if p_payment_method not in ('cash', 'gcash', 'pending') then
    raise exception 'Invalid payment method.';
  end if;

  if p_payment_method = 'pending' and clean_customer_name is null then
    raise exception 'Customer name is required for utang.';
  end if;

  if p_payment_method = 'pending' and clean_note is null then
    raise exception 'Reason is required for utang.';
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
    raise exception 'Start an active shift before recording a walk-in.';
  end if;

  if p_payment_method = 'cash' and not active_shift.can_accept_cash then
    raise exception 'This staff profile is not allowed to accept cash.';
  end if;

  if p_payment_method = 'gcash' and not active_shift.can_accept_gcash then
    raise exception 'This staff profile is not allowed to accept GCash.';
  end if;

  settlement := p_payment_method::public.entry_settlement_type;
  entry_status := case p_payment_method
    when 'cash' then 'settled'::public.entry_status
    when 'gcash' then 'gcash_pending_review'::public.entry_status
    else 'pending'::public.entry_status
  end;
  gcash_review_status := case
    when p_payment_method = 'gcash' and clean_reference is not null then 'for_review'::public.proof_status
    else 'awaiting_proof'::public.proof_status
  end;

  if clean_reference is not null then
    select count(*)
    into duplicate_reference_count
    from public.gcash_proofs
    where lower(gcash_reference_number) = lower(clean_reference);
  end if;

  if p_payment_method = 'pending' then
    select
      count(*),
      coalesce(sum(greatest(amount - coalesce(paid_amount, 0), 0)), 0)
    into existing_unpaid_balance_count, existing_unpaid_balance_amount
    from public.walk_in_balances
    where lower(customer_name) = lower(clean_customer_name)
      and settled_at is null
      and greatest(amount - coalesce(paid_amount, 0), 0) > 0;
  end if;

  if p_payment_method in ('cash', 'gcash') then
    insert into public.payments (
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
      active_shift.id,
      auth.uid(),
      p_payment_method::public.payment_type,
      'walk_in_entry',
      p_amount,
      case
        when p_payment_method = 'gcash' then gcash_review_status::text::public.payment_status
        else 'completed'::public.payment_status
      end,
      now(),
      case when p_payment_method = 'gcash' then clean_reference else null end,
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
    auth.uid(),
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
      gcash_reference_number,
      proof_status
    )
    values (
      created_payment_id,
      auth.uid(),
      'pending-proofs/' || created_payment_id::text,
      'Pending proof',
      clean_reference,
      gcash_review_status
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
      auth.uid()
    )
    returning id into created_balance_id;
  end if;

  return jsonb_build_object(
    'entry_id', created_entry_id,
    'payment_id', created_payment_id,
    'balance_id', created_balance_id,
    'gcash_proof_id', created_proof_id,
    'entry_status', entry_status,
    'duplicate_reference_count', duplicate_reference_count,
    'existing_unpaid_balance_count', existing_unpaid_balance_count,
    'existing_unpaid_balance_amount', existing_unpaid_balance_amount
  );
end;
$$;

grant execute on function public.create_walk_in(text, numeric, text, text, text) to authenticated;

create or replace function private.record_balance_payment(
  p_balance_id uuid,
  p_payment_mode text,
  p_payment_method text,
  p_amount numeric,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  active_shift record;
  actor_role public.app_role;
  balance_row record;
  clean_note text := nullif(btrim(p_note), '');
  payment_amount numeric(12,2);
  remaining_before numeric(12,2);
  remaining_after numeric(12,2);
  previous_status text;
  new_status text;
  created_payment_id uuid;
  settled_now boolean;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  actor_role := private.current_app_role();

  if actor_role not in ('owner', 'admin', 'manager', 'accountant', 'front_desk') then
    raise exception 'You do not have permission to record balance payments.';
  end if;

  if p_payment_mode not in ('full', 'partial') then
    raise exception 'Choose a valid payment mode.';
  end if;

  if p_payment_method not in ('cash', 'gcash', 'other') then
    raise exception 'Choose a valid payment method.';
  end if;

  select
    w.id,
    w.member_id,
    w.amount,
    w.paid_amount,
    w.due_at,
    w.settled_payment_id,
    w.settled_at,
    w.created_at,
    w.customer_name,
    w.note
  into balance_row
  from public.walk_in_balances w
  where w.id = p_balance_id
  for update;

  if balance_row.id is null then
    raise exception 'Balance was not found.';
  end if;

  remaining_before := round(greatest(balance_row.amount - coalesce(balance_row.paid_amount, 0), 0), 2);

  if remaining_before <= 0 then
    raise exception 'This balance is already settled.';
  end if;

  if p_payment_mode = 'full' then
    payment_amount := remaining_before;
  else
    if p_amount is null or p_amount <= 0 then
      raise exception 'Amount must be greater than zero.';
    end if;

    if p_amount > remaining_before then
      raise exception 'Partial payment cannot exceed the remaining balance.';
    end if;

    payment_amount := round(p_amount, 2);
  end if;

  select
    s.id,
    s.staff_profile_id,
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

  if actor_role = 'front_desk' and active_shift.id is null then
    raise exception 'Start an active shift before settling utang.';
  end if;

  if active_shift.id is not null then
    if p_payment_method = 'cash' and not active_shift.can_accept_cash then
      raise exception 'This staff profile is not allowed to accept cash.';
    end if;

    if p_payment_method = 'gcash' and not active_shift.can_accept_gcash then
      raise exception 'This staff profile is not allowed to accept GCash.';
    end if;
  end if;

  previous_status := case
    when coalesce(balance_row.paid_amount, 0) >= balance_row.amount then 'paid'
    when balance_row.due_at is not null and balance_row.due_at < now() then 'overdue'
    when coalesce(balance_row.paid_amount, 0) > 0 then 'partially_paid'
    else 'unpaid'
  end;

  insert into public.payments (
    member_id,
    balance_id,
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
    balance_row.member_id,
    p_balance_id,
    active_shift.id,
    auth.uid(),
    p_payment_method::public.payment_type,
    'balance_payment',
    payment_amount,
    'completed',
    now(),
    coalesce(clean_note, 'Utang payment')
  )
  returning id into created_payment_id;

  remaining_after := round(greatest(balance_row.amount - coalesce(balance_row.paid_amount, 0) - payment_amount, 0), 2);
  settled_now := remaining_after <= 0;

  update public.walk_in_balances
  set
    paid_amount = round(coalesce(paid_amount, 0) + payment_amount, 2),
    last_payment_at = now(),
    settled_payment_id = case when settled_now then created_payment_id else settled_payment_id end,
    settled_at = case when settled_now then now() else settled_at end
  where id = p_balance_id;

  new_status := case
    when settled_now then 'paid'
    when balance_row.due_at is not null and balance_row.due_at < now() then 'overdue'
    when coalesce(balance_row.paid_amount, 0) + payment_amount > 0 then 'partially_paid'
    else 'unpaid'
  end;

  perform private.log_balance_event(
    'balance_payment_recorded',
    p_balance_id,
    jsonb_build_object(
      'balance_id', balance_row.id,
      'member_id', balance_row.member_id,
      'original_amount', balance_row.amount,
      'paid_amount', balance_row.paid_amount,
      'remaining_amount', remaining_before,
      'status', previous_status,
      'due_at', balance_row.due_at,
      'payment_mode', p_payment_mode,
      'payment_method', p_payment_method,
      'note', balance_row.note
    ),
    jsonb_build_object(
      'balance_id', balance_row.id,
      'member_id', balance_row.member_id,
      'payment_id', created_payment_id,
      'original_amount', balance_row.amount,
      'paid_amount', round(coalesce(balance_row.paid_amount, 0) + payment_amount, 2),
      'remaining_amount', remaining_after,
      'status', new_status,
      'due_at', balance_row.due_at,
      'payment_mode', p_payment_mode,
      'payment_method', p_payment_method,
      'payment_amount', payment_amount,
      'shift_id', active_shift.id,
      'note', clean_note
    )
  );

  if previous_status is distinct from new_status then
    perform private.log_balance_event(
      'balance_status_changed',
      p_balance_id,
      jsonb_build_object(
        'balance_id', balance_row.id,
        'status', previous_status,
        'remaining_amount', remaining_before
      ),
      jsonb_build_object(
        'balance_id', balance_row.id,
        'status', new_status,
        'remaining_amount', remaining_after
      )
    );
  end if;

  return jsonb_build_object(
    'status', 'success',
    'balance_id', p_balance_id,
    'payment_id', created_payment_id,
    'payment_amount', payment_amount,
    'remaining_amount', remaining_after,
    'balance_status', new_status
  );
end;
$$;

drop policy if exists "walk in balances management update" on public.walk_in_balances;
create policy "walk in balances permitted settlement update"
on public.walk_in_balances for update
to authenticated
using (private.current_app_role() in ('owner', 'admin', 'manager', 'accountant', 'front_desk'))
with check (private.current_app_role() in ('owner', 'admin', 'manager', 'accountant', 'front_desk'));

drop policy if exists "payments balance settlement insert" on public.payments;
create policy "payments permitted balance settlement insert"
on public.payments for insert
to authenticated
with check (
  private.current_app_role() in ('owner', 'admin', 'manager', 'accountant', 'front_desk')
  and purpose = 'balance_payment'
  and balance_id is not null
  and received_by = auth.uid()
  and status = 'completed'
  and paid_at is not null
  and (shift_id is null or private.is_own_active_shift(shift_id))
);

update public.settings
set value = jsonb_set(
  value,
  '{types}',
  (
    select jsonb_agg(
      case
        when item ->> 'key' = 'pending_payment'
          then jsonb_set(item, '{label}', '"Utang / Pay later"'::jsonb)
        else item
      end
    )
    from jsonb_array_elements(value -> 'types') as item
  )
)
where key = 'exception_types'
  and jsonb_typeof(value -> 'types') = 'array';
