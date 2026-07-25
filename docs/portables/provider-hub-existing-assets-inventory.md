# Provider Hub Existing Assets Inventory

Status: verified repository map for Issue #650.

This inventory completes phase 1 of the Provider Hub implementation sequence. It maps existing assets before any `provider-hub-core` or `provider-hub-host` extraction.

## Existing reusable assets

| Area | Verified path | Current responsibility | Intended ownership |
|---|---|---|---|
| Product contract | `docs/portables/provider-hub-byok-portable.md` | Defines dual-audience product, safety boundaries, roadmap, and readiness gates. | Product documentation |
| Provider configuration port | `saas/lib/engine/providerConfigStore.ts` | Host-replaceable persistence seam for encrypted user provider configuration and provider registry reads. | Move interface/types toward `provider-hub-core`; keep Supabase adapter in `provider-hub-host` |
| Secret lifecycle helpers | `saas/lib/engine/userProviderConfigs.ts` | Provider and key-name sanitization, encryption, decryption, masking, retrieval, and merge-on-save behavior. | Split safe metadata contracts into core; keep encryption implementation and plaintext access in host |
| Vault crypto | `saas/lib/vault/crypto.ts` | SignalBoost encryption/decryption implementation used by BYOK configuration. | Host-only vault adapter |
| User configuration API | `saas/app/api/config/provider/route.ts` | Authenticated HTTP boundary for reading masked configuration and saving provider settings. | SignalBoost host API |
| Runtime consumption | `saas/app/api/execute-runner/route.ts` | Reads authorized user provider configuration before provider execution. | Consumer integration; must depend on a bounded Provider Hub service rather than raw storage |
| Provider metadata | `saas/lib/provider-framework/` | Canonical provider metadata, registration, capability, and SDK boundary. | Compose from Provider Hub; do not duplicate or turn into orchestration/storage |
| Provider action governance | `saas/app/api/hub/action/` and `saas/lib/hub/` | Reviewed capability discovery, preview, approval, and governed provider-action paths. | Console Hub integration; Provider Hub must reuse governance rather than create a parallel executor |
| Existing tests | `saas/tests/userProviderConfigs.node.test.ts` | Covers BYOK configuration behavior including safe secret handling. | Retain; extend with Provider Hub contract, tenant, and compatibility tests |
| Database tables | `user_provider_configs`, `provider_registry` as consumed by `providerConfigStore.ts` | Persist encrypted user configuration and active provider registry metadata. | SignalBoost host persistence adapter |

## Current trust boundaries

1. Raw provider values enter only through the authenticated host API.
2. `userProviderConfigs.ts` encrypts values before persistence.
3. `ProviderConfigStore` stores encrypted envelopes and can be replaced by a buyer adapter.
4. UI/API reads must return masked values, never decrypted secrets.
5. Runtime decryption is a host concern and must occur only for an authorized execution path.
6. Provider metadata and capability discovery must remain separate from credentials.
7. Provider mutation, spend, publishing, browser execution, and infrastructure changes remain governed elsewhere.

## Duplication risks

Provider Hub must not create:

- a second provider registry beside `saas/lib/provider-framework/` and `provider_registry`;
- a second provider action executor beside Console Hub and the Universal Provider Framework;
- a second vault implementation inside portable core;
- direct Supabase access from portable core;
- a client-visible secret retrieval API;
- a separate approval or policy engine.

## Proposed boundary

### `provider-hub-core`

Node-safe, host-neutral contracts only:

- provider connection identity and lifecycle metadata;
- authentication-method metadata without secret values;
- bounded capability, environment, region, validation, and health records;
- `ProviderConfigStore`-style persistence port types;
- vault, identity, audit, approval, and notification port contracts;
- strict sanitized response schemas;
- deterministic validation and compatibility helpers.

The core must not import Next.js, Supabase, SignalBoost vault crypto, Console Hub routes, or provider SDK credentials.

### `provider-hub-host`

SignalBoost and buyer-specific adapters:

- Supabase persistence adapter;
- SignalBoost vault encryption adapter;
- authenticated API routes and UI;
- identity and tenant resolution;
- audit and approval integration;
- Universal Provider Framework and Console Hub composition;
- runtime secret resolution after authorization.

## Verified gaps

The repository does not yet expose a dedicated Provider Hub self-service surface that presents connection lifecycle, masked credential status, validation state, authorized consumer products, replace/rotate/disconnect controls, and manual setup guidance as one first-class product experience.

The repository also does not yet have a versioned host-neutral Provider Hub public contract or a complete tenant/environment isolation test suite for that boundary.

## Next bounded implementation slice

Create `saas/provider-hub-core/` with versioned, Node-safe connection metadata and port contracts. Adapt the existing `ProviderConfigStore` interface without moving Supabase or vault code into core. Add tests proving:

- no secret-shaped fields can appear in public connection metadata;
- tenant and environment identity are mandatory;
- records are immutable and versioned;
- the core has no Next.js, Supabase, vault, or provider-execution imports;
- the existing SignalBoost store can satisfy the new persistence port through a host adapter.

## Non-claims

This inventory does not claim production packaging, external deployment, enterprise vault support, OAuth completion, provider validation coverage, licensing, high availability, or commercial readiness. It changes no runtime behavior and authorizes no provider action.
