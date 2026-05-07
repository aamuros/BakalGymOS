create type public.cash_movement_category as enum ('expense', 'owner_pickup', 'cash_adjustment');

alter table public.cash_movements
  add column if not exists category public.cash_movement_category;

update public.cash_movements
set category = case
  when movement_type = 'cash_out' then 'expense'::public.cash_movement_category
  else 'cash_adjustment'::public.cash_movement_category
end
where category is null;

alter table public.cash_movements
  alter column category set default 'expense'::public.cash_movement_category,
  alter column category set not null;

alter table public.shifts
  add column if not exists closing_note text,
  add column if not exists variance_note text,
  add column if not exists cash_sales numeric(12,2),
  add column if not exists cash_expenses numeric(12,2),
  add column if not exists owner_cash_pickups numeric(12,2),
  add column if not exists cash_adjustments numeric(12,2);

create index if not exists cash_movements_category_idx on public.cash_movements(category);

create or replace function private.close_shift_reconciliation(
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
  actor_role public.app_role;
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
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  actor_role := private.current_app_role();

  if actor_role is null then
    raise exception 'Your account is not active.';
  end if;

  if actor_role not in ('owner', 'admin', 'manager', 'front_desk') then
    raise exception 'Only assigned staff, manager, owner, or admin can close shifts.';
  end if;

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
    sp.can_close_shift
  into target_shift
  from public.shifts s
  join public.staff_profiles sp on sp.id = s.staff_profile_id
  where s.id = p_shift_id
  for update;

  if target_shift.id is null then
    raise exception 'Shift was not found.';
  end if;

  if target_shift.status <> 'open'::public.shift_status or target_shift.closed_at is not null then
    raise exception 'Only an active shift can be closed.';
  end if;

  if actor_role not in ('owner', 'admin', 'manager')
    and target_shift.assigned_profile_id <> auth.uid()
    and target_shift.opened_by <> auth.uid()
  then
    raise exception 'Only the assigned staff, manager, owner, or admin can close this shift.';
  end if;

  if actor_role not in ('owner', 'admin', 'manager') and not target_shift.can_close_shift then
    raise exception 'Your staff profile is not allowed to close shifts.';
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
    closed_by = auth.uid(),
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
    entity_table,
    entity_id,
    old_data,
    new_data
  )
  values (
    auth.uid(),
    'shift_closed',
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
      'variance_note', clean_variance_note
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

create or replace function public.close_shift_reconciliation(
  p_shift_id uuid,
  p_actual_cash numeric,
  p_notes text,
  p_variance_note text
)
returns jsonb
language sql
security invoker
set search_path = public
as $$
  select private.close_shift_reconciliation(p_shift_id, p_actual_cash, p_notes, p_variance_note)
$$;

grant execute on function public.close_shift_reconciliation(uuid, numeric, text, text) to authenticated;
