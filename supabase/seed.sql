begin;

-- Local/demo Auth users.
-- Shared password for every seeded auth account in this file: Test1234!
insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  raw_app_meta_data,
  raw_user_meta_data
)
values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner@gymledger.local', '$2y$10$M19XeRjwxCJK3e73qSTiwuxbJJu52cRmSKhusoVX3iLP3sNqSuSGm', now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'manager@gymledger.local', '$2y$10$M19XeRjwxCJK3e73qSTiwuxbJJu52cRmSKhusoVX3iLP3sNqSuSGm', now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'frontdesk1@gymledger.local', '$2y$10$M19XeRjwxCJK3e73qSTiwuxbJJu52cRmSKhusoVX3iLP3sNqSuSGm', now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'frontdesk2@gymledger.local', '$2y$10$M19XeRjwxCJK3e73qSTiwuxbJJu52cRmSKhusoVX3iLP3sNqSuSGm', now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'accountant@gymledger.local', '$2y$10$M19XeRjwxCJK3e73qSTiwuxbJJu52cRmSKhusoVX3iLP3sNqSuSGm', now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'active.member@gymledger.local', '$2y$10$M19XeRjwxCJK3e73qSTiwuxbJJu52cRmSKhusoVX3iLP3sNqSuSGm', now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'expired.member@gymledger.local', '$2y$10$M19XeRjwxCJK3e73qSTiwuxbJJu52cRmSKhusoVX3iLP3sNqSuSGm', now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}')
on conflict (id) do nothing;

insert into auth.identities (
  id,
  provider_id,
  user_id,
  identity_data,
  provider,
  last_sign_in_at,
  created_at,
  updated_at
)
values
  ('01000000-0000-0000-0000-000000000001', 'owner@gymledger.local', '00000000-0000-0000-0000-000000000001', '{"sub":"00000000-0000-0000-0000-000000000001","email":"owner@gymledger.local"}', 'email', now(), now(), now()),
  ('01000000-0000-0000-0000-000000000002', 'manager@gymledger.local', '00000000-0000-0000-0000-000000000002', '{"sub":"00000000-0000-0000-0000-000000000002","email":"manager@gymledger.local"}', 'email', now(), now(), now()),
  ('01000000-0000-0000-0000-000000000003', 'frontdesk1@gymledger.local', '00000000-0000-0000-0000-000000000003', '{"sub":"00000000-0000-0000-0000-000000000003","email":"frontdesk1@gymledger.local"}', 'email', now(), now(), now()),
  ('01000000-0000-0000-0000-000000000004', 'frontdesk2@gymledger.local', '00000000-0000-0000-0000-000000000004', '{"sub":"00000000-0000-0000-0000-000000000004","email":"frontdesk2@gymledger.local"}', 'email', now(), now(), now()),
  ('01000000-0000-0000-0000-000000000005', 'accountant@gymledger.local', '00000000-0000-0000-0000-000000000005', '{"sub":"00000000-0000-0000-0000-000000000005","email":"accountant@gymledger.local"}', 'email', now(), now(), now()),
  ('01000000-0000-0000-0000-000000000006', 'active.member@gymledger.local', '00000000-0000-0000-0000-000000000006', '{"sub":"00000000-0000-0000-0000-000000000006","email":"active.member@gymledger.local"}', 'email', now(), now(), now()),
  ('01000000-0000-0000-0000-000000000007', 'expired.member@gymledger.local', '00000000-0000-0000-0000-000000000007', '{"sub":"00000000-0000-0000-0000-000000000007","email":"expired.member@gymledger.local"}', 'email', now(), now(), now())
on conflict (provider_id, provider) do update
set user_id = excluded.user_id,
    identity_data = excluded.identity_data,
    updated_at = excluded.updated_at;

insert into public.profiles (id, full_name, email, role)
values
  ('00000000-0000-0000-0000-000000000001', 'GymLedger Owner', 'owner@gymledger.local', 'owner'),
  ('00000000-0000-0000-0000-000000000002', 'Gym Manager', 'manager@gymledger.local', 'manager'),
  ('00000000-0000-0000-0000-000000000003', 'Front Desk One', 'frontdesk1@gymledger.local', 'front_desk'),
  ('00000000-0000-0000-0000-000000000004', 'Front Desk Two', 'frontdesk2@gymledger.local', 'front_desk'),
  ('00000000-0000-0000-0000-000000000005', 'Gym Accountant', 'accountant@gymledger.local', 'accountant'),
  ('00000000-0000-0000-0000-000000000006', 'Active Member', 'active.member@gymledger.local', 'member'),
  ('00000000-0000-0000-0000-000000000007', 'Expired Member', 'expired.member@gymledger.local', 'member')
on conflict (id) do update
set full_name = excluded.full_name,
    email = excluded.email,
    role = excluded.role;

insert into public.staff_profiles (
  id,
  profile_id,
  employee_code,
  job_title,
  can_open_shift,
  can_close_shift,
  can_accept_cash,
  can_accept_gcash,
  hired_at
)
values
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002', 'MGR-001', 'Manager', true, true, true, true, current_date - 365),
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000003', 'FD-001', 'Front Desk Staff', true, true, true, true, current_date - 120),
  ('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000004', 'FD-002', 'Front Desk Staff', true, true, true, true, current_date - 90),
  ('10000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000005', 'ACC-001', 'Accountant', false, false, false, false, current_date - 200)
on conflict (profile_id) do update
set employee_code = excluded.employee_code,
    job_title = excluded.job_title,
    can_open_shift = excluded.can_open_shift,
    can_close_shift = excluded.can_close_shift,
    can_accept_cash = excluded.can_accept_cash,
    can_accept_gcash = excluded.can_accept_gcash;

insert into public.membership_plans (id, name, description, duration_days, price, entry_limit, is_unlimited)
values
  ('20000000-0000-0000-0000-000000000001', 'Daily Walk-In', 'Single-day access', 1, 100.00, 1, false),
  ('20000000-0000-0000-0000-000000000002', 'Monthly Unlimited', 'Unlimited gym access for 30 days', 30, 1200.00, null, true),
  ('20000000-0000-0000-0000-000000000003', 'Quarterly Unlimited', 'Unlimited gym access for 90 days', 90, 3200.00, null, true)
on conflict (id) do update
set name = excluded.name,
    description = excluded.description,
    duration_days = excluded.duration_days,
    price = excluded.price,
    entry_limit = excluded.entry_limit,
    is_unlimited = excluded.is_unlimited;

insert into public.members (
  id,
  profile_id,
  member_code,
  full_name,
  phone,
  email,
  status,
  created_by
)
values
  ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000006', 'MEM-0001', 'Active Member', '09170000001', 'active.member@gymledger.local', 'active', '00000000-0000-0000-0000-000000000003'),
  ('30000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000007', 'MEM-0002', 'Expired Member', '09170000002', 'expired.member@gymledger.local', 'active', '00000000-0000-0000-0000-000000000003'),
  ('30000000-0000-0000-0000-000000000003', null, 'MEM-0003', 'Cash Walk-In Member', '09170000003', null, 'active', '00000000-0000-0000-0000-000000000003')
on conflict (id) do update
set profile_id = excluded.profile_id,
    member_code = excluded.member_code,
    full_name = excluded.full_name,
    phone = excluded.phone,
    email = excluded.email,
    status = excluded.status;

insert into public.shifts (
  id,
  staff_profile_id,
  opened_by,
  opened_at,
  opening_cash,
  expected_cash,
  actual_cash,
  cash_difference,
  status,
  notes
)
values (
  '40000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000003',
  now() - interval '4 hours',
  1000.00,
  1300.00,
  null,
  null,
  'open',
  'Sample morning shift'
)
on conflict (id) do update
set expected_cash = excluded.expected_cash,
    actual_cash = excluded.actual_cash,
    cash_difference = excluded.cash_difference,
    status = excluded.status;

insert into public.payments (
  id,
  member_id,
  shift_id,
  received_by,
  payment_type,
  purpose,
  amount,
  status,
  paid_at,
  due_at,
  reference_number,
  notes
)
values
  ('50000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003', 'gcash', 'membership_purchase', 1200.00, 'completed', now() - interval '3 hours', null, 'GCASH-GL-0001', 'Monthly membership purchase'),
  ('50000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003', 'cash', 'walk_in_entry', 100.00, 'completed', now() - interval '2 hours', null, null, 'Cash walk-in'),
  ('50000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003', 'cash', 'balance_payment', 150.00, 'pending', null, now() + interval '7 days', null, 'Utang for expired member walk-in')
on conflict (id) do update
set amount = excluded.amount,
    status = excluded.status,
    paid_at = excluded.paid_at,
    due_at = excluded.due_at,
    notes = excluded.notes;

insert into public.member_subscriptions (
  id,
  member_id,
  plan_id,
  starts_at,
  ends_at,
  status,
  entries_used,
  purchased_payment_id,
  created_by
)
values
  ('60000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', current_date - 5, current_date + 25, 'active', 1, '50000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003'),
  ('60000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', current_date - 45, current_date - 15, 'expired', 0, null, '00000000-0000-0000-0000-000000000003')
on conflict (id) do update
set starts_at = excluded.starts_at,
    ends_at = excluded.ends_at,
    status = excluded.status,
    entries_used = excluded.entries_used,
    purchased_payment_id = excluded.purchased_payment_id;

update public.payments
set subscription_id = '60000000-0000-0000-0000-000000000001'
where id = '50000000-0000-0000-0000-000000000001';

insert into public.exceptions (
  id,
  member_id,
  exception_type,
  reason,
  created_by,
  status
)
values (
  '70000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000002',
  'payment_to_follow',
  'Expired member allowed to enter with payment due later.',
  '00000000-0000-0000-0000-000000000003',
  'pending'
)
on conflict (id) do update
set status = excluded.status,
    reason = excluded.reason;

insert into public.entries (
  id,
  member_id,
  guest_name,
  entered_at,
  checked_in_by,
  shift_id,
  settlement_type,
  subscription_id,
  payment_id,
  exception_id,
  status,
  notes
)
values
  ('80000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', null, now() - interval '2 hours 30 minutes', '00000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000001', 'membership', '60000000-0000-0000-0000-000000000001', null, null, 'completed', 'Active member entry settled by membership'),
  ('80000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000003', null, now() - interval '2 hours', '00000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000001', 'cash', null, '50000000-0000-0000-0000-000000000002', null, 'completed', 'Walk-in entry settled by cash'),
  ('80000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000002', null, now() - interval '1 hour', '00000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000001', 'pending', null, '50000000-0000-0000-0000-000000000003', null, 'completed', 'Walk-in entry recorded as utang'),
  ('80000000-0000-0000-0000-000000000004', null, 'Guest With Owner Approval', now() - interval '30 minutes', '00000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000001', 'exception', null, null, '70000000-0000-0000-0000-000000000001', 'completed', 'Guest entry awaiting owner review')
on conflict (id) do update
set status = excluded.status,
    notes = excluded.notes;

update public.exceptions
set entry_id = '80000000-0000-0000-0000-000000000004'
where id = '70000000-0000-0000-0000-000000000001';

insert into public.walk_in_balances (
  id,
  entry_id,
  shift_id,
  customer_name,
  amount,
  status,
  note,
  created_by
)
values (
  'b0000000-0000-0000-0000-000000000001',
  '80000000-0000-0000-0000-000000000003',
  '40000000-0000-0000-0000-000000000001',
  'Expired Member',
  150.00,
  'pending',
  'Seed utang balance for an expired member walk-in',
  '00000000-0000-0000-0000-000000000003'
)
on conflict (entry_id) do update
set amount = excluded.amount,
    status = excluded.status,
    note = excluded.note;

insert into public.gcash_proofs (
  id,
  payment_id,
  uploaded_by,
  storage_path,
  file_name,
  mime_type,
  file_size,
  gcash_reference_number,
  sender_name,
  proof_status
)
values (
  '90000000-0000-0000-0000-000000000001',
  '50000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000003',
  '50000000-0000-0000-0000-000000000001/90000000-0000-0000-0000-000000000001-sample-proof.jpg',
  'sample-proof.jpg',
  'image/jpeg',
  125000,
  'GCASH-GL-0001',
  'Active Member',
  'pending_review'
)
on conflict (id) do update
set storage_path = excluded.storage_path,
    proof_status = excluded.proof_status;

insert into public.balances (
  id,
  balance_date,
  shift_id,
  expected_cash,
  actual_cash,
  cash_difference,
  expected_gcash,
  verified_gcash,
  gcash_difference,
  total_sales,
  total_corrections,
  status,
  prepared_by
)
values (
  'a0000000-0000-0000-0000-000000000001',
  current_date,
  '40000000-0000-0000-0000-000000000001',
  1100.00,
  null,
  null,
  1200.00,
  0.00,
  -1200.00,
  1300.00,
  0.00,
  'draft',
  '00000000-0000-0000-0000-000000000005'
)
on conflict (balance_date, shift_id) do update
set expected_cash = excluded.expected_cash,
    expected_gcash = excluded.expected_gcash,
    verified_gcash = excluded.verified_gcash,
    gcash_difference = excluded.gcash_difference,
    total_sales = excluded.total_sales,
    status = excluded.status;

insert into public.settings (key, value, description, is_owner_only, updated_by)
values
  ('walk_in_rate', '{"amount":100,"currency":"PHP"}', 'Default walk-in entry fee.', false, '00000000-0000-0000-0000-000000000001'),
  ('gcash_account', '{"account_name":"GymLedger Demo","mobile":"09XX-XXX-XXXX"}', 'Displayed GCash collection account.', true, '00000000-0000-0000-0000-000000000001')
on conflict (key) do update
set value = excluded.value,
    description = excluded.description,
    is_owner_only = excluded.is_owner_only,
    updated_by = excluded.updated_by;

commit;
