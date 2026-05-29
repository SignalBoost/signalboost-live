-- Hard safety rails for the AI Outreach Engine.
-- The application also enforces these rules, but database triggers keep approval and
-- daily-send constraints intact for any future server-side entry point.

create or replace function public.enforce_outreach_send_safety()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  current_status text;
  sent_count integer;
begin
  perform pg_advisory_xact_lock(hashtext('public.outreach_sends:rolling_24h_limit'));

  select status into current_status
  from public.outreach_queue
  where id = new.outreach_id;

  if current_status is distinct from 'approved' then
    raise exception 'Outreach must be approved before it can be sent';
  end if;

  select count(*) into sent_count
  from public.outreach_sends
  where sent_at >= now() - interval '24 hours';

  if sent_count >= 50 then
    raise exception 'Daily outreach send limit reached: 50 sends per rolling 24 hours';
  end if;

  return new;
end;
$$;

drop trigger if exists outreach_sends_safety_limit on public.outreach_sends;
create trigger outreach_sends_safety_limit
before insert on public.outreach_sends
for each row execute function public.enforce_outreach_send_safety();

create index if not exists outreach_queue_waiting_to_send_idx
  on public.outreach_queue(approved_at desc)
  where status = 'approved';
