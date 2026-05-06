begin;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'gcash-proofs',
  'gcash-proofs',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "gcash proofs storage read allowed staff"
on storage.objects for select
to authenticated
using (
  bucket_id = 'gcash-proofs'
  and private.current_app_role() in ('owner', 'admin', 'manager', 'front_desk', 'accountant')
);

create policy "gcash proofs storage upload operational staff"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'gcash-proofs'
  and private.current_app_role() in ('owner', 'admin', 'manager', 'front_desk')
);

create policy "gcash proofs storage update management"
on storage.objects for update
to authenticated
using (
  bucket_id = 'gcash-proofs'
  and private.current_app_role() in ('owner', 'admin', 'manager')
)
with check (
  bucket_id = 'gcash-proofs'
  and private.current_app_role() in ('owner', 'admin', 'manager')
);

create policy "gcash proofs storage delete management"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'gcash-proofs'
  and private.current_app_role() in ('owner', 'admin', 'manager')
);

commit;
