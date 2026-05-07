begin;

drop policy if exists "gcash proofs storage upload operational staff" on storage.objects;
create policy "gcash proofs storage upload operational staff"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'gcash-proofs'
  and private.current_app_role() in ('owner', 'admin', 'manager', 'front_desk')
  and private.has_permission('record_payments')
  and lower((storage.extension(name))) in ('jpg', 'jpeg', 'png', 'webp')
);

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
      'sender_mobile', clean_sender_mobile
    )
  );

  return jsonb_build_object('status', 'staff_checked', 'proof_id', target_proof.id);
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

  if p_action not in ('confirm', 'dispute', 'follow_up') then
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

  new_status := case p_action
    when 'confirm' then 'owner_confirmed'::public.proof_status
    when 'dispute' then 'disputed'::public.proof_status
    else 'needs_follow_up'::public.proof_status
  end;

  update public.gcash_proofs
  set
    proof_status = new_status,
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    owner_note = clean_note,
    rejection_reason = case when new_status = 'disputed' then clean_note else null end
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

commit;
