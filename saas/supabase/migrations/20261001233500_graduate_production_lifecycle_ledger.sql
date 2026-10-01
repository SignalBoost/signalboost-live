-- Buyer-auditable post-graduation artifact lifecycle ledger.
-- Append-only, sanitized, and cryptographically chained. No prompt/response text is stored.

create table if not exists public.cos_university_graduate_lifecycle_events (
  id uuid primary key default gen_random_uuid(),
  registry_id uuid not null,
  candidate_id text not null,
  trained_artifact_hash text not null,
  event_type text not null check (event_type in (
    'graduated','activated','serving_started','serving_succeeded','serving_failed',
    'verified_outcome','health_observed','drift_detected','remediation_started',
    'retraining_started','reevaluation_started','reactivated','rollback','retired'
  )),
  correlation_id text,
  evidence_hash text not null check (evidence_hash ~ '^[0-9a-f]{64}$'),
  previous_event_hash text check (previous_event_hash is null or previous_event_hash ~ '^[0-9a-f]{64}$'),
  event_hash text not null unique check (event_hash ~ '^[0-9a-f]{64}$'),
  evidence jsonb not null default '{}'::jsonb,
  observed_at timestamptz not null default now()
);
create index if not exists cos_graduate_lifecycle_registry_time_idx
  on public.cos_university_graduate_lifecycle_events(registry_id, observed_at desc);
create index if not exists cos_graduate_lifecycle_artifact_time_idx
  on public.cos_university_graduate_lifecycle_events(trained_artifact_hash, observed_at desc);
comment on table public.cos_university_graduate_lifecycle_events is
  'Append-only cryptographically chained evidence for each graduated artifact from activation through Production serving, outcomes, health, remediation, rollback, and retirement. Sanitized: no raw prompt/response text.';
alter table public.cos_university_graduate_lifecycle_events enable row level security;
revoke all on public.cos_university_graduate_lifecycle_events from anon, authenticated;

create or replace function public.append_cos_graduate_lifecycle_event(
  p_registry_id uuid,
  p_candidate_id text,
  p_trained_artifact_hash text,
  p_event_type text,
  p_correlation_id text,
  p_evidence_hash text,
  p_evidence jsonb,
  p_observed_at timestamptz default now()
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_previous text;
  v_event_hash text;
  v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_registry_id::text, 0));
  select event_hash into v_previous
    from public.cos_university_graduate_lifecycle_events
   where registry_id = p_registry_id
   order by observed_at desc, id desc
   limit 1;
  v_event_hash := encode(digest(
    coalesce(v_previous,'') || '|' || p_registry_id::text || '|' ||
    coalesce(p_candidate_id,'') || '|' || coalesce(p_trained_artifact_hash,'') || '|' ||
    coalesce(p_event_type,'') || '|' || coalesce(p_correlation_id,'') || '|' ||
    coalesce(p_evidence_hash,'') || '|' || p_observed_at::text,
    'sha256'
  ), 'hex');
  insert into public.cos_university_graduate_lifecycle_events(
    registry_id,candidate_id,trained_artifact_hash,event_type,correlation_id,
    evidence_hash,previous_event_hash,event_hash,evidence,observed_at
  ) values (
    p_registry_id,p_candidate_id,p_trained_artifact_hash,p_event_type,p_correlation_id,
    p_evidence_hash,v_previous,v_event_hash,coalesce(p_evidence,'{}'::jsonb),p_observed_at
  ) returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.append_cos_graduate_lifecycle_event(uuid,text,text,text,text,text,jsonb,timestamptz) from public, anon, authenticated;
