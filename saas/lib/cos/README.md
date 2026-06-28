# COS Mining + Predictive — portable module

A self-contained behavioral **data-mining + predictive** engine. It ingests interaction and
transaction events, mines features / behavior segments (K-means) / association patterns
(Apriori), forecasts each user's next-best-actions and propensity, and ships an admin
dashboard — fully localized in five languages. The whole `lib/cos/` folder moves to another
project as a unit: internal imports are all relative, configuration is env-only, i18n is
bundled, and the host injects auth through a small adapter.

This is packaged like the `infra-pr` and `console-core` modules so it can be licensed and
dropped into a fresh codebase.

## Folder map (portable core — relative imports only)

```
lib/cos/
  README.md                this file
  migration.sql            schema (5 tables + RLS + run audit)
  host.ts                  identity/auth seam — host implements CosHost / role checks
  predictive.ts            next-best-action + propensity (pure, swappable for a trained model)
  overview.ts              assembles the admin dashboard payload from a MiningStore
  i18n.ts                  cosT() / localizeFeatureName() / localizeMeta()
  i18n/dictionaries.ts     bundled en/es/pt/pl/ru dictionaries (source of truth)
  ui/MiningDashboard.tsx   portable admin cockpit (client component, localized, endpoint-driven)
  mining/
    types.ts               shared types + FEATURE_JSON_SCHEMA + stable FEATURE_NAMES
    algorithms.ts          K-means (k-means++), Apriori, linear regression — zero deps
    features.ts            feature extraction + standardized vectors + Apriori baskets
    storage.ts             MiningStore interface + Supabase adapter (live) + Azure seam
    pipeline.ts            ETL (Extract → Transform → Load) + run audit
```

## Host bindings (must live under `app/` — Next.js requirement)

Thin files that import the module and add only auth + routing:

```
app/api/cos/events/route.ts              ingest events (authenticated)
app/api/cron/cos-mining/route.ts         scheduled mining job (CRON_SECRET)
app/api/features/user/[id]/route.ts      mined features for one user
app/api/predict/user/[id]/route.ts       forecast (next-best-action + propensity)
app/api/cos/mining/overview/route.ts     admin cockpit aggregates
app/dashboard/cos-mining/page.tsx        renders <MiningDashboard lang={…} />
```

## Port to a fresh project

1. Copy `lib/cos/` as-is.
2. Run `lib/cos/migration.sql` against Postgres (Supabase-compatible).
3. Provide a storage backend: set `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (default), or
   implement `AzureMiningStore` and set `COS_MINING_BACKEND=azure`.
4. Implement the host seam: give each route an identity via your auth, mapped to
   `{ id, email, role }`, then reuse `isMiningAdmin` / `canReadUser` from `host.ts`.
5. Add the six thin bindings under `app/` (or your framework's equivalent) and one cron.
6. i18n is already bundled; no `/locales` dependency. To localize host chrome, call
   `cosT(lang, 'path')`.

The only host-specific imports live in the `app/` bindings (auth + framework). The core has
none.

## Predictive contract

`forecastUser(features, recentTokens, rules)` → `{ predictions[], propensity }`.
`predictions` are `{ action, score, confidence, basis }`; `propensity` is
`{ engagement, churn_risk, value }` in 0..1. Predictions are derived transparently from the
mined Apriori rules + feature vector — swap in a trained model later by returning the same
shape and nothing downstream changes.

## i18n

Five languages (en/es/pt/pl/ru), bundled in `i18n/dictionaries.ts`, identical structure.
Every UI string resolves through `cosT()` — no hard-coded English. The standalone
`/locales/cos.*.json` copies are kept for the host's wider toolchain and validated by
`scripts/verify-cos-locale-parity.mjs` (wire it into CI). Polish/Russian run ~30% longer —
the dashboard uses min-width + wrapping, never fixed-width controls.

## Security & compliance

No raw credentials stored; provider tokens stay in the host vault, Azure keys in Key Vault.
Ingestion stamps `user_id` from the verified session. Feature reads are RLS-scoped to the
owner (admin may read any). Every mining run writes an audit row. Cron is `CRON_SECRET`-gated.
