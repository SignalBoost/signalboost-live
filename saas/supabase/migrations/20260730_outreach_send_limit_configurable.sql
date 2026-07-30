-- saas/supabase/migrations/20260730_outreach_send_limit_configurable.sql
--
-- TURN OFF THE ROLLING 24-HOUR SEND CAP (owner instruction, 2026-07-30).
--
-- 20260529_outreach_send_limit_hardening.sql hardcoded `if sent_count >= 50 then raise`
-- inside the trigger. That number could not be changed from the application, so lifting
-- the cap in code alone would have left every send past 50 failing at the database with
-- a raw exception — the application would report success paths that the trigger refuses.
-- Both layers have to move together.
--
-- The trigger now reads the cap from system_settings.outreach_daily_send_limit:
--   • row absent, null, 0, or non-numeric  -> NO CAP (this is the new default)
--   • positive integer                     -> that many sends per rolling 24 hours
--
-- WHAT IS DELIBERATELY KEPT: the approval check. A row still cannot be sent unless its
-- outreach_queue status is 'approved'. That is the human release gate, not a rate limit,
-- and nothing here weakens it. The advisory lock is kept too, so a re-imposed cap stays
-- correct under concurrent sends.
--
-- To re-impose a cap later, without a deploy:
--   insert into public.system_settings (key, value) values ('outreach_daily_send_limit', '100'::jsonb)
--   on conflict (key) do update set value = excluded.value;
-- and set OUTREACH_DAILY_SEND_LIMIT to the same number in Vercel so the application
-- refuses early with a clean message instead of hitting this exception.
--
-- Safe to run twice.

create or replace function public.enforce_outreach_send_safety()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  current_status text;
  sent_count integer;
  configured_limit integer;
  raw_limit jsonb;
begin
  perform pg_advisory_xact_lock(hashtext('public.outreach_sends:rolling_24h_limit'));

  select status into current_status
  from public.outreach_queue
  where id = new.outreach_id;

  if current_status is distinct from 'approved' then
    raise exception 'Outreach must be approved before it can be sent';
  end if;

  select value into raw_limit
  from public.system_settings
  where key = 'outreach_daily_send_limit';

  begin
    configured_limit := nullif(trim(both '"' from coalesce(raw_limit::text, '')), '')::integer;
  exception when others then
    configured_limit := null;
  end;

  -- No cap configured: allow the insert. Counting still happens in the application.
  if configured_limit is null or configured_limit <= 0 then
    return new;
  end if;

  select count(*) into sent_count
  from public.outreach_sends
  where sent_at >= now() - interval '24 hours';

  if sent_count >= configured_limit then
    raise exception 'Daily outreach send limit reached: % sends per rolling 24 hours', configured_limit;
  end if;

  return new;
end;
$$;

drop trigger if exists outreach_sends_safety_limit on public.outreach_sends;
create trigger outreach_sends_safety_limit
before insert on public.outreach_sends
for each row execute function public.enforce_outreach_send_safety();
