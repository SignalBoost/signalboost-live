# COS Data-Mining Layer

The mining layer turns raw behavioral and transactional logs into **mined features** that
the COS predictive models consume to forecast a user's next action. It also detects
behavior **segments** (K-means) and **association patterns** (Apriori).

## Data flow

```
ingest (client/providers)
   └─► POST /api/cos/events ──► MiningStore.appendEvents ──► cos_events   (raw lake)

scheduled job (Vercel cron, daily/weekly)
   └─► /api/cron/cos-mining ──► runMiningPipeline
          Extract:   loadEvents(window)            from cos_events
          Transform: extractFeatures               (frequency, amounts, hour, device, …)
                     kmeans(vectors, k)             behavior segments
                     apriori(baskets)               association rules
          Load:      writeFeatures / writeSegments / writeRules
          Audit:     cos_mining_runs (one row per run)

predictive layer
   └─► GET /api/features/user/{id} ──► { features[], segment } ──► models
```

## Modules

| File | Role |
|---|---|
| `lib/cos/mining/types.ts` | Shared types + `FEATURE_JSON_SCHEMA` + stable `FEATURE_NAMES` |
| `lib/cos/mining/storage.ts` | `MiningStore` interface + Supabase adapter (live) + Azure adapter (seam) |
| `lib/cos/mining/features.ts` | Feature extraction, standardized cluster vectors, Apriori baskets |
| `lib/cos/mining/algorithms.ts` | Pure-TS K-means (k-means++), Apriori, linear regression |
| `lib/cos/mining/pipeline.ts` | ETL orchestrator + run audit |
| `app/api/cos/events/route.ts` | Authenticated ingestion (server-stamped `user_id`) |
| `app/api/cron/cos-mining/route.ts` | Scheduled job (`?job=daily|weekly`), CRON_SECRET |
| `app/api/features/user/[id]/route.ts` | Feature exposure for the predictive layer |
| `mining/databricks/cos_mining_job.py` | External Azure/Databricks scale-out (same logic) |

## How the predictive layer consumes features

Call `GET /api/features/user/{id}`. A user can read their own features; owner/admin can
read anyone's. Response:

```json
{
  "ok": true,
  "user_id": "…uuid…",
  "segment": 3,
  "count": 9,
  "features": [
    { "user_id": "…", "feature_name": "avg_deposit_cents", "value": 42500, "timestamp": "2026-06-27T…Z" },
    { "user_id": "…", "feature_name": "preferred_txn_hour", "value": 20, "timestamp": "2026-06-27T…Z" }
  ]
}
```

Each item validates against the deliverable schema (`FEATURE_JSON_SCHEMA` in `types.ts`):

```json
{ "user_id": "uuid", "feature_name": "string", "value": 0, "timestamp": "date-time" }
```

A model builds its input vector by selecting the `FEATURE_NAMES` it needs and reading
`value` per `feature_name` (treat missing features as 0). Names are stable contracts —
add new ones, don't rename existing ones.

### Phase-1 feature set

`event_frequency_per_day`, `transaction_count`, `avg_deposit_cents`, `avg_transfer_cents`,
`preferred_txn_hour`, `dominant_device_code` (0 unknown / 1 mobile / 2 desktop / 3 tablet),
`campaign_engagement_rate`, `recency_days`, `amount_trend_slope`.

## Scheduling

`vercel.json` runs two crons against the same route:

- daily  — `/api/cron/cos-mining` (look-back 2 days, incremental)
- weekly — `/api/cron/cos-mining?job=weekly` (look-back 30 days, full re-segment)

The daily job is bounded by `maxEvents` so it stays within `maxDuration`. For volumes
beyond a single function run, switch to the Databricks job and point the API at the same
feature store.

## Storage backends (Azure reconciliation)

The spec calls for Azure Data Lake + Cosmos DB + Databricks. The deployable stack is
Vercel + Supabase, so:

- **Live now:** `SupabaseMiningStore` — raw events in `cos_events`, features in
  `cos_user_features`. Runs entirely in-stack.
- **Scale-out:** set `COS_MINING_BACKEND=azure` and implement `AzureMiningStore`
  (`@azure/storage-file-datalake` for raw events, `@azure/cosmos` for features) — the
  `MiningStore` interface is identical, so the pipeline and routes don't change. Heavy
  jobs run on Databricks via `cos_mining_job.py`.

This keeps one code path live today while leaving a clean swap to Azure when that infra
is stood up. No Azure claim is made until the adapter and creds exist.

## i18n enforcement (day-one, five languages)

- Every COS UI string resolves through `cosT(site_language, 'path')` in `lib/cos/i18n.ts`.
  No hard-coded English.
- Dictionaries: `/locales/cos.{en,es,pt,pl,ru}.json`, **identical structure**, native copy.
- SEO metadata is localized via `localizeMeta(site_language)`; feature labels via
  `localizeFeatureName(...)`. Machine names stay English (model contracts); only display
  labels are translated.
- `site_language` flows from the request/site context into every label, CTA, and meta tag.
- CI guard `scripts/verify-cos-locale-parity.mjs` fails the build on any missing key, extra
  key, or empty value. A COS page does not ship unless all five dictionaries are complete.
- Polish & Russian run ~30% longer than English — use min-width + wrapping, not fixed-width
  controls, on any COS card/button.

## Security & compliance

- **No raw credentials stored.** Mining only ever reads derived, non-secret signals.
  Provider tokens remain in the encrypted vault; Azure keys come from Key Vault / env.
- Ingestion stamps `user_id` from the verified session — clients cannot spoof identity.
- Feature reads are RLS-scoped to the owner (owner/admin may read any).
- Every mining run writes an audit row to `cos_mining_runs` (status, counts, actor, error).
- Cron is protected by `CRON_SECRET` bearer auth.

## Required env

| Var | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | mining store (live) |
| `CRON_SECRET` | authorize the scheduled job |
| `COS_MINING_BACKEND` | `supabase` (default) or `azure` |
| `COS_EVENTS_PATH` + Azure SDK creds (Key Vault) | only when backend = azure / Databricks |

## Install order

1. Run `supabase/migrations/20260627_cos_mining.sql` in Supabase SQL.
2. Commit the `lib/cos/mining/*`, `lib/cos/i18n.ts`, the three routes, the five
   `locales/cos.*.json`, and the parity script.
3. Replace `vercel.json` to register the two crons.
4. Wire `scripts/verify-cos-locale-parity.mjs` into the QA workflow.
```
```
