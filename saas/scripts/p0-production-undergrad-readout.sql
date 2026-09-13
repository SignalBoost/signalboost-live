-- saas/scripts/p0-production-undergrad-readout.sql
-- Read-only undergraduate Production acceptance readout.
-- Bind :commit_sha and :deployment_id to the LIVE Production values.
-- Do not insert, update, or delete rows.

with required(path_id) as (
  values
    ('registered_agent_cycle'),
    ('continuous_learning'),
    ('deliberate_practice'),
    ('independent_exams'),
    ('subject_a_range_evidence'),
    ('language_a_range_evidence'),
    ('delayed_retention'),
    ('graduation')
),
latest as (
  select distinct on (e.path_id)
    e.path_id,
    e.event_key,
    e.deployment_id,
    e.commit_sha,
    e.verifier,
    e.observed_at,
    e.expires_at,
    e.evidence
  from cos_university_learning_assurance_events e
  join required r on r.path_id = e.path_id
  where e.event_type = 'production_path'
  order by e.path_id, e.observed_at desc, e.event_key desc
)
select
  r.path_id,
  l.event_key,
  l.commit_sha,
  l.deployment_id,
  l.verifier,
  l.observed_at,
  l.expires_at,
  coalesce((l.evidence->>'featureEnabled')::boolean, false) as feature_enabled,
  coalesce((l.evidence->>'invocationSucceeded')::boolean, false) as invocation_succeeded,
  l.evidence->>'runnerInvoked' as runner_invoked,
  l.evidence->>'skipped' as skipped,
  l.evidence->>'dailyCadence' as daily_cadence,
  l.evidence->>'attempted' as attempted,
  case
    when l.event_key is null then 'missing'
    when l.verifier is distinct from 'host_production_verifier' then 'wrong_verifier'
    when l.commit_sha is distinct from :commit_sha then 'stale_commit'
    when l.deployment_id is distinct from :deployment_id then 'wrong_deployment'
    when l.expires_at is null or l.expires_at <= now() then 'expired'
    when coalesce((l.evidence->>'featureEnabled')::boolean, false) is not true then 'flag_off'
    when coalesce((l.evidence->>'invocationSucceeded')::boolean, false) is not true then 'invocation_failed'
    when l.evidence->>'skipped' = 'true' then 'idle_skip'
    when l.evidence->>'runnerInvoked' = 'false' then 'idle_skip'
    when l.evidence->>'dailyCadence' = 'not_due' then 'idle_skip'
    when l.evidence is null then 'execution_evidence_missing'
    else 'verified_candidate'
  end as acceptance_status
from required r
left join latest l on l.path_id = r.path_id
order by r.path_id;
