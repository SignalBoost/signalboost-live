# Provider Hub Reference Deployment

This directory packages the phase 7 reference deployment and external-host integration example for the versioned Provider Hub contracts.

## Contents

- `reference-deployment.ts` composes deterministic in-memory host ports for contract validation and buyer evaluation.
- `external-host-example.ts` shows how a buyer supplies identity, vault, persistence, audit, approval, licensing, and UI adapters without changing Provider Hub core.

## Boundary

These examples are non-production, execution-free, and network-free. They do not start a server, contact a provider, decrypt or reveal credentials, mutate provider accounts, approve actions automatically, publish content, spend money, use browser automation, or change infrastructure.

The reference vault returns opaque references only. The approval adapter always returns `pending`. The persistence adapter exposes allowlisted public connection metadata only. Buyers must replace every in-memory adapter with their own reviewed production implementation before deployment.

## Integration sequence

1. Implement the seven host ports from `provider-hub-core/host-ports.ts`.
2. Keep tenant and environment scope in every identity and persistence lookup.
3. Store credentials in a buyer-controlled vault and return opaque references only.
4. Keep approvals explicit and fail closed when ownership, authorization, licensing, or durable state cannot be verified.
5. Project only sanitized Provider Hub metadata to browser or operator surfaces.
6. Run the Provider Hub contract, isolation, compatibility, and reference-deployment tests before packaging.
