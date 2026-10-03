-- saas/supabase/migrations/20261003014000_university_assembly_line_queue.sql
-- Owner 2026-10-02: "If Station 2 is occupied, the artifact enters a visible queue with position, lease and expected
-- start time." The lifecycle ledger already owned one obligation per artifact; this adds the line's own bookkeeping
-- so a waiting unit can say WHERE it is in the queue and WHEN it should start, instead of only that it is late.
-- Additive and idempotent: no column is dropped, no existing row is rewritten, and the grant stays service_role only.
alter table public.cos_university_lifecycle_orchestration
  add column if not exists station text,
  add column if not exists queue_position integer,
  add column if not exists expected_start_at timestamptz,
  add column if not exists lease_until timestamptz,
  add column if not exists lease_holder text,
  add column if not exists handoff_source text;

-- Backfill the station from the stage the controller already recorded, so existing rows join the line as they are.
update public.cos_university_lifecycle_orchestration
  set station = stage
  where station is null;

alter table public.cos_university_lifecycle_orchestration
  add constraint cos_university_lifecycle_orchestration_station_check
  check (station is null or station in ('EXACT_CANARY','INDEPENDENT_EVALUATION','QUARANTINE_REMEDIATION','GRADUATION','WORKFORCE','TERMINAL'))
  not valid;

-- The controller's two hot reads: a station's queue in order, and the live leases that say which lanes are busy.
create index if not exists cos_university_lifecycle_orchestration_station_queue_idx
  on public.cos_university_lifecycle_orchestration (station, stage_entered_at)
  where terminal = false;
create index if not exists cos_university_lifecycle_orchestration_lease_idx
  on public.cos_university_lifecycle_orchestration (station, lease_until)
  where terminal = false and lease_until is not null;

revoke all on public.cos_university_lifecycle_orchestration from public, anon, authenticated;
grant select, insert, update on public.cos_university_lifecycle_orchestration to service_role;
-- end of saas/supabase/migrations/20261003014000_university_assembly_line_queue.sql (if this line is missing, the paste was cut short)