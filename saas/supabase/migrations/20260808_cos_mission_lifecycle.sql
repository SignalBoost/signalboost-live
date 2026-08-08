-- Durable, queryable lifecycle metadata for re-entrant COS missions.
-- The complete mission record remains in state JSONB; these columns let operators,
-- cron workers, and readiness views identify active/blocked/completed missions without
-- interpreting model output or loading the full state blob.

alter table public.cos_autonomy_state
  add column if not exists status text not null default 'INITIALIZED',
  add column if not exists iteration integer not null default 0,
  add column if not exists blocked_reason text,
  add column if not exists completed_at timestamptz;

create index if not exists cos_autonomy_state_status_idx
  on public.cos_autonomy_state(status, updated_at desc);

comment on column public.cos_autonomy_state.status is
  'Deterministic COS mission lifecycle status; never derived from model prose.';
comment on column public.cos_autonomy_state.iteration is
  'Number of persisted re-entrant mission ticks executed.';
comment on column public.cos_autonomy_state.blocked_reason is
  'Concrete governance, credential, budget, or unrecoverable block reason.';
comment on column public.cos_autonomy_state.completed_at is
  'Set only when deterministic mission completion gates pass.';
