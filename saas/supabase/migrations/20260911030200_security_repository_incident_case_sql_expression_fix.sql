create table if not exists public.security_repository_incident_cases (
  case_id text primary key,
  engagement_id text not null,
  repository text not null,
  severity text not null check (severity in ('warning', 'critical')),
  status text not null default 'open' check (status in ('open', 'investigating', 'contained', 'remediated', 'verified', 'closed')),
  first_observed_at timestamptz not null,
  last_observed_at timestamptz not null,
  evidence_count bigint not null default 1 check (evidence_count > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (engagement_id, repository)
);

create table if not exists public.security_repository_incident_case_events (
  id bigint generated always as identity primary key,
  case_id text not null references public.security_repository_incident_cases(case_id),
  evidence_event_id text not null,
  evidence_entry_hash text not null unique check (evidence_entry_hash ~ '^[a-f0-9]{64}$'),
  event_type text not null,
  severity text not null check (severity in ('warning', 'critical')),
  indicator_observations jsonb not null check (pg_catalog.jsonb_typeof(indicator_observations) = 'array'),
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (case_id, evidence_event_id)
);

create index if not exists security_repository_incident_cases_repo_time_idx on public.security_repository_incident_cases (repository, last_observed_at desc);
create index if not exists security_repository_incident_case_events_case_time_idx on public.security_repository_incident_case_events (case_id, occurred_at, id);

alter table public.security_repository_incident_cases enable row level security;
alter table public.security_repository_incident_case_events enable row level security;
revoke all on table public.security_repository_incident_cases from public, anon, authenticated, service_role;
revoke all on table public.security_repository_incident_case_events from public, anon, authenticated, service_role;
revoke all on sequence public.security_repository_incident_case_events_id_seq from public, anon, authenticated, service_role;
grant select on table public.security_repository_incident_cases to service_role;
grant select on table public.security_repository_incident_case_events to service_role;

create or replace function public.append_security_repository_patrol_evidence(
  p_engagement_id text, p_event_id text, p_delivery_id text, p_repository text,
  p_event_type text, p_chain_index bigint, p_previous_hash text, p_entry_hash text,
  p_evidence_entry jsonb
) returns text language plpgsql security definer set search_path = '' as $$
declare
  current_index bigint;
  current_hash text;
  incident_indicators jsonb;
  incident_severity text;
  incident_case_id text;
  incident_recorded_at timestamptz;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_engagement_id, 0));
  if exists (select 1 from public.security_repository_patrol_evidence where delivery_id = p_delivery_id or event_id = p_event_id) then return 'duplicate'; end if;

  select chain_index, entry_hash into current_index, current_hash from public.security_repository_patrol_evidence
  where engagement_id = p_engagement_id order by chain_index desc limit 1;
  if current_index is null then
    if p_chain_index <> 0 or p_previous_hash <> pg_catalog.repeat('0', 64) then return 'conflict'; end if;
  elsif p_chain_index <> current_index + 1 or p_previous_hash <> current_hash then return 'conflict';
  end if;

  if p_evidence_entry->>'schema' <> 'itmounts-security-evidence-v1'
     or (p_evidence_entry->>'index')::bigint <> p_chain_index
     or p_evidence_entry->>'previousHash' <> p_previous_hash
     or p_evidence_entry->>'hash' <> p_entry_hash
     or p_evidence_entry#>>'{event,engagementId}' <> p_engagement_id
     or p_evidence_entry#>>'{event,eventId}' <> p_event_id then return 'conflict';
  end if;

  incident_recorded_at := (p_evidence_entry#>>'{event,recordedAt}')::timestamptz;
  insert into public.security_repository_patrol_evidence (engagement_id,event_id,delivery_id,repository,event_type,chain_index,previous_hash,entry_hash,evidence_entry,recorded_at)
  values (p_engagement_id,p_event_id,p_delivery_id,pg_catalog.lower(p_repository),p_event_type,p_chain_index,p_previous_hash,p_entry_hash,p_evidence_entry,incident_recorded_at);

  select coalesce(pg_catalog.jsonb_agg(observation), '[]'::jsonb) into incident_indicators
  from pg_catalog.jsonb_array_elements(coalesce(p_evidence_entry#>'{event,observations}', '[]'::jsonb)) observation
  where observation->>'kind' = 'defensive_indicator';

  if pg_catalog.jsonb_array_length(incident_indicators) > 0 then
    incident_severity := case when exists (
      select 1 from pg_catalog.jsonb_array_elements(incident_indicators) observation
      where observation->>'value' like any (array['history_rewrite_observed:%','permission_boundary_change_observed:%','branch_protection_change_observed:%'])
    ) then 'critical' else 'warning' end;
    incident_case_id := p_engagement_id || ':repository:' || pg_catalog.lower(p_repository);

    insert into public.security_repository_incident_cases (case_id,engagement_id,repository,severity,status,first_observed_at,last_observed_at,evidence_count)
    values (incident_case_id,p_engagement_id,pg_catalog.lower(p_repository),incident_severity,'open',incident_recorded_at,incident_recorded_at,1)
    on conflict (engagement_id, repository) do update set
      severity = case when public.security_repository_incident_cases.severity = 'critical' or excluded.severity = 'critical' then 'critical' else 'warning' end,
      last_observed_at = greatest(public.security_repository_incident_cases.last_observed_at, excluded.last_observed_at),
      evidence_count = public.security_repository_incident_cases.evidence_count + 1,
      updated_at = pg_catalog.now();

    insert into public.security_repository_incident_case_events (case_id,evidence_event_id,evidence_entry_hash,event_type,severity,indicator_observations,occurred_at)
    values (incident_case_id,p_event_id,p_entry_hash,p_event_type,incident_severity,incident_indicators,incident_recorded_at);
  end if;
  return 'inserted';
end;
$$;

revoke all on function public.append_security_repository_patrol_evidence(text,text,text,text,text,bigint,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.append_security_repository_patrol_evidence(text,text,text,text,text,bigint,text,text,jsonb) to service_role;

create or replace function public.reject_security_repository_incident_case_event_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin raise exception 'security_repository_incident_case_events_are_append_only'; end;
$$;
drop trigger if exists security_repository_incident_case_events_immutable on public.security_repository_incident_case_events;
create trigger security_repository_incident_case_events_immutable before update or delete on public.security_repository_incident_case_events
for each row execute function public.reject_security_repository_incident_case_event_mutation();
revoke all on function public.reject_security_repository_incident_case_event_mutation() from public, anon, authenticated, service_role;

comment on table public.security_repository_incident_cases is 'Durable repository-security incident case snapshots derived only from explicit Referee-authorized defensive indicators.';
comment on table public.security_repository_incident_case_events is 'Append-only incident timeline linked to tamper-evident repository patrol evidence hashes; contains observations, never automatic attribution.';
