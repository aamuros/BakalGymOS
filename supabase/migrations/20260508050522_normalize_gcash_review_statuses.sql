alter type public.payment_status add value if not exists 'awaiting_proof';
alter type public.payment_status add value if not exists 'for_review';
alter type public.payment_status add value if not exists 'verified';
alter type public.payment_status add value if not exists 'rejected';
alter type public.payment_status add value if not exists 'follow_up';

alter type public.proof_status add value if not exists 'awaiting_proof';
alter type public.proof_status add value if not exists 'for_review';
alter type public.proof_status add value if not exists 'follow_up';
