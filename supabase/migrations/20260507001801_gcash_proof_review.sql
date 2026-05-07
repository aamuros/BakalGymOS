alter type public.payment_status add value if not exists 'pending_proof';
alter type public.payment_status add value if not exists 'staff_checked';
alter type public.payment_status add value if not exists 'owner_confirmed';
alter type public.payment_status add value if not exists 'disputed';
alter type public.payment_status add value if not exists 'needs_follow_up';

alter type public.proof_status add value if not exists 'staff_checked';
alter type public.proof_status add value if not exists 'owner_confirmed';
alter type public.proof_status add value if not exists 'disputed';
alter type public.proof_status add value if not exists 'needs_follow_up';
