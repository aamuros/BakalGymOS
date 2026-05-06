alter type public.entry_status add value if not exists 'settled';
alter type public.entry_status add value if not exists 'pending';
alter type public.entry_status add value if not exists 'gcash_pending_review';

alter type public.proof_status add value if not exists 'pending_proof';

alter table public.entries
  drop constraint if exists entries_check,
  drop constraint if exists entries_check1;

alter table public.entries
  add constraint entries_member_required_for_membership_check
  check (settlement_type <> 'membership' or member_id is not null),
  add constraint entries_settlement_link_check
  check (
    (settlement_type = 'membership' and subscription_id is not null and payment_id is null and exception_id is null)
    or (settlement_type in ('cash', 'gcash') and payment_id is not null and exception_id is null)
    or (settlement_type = 'pending' and exception_id is null)
    or (settlement_type = 'exception' and exception_id is not null and payment_id is null)
  );

create table public.walk_in_balances (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null unique references public.entries(id) on delete cascade,
  shift_id uuid not null references public.shifts(id) on delete cascade,
  customer_name text,
  amount numeric(12,2) not null check (amount > 0),
  status public.review_status not null default 'pending',
  note text,
  created_by uuid references public.profiles(id) on delete set null,
  settled_payment_id uuid references public.payments(id) on delete set null,
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index walk_in_balances_shift_id_idx on public.walk_in_balances(shift_id);
create index walk_in_balances_status_idx on public.walk_in_balances(status);
create index walk_in_balances_created_by_idx on public.walk_in_balances(created_by);

create trigger walk_in_balances_set_updated_at before update on public.walk_in_balances
  for each row execute function public.set_updated_at();

create trigger audit_walk_in_balances after insert or update or delete on public.walk_in_balances
  for each row execute function public.audit_row_change();

alter table public.walk_in_balances enable row level security;

create policy "walk in balances operational read"
on public.walk_in_balances for select
to authenticated
using (
  private.is_reporting_role()
  or created_by = auth.uid()
  or exists (
    select 1
    from public.shifts s
    where s.id = walk_in_balances.shift_id
      and s.opened_by = auth.uid()
  )
);

create policy "walk in balances active shift insert"
on public.walk_in_balances for insert
to authenticated
with check (
  private.is_front_desk_or_management()
  and created_by = auth.uid()
  and private.is_own_active_shift(shift_id)
);

create policy "walk in balances management update"
on public.walk_in_balances for update
to authenticated
using (private.is_management())
with check (private.is_management());

create or replace function public.create_walk_in(
  p_customer_name text,
  p_amount numeric,
  p_payment_method text,
  p_note text
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
  created_entry_id uuid;
  created_payment_id uuid;
  created_balance_id uuid;
  created_proof_id uuid;
  entry_status public.entry_status;
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
      auth.uid(),
      p_payment_method::public.payment_type,
      'walk_in_entry',
      p_amount,
      'completed',
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
      proof_status
    )
    values (
      created_payment_id,
      auth.uid(),
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
      auth.uid()
    )
    returning id into created_balance_id;
  end if;

  return jsonb_build_object(
    'entry_id', created_entry_id,
    'payment_id', created_payment_id,
    'balance_id', created_balance_id,
    'gcash_proof_id', created_proof_id,
    'entry_status', entry_status
  );
end;
$$;

grant execute on function public.create_walk_in(text, numeric, text, text) to authenticated;
