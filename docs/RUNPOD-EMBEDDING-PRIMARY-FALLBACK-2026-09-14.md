# RunPod embedding primary with managed fallback — 2026-09-14

## Decision

`LOCAL_AI_BASE_URL` and the existing managed embedding configuration remain the fallback plane. They are **not** repointed to RunPod.

An optional RunPod embedding primary is configured independently with:

- `RUNPOD_PRIMARY_EMBEDDING_BASE_URL`
- `RUNPOD_PRIMARY_EMBEDDING_MODEL`
- `RUNPOD_PRIMARY_EMBEDDING_API_KEY`
- optional `RUNPOD_PRIMARY_EMBEDDING_TIMEOUT_MS`

No primary endpoint is configured by this change, so merging it does not start RunPod compute or change current Production traffic.

## Routing

When a valid RunPod embedding primary is configured:

1. try RunPod first;
2. validate response count and the fixed 768-vector width;
3. on timeout, HTTP failure, malformed response, or wrong vector width, use the existing managed embedding engine unchanged;
4. record safe routing telemetry without prompt content or credentials.

If RunPod primary is absent or its configuration is invalid, the managed embedding engine remains authoritative.

## Vector-space invariant

The RunPod primary model identifier must exactly equal `LOCAL_AI_EMBEDDING_MODEL` before the primary is eligible. Matching dimensions alone are not sufficient: unrelated 768-dimensional embedding models produce incompatible vector spaces. Changing the canonical embedding model requires an explicit database/vector migration and full corpus re-index rather than mixing old and new vectors.

## Credential boundary

The RunPod embedding primary requires its own `RUNPOD_PRIMARY_EMBEDDING_API_KEY`. It never inherits `RUNPOD_API_KEY`, `LOCAL_AI_API_KEY`, or `LOCAL_AI_EMBEDDING_API_KEY`.

## Activation boundary

This PR supplies routing and failover machinery only. Provisioning or enabling a paid RunPod Serverless endpoint is a separate cost-bearing action and requires an explicit deployment decision after price/capacity review and a model-identity canary.
