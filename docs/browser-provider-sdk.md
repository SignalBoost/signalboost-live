# Browser Provider SDK

The Browser Provider Abstraction Layer (BPAL) is a provider-neutral metadata SDK between Browser Runtime consumers and provider-specific definitions. It contains no execution, credentials, browser launch, mutations, approval, orchestration, or Supervisor logic.

## Components

- `ProviderRegistry`: deterministic registration, lookup, removal, serialization, health, version, and capability access.
- `CapabilityRegistry`: immutable read-only capability metadata with maturity, risk, API/browser support, evidence, verification, navigation, origins, and versions.
- Origin, navigation, selector, verification, and evidence registries: the only canonical provider metadata sources.
- Provider versioning: provider, capability, and schema versions are explicit and deterministic.

## Vercel

The initial adapter defines read-only metadata for deployment status/logs/failures, domains, project metadata, environment-variable metadata, dashboard evidence, and dashboard/API comparison. It does not execute or authenticate.

## Expansion

Future Stripe, GitHub, Supabase, Cloudflare, AWS, and Azure adapters implement `BrowserProviderAdapter`, provide localized display metadata, register deterministic profiles, and remain read-only until separately governed.
