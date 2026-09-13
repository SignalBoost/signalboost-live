> **Read with [ONBOARD.md](../ONBOARD.md)** — repository operating doctrine and current-state handoff.

# COS Recognition & Lifeline (critical)

COS (Chief of Staff) must remain operational without silently substituting a hosted model provider. Owner recognition, independent reasoning health, and optional hosted fallback are separate concerns.

## 1. Required runtime boundaries

The owner Assistant depends on:

- **`OWNER_EMAILS`** — contains the exact authorized owner login address(es), normalized by the access resolver. Owner/admin privilege comes from the canonical owner allowlist in `saas/lib/auth/access.ts`; a database role does not silently create owner authority.
- **Independent COS reasoner configuration** — `LOCAL_AI_BASE_URL`, `LOCAL_AI_MODEL`, and the matching local/provider credential and host allowlist used by the configured COS reasoner. `/api/cos/status` verifies the actual reasoner health instead of treating a hosted-provider key as proof that COS is alive.

`ANTHROPIC_API_KEY` is **not** a COS lifeline requirement. Anthropic is an optional provider integration only. Ordinary Concierge and independent COS reasoning must not require it.

Hosted-model fallback is separately governed by **`COS_EXTERNAL_AI_FALLBACK_ENABLED`**. It is disabled unless explicitly set to `true`. A forgotten or stale hosted-provider key must therefore not silently turn provider-independent reasoning into paid fallback.

First-party SignalBoost/COS text generation is normalized to the local provider at the shared platform AI port and legacy `callModel()` compatibility seam. Stale `modelPreference: 'claude'` or `modelPreference: 'openai'` hints in older first-party callers therefore cannot select a hosted provider. Explicit customer/provider adapters and governed external-teacher integrations remain separate surfaces.

COS autonomy is also local-only. The scheduled autonomy runtime no longer accepts `COS_AUTONOMY_MODEL` as a hosted-provider selector, and its readiness check is satisfied only by the configured independent COS reasoner—not by the presence of Anthropic or OpenAI keys.

## 2. Failure modes

### Owner recognition failure

If `OWNER_EMAILS` does not match the authenticated login, `getAccess()` does not create an owner context. The caller receives the customer Concierge boundary and owner-only actions are unavailable.

### Independent reasoner failure

If the owner is recognized but the configured COS reasoner is missing or unhealthy, the owner channel is **degraded**. The remedy is to repair the local/provider-independent COS configuration — not to add an Anthropic key.

### Hosted fallback

Hosted fallback is optional. It may run only when the platform's governed fallback policy explicitly enables it. Provider credentials by themselves are not authorization to invoke that provider.

## 3. Detection

`GET /api/cos/status` reports:

- `mode: "cos"` — owner recognized and the independent COS reasoner is configured and healthy.
- `mode: "degraded"` — owner recognized, but the independent COS reasoner is not configured or unhealthy.
- `mode: "concierge"` — caller is not recognized as owner.

The response also reports `localReasoner`, `cloudFallbackEnabled`, and `providerIndependent`. The Assistant badge consumes this status so a downgrade is visible before the owner sends a task.

`GET /api/admin/cos-reasoner/health` uses the same fallback rule as runtime: `fallbackEnabled` is true only when `COS_EXTERNAL_AI_FALLBACK_ENABLED=true` exactly. Missing or unrelated hosted-provider keys do not change that status.

## 4. Restore steps

1. Verify the authenticated login is authorized by `OWNER_EMAILS`.
2. Verify `LOCAL_AI_BASE_URL`, `LOCAL_AI_MODEL`, the configured reasoner credential, and `LOCAL_AI_ALLOWED_HOSTS` match the intended COS runtime.
3. Keep `COS_EXTERNAL_AI_FALLBACK_ENABLED` unset/false for provider-independent operation. Enable it only as an intentional policy decision.
4. Redeploy after environment changes.
5. Confirm `/api/cos/status` reports `mode: "cos"`, a healthy local reasoner, and the expected fallback state.

Do **not** restore COS by adding `ANTHROPIC_API_KEY`. If an old Anthropic credential still exists, it should be removed when no optional Anthropic integration needs it, but its mere presence must not control COS health or public Concierge behavior.

## 5. Anti-confabulation guard

The support brain already contains structural action-integrity checks: owner-only tools are access-gated, execution claims are checked against tools that actually fired, and non-owner replies cannot truthfully claim an owner mutation that never occurred. Preserve this rule when adding tools: a model may describe an action only after the real executor returns success evidence.

## 6. Provider-independence invariant

The canonical invariant is:

> Local/COS reasoning and live evidence retrieval come first. A hosted model is never selected merely because its API key happens to be present. Hosted fallback requires an explicit policy opt-in and recorded provenance.

This invariant applies independently to Concierge, COS, Builder, specialist routing, and future agent/tool loops. Optional provider adapters may remain available for customers or explicitly governed integrations without becoming hidden runtime dependencies.
