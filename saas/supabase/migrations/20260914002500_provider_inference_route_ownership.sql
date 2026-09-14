-- Distinguish compute-provider dependency from iTMounts model ownership.
-- No prompts, responses, credentials or hidden reasoning are stored.

alter table public.provider_inference_usage
  add column if not exists route_owner text
    check (route_owner is null or route_owner in ('itmounts','external')),
  add column if not exists graduate_candidate_id text,
  add column if not exists graduate_artifact_id text,
  add column if not exists graduate_artifact_hash text
    check (graduate_artifact_hash is null or graduate_artifact_hash ~ '^[a-f0-9]{64}$'),
  add column if not exists fallback_from_owned boolean not null default false;

create index if not exists provider_inference_usage_owner_created_idx
  on public.provider_inference_usage (route_owner, created_at desc);
create index if not exists provider_inference_usage_graduate_created_idx
  on public.provider_inference_usage (graduate_candidate_id, created_at desc)
  where graduate_candidate_id is not null;

comment on column public.provider_inference_usage.route_owner is
  'Model/runtime ownership attribution. Compute provider remains separately recorded in provider.';
comment on column public.provider_inference_usage.fallback_from_owned is
  'True only when an attempted active iTMounts graduate failed and the bounded base runtime fallback was used.';

-- PostgreSQL CREATE OR REPLACE VIEW requires existing output columns to retain their positions.
-- Preserve the original 11-column contract and append ownership fields only at the end.
create or replace view public.provider_inference_usage_hourly
with (security_invoker = true)
as
select
  date_trunc('hour', created_at) as hour,
  provider,
  model,
  feature,
  count(*)::bigint as requests,
  count(*) filter (where success)::bigint as successful_requests,
  coalesce(sum(prompt_tokens), 0)::bigint as prompt_tokens,
  coalesce(sum(completion_tokens), 0)::bigint as completion_tokens,
  coalesce(sum(total_tokens), 0)::bigint as total_tokens,
  coalesce(sum(cached_prompt_tokens), 0)::bigint as cached_prompt_tokens,
  sum(provider_estimated_cost_usd) as provider_estimated_cost_usd,
  route_owner,
  count(*) filter (where fallback_from_owned)::bigint as owned_fallback_requests
from public.provider_inference_usage
group by 1, 2, 3, 4, 12;

create or replace view public.provider_inference_usage_daily
with (security_invoker = true)
as
select
  date_trunc('day', created_at) as day,
  provider,
  model,
  feature,
  count(*)::bigint as requests,
  count(*) filter (where success)::bigint as successful_requests,
  coalesce(sum(prompt_tokens), 0)::bigint as prompt_tokens,
  coalesce(sum(completion_tokens), 0)::bigint as completion_tokens,
  coalesce(sum(total_tokens), 0)::bigint as total_tokens,
  coalesce(sum(cached_prompt_tokens), 0)::bigint as cached_prompt_tokens,
  sum(provider_estimated_cost_usd) as provider_estimated_cost_usd,
  route_owner,
  count(*) filter (where fallback_from_owned)::bigint as owned_fallback_requests
from public.provider_inference_usage
group by 1, 2, 3, 4, 12;

revoke all on public.provider_inference_usage_hourly from anon, authenticated;
revoke all on public.provider_inference_usage_daily from anon, authenticated;
