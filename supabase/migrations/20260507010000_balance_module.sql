begin;

alter table public.walk_in_balances
  add column if not exists paid_amount numeric(12,2) not null default 0 check (paid_amount >= 0),
  add column if not exists due_at timestamptz,
  add column if not exists last_payment_at timestamptz;

alter table public.walk_in_balances
  alter column due_at set default (now() + interval '7 days');

update public.walk_in_balances
set due_at = coalesce(due_at, created_at + interval '7 days')
where due_at is null;

alter table public.walk_in_balances
  drop constraint if exists walk_in_balances_paid_amount_not_over_amount,
  add constraint walk_in_balances_paid_amount_not_over_amount
  check (paid_amount <= amount);

alter table public.payments
  add column if not exists balance_id uuid references public.walk_in_balances(id) on delete set null;

create index if not exists walk_in_balances_due_at_idx on public.walk_in_balances(due_at);
create index if not exists payments_balance_id_idx on public.payments(balance_id);

create or replace function private.log_balance_event(
  p_action text,
  p_balance_id uuid,
  p_old_data jsonb,
  p_new_data jsonb
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
    old_data,
    new_data
  )
  values (
    auth.uid(),
    p_action,
    'walk_in_balances',
    p_balance_id,
    p_old_data,
    p_new_data
  );
end;
$$;

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

  if private.current_app_role() not in ('owner', 'admin', 'manager', 'accountant') then
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
    coalesce(clean_note, 'Balance payment')
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

create or replace function public.record_balance_payment(
  p_balance_id uuid,
  p_payment_mode text,
  p_payment_method text,
  p_amount numeric,
  p_note text
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select private.record_balance_payment(
    p_balance_id,
    p_payment_mode,
    p_payment_method,
    p_amount,
    p_note
  )
$$;

revoke usage on schema private from authenticated;
revoke execute on function private.log_balance_event(text, uuid, jsonb, jsonb) from public, authenticated, anon;
revoke execute on function private.record_balance_payment(uuid, text, text, numeric, text) from public, authenticated, anon;
grant execute on function public.record_balance_payment(uuid, text, text, numeric, text) to authenticated;

drop policy if exists "walk in balances management update" on public.walk_in_balances;
create policy "walk in balances management update"
on public.walk_in_balances for update
to authenticated
using (private.current_app_role() in ('owner', 'admin', 'manager', 'accountant'))
with check (private.current_app_role() in ('owner', 'admin', 'manager', 'accountant'));

drop policy if exists "payments balance settlement insert" on public.payments;
create policy "payments balance settlement insert"
on public.payments for insert
to authenticated
with check (
  private.current_app_role() in ('owner', 'admin', 'manager', 'accountant')
  and purpose = 'balance_payment'
  and balance_id is not null
  and received_by = auth.uid()
  and status = 'completed'
  and paid_at is not null
  and (shift_id is null or private.is_own_active_shift(shift_id))
);

commit;
