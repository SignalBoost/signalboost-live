# Runbook: Supabase Disk I/O Budget Exhaustion

**Incident date:** 2026-09-20 / 2026-09-21 UTC  
**Production project:** `SignalBoost's Project` (`qpblefwtnbivuusxmabv`)  
**Status:** Resolved by compute resize from Nano to Small. No emergency data deletion or training shutdown was required.

## Purpose

Use this runbook when Supabase reports that the project is close to exhausting, or has exhausted, its Disk I/O Budget; when database-backed COS/University/Self-Healing operations suddenly become slow; or when Postgres requests begin timing out despite the project still reporting healthy.

The key lesson from this incident is:

> Do not assume high Disk I/O means the database is full or that one application loop is runaway. First verify the compute tier, distinguish sustained legitimate work from redundant churn, and restore infrastructure headroom before changing learning/evidence semantics.

## What happened

The Supabase Infrastructure page showed the Production database at the edge of the Nano compute envelope:

- CPU: about 93%
- Memory: about 74%
- Disk I/O budget: 100%
- Database: about 504.7–504.9 MB
- WAL: about 128 MB
- System: about 171.5 MB
- Provisioned disk used: about 0.79 GB of 2 GB

Supabase also displayed the warning that the project was about to deplete its Disk I/O Budget and that, once the burst budget was exhausted, disk throughput would fall back to a much lower baseline until the budget reset.

The project remained logically healthy, but an early diagnostic SQL probe timed out while connecting. That combination — healthy control-plane status plus I/O-budget exhaustion and transient query/connectivity slowness — is a resource-saturation signal, not evidence of a data-corruption event.

Storage capacity itself was not the problem. The database was well below the provisioned disk limit and the project was configured to auto-expand storage when needed.

## Why Nano was the wrong tier

The organization was already on Supabase Pro, but this project was still running on a legacy Nano instance inherited from an earlier configuration.

At the time of the incident:

- Nano exposed up to about 0.5 GB memory.
- The database itself had reached roughly 500 MB.
- CPU was near saturation.
- The daily/burst Disk I/O budget had been consumed.

This meant the workload had outgrown the compute tier even though the project had not run out of disk space.

Do not confuse **disk capacity** with **disk I/O capacity**. Increasing disk size alone would not have fixed this incident.

## Immediate remediation

The Production database compute size was changed from **Nano** to **Small**.

Small was chosen instead of Micro because the workload includes continuous learning, University distillation/evaluation, Self-Healing, embeddings, campaign processing, and evidence/audit ledgers. The extra memory/headroom was worth the small cost difference and avoided moving from one marginal tier to another.

No io2 migration, extra provisioned IOPS, read replica, or emergency data purge was performed.

Supabase compute changes can restart Postgres and may cause a short interruption. Treat the resize as an infrastructure change and verify it after the dashboard reports completion.

## How the fix was verified

The resize was verified from the live database rather than trusting only the dashboard selection.

### Verify Postgres restarted and inspect the effective connection ceiling

```sql
select
  current_setting('max_connections')::int as max_connections,
  pg_postmaster_start_time() as postgres_started_at,
  now() - pg_postmaster_start_time() as uptime,
  pg_size_pretty(pg_database_size(current_database())) as database_size;
```

Immediately after the 2026-09-20/21 resize, Production reported:

- `max_connections = 90`
- a fresh Postgres start time
- database size about 490 MB

At that time, `90` matched the expected Small-tier connection ceiling. Future engineers must compare against Supabase's current published limits rather than assuming this number is permanent.

### Verify there is no active runaway workload

```sql
select
  state,
  coalesce(wait_event_type, '') as wait_event_type,
  coalesce(wait_event, '') as wait_event,
  count(*) as connections,
  round(
    max(extract(epoch from (now() - query_start)))
      filter (where state = 'active')::numeric,
    2
  ) as max_active_seconds
from pg_stat_activity
where datname = current_database()
group by 1,2,3
order by connections desc;
```

After the resize, the database showed approximately:

- 9 idle client connections
- 1 active query at essentially 0 seconds
- no evidence of a long-running runaway query

### Verify the application query bridge

The operator-facing iTMounts **Tier 1 Providers -> Supabase Workspace -> SQL Editor** should also execute a harmless read query successfully. During this incident's recovery, the workspace SQL Engine returned a normal one-row result after the resize, confirming that the application-side Supabase query bridge was functional again.

This is a supplemental health check only. A successful one-row query does not replace database-side resource checks, but it proves the application's provider integration can once again reach and read Production.

### Check cache/deadlocks

```sql
select
  round(
    100.0 * sum(blks_hit) /
    nullif(sum(blks_hit) + sum(blks_read), 0),
    2
  ) as cache_hit_pct,
  pg_size_pretty(sum(temp_bytes)::bigint) as temp_bytes,
  sum(deadlocks) as deadlocks
from pg_stat_database
where datname = current_database();
```

Post-resize observations:

- cache hit rate: about 99.99%
- deadlocks: 0

A very high historical `temp_bytes` value is cumulative and is not by itself proof of a current runaway query.

## Investigation findings

The investigation found substantial database activity, but it is important not to overstate which activity was causal.

### Continuous-learning embeddings

`pg_stat_statements` showed roughly 10,895 embedding UPDATE calls against `cos_continuous_learning`, with significant WAL/dirty-page activity.

At first this looked like a possible rewrite loop. A later state check showed:

- about 10,893 rows already embedded with `BAAI/bge-base-en-v1.5`
- 0 missing vectors among those current-model rows
- additional unembedded rows still legitimately pending

The near 1:1 relationship between historical embedding updates and current-model embedded rows means the large embedding-write total was **mostly legitimate one-time backfill**, not established runaway rewrite amplification.

Do not disable or deduplicate embedding writes solely because this historical counter is large. First compare update counts to the number of rows that actually required embedding.

### University assurance ledger

The assurance ledger was a significant write source. During the incident it had accumulated many recurring Production-path receipts, including thousands from the mass-distillation campaign and evaluator lanes.

Examples observed during investigation included:

- mass-distillation campaign: 5,923 Production-path rows
- mass-distilled independent evaluation: 2,288 Production-path rows
- mass-distillation supervision: 1,244 Production-path rows
- continuous learning: 928 Production-path rows
- deliberate practice: 889 Production-path rows
- ordinary distilled evaluation: 834 Production-path rows

Several lanes had high repetition ratios. For example, the ordinary distilled evaluator had only a small number of distinct evidence hashes across hundreds of rows, and many of those rows represented skipped/no-op executions.

The mass-distillation campaign receipts were also large: a single receipt could contain a deeply nested workflow snapshot including teacher-pool/provider state, reconciliation data, recovery state, curriculum state, capacity state, and other diagnostics.

This is a plausible optimization area, but it was **not changed as part of the incident recovery**. The audit/evidence ledger has governance semantics, so future optimization must preserve append-only evidence where a material execution, authorization, failure, evaluation, spend event, or state transition actually occurred.

Safe future optimization candidates include:

- coalescing repeated no-op/skip receipts when doing so does not remove required execution evidence;
- recording compact summaries for routine heartbeat/no-op observations instead of repeating large nested snapshots;
- keeping full durable evidence for material executions, failures, authorizations, evaluations and state transitions;
- measuring write reduction before and after any change.

Do not silently weaken University evidence, promotion gates, rollback evidence, spend controls, or Self-Healing auditability to reduce database writes.

### Campaign queue and Supervisor audit scans

The investigation also observed high historical scan/update counts on:

- `cos_campaign_queue`
- `supervisor_audit_events`

These are future indexing/query-efficiency candidates, especially if Disk I/O starts climbing again on Small. However, they were not proven to be the single root cause of this incident.

## Recurrence procedure

When this warning appears again, follow this order.

### 1. Confirm whether the problem is capacity or a current runaway query

Check:

- Supabase Infrastructure: CPU, Memory, Disk I/O, compute size.
- Disk usage separately from Disk I/O.
- `pg_stat_activity` for long-running active queries.
- `pg_stat_statements` for statements with high calls, execution time, block reads/writes, WAL bytes, and temp I/O.

Do not perform expensive diagnostic scans repeatedly while the database is already I/O constrained. Start with small bounded queries.

### 2. Check the compute tier before changing application code

If the database is still on an undersized tier and CPU/Memory/I/O are simultaneously near the ceiling, restore infrastructure headroom first.

For this workload, Nano is no longer an acceptable Production baseline.

As of this incident, Small was the chosen Production floor. Re-evaluate that decision against current Supabase limits and actual Production metrics rather than treating it as permanent forever.

### 3. Resize safely if needed

Before resizing:

- confirm the current project/ref;
- confirm there is no active database migration or other maintenance that must not be interrupted;
- expect a Postgres restart/short interruption;
- do not combine the resize with unrelated schema/data changes.

After resizing:

- verify `pg_postmaster_start_time()`;
- verify effective settings/limits;
- verify ordinary application/database traffic resumes;
- recheck active queries;
- watch CPU/Memory/Disk I/O over the next normal workload cycle.

### 4. Distinguish legitimate batch work from write amplification

For every high-write statement, ask:

1. How many application/database rows legitimately needed this write?
2. Are the same rows being rewritten with identical state?
3. Is a timestamp/random UUID causing a new durable row on every heartbeat?
4. Is the payload much larger than the decision/state change it represents?
5. Is the write required evidence, or merely telemetry that could be summarized elsewhere?

For embeddings specifically, compare current-model embedded-row count to historical update count before declaring a loop.

For assurance events, compare total rows to distinct `evidence_hash` values and inspect how many rows are skipped/no-op observations.

### 5. Optimize only after the live database is stable

Potential software remedies, when supported by evidence:

- make state updates idempotent;
- skip UPDATEs when persisted values are already equal;
- add indexes for frequently filtered/ordered columns;
- reduce unnecessary sequential scans;
- batch bounded writes where semantics permit;
- separate heartbeat/telemetry from immutable governance evidence;
- compact repeated no-op observations without removing material audit evidence.

Any University/Self-Healing ledger change must preserve governance and evidence semantics.

## Useful diagnostic queries

### Top I/O/WAL statements

Requires `pg_stat_statements`.

```sql
select
  left(regexp_replace(query, '\\s+', ' ', 'g'), 220) as query,
  calls,
  round(total_exec_time::numeric, 1) as total_ms,
  round(mean_exec_time::numeric, 2) as avg_ms,
  shared_blks_read,
  shared_blks_dirtied,
  shared_blks_written,
  temp_blks_read,
  temp_blks_written,
  wal_records,
  wal_fpi,
  wal_bytes
from pg_stat_statements
order by (
  coalesce(shared_blks_read, 0) +
  coalesce(shared_blks_dirtied, 0) +
  coalesce(shared_blks_written, 0) +
  coalesce(temp_blks_read, 0) +
  coalesce(temp_blks_written, 0)
) desc
limit 20;
```

### High-churn tables

```sql
select
  schemaname,
  relname,
  n_live_tup,
  n_dead_tup,
  seq_scan,
  idx_scan,
  n_tup_ins,
  n_tup_upd,
  n_tup_del,
  vacuum_count,
  autovacuum_count,
  analyze_count,
  autoanalyze_count,
  pg_size_pretty(pg_total_relation_size(relid)) as total_size
from pg_stat_user_tables
order by (n_tup_ins + n_tup_upd + n_tup_del) desc
limit 25;
```

### University ledger repetition

```sql
select
  path_id,
  count(*) as rows,
  count(distinct evidence_hash) as distinct_evidence,
  round(
    count(*)::numeric /
    nullif(count(distinct evidence_hash), 0),
    2
  ) as rows_per_evidence,
  count(*) filter (
    where coalesce((evidence->>'skipped')::boolean, false)
  ) as skipped_rows
from public.cos_university_learning_assurance_events
where event_type = 'production_path'
group by path_id
order by rows desc;
```

### Embedding-state sanity check

```sql
select
  embedding_model,
  count(*) as rows,
  count(*) filter (where embedding is null) as missing_vector,
  count(*) filter (where embedding is not null) as with_vector
from public.cos_continuous_learning
group by embedding_model
order by rows desc;
```

## What not to do

Do not:

- delete University/Self-Healing evidence to make the warning disappear;
- disable learning/distillation merely because historical WAL is high;
- assume a large embedding UPDATE count is a loop without comparing it to rows legitimately embedded;
- buy io2/additional IOPS before proving the compute tier and query behavior require it;
- add a read replica to solve a write-heavy workload;
- increase disk size and expect that alone to restore I/O throughput;
- make multiple unrelated infrastructure and code changes at once;
- treat historical dashboard percentages immediately after a resize as proof the resize failed.

## Resolution record

The 2026-09-20/21 incident was resolved by:

1. identifying that the Pro project was still on legacy Nano compute;
2. confirming Nano was at the edge of CPU/memory/database-size and had consumed the Disk I/O burst budget;
3. resizing Production from Nano to Small;
4. verifying the Postgres restart and Small-tier effective settings from SQL;
5. confirming normal live activity, 99.99% cache hit rate and zero deadlocks after the resize;
6. re-evaluating the suspected embedding write loop and determining that the historical embedding writes were mostly legitimate one-time backfill;
7. leaving learning/distillation semantics unchanged rather than introducing an unnecessary emergency code change.

**Current operational lesson:** restore headroom first, measure second, optimize only the writes proven redundant.
