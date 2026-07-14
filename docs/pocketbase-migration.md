# PocketBase migration

This migration is intentionally staged. Setting `BACKEND_PROVIDER=pocketbase` before the collections, users, files, and application adapters are ready would break production.

## Target architecture

- PocketBase runs as a single persistent service with its SQLite database and uploaded files on a mounted volume.
- Vercel connects to PocketBase over HTTPS.
- Nightly encrypted snapshots of `pb_data` are copied to a separate provider or object store.
- GitHub Actions checks `/api/health` every 30 minutes.
- Supabase remains read-only during validation and is removed after final reconciliation.

PocketBase removes Supabase organization-wide egress quota enforcement, but the VPS/provider can still have bandwidth, storage, billing, and availability limits. No infrastructure can provide a literal zero-lockout guarantee.

## Required Vercel variables

Keep `BACKEND_PROVIDER=supabase` during migration.

```text
BACKEND_PROVIDER=supabase
POCKETBASE_URL=https://api-pb.signalboostapp.com
NEXT_PUBLIC_POCKETBASE_URL=https://api-pb.signalboostapp.com
POCKETBASE_ADMIN_EMAIL=<stored only as a protected server-side secret>
POCKETBASE_ADMIN_PASSWORD=<stored only as a protected server-side secret>
```

At final cutover:

```text
BACKEND_PROVIDER=pocketbase
```

Never expose the PocketBase admin credentials through `NEXT_PUBLIC_*` variables.

## Deployment

The repository contains:

- `infrastructure/pocketbase/Dockerfile`
- `infrastructure/pocketbase/fly.toml.example`
- `.github/workflows/pocketbase-watchdog.yml`

The container requires a reviewed `PB_VERSION` build argument. Create a persistent volume mounted at `/pb/pb_data`; without it, all records and files will disappear when the container is replaced.

## Migration sequence

1. Deploy PocketBase and create the first administrator through its installer page.
2. Configure Google and GitHub OAuth in the PocketBase `users` auth collection.
3. Create destination collections matching the approved schema inventory.
4. Add a text field named `legacy_id` to migrated collections and index it uniquely where possible.
5. Run `node saas/scripts/pocketbase-migrate.mjs` for non-auth records.
6. Export and copy Supabase Storage objects separately, preserving original paths in a mapping table.
7. Import user identities and metadata into the PocketBase auth collection.
8. Require password reset for password users and account relinking for OAuth users.
9. Replace Supabase data calls module by module through the backend abstraction.
10. Run record-count, foreign-key mapping, file-count, and sampled-content validation.
11. Switch Vercel to `BACKEND_PROVIDER=pocketbase`.
12. Keep Supabase read-only for a rollback window before removal.

## Authentication limitation

Supabase does not provide a supported export of usable passwords, refresh tokens, OAuth tokens, or active sessions for transplant into PocketBase. Email addresses, IDs, roles, and profile metadata can be migrated. Existing users must establish a new PocketBase credential through password reset or OAuth relinking. Old Supabase sessions must be considered invalid after cutover.

## Current restriction

The Supabase organization currently responds with HTTP 402 for API and Auth requests. The migration utility cannot read records or files until dashboard access, a database export, or service restoration provides the source data. Code preparation and PocketBase deployment can proceed independently.

## Validation endpoint

Once configured, the SaaS exposes:

```text
GET /api/backend/health
```

It returns HTTP 200 when the selected backend is healthy and HTTP 503 when PocketBase is unavailable.
