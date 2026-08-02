<!-- docs/portables/buyer-package/provider-hub-presentation.md -->

# Provider Hub — Buyer Evaluation

**Release:** `1.0.0-rc.1` design-partner evaluation
**Package:** `@portable/provider-hub`

> **Before sending this document, fill in:** [SET price], [SET pilot length], [SET pilot fee],
> and the contact line at the end.

---

## 1. The problem

Every platform that connects to third-party providers ends up with the same two artefacts, and both of them leak.

**Connection records** — which provider, whose account, what state it is in — get logged, cached, rendered in an admin console, and shipped to a SIEM. Somewhere in that chain, a field named `api_key` holding a value that looks like a key ends up somewhere it should never have been. Not because anyone decided to store it, but because nothing refused it at construction.

**Read evidence** — proof that a provider was queried, what came back, and when — has the same problem one layer down. It is written to satisfy an auditor, so it is retained longer than anything else, and it is exactly where a response body or a query string carrying a token goes to live forever.

Neither failure is loud. Both are discovered by somebody else, usually during a review, usually in a record that has been retained for a year.

## 2. What it is

A small, bounded portable that does two things and refuses to do more:

- **Redacted connection metadata** that rejects secret-shaped material at construction rather than filtering it later.
- **Constrained live-data reads** — https, GET, bounded timeout, production disabled — producing evidence that carries an origin and a digest and cannot carry a payload.

You supply the transport, the digest, the persistence, the credentials, and every provider account. The portable holds none of them.

It is deliberately narrow. We are not claiming it is a provider integration platform; it is the part of one that has to be right about secrets.

## 3. The rule the design turns on

> **Refuse at construction, not at review.**

Two enforcements, and both are refusals rather than warnings:

- A **secret-shaped field name** in connection metadata throws. `api_key`, `token`, `password`, `secret`, `private_key`, `credential`, `access_key` — the name alone is enough, whatever the value.
- A **masked value that is not a recognised placeholder** throws. Only `saved`, `configured`, or `••••` plus a short safe suffix survive. A real-looking value is rejected even if the field name is innocent.

And on the read side, a URL is refused before any call if it is plaintext, carries embedded credentials, or has a credential-shaped query string.

The pattern is the same as everywhere else in this portfolio: the check is where the data is created, so nothing downstream can be the place it was supposed to be caught.

## 4. What the evidence will not contain

Read evidence carries the identity quadruple, the capability, the **origin only** of the source, timestamps and a freshness figure, HTTP status, result count, a SHA-256 of the body, an ETag, rate-limit figures, and a failure code.

It does not carry the response body, the full URL, the query string, or any credential. There is no field one could occupy.

**One honest detail rather than a claim:** the record ends with four assertion fields. Three of them — no provider mutation, no credentials exposed, no raw payload stored — are literal, because they are true by construction: the adapter issues GET and nothing else, and the record has no field a secret could sit in. The fourth, whether network access occurred, is **derived from what actually happened** rather than asserted.

That distinction exists because it was previously wrong. The field was a hardcoded `false`, so evidence for a completed read stated that no network access had occurred. It was found, fixed, and the acceptance harness now checks it on every run. We would rather tell you that than have you find it.

## 5. Acceptance runs in your environment, against your ports

Twelve independently reported checks. **Seven of them assert a refusal** — the harness hands the portable material it must reject and fails if it is accepted:

| | |
| --- | --- |
| Production-mode read | refused |
| Plaintext `http://` source | refused |
| Credential-shaped query string | refused |
| Embedded basic-auth credentials | refused |
| Timeout beyond the ceiling | refused |
| Secret-shaped metadata field | refused |
| Unsafe masked value | refused |

The other five come from one real read through your ports: your transport was invoked exactly once, your digest produced the recorded hash, no fragment of the response body reached the record, network access was declared honestly, and a failing transport produced evidence instead of an exception.

Two design choices your security reviewer will ask about:

- **You nominate the probe URL**, it must be https, and the harness refuses to run without one. It will not pick a destination on your behalf.
- **It will not substitute its own ports for missing ones.** A substituted transport produces a green result that proves nothing about whether your network policy, proxy and TLS let the call out.

The result is a frozen, JSON-serialisable record printed with its SHA-256. Keep it — it is your acceptance evidence, and the hash is how two people confirm they are discussing the same run.

## 6. What you implement

| Boundary | What you supply |
| --- | --- |
| Read transport | your credentials, proxy and network policy |
| Digest | your hashing, without exposing the payload |
| Connection persistence | your own store |
| Vault, identity, approval, audit, quota, spend | entirely yours — none of it is in the payload |

## 7. What it does not do

- No provider writes. There is no mutation path in the payload.
- No credential storage, OAuth client, or service-account material.
- No approval, rollout, deployment or production publication.
- No database, vault, transport or provider account.
- No production-mode reads in this release — they are refused by the adapter.

**A scope limit worth raising now rather than at signature:** the packaged surface is metadata and reads. Identity, vault, audit and approval contracts exist in the source tree as host-composition references but are not part of the payload. If you need those interfaces shipped as product rather than written by your team, tell us during evaluation — it is a decision about scope, not a missing implementation.

## 8. The portability claim, verified rather than asserted

Each release is built by walking the real import graph from the declared entry point and **fails if the graph reaches anything undeclared.** Host fallbacks and vendor-name exceptions are both empty, verified by that walk. Four modules, zero host imports, no environment reads.

The payload owns no schema and holds no state, so an upgrade migrates nothing and a rollback is restoring the previous archive. Every release carries `SHA256SUMS`, a CycloneDX 1.5 SBOM, and release notes.

## 9. Editions and commercials

| | Evaluation | Production |
| --- | --- | --- |
| Connection metadata | included | included |
| Bounded live-data reads | included | included |
| Acceptance harness and CLI | included | included |
| Production-mode reads | disabled | on roadmap, not shipped |
| Price | [SET price] | [SET price] |

**Pilot:** [SET pilot length] at [SET pilot fee], covering installation into one environment, one acceptance run against your own ports and a probe URL you choose, and one live read against a provider you already hold an account with.

Source delivery makes licence enforcement contractual rather than technical. We state that plainly rather than implying a protection that does not exist.

## 10. Next steps

1. A technical session against the integration guide — about an hour with whoever owns your outbound network policy and your secret store.
2. Installation into one non-production environment.
3. An acceptance run against your ports, to a probe URL you nominate. Twelve checks, one record.
4. One live read against a provider account you already hold.

Contact: [SET name, title, email]
