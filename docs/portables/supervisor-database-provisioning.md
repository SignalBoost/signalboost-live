<!-- docs/portables/supervisor-database-provisioning.md -->

# Provisioning the supervisor database

On 28 July 2026 an inventory found **fifteen of the sixteen tables the supervisor stack
expects did not exist** on the platform's own Supabase project. The observation cron had been
running every fifteen minutes for weeks with nowhere to write. Nothing surfaced it, because
one page crashed without naming the cause and another caught the same error and reported an
empty state.

This page is the order to apply them in, and what each one turns on.

**Committing a migration file creates nothing.** The file is text in a repository. Each one
has to be executed against the database — Hub → Supabase Workspace → SQL Editor, or the
Supabase dashboard's own editor. Open the migration in GitHub, copy its whole contents, paste,
run.

---

## Order

Dependencies run downward. Apply them in this sequence.

| # | Migration | Creates | Turns on |
|---|---|---|---|
| 1 | `20260716_supervisor_execution_history.sql` | `supervisor_executions`, `supervisor_audit_events`, `supervisor_evidence` | Execution records, the audit trail, verification evidence |
| 2 | `20260716_supervisor_federated_coordination.sql` | `supervisor_work_items`, `supervisor_leases`, `supervisor_instances`, `supervisor_coordination_events` | Work distribution and leasing — the observation cron refuses to start without this |
| 3 | `20260718_supervisor_coordination_security_hardening.sql` | — | Hardening for the above. Apply immediately after 2 |
| 4 | `20260718_supervisor_dispatch_ledger.sql` | `supervisor_dispatch_ledger` | The durable dispatch ledger |
| 5 | `20260717_github_universal_provider_runtime.sql` | `provider_connections` | Which provider projects the observer watches |
| 6 | `20260717_vercel_deployment_health_intelligence.sql` | `vercel_deployment_health_runs` | **The production repair history** |
| 7 | `20260717_vercel_deployment_health_intelligence_hardening.sql` | — | Hardening for 6. Apply immediately after |
| 8 | `20260717_vercel_observation_triggers.sql` | `vercel_observation_triggers` | Trigger ingestion and deduplication |

Steps 1 through 8 are what the Self-Healing Supervisor needs. Stop there if that is what you
are working on.

The mission tables are a different subsystem and are not required by the supervisor:

| # | Migration | Creates |
|---|---|---|
| 9 | `20260723_mission_002_durable_outbox.sql` | `mission_records`, `mission_outbox`, `mission_event_inbox` |
| 10 | `20260723_mission_002_manual_reviews.sql` | `mission_manual_reviews` |
| 11 | `20260723_mission_002_manual_review_rpc_hardening.sql` | — |

---

## After each one

Re-run `supabase/checks/supervisor-table-inventory.sql`. It prints MISSING or present for
every expected table, so progress is visible rather than assumed. If a migration errors, stop
and read it — a later one may depend on it.

## When steps 1–8 are done

`/dashboard/supervisor/vercel-health` should load instead of returning a server error. It will
be empty, which is now the honest answer: the tables exist and nothing has been observed yet.

Then the observation cron can do its work. It needs, in the deployment environment:
`VERCEL_PROJECT_ID`, `VERCEL_PROVIDER_CONNECTION_ID`, `VERCEL_API_TOKEN`, `VERCEL_TEAM_ID`,
and `VERCEL_OBSERVATION_ENVIRONMENT`. Redeploy after setting them — they are read at process
start.

---

## Why this went unnoticed, and what to change

Two habits let a whole persistence layer stay absent while the code that needed it ran on a
schedule.

**A migration in the repository is not a migration in the database, and nothing here records
which have been applied.** The inventory query is the substitute until something better
exists. Run it whenever a capability appears wired but inert.

**Error handling that is too forgiving hides the diagnosis.** The operator console called the
health store with no catch and produced a bare server error. The demo page caught the same
failure and reported that nothing had been observed — plausible, wrong, and far more
misleading than a crash. A missing store is not an empty result, and the two should never
look alike.
