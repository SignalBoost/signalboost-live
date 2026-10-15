# Customer LAB observability acceptance plan — 2026-10-15

This document is about the commercial iTMounts AI University customer LAB, **not** COS Residency. Request telemetry is already emitted as structured `lab_request` Vercel logs with `x-lab-observation-id`, timing, operation, response status and severity. This PR adds a sanitized `lab_...` error category when the API returns a recognized machine error; raw customer content remains excluded.

## What is NOT yet implemented
- Durable, queryable per-customer and per-run event timelines with permission-scoped operator diagnostics.
- Cross-request/cross-worker trace IDs linked to a training-run stage, provider job and callback (without plaintext identity in logs).
- A customer-facing support-reference workflow and stage-specific explanation/remediation UI that uses those traces.
- Production alerting, issue clustering, anomaly detection, SLOs, retention/deletion controls, and verified incident replay.
- Explicit verification of EU residency and tenant-access controls for any future persistent telemetry store.

## Next acceptance batch
1. Design minimal event schema: observation ID, run ID scoped by organization, bounded operation, lifecycle stage, classified failure code, elapsed time, outcome; pseudonymize identity for operations reporting. Record no secrets, datasets, prompts, user-generated text or third-party error body.
2. Add tenant-isolated append-only run event storage with retention and access policies; instrument training reservation, provider submission, job recovery, stage callbacks, cancellation and artifact delivery. Record unknown provider submission outcomes as *uncertain*, not failed or retried automatically.
3. Add authenticated customer trace view and restricted operator diagnosis view. Return support-safe references and actionable recovery guidance without exposing private payloads or giving infrastructure access to LAB supervisors.
4. Verify representative good, failed, timeout, canceled and ambiguous-cost run trajectories with synthetic workflows and production telemetry. Establish alerts and SLOs only from observed events.

**Acceptance:** no unapproved provider spend, no unsafe retries, no cross-tenant reads, no privileged customer platform access, and no claim of production-wide tracing until deployed event pathways are tested.
