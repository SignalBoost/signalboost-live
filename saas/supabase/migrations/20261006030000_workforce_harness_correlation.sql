-- Bind one live COS Harness run to the exact graduate Production turn it served.
-- Historical rows remain NULL and therefore cannot be promoted by Harness correlation.
alter table public.cos_workforce_assignments
  add column if not exists harness_run_id text;

create index if not exists cos_workforce_assignments_harness_run_idx
  on public.cos_workforce_assignments (harness_run_id)
  where source_kind = 'production_request' and status = 'served' and harness_run_id is not null;

comment on column public.cos_workforce_assignments.harness_run_id is
  'Server-owned COS Production Harness run that delivered this graduate turn. NULL for historical/shadow evidence; verified outcome correlation requires an exact served production_request match.';
