create table if not exists public.security_repository_evidence_chain (
  chain_index bigint primary key check (chain_index >= 0),
  delivery_id text not null unique check (char_length(delivery_id) between 1 and 128),
  engagement_id text not null check (char_length(engagement_id) between 1 and 256),
  repository text not null check (repository ~ '^[A-Za-z0-9_.-]{1,100}/[A-Za-z0-9_.-]{1,100}$'),
  provider_event text not null check (provider_event ~ '^[a-z0-9_]{1,128}$'),
  payload_sha256 text not null check (payload_sha256 ~ '^[a-f0-9]{64}$'),
  previous_hash text not null check (previous_hash ~ '^[a-f0-9]{64}$'),
  entry_hash text not null unique check (entry_hash ~ '^[a-f0-9]{64}$'),
  evidence_entry jsonb not null check (jsonb_typeof(evidence_entry) = 'object'),
  indicators jsonb not null default '[]'::jsonb check (jsonb_typeof(indicators) = 'array'),
  recorded_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists security_repository_evidence_engagement_time_idx
  on public.security_repository_evidence_chain (engagement_id, recorded_at desc);
create index if not exists security_repository_evidence_engagement_repository_idx
  on public.security_repository_evidence_chain (engagement_id, repository);

alter table public.security_repository_evidence_chain enable row level security;
revoke all on public.security_repository_evidence_chain from anon, authenticated;
grant select on public.security_repository_evidence_chain to service_role;

create or replace function public.append_security_repository_evidence(
  p_delivery_id text,
  p_repository text,
  p_provider_event text,
  p_payload_sha256 text,
  p_engagement_id text,
  p_chain_index bigint,
  p_previous_hash text,
  p_entry_hash text,
  p_evidence_entry jsonb,
  p_indicators jsonb,
  p_recorded_at timestamptz
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_index bigint;
  current_hash text;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('security_repository_evidence_chain'));

  if exists (select 1 from public.security_repository_evidence_chain where delivery_id = p_delivery_id) then
    return 'duplicate';
  end if;

  select chain_index, entry_hash into current_index, current_hash
  from public.security_repository_evidence_chain
  order by chain_index desc
  limit 1;

  if current_index is null then
    if p_chain_index <> 0 or p_previous_hash <> repeat('0', 64) then return 'chain_conflict'; end if;
  elsif p_chain_index <> current_index + 1 or p_previous_hash <> current_hash then
    return 'chain_conflict';
  end if;

  insert into public.security_repository_evidence_chain (
    chain_index, delivery_id, engagement_id, repository, provider_event, payload_sha256,
    previous_hash, entry_hash, evidence_entry, indicators, recorded_at
  ) values (
    p_chain_index, p_delivery_id, p_engagement_id, lower(p_repository), p_provider_event,
    lower(p_payload_sha256), lower(p_previous_hash), lower(p_entry_hash), p_evidence_entry,
    p_indicators, p_recorded_at
  );
  return 'appended';
end;
$$;

revoke all on function public.append_security_repository_evidence(text,text,text,text,text,bigint,text,text,jsonb,jsonb,timestamptz)
  from public, anon, authenticated;
grant execute on function public.append_security_repository_evidence(text,text,text,text,text,bigint,text,text,jsonb,jsonb,timestamptz)
  to service_role;

create or replace function public.prevent_security_repository_evidence_mutation()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  raise exception 'security_repository_evidence_chain is append-only';
end;
$$;

revoke all on function public.prevent_security_repository_evidence_mutation() from public, anon, authenticated;
grant execute on function public.prevent_security_repository_evidence_mutation() to service_role;

drop trigger if exists security_repository_evidence_immutable on public.security_repository_evidence_chain;
create trigger security_repository_evidence_immutable
before update or delete on public.security_repository_evidence_chain
for each row execute function public.prevent_security_repository_evidence_mutation();
