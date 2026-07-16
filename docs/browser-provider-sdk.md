# Browser Provider SDK

The Browser Provider Abstraction Layer (BPAL) is a provider-neutral metadata SDK between Browser Runtime consumers and provider-specific definitions. It contains no execution, credentials, browser launch, mutations, approval, orchestration, or Supervisor logic.

## Components

- `ProviderRegistry`: deterministic registration, lookup, removal, serialization, health, version, and capability access.
- `CapabilityRegistry`: immutable read-only capability metadata with maturity, risk, API/browser support, evidence, verification, navigation, origins, and versions.
- Origin, navigation, selector, verification, and evidence registries: the only canonical provider metadata sources.
- Provider versioning: provider, capability, and schema versions are explicit and deterministic.

## Registration boundary

Registration is a fail-closed trust boundary. Adapters must use an exact, versioned shape; canonical HTTPS origins; unique profile and capability identifiers; read-only capability risk; and references that resolve to declared origins, navigation, verification, and evidence profiles. Unknown fields, duplicate identifiers or operations, invalid timestamps, noncanonical origins, mismatched versions, and dangling references are rejected before the adapter becomes visible.

The registry stores a detached, deeply frozen snapshot. Later changes to the caller-owned adapter object cannot alter registered origins, selectors, capabilities, verification assertions, evidence requirements, health, localization, or version metadata.

## Vercel

The initial adapter defines read-only metadata for deployment status/logs/failures, domains, project metadata, environment-variable metadata, dashboard evidence, and dashboard/API comparison. It does not execute or authenticate.

## Expansion

Future Stripe, GitHub, Supabase, Cloudflare, AWS, and Azure adapters implement `BrowserProviderAdapter`, provide localized display metadata, register deterministic profiles, and remain read-only until separately governed.

## Integration boundary

BPAL remains a metadata-only layer. Browser Runtime and Supervisor integrations must consume its exported contracts without introducing a second provider registry, duplicate Vercel adapter, credential handling, dashboard mutations, or production browser execution. This boundary resolves the overlapping Mission 001 implementations while preserving the canonical SDK already present on `main`.
