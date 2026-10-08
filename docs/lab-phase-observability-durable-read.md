# Lab Phases 1–5 — durable read path

This increment introduces service-role-only tenant-scoped event storage and an owner-only read endpoint at `/api/admin/lab-phase-observability`. It reports all 15 signals through the existing common health contract; zero events mean UNKNOWN, not green. It never grants certification, execution, or repair authority.

Configuration: `ITMOUNTS_LAB_OBSERVABILITY_TENANT_ID` binds this host to one tenant's isolated observations, and `VERCEL_GIT_COMMIT_SHA` binds the exact build revision. Missing configuration, failed reads and schema not yet migrated yield 503, not an invented healthy status. Apply migration `20261008231500_lab_phase_observability.sql` before use.

Only a trusted tenant-authorized backend may write to `lab_phase_observations` using a service-role connection, after verifying signed evidence, source provenance and immutable revision. **No public ingestion endpoint has been added**. Never insert synthetic observations with source=live_runtime. Do not insert customer identifiers, evidence references, secrets or raw logs. The owner route does not export tenant IDs.

Still outstanding: actual runtime write hooks for Phases 1–5, tenant-local deployment configuration, migration execution, dashboard presentation, recurring supervisor checks, on-call delivery, live proof and independent certification. A merged PR alone does not complete this work.
