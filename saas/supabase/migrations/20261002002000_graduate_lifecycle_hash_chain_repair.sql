-- Repair lifecycle hashing for Supabase extension schema and make append order explicit.
alter table public.cos_university_graduate_lifecycle_events
  add column if not exists chain_sequence bigint;

with ranked as (
  select id, row_number() over (partition by registry_id order by observed_at, id)::bigint as seq
  from public.cos_university_graduate_lifecycle_events
)
update public.cos_university_graduate_lifecycle_events e
set chain_sequence = ranked.seq
from ranked
where ranked.id=e.id and e.chain_sequence is null;

create unique index if not exists cos_graduate_lifecycle_registry_sequence_uidx
  on public.cos_university_graduate_lifecycle_events(registry_id, chain_sequence);

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
  v_sequence bigint;
  v_event_hash text;
  v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_registry_id::text, 0));
  select event_hash, chain_sequence into v_previous, v_sequence
    from public.cos_university_graduate_lifecycle_events
   where registry_id = p_registry_id
   order by chain_sequence desc nulls last, observed_at desc, id desc
   limit 1;
  v_sequence := coalesce(v_sequence,0)+1;
  v_event_hash := encode(extensions.digest(
    coalesce(v_previous,'') || '|' || p_registry_id::text || '|' ||
    coalesce(p_candidate_id,'') || '|' || coalesce(p_trained_artifact_hash,'') || '|' ||
    coalesce(p_event_type,'') || '|' || coalesce(p_correlation_id,'') || '|' ||
    coalesce(p_evidence_hash,'') || '|' || p_observed_at::text,
    'sha256'
  ), 'hex');
  insert into public.cos_university_graduate_lifecycle_events(
    registry_id,candidate_id,trained_artifact_hash,event_type,correlation_id,
    evidence_hash,previous_event_hash,event_hash,evidence,observed_at,chain_sequence
  ) values (
    p_registry_id,p_candidate_id,p_trained_artifact_hash,p_event_type,p_correlation_id,
    p_evidence_hash,v_previous,v_event_hash,coalesce(p_evidence,'{}'::jsonb),p_observed_at,v_sequence
  ) returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.append_cos_graduate_lifecycle_event(uuid,text,text,text,text,text,jsonb,timestamptz) from public, anon, authenticated;
