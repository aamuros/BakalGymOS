-- Phase 10: Make core gym behavior configurable without code changes.
-- Adds operational settings: walk-in rate, utang controls, grace period.
-- Updates the admin RPC to accept these new setting keys.

-- ---------------------------------------------------------------------------
-- 1. Extend update_admin_setting to accept new keys
-- ---------------------------------------------------------------------------

create or replace function public.update_admin_setting(
  p_key text,
  p_value jsonb,
  p_description text default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  if not coalesce(private.current_app_role() in ('owner', 'admin'), false) then
    raise exception 'Only owner or admin accounts can manage settings.';
  end if;

  if p_key not in (
    'gym_profile',
    'payment_settings',
    'exception_type_settings',
    'walk_in_rate',
    'operational_settings'
  ) then
    raise exception 'Unsupported setting key.';
  end if;

  insert into public.settings (key, value, description, is_owner_only, updated_by)
  values (p_key, p_value, p_description, true, auth.uid())
  on conflict (key) do update
  set value = excluded.value,
      description = excluded.description,
      is_owner_only = true,
      updated_by = excluded.updated_by;

  perform private.record_audit_log(
    auth.uid(),
    case
      when p_key = 'payment_settings' then 'payment_settings_changed'
      else p_key || '_changed'
    end,
    'settings',
    null,
    null,
    jsonb_build_object('key', p_key, 'value', p_value),
    coalesce(nullif(btrim(p_note), ''), 'Admin setting changed')
  );

  return jsonb_build_object('status', 'updated', 'key', p_key);
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Seed default operational settings (upsert so re-seeding is safe)
-- ---------------------------------------------------------------------------

insert into public.settings (key, value, description, is_owner_only)
values
  (
    'operational_settings',
    '{"allow_utang": true, "max_utang_warning_amount": 500, "grace_period_days": 0}'::jsonb,
    'Controls for utang, warnings, and membership grace period.',
    true
  )
on conflict (key) do update
set value = excluded.value,
    description = excluded.description;

-- Ensure walk_in_rate exists with a sensible default
insert into public.settings (key, value, description, is_owner_only)
values
  (
    'walk_in_rate',
    '{"amount": 100, "currency": "PHP"}'::jsonb,
    'Default walk-in entry rate used by Front Desk.',
    true
  )
on conflict (key) do update
set description = excluded.description;
