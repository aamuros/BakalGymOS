alter table public.gcash_proofs
  alter column proof_status set default 'awaiting_proof';

create index if not exists gcash_proofs_reference_number_idx
on public.gcash_proofs (lower(gcash_reference_number))
where gcash_reference_number is not null;

drop index if exists gcash_proofs_review_queue_idx;
create index if not exists gcash_proofs_review_queue_idx
on public.gcash_proofs(proof_status, created_at)
where proof_status in ('for_review', 'rejected', 'follow_up');

update public.gcash_proofs
set proof_status = case proof_status::text
  when 'pending_proof' then 'awaiting_proof'::public.proof_status
  when 'pending_review' then 'for_review'::public.proof_status
  when 'staff_checked' then 'for_review'::public.proof_status
  when 'owner_confirmed' then 'verified'::public.proof_status
  when 'disputed' then 'rejected'::public.proof_status
  when 'needs_follow_up' then 'follow_up'::public.proof_status
  else proof_status
end
where proof_status::text in (
  'pending_proof',
  'pending_review',
  'staff_checked',
  'owner_confirmed',
  'disputed',
  'needs_follow_up'
);

update public.payments p
set
  reference_number = coalesce(nullif(btrim(p.reference_number), ''), nullif(btrim(gp.gcash_reference_number), '')),
  status = case gp.proof_status::text
    when 'awaiting_proof' then 'awaiting_proof'::public.payment_status
    when 'for_review' then 'for_review'::public.payment_status
    when 'verified' then 'verified'::public.payment_status
    when 'rejected' then 'rejected'::public.payment_status
    when 'follow_up' then 'follow_up'::public.payment_status
    else p.status
  end
from public.gcash_proofs gp
where gp.payment_id = p.id
  and p.payment_type = 'gcash';

drop policy if exists "gcash proofs staff update pending upload" on public.gcash_proofs;
create policy "gcash proofs staff update pending upload"
on public.gcash_proofs for update
to authenticated
using (
  private.is_front_desk_or_management()
  and uploaded_by = auth.uid()
  and proof_status in ('awaiting_proof', 'follow_up', 'rejected')
)
with check (
  private.is_front_desk_or_management()
  and uploaded_by = auth.uid()
  and proof_status = 'for_review'
);

drop policy if exists "payments staff gcash proof status update" on public.payments;
create policy "payments staff gcash proof status update"
on public.payments for update
to authenticated
using (
  private.is_front_desk_or_management()
  and received_by = auth.uid()
  and payment_type = 'gcash'
  and status in ('awaiting_proof', 'rejected', 'follow_up')
)
with check (
  private.is_front_desk_or_management()
  and received_by = auth.uid()
  and payment_type = 'gcash'
  and status = 'for_review'
);

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
    'duplicate_reference_count', duplicate_reference_count
  );
end;
$$;

grant execute on function public.create_walk_in(text, numeric, text, text, text) to authenticated;

create or replace function public.handle_expired_member_entry(
  p_member_id uuid,
  p_action_type text,
  p_amount numeric,
  p_payment_method text,
  p_reason text,
  p_gcash_reference_number text
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
  clean_reference text := nullif(btrim(p_gcash_reference_number), '');
  created_entry_id uuid;
  created_payment_id uuid;
  created_balance_id uuid;
  created_exception_id uuid;
  duplicate_reference_count integer := 0;
  gcash_review_status public.proof_status;
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

  if clean_reference is not null then
    select count(*)
    into duplicate_reference_count
    from public.gcash_proofs
    where lower(gcash_reference_number) = lower(clean_reference);
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

    gcash_review_status := case
      when p_payment_method = 'gcash' and clean_reference is not null then 'for_review'::public.proof_status
      else 'awaiting_proof'::public.proof_status
    end;

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
      'walk_in_entry',
      p_amount,
      case
        when p_payment_method = 'gcash' then gcash_review_status::text::public.payment_status
        else 'completed'::public.payment_status
      end,
      now(),
      case when p_payment_method = 'gcash' then clean_reference else null end,
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
    'shift_id', active_shift.id,
    'duplicate_reference_count', duplicate_reference_count
  );
end;
$$;

grant execute on function public.handle_expired_member_entry(uuid, text, numeric, text, text, text) to authenticated;

create or replace function public.mark_gcash_proof_uploaded(
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
  target_proof record;
  clean_reference text := nullif(btrim(p_gcash_reference_number), '');
  clean_sender_name text := nullif(btrim(p_sender_name), '');
  clean_sender_mobile text := nullif(btrim(p_sender_mobile), '');
  duplicate_reference_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  if not private.is_front_desk_or_management() then
    raise exception 'You do not have permission to upload GCash proofs.';
  end if;

  if not private.has_permission('record_payments') then
    raise exception 'You do not have permission to record GCash proof uploads.';
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
  for update;

  if target_proof.id is null then
    raise exception 'GCash proof was not found.';
  end if;

  if target_proof.payment_type <> 'gcash' then
    raise exception 'Proof can only be attached to a GCash payment.';
  end if;

  if target_proof.uploaded_by is distinct from auth.uid() and not private.is_management() then
    raise exception 'Only the recording staff or management can upload this proof.';
  end if;

  if target_proof.proof_status not in ('awaiting_proof', 'follow_up', 'rejected') then
    raise exception 'This GCash proof is not waiting for upload.';
  end if;

  if clean_reference is not null then
    select count(*)
    into duplicate_reference_count
    from public.gcash_proofs
    where lower(gcash_reference_number) = lower(clean_reference)
      and id <> target_proof.id;
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
    proof_status = 'for_review',
    reviewed_by = null,
    reviewed_at = null,
    rejection_reason = null
  where id = target_proof.id;

  update public.payments
  set
    reference_number = clean_reference,
    status = 'for_review'
  where id = target_proof.payment_id;

  insert into public.audit_logs (
    actor_id,
    action,
    entity_table,
    entity_id,
    new_data
  )
  values (
    auth.uid(),
    'gcash_proof_uploaded',
    'gcash_proofs',
    target_proof.id,
    jsonb_build_object(
      'payment_id', target_proof.payment_id,
      'storage_path', p_storage_path,
      'file_name', p_file_name,
      'mime_type', p_mime_type,
      'file_size', p_file_size,
      'gcash_reference_number', clean_reference,
      'sender_name', clean_sender_name,
      'sender_mobile', clean_sender_mobile,
      'duplicate_reference_count', duplicate_reference_count
    )
  );

  return jsonb_build_object(
    'status',
    'for_review',
    'proof_id',
    target_proof.id,
    'duplicate_reference_count',
    duplicate_reference_count
  );
end;
$$;

revoke execute on function public.mark_gcash_proof_uploaded(
  uuid,
  text,
  text,
  text,
  bigint,
  text,
  text,
  text
) from public, anon, authenticated;

grant execute on function public.mark_gcash_proof_uploaded(
  uuid,
  text,
  text,
  text,
  bigint,
  text,
  text,
  text
) to authenticated;

create or replace function public.review_gcash_proof(
  p_proof_id uuid,
  p_action text,
  p_owner_note text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_proof record;
  new_status public.proof_status;
  clean_note text := nullif(btrim(p_owner_note), '');
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  if not private.is_management() then
    raise exception 'Only owner, admin, or manager accounts can review GCash proofs.';
  end if;

  if not private.has_permission('correct_payments') then
    raise exception 'You do not have permission to review GCash proofs.';
  end if;

  if p_action not in ('verify', 'reject', 'follow_up', 'confirm', 'dispute') then
    raise exception 'Choose a valid GCash review action.';
  end if;

  select gp.id, gp.payment_id, gp.proof_status
  into target_proof
  from public.gcash_proofs gp
  where gp.id = p_proof_id
  for update;

  if target_proof.id is null then
    raise exception 'GCash proof was not found.';
  end if;

  if p_action in ('verify', 'confirm')
    and target_proof.proof_status not in ('for_review', 'follow_up')
  then
    raise exception 'Only review or follow-up GCash proofs can be verified.';
  elsif p_action in ('reject', 'dispute')
    and target_proof.proof_status not in ('for_review', 'follow_up')
  then
    raise exception 'Only review or follow-up GCash proofs can be rejected.';
  elsif p_action = 'follow_up'
    and target_proof.proof_status not in ('for_review', 'rejected')
  then
    raise exception 'Only review or rejected GCash proofs can be marked for follow-up.';
  end if;

  new_status := case
    when p_action in ('verify', 'confirm') then 'verified'::public.proof_status
    when p_action in ('reject', 'dispute') then 'rejected'::public.proof_status
    else 'follow_up'::public.proof_status
  end;

  update public.gcash_proofs
  set
    proof_status = new_status,
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    owner_note = clean_note,
    rejection_reason = case when new_status = 'rejected' then clean_note else null end
  where id = target_proof.id;

  update public.payments
  set status = new_status::text::public.payment_status
  where id = target_proof.payment_id;

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
    'gcash_proof_' || p_action,
    'gcash_proofs',
    target_proof.id,
    jsonb_build_object('proof_status', target_proof.proof_status),
    jsonb_build_object(
      'proof_status', new_status,
      'payment_id', target_proof.payment_id,
      'owner_note', clean_note
    )
  );

  return jsonb_build_object('status', new_status, 'proof_id', target_proof.id);
end;
$$;

revoke execute on function public.review_gcash_proof(uuid, text, text) from public, anon, authenticated;
grant execute on function public.review_gcash_proof(uuid, text, text) to authenticated;

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
    'for_review'::public.proof_status,
    'rejected'::public.proof_status,
    'follow_up'::public.proof_status
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
    'GCash needs review',
    format('%s recorded a GCash payment%s.', coalesce(uploader_name, 'Staff'), case when amount_text is null then '' else ' for PHP ' || amount_text end),
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
