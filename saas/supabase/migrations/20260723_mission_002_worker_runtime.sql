-- Mission 002 phase 3: server-only fenced ownership and atomic outbox claiming.
alter table public.mission_outbox add column if not exists claim_owner text;
alter table public.mission_outbox add column if not exists claim_fence bigint;
alter table public.mission_outbox add column if not exists claimed_at timestamptz;
alter table public.mission_outbox add column if not exists retry_at timestamptz;
alter table public.mission_outbox drop constraint if exists mission_outbox_status_check;
alter table public.mission_outbox add constraint mission_outbox_status_check check(status in ('pending','claimed','published','retry_wait','dead_lettered'));
create table if not exists public.mission_worker_leases (
 scope text primary key, owner_id text not null, fencing_token bigint not null default 0,
 expires_at timestamptz not null, updated_at timestamptz not null default now()
);
alter table public.mission_worker_leases enable row level security;

create or replace function public.mission_claim_outbox(p_scope text,p_owner text,p_fence bigint,p_limit integer)
returns setof public.mission_outbox language plpgsql security definer set search_path=public as $$
begin
 if p_limit < 1 or p_limit > 100 then raise exception 'invalid_limit'; end if;
 if not exists (select 1 from mission_worker_leases where scope=p_scope and owner_id=p_owner and fencing_token=p_fence and expires_at>now()) then raise exception 'stale_owner'; end if;
 return query with candidates as (
   select event_id from mission_outbox where (status='pending' or (status='retry_wait' and retry_at<=now()) or (status='claimed' and claimed_at < now()-interval '5 minutes'))
   order by created_at for update skip locked limit p_limit
 ) update mission_outbox o set status='claimed',claim_owner=p_owner,claim_fence=p_fence,claimed_at=now()
 from candidates c where o.event_id=c.event_id returning o.*;
end $$;
revoke all on public.mission_records,public.mission_outbox,public.mission_event_inbox,public.mission_worker_leases from anon, authenticated;
revoke all on function public.mission_claim_outbox(text,text,bigint,integer) from public, anon, authenticated;
grant execute on function public.mission_claim_outbox(text,text,bigint,integer) to service_role;
