-- Provider-boundary inference billing telemetry.
-- This table stores usage metadata only: never prompts, responses, credentials, or hidden reasoning.
create table if not exists public.provider_inference_usage (
  id uuid primary key default gen_random_uuid(),
  request_id text not null unique,
  provider text not null,
  model text not null,
  feature text not null,
  correlation_id text null,
  agent_id text null,
  purpose text null,
  prompt_tokens integer null check (prompt_tokens is null or prompt_tokens >= 0),
  completion_tokens integer null check (completion_tokens is null or completion_tokens >= 0),
  total_tokens integer null check (total_tokens is null or total_tokens >= 0),
  cached_prompt_tokens integer null check (cached_prompt_tokens is null or cached_prompt_tokens >= 0),
  provider_estimated_cost_usd numeric null check (provider_estimated_cost_usd is null or provider_estimated_cost_usd >= 0),
  cost_source text not null default 'unreported' check (cost_source in ('provider_reported', 'unreported')),
  success boolean not null,
  http_status integer null,
  latency_ms integer not null default 0 check (latency_ms >= 0),
  finish_reason text null,
  created_at timestamptz not null default now()
);

comment on table public.provider_inference_usage is
  'Service-only provider-boundary inference usage and provider-reported cost. Stores no prompt, response, credential, or hidden reasoning.';
comment on column public.provider_inference_usage.provider_estimated_cost_usd is
  'Provider-reported request cost when supplied by the API response; null is unknown, never guessed.';

alter table public.provider_inference_usage enable row level security;
revoke all on public.provider_inference_usage from anon, authenticated;

create index if not exists provider_inference_usage_created_idx
  on public.provider_inference_usage (created_at desc);
create index if not exists provider_inference_usage_feature_created_idx
  on public.provider_inference_usage (feature, created_at desc);
create index if not exists provider_inference_usage_model_created_idx
  on public.provider_inference_usage (model, created_at desc);

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
  sum(provider_estimated_cost_usd) as provider_estimated_cost_usd
from public.provider_inference_usage
group by 1, 2, 3, 4;

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
  sum(provider_estimated_cost_usd) as provider_estimated_cost_usd
from public.provider_inference_usage
group by 1, 2, 3, 4;

revoke all on public.provider_inference_usage_hourly from anon, authenticated;
revoke all on public.provider_inference_usage_daily from anon, authenticated;
