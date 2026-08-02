-- saas/supabase/migrations/20260802_supervisor_observation_policy.sql
--
-- OBSERVATION CADENCE IS A POLICY, NOT A CONSTANT.
--
-- The frequency was previously asserted in two places: the platform's cron schedule, and a
-- separate declaration the health check consulted to decide whether a runtime was late. Two
-- statements of one fact drift, and the drift is dangerous in the lenient direction — widen
-- the cron and the console keeps reporting "operational" long after the runtime has actually
-- stopped, because the liveness rule is still measuring against the old interval.
--
-- So the interval lives here, once. The scheduler becomes a TICK — it may fire as often as
-- the platform allows — and this row decides whether an observation is actually due. The
-- health check derives its staleness window from the same row, so the two can no longer
-- disagree about what "late" means.
--
-- WHY THAT MATTERS BEYOND TIDINESS. A buyer running this portable is not on our scheduler.
-- Their cron, their queue, their Kubernetes CronJob — whatever ticks it — reads the same
-- policy. Cadence becomes something an operator changes in the console, not something a
-- vendor changes in a deploy.
--
-- ONE ROW PER OBSERVED SCOPE, so production can be watched closely while a preview
-- environment is watched cheaply or not at all.

create table if not exists supervisor_observation_policy (
  id                    uuid primary key default gen_random_uuid(),
  /** The runtime this governs, matching supervisor_instances.instance_id. */
  instance_id           text        not null,
  environment           text        not null default 'production',

  /** How often an observation is DUE. The tick may fire more often; this decides. */
  interval_seconds      integer     not null,
  /**
   * How many intervals may pass before the runtime is considered absent rather than late.
   * A scheduled job is allowed to be late once — cold starts, a busy platform — without
   * being declared missing.
   */
  staleness_multiplier  numeric(4,2) not null default 2.5,
  /**
   * Whether a genuinely missed run becomes an incident for the orchestrator. This is the
   * only part of the stale-heartbeat story self-healing legitimately owns: a heartbeat
   * ageing between runs is expected, a run that never fires is a fault.
   */
  missed_run_is_incident boolean    not null default true,

  enabled               boolean     not null default true,
  /** Free text, because "why every 15 minutes" is the question a reviewer will ask. */
  rationale             text,
  updated_by            text,
  updated_at            timestamptz not null default now(),
  created_at            timestamptz not null default now(),

  constraint supervisor_observation_policy_unique unique (instance_id, environment),
  -- A minute is the floor because anything tighter costs more in invocations than it buys in
  -- detection, and a day is the ceiling because a runtime nobody checks for longer than that
  -- is not being supervised in any meaningful sense.
  constraint supervisor_observation_interval check (interval_seconds >= 60 and interval_seconds <= 86400),
  constraint supervisor_observation_multiplier check (staleness_multiplier >= 1.0 and staleness_multiplier <= 10.0)
);

comment on table supervisor_observation_policy is
  'How often each Supervisor runtime is due to observe. Single source of truth: the scheduler obeys it and the health check derives its staleness window from it, so they cannot disagree.';
comment on column supervisor_observation_policy.interval_seconds is
  'Observation cadence. The platform scheduler is only a tick — this decides whether a run is actually due.';
comment on column supervisor_observation_policy.staleness_multiplier is
  'Intervals of grace before "late" becomes "absent". 2.5 lets a run be late once without raising an alarm.';
comment on column supervisor_observation_policy.missed_run_is_incident is
  'A heartbeat ageing between scheduled runs is expected and is never an incident. A run that never fires is, and this is what routes it to the orchestrator.';

-- The platform's own runtime, seeded to match the cadence it already runs at. Recorded with
-- its reasoning so the number is reviewable rather than inherited.
insert into supervisor_observation_policy (instance_id, environment, interval_seconds, staleness_multiplier, missed_run_is_incident, rationale, updated_by)
values (
  'vercel-observation-cron',
  'production',
  900,
  2.5,
  true,
  'Fifteen minutes: a failed deployment is worth catching within one release cycle, and each run costs an invocation plus provider API calls. Tightening below five minutes buys little detection for meaningfully more spend; loosening past an hour means a bad deploy can sit unobserved through a working morning.',
  'system'
)
on conflict (instance_id, environment) do nothing;
