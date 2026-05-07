alter type public.exception_type add value if not exists 'free_entry';
alter type public.exception_type add value if not exists 'guest_entry';
alter type public.exception_type add value if not exists 'trial_session';
alter type public.exception_type add value if not exists 'pending_payment';
alter type public.exception_type add value if not exists 'gcash_pending';
alter type public.exception_type add value if not exists 'expired_but_allowed';
alter type public.exception_type add value if not exists 'owner_allowed';
alter type public.exception_type add value if not exists 'disputed_payment';

alter type public.review_status add value if not exists 'needs_review';
alter type public.review_status add value if not exists 'resolved';
