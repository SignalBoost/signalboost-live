# Entitlements

How licensing works in every portable. Written for the person deploying one.

## What a licence is

A signed statement about what you bought: which product, edition, features, seats, and duration. Your deployment verifies it locally using the issuer public key.

There is no call home. Verification does not touch the network, read an environment variable, or open a file. Air-gapped and connected installations verify the same way.

## Installing a licence

You receive `portable-license.1.<claims>.<signature>`. Store it in your own configuration or vault and pass it to the entitlement gate:

```ts
import { createEntitlementGate } from '<portable>/portable-license/index.ts';

const entitlement = createEntitlementGate({
  productId: 'self-healing-supervisor',
  issuer: '<issuer name from your order>',
  publicKeysPem: [ISSUER_PUBLIC_KEY_PEM],
  token: await yourVault.get('PORTABLE_LICENSE_TOKEN'),
});
```

Keep the token out of source control and screenshots.

## Licence states

| State | What still works | What stops |
| --- | --- | --- |
| `valid` | Everything your edition includes | — |
| `grace` | Everything | Nothing yet |
| `expired` | Reading state, incident history, audit and SIEM output | Executing and dispatching |
| `revoked` | Reading state, incident history, audit and SIEM output | Executing and dispatching |
| `missing` / `malformed` / `bad_signature` | Reading state and audit output | Everything else |

Expiry degrades the product; it does not switch it off. You never lose access to your own operational records. `entitlement.describe()` returns a safe one-line status and never includes the token.

## Revocation

Revocation is the only part that cannot be answered from the token alone, so the buyer supplies it:

```ts
import {
  createStaticRevocationList,
  createCachingRevocationSource,
  mergeRevocationSources,
} from '<portable>/portable-license/revocation.ts';
```

- `createStaticRevocationList(ids)` supports air-gapped sites receiving lists out of band.
- `createCachingRevocationSource(...)` adds caching, timeout, last-known-good fallback, and staleness reporting.
- `mergeRevocationSources(a, b, …)` treats a positive revocation from any source as authoritative.

A failed revocation check never revokes. Failure is ignorance, not evidence. Wire `onStale` to monitoring so unenforced revocation remains visible.

## Enforcement

Enforcement occurs at the execution boundary, not by hiding UI. It checks product, issuer, validity window, revocation, and named features.

Seats and execution limits are carried in the signed claims but are not currently enforced by an in-product counter.

## Independent verification

The claims are the base64url payload between the two dots. The signature is Ed25519 over canonical JSON. `canonicalize()` is exported so buyers can reproduce the signed bytes independently.
