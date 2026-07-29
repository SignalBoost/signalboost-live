-- saas/supabase/migrations/20260729_supervisor_demo_records_production_kind.sql
--
-- ALLOW A PRODUCTION RUN TO BE PUBLISHED.
--
-- The original table accepted only 'rehearsal' and 'drill', because production repair history
-- names real infrastructure and a share link is public. That was the right default on the day
-- it was written, and it became the wrong one the moment the supervisor detected its first
-- real incident: the strongest evidence this product will ever produce was the one thing that
-- could not be sent to a buyer.
--
-- The protection moves rather than disappears. The publishing route now MASKS provider
-- identifiers in every string at every depth — dpl_…, prj_…, team_… and *.vercel.app become
-- placeholders — so a reader sees that a specific deployment was identified and diagnosed
-- without learning which one. The existing check constraint below still refuses a payload
-- carrying those keys at the top level, as a backstop for a route that regresses.
--
-- Safe to run twice.

alter table public.supervisor_demo_records
  drop constraint if exists supervisor_demo_records_kind_check;

alter table public.supervisor_demo_records
  add constraint supervisor_demo_records_kind_check
  check (kind in ('rehearsal', 'drill', 'production'));
