create table if not exists public.security_repository_patrol_evidence (
  id bigint generated always as identity primary key,
  engagement_id text not null,
  event_id text not null unique,
  delivery_id text not null unique,
  repository text not null,
  event_type text not null,
  chain_index bigint not null check (chain_index >= 0),
  previous_hash text not null check (previous_hash ~ '^[a-f0-9]{64}$'),
  entry_hash text not null unique check (entry_hash ~ '^[a-f0-9]{64}$'),
  evidence_entry jsonb not null,
  recorded_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (engagement_id, chain_index)
);

create index if not exists security_repository_patrol_evidence_repo_time_idx
  on public.security_repository_patrol_evidence (repository, recorded_at desc);

alter table public.security_repository_patrol_evidence enable row level security;
revoke all on table public.security_repository_patrol_evidence from public, anon, authenticated;
grant select, insert on table public.security_repository_patrol_evidence to service_role;
grant usage, select on sequence public.security_repository_patrol_evidence_id_seq to service_role;

create or replace function public.append_security_repository_patrol_evidence(
  p_engagement_id text,
  p_event_id text,
  p_delivery_id text,
  p_repository text,
  p_event_type text,
  p_chain_index bigint,
  p_previous_hash text,
  p_entry_hash text,
  p_evidence_entry jsonb
) returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_index bigint;
  current_hash text;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_engagement_id, 0));

  if exists (
    select 1 from public.security_repository_patrol_evidence
    where delivery_id = p_delivery_id or event_id = p_event_id
  ) then
    return 'duplicate';
  end if;

  select chain_index, entry_hash into current_index, current_hash
  from public.security_repository_patrol_evidence
  where engagement_id = p_engagement_id
  order by chain_index desc
  limit 1;

  if current_index is null then
    if p_chain_index <> 0 or p_previous_hash <> repeat('0', 64) then return 'conflict'; end if;
  elsif p_chain_index <> current_index + 1 or p_previous_hash <> current_hash then
    return 'conflict';
  end if;

  if p_evidence_entry->>'schema' <> 'itmounts-security-evidence-v1'
     or (p_evidence_entry->>'index')::bigint <> p_chain_index
     or p_evidence_entry->>'previousHash' <> p_previous_hash
     or p_evidence_entry->>'hash' <> p_entry_hash
     or p_evidence_entry#>>'{event,engagementId}' <> p_engagement_id
     or p_evidence_entry#>>'{event,eventId}' <> p_event_id then
    return 'conflict';
  end if;

  insert into public.security_repository_patrol_evidence (
    engagement_id, event_id, delivery_id, repository, event_type, chain_index,
    previous_hash, entry_hash, evidence_entry, recorded_at
  ) values (
    p_engagement_id, p_event_id, p_delivery_id, lower(p_repository), p_event_type, p_chain_index,
    p_previous_hash, p_entry_hash, p_evidence_entry,
    (p_evidence_entry#>>'{event,recordedAt}')::timestamptz
  );
  return 'inserted';
end;
$$;

revoke all on function public.append_security_repository_patrol_evidence(text,text,text,text,text,bigint,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.append_security_repository_patrol_evidence(text,text,text,text,text,bigint,text,text,jsonb) to service_role;

comment on table public.security_repository_patrol_evidence is
  'Append-only Referee-authorized repository patrol evidence. Raw webhook bodies and secrets are never stored.';
