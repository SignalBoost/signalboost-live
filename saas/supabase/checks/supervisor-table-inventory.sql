-- saas/supabase/checks/supervisor-table-inventory.sql
--
-- WHICH SUPERVISOR TABLES ACTUALLY EXIST.
--
-- This repository holds migration files, but nothing records which of them have been run
-- against the live database. The gap surfaced on 28 July 2026: the Vercel observer had been
-- scheduled every 15 minutes for weeks and could never write a single run, because
-- vercel_deployment_health_runs had never been created. The operator console reported a
-- server error; the demo page, which caught the same failure, reported politely that nothing
-- had been observed. Neither said the store was missing.
--
-- Run this in the SQL editor. Every row marked MISSING is a capability that is wired,
-- scheduled, and silently unable to persist anything.
--
-- Safe to run at any time: it reads catalogue metadata and touches no data.

with expected(table_name, purpose) as (
  values
    ('vercel_deployment_health_runs', 'Vercel observer run records — the production repair history'),
    ('vercel_observation_triggers',   'Observation trigger ingestion and deduplication'),
    ('provider_connections',          'Which provider projects the observer watches'),
    ('supervisor_executions',         'Execution records for dispatched repairs'),
    ('supervisor_dispatch_ledger',    'Durable dispatch ledger'),
    ('supervisor_audit_events',       'Audit events emitted by dispatch'),
    ('supervisor_evidence',           'Evidence captured during verification'),
    ('supervisor_work_items',         'Coordination work items'),
    ('supervisor_leases',             'Coordination leases'),
    ('supervisor_instances',          'Registered supervisor instances'),
    ('supervisor_coordination_events','Coordination event history'),
    ('supervisor_demo_records',       'Published demo records for share links'),
    ('mission_records',               'Mission records'),
    ('mission_outbox',                'Mission outbox'),
    ('mission_event_inbox',           'Mission event inbox'),
    ('mission_manual_reviews',        'Mission manual review queue')
)
select
  e.table_name,
  case when t.table_name is null then 'MISSING' else 'present' end as status,
  e.purpose
from expected e
left join information_schema.tables t
  on t.table_schema = 'public'
 and t.table_name = e.table_name
order by status, e.table_name;
