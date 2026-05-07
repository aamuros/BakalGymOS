begin;

create index if not exists payments_status_paid_at_idx
  on public.payments(status, paid_at);

create index if not exists payments_purpose_paid_at_idx
  on public.payments(purpose, paid_at);

create index if not exists payments_received_by_paid_at_idx
  on public.payments(received_by, paid_at);

create index if not exists entries_status_entered_at_idx
  on public.entries(status, entered_at);

create index if not exists exceptions_status_created_at_idx
  on public.exceptions(status, created_at);

create index if not exists walk_in_balances_created_at_idx
  on public.walk_in_balances(created_at);

create index if not exists walk_in_balances_settled_at_idx
  on public.walk_in_balances(settled_at);

commit;
