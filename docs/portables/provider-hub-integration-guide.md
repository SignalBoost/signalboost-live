<!-- docs/portables/provider-hub-integration-guide.md -->
# Provider Hub — Enterprise Integration Guide

**Release:** `1.0.0-rc.1` design-partner evaluation
**Package:** `@portable/provider-hub`
**Payload:** one root, `provider-hub-core` — four modules reached from the barrel.

The portable supplies two bounded behaviours: **redacted provider connection metadata**, and **constrained live-data reads**. The buyer supplies the transport, the digest, the persistence, the credentials, the authorization, and every provider account.

It is deliberately small. Most of what a provider integration platform normally does — writes, rollout, credential storage, approval — is **not here**, and the sections below say so explicitly rather than leaving it to be discovered.

---

## 1. Canonical buyer entry point

```ts
import {
  createProviderConnectionMetadata,
  executeProviderLiveDataRead,
  createProviderLiveDataReadEvidence,
  runProviderHubAcceptance,
} from '@portable/provider-hub'
```

One entry point, `.`. The graph walk that builds the release reports **four modules and zero host imports** — no bare specifiers, no aliases, no environment reads.

## 2. Buyer-provided boundaries

| Port | Required | Buyer implementation |
| --- | --- | --- |
| `ProviderLiveDataReadTransport` | yes | `get({ url, timeoutMs })` — performs the read using your credentials, your proxy, your network policy |
| `ProviderLiveDataDigestPort` | yes | `sha256(value)` — produces the digest without exposing the payload |
| `ProviderConnectionPersistencePort` | for metadata reads | `getConnection(identity)` from your own store |

Everything else is yours and is not represented in the payload at all: vault integration, identity, approval, quota, spend, audit transport, and deployment controls.

## 3. Connection metadata

```ts
const metadata = createProviderConnectionMetadata({
  tenantId, environmentId, connectionId, providerId,
  state: 'validated',
  authentication: { method: 'oauth', configured: true, maskedFields: { account: '••••4f21' } },
  updatedAt: new Date().toISOString(),
})
```

The record is frozen and carries a schema version. Two constraints are enforced by refusal rather than by convention:

- **A secret-shaped public field name is rejected outright.** `api_key`, `token`, `password`, `secret`, `private_key`, `credential`, `access_key` — any of these as a field *name* throws, regardless of the value.
- **A masked value must be a recognised placeholder.** Only `saved`, `configured`, or `••••` followed by up to eight safe characters. A real-looking value like `sk-live-0123…` throws.

The reasoning is that this record is the one most likely to be logged, cached, rendered in a console, and shipped to a SIEM. Anything that reaches it should be safe in all four places, and the check is at construction so it cannot be skipped downstream.

## 4. Live-data reads, and what they refuse

```ts
const execution = await executeProviderLiveDataRead(
  { tenantId, environmentId, connectionId, providerId,
    capability: 'read:channel-statistics',
    sourceUrl: 'https://api.provider.example/v1/stats',
    observedAt, timeoutMs: 5000 },
  { executionMode: 'staging', transport, digest, now: () => new Date().toISOString() },
)
```

The adapter refuses, before any transport call:

| Refusal | Why |
| --- | --- |
| `production-live-data-read-disabled` | production mode is not enabled in this release |
| `invalid-source-url` | not https, or carries embedded basic-auth credentials, or has a fragment |
| `invalid-source-path` | path contains characters outside the safe set |
| `credential-shaped-source` | the path or query looks like it carries a key or token |
| `invalid-timeout` | not a positive integer, or above the 30-second ceiling |
| `invalid-observed-at` / `invalid-clock` | unparseable timestamps |

**A read is GET only.** There is no code path in the payload that performs a write.

**A failing transport does not throw.** It produces evidence with `failureCode: 'transport_failure'` and HTTP 503. An exception would lose the record of the attempt, which is the thing an operator needs afterwards.

## 5. What the evidence record does and does not contain

It carries: the identity quadruple, the capability, the **origin only** of the source, fetched and observed timestamps, a freshness figure, HTTP status, result count, a **SHA-256 of the body**, an ETag, rate-limit figures, a failure code, and a list of blockers when validation found problems.

It does not carry the response body, the full URL, any query string, or any credential — there is no field one could occupy.

Four assertion fields sit at the end of every record, and the distinction between them matters:

- `providerMutationPerformed`, `credentialsExposed`, `rawPayloadStored` are **literal `false`** because they are true *by construction* — GET only, and no field a payload or secret could occupy.
- `networkAccessPerformed` is **derived**, not a constant. It is true when the transport was actually invoked, including when that transport threw, because an attempt that fails is still an attempt.

That last one was a hardcoded `false` until this release, which meant evidence for a completed read asserted that no network access had occurred. If you are reviewing an older archive, that field cannot be trusted.

**One thing to know about ETags:** the provider's ETag is kept verbatim, subject to a length limit and a credential-shape check. A provider that echoes response content into its ETag header will therefore echo it into your evidence. The acceptance harness detects exactly this.

## 6. Acceptance

```ts
const record = await runProviderHubAcceptance({ transport, digest, probeUrl })
```

Twelve independently reported checks against **your** ports. It never throws, and returns a frozen `provider-hub-acceptance/1` record.

Seven of the twelve assert a **refusal** — the harness hands the portable material it must reject and fails if it is accepted: production mode, plaintext URLs, credential-shaped query strings, embedded credentials, oversized timeouts, secret-shaped metadata field names, unsafe masked values.

The remaining five come from one real read through your ports: that your transport was invoked exactly once, that your digest produced the recorded hash, that no fragment of the body reached the record, that network access was declared honestly, and that a failing transport is recorded rather than thrown.

`probeUrl` is **required** and must be https. The harness will not choose a destination on your behalf, and refuses to run if either port is missing rather than substituting its own — a substituted port would test our wiring instead of yours and produce a green result that proves nothing.

For pipelines:

```
node scripts/run-provider-hub-acceptance.mjs ./your-ports.mjs --probe https://status.yourcompany.com/health
```

Exit 0 when every check passes, 1 when one fails, 2 when it could not run. The record and its SHA-256 are printed so two people can confirm they are looking at the same run.

## 7. What is not included, stated plainly

- Provider credentials, tokens, OAuth clients, or service-account material.
- **Provider writes.** No mutation path exists in the payload.
- Automatic approval, rollout, deployment, or production publication.
- A database, vault, network transport, or provider account.
- Production-mode reads, which are refused by the adapter in this release.

**Known scope limit worth raising in evaluation:** the packaged buyer surface is metadata and reads. The identity, vault, audit and approval *contracts* exist in the source tree as host-composition references but are not reachable from the barrel and are therefore not in the payload. If your deployment needs those interfaces shipped as part of the product rather than written by your team, say so during evaluation — it is a decision about payload scope, not a missing implementation.

## 8. Upgrade, rollback, state

Within 1.x, buyer-facing interfaces are additive only. **The payload owns no datastore schema and holds no state**, so an upgrade migrates nothing and a rollback is restoring the previous verified archive. Re-run acceptance after either.

## 9. Boundary enforcement

The release is built by walking the real import graph from the declared entry point rather than from a hand-written file list, and **the build fails if the graph reaches anything the spec did not declare.** `hostFallbacks` and `knownNamingExceptions` are both empty and verified empty by that walk.

Each release carries `SHA256SUMS`, a CycloneDX 1.5 SBOM, and release notes. Supported platforms: Node.js 20 and 22 LTS, TypeScript 5.x, Linux and macOS build hosts, no native modules.
