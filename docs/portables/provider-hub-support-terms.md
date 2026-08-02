<!-- docs/portables/provider-hub-support-terms.md -->

# Provider Hub — proposed support framework

**Status: commercial draft for counsel and capacity review. Not an SLA, not incorporated into any agreement, and not ready to sign.**

No response target in this document is binding unless a signed order form or pilot agreement identifies the vendor legal entity, customer, supported version, support period, channels, hours, staffing model, fees, exclusions, escalation path, and remedies.

## 1. Current evaluation support

Version `1.0.0-rc.1` is a design-partner evaluation release. Release candidates are not supported for production use and carry no response commitment.

During an authorized evaluation, support is limited to reasonable-effort assistance with:

- installation of the exact archived package;
- interpretation of manifest, SBOM, checksums, and acceptance results;
- defects reproducible in unmodified package code;
- clarification of the public interfaces and documented refusals;
- security reports concerning the package itself.

The evaluator and vendor must agree the working contact channel before the evaluation starts. A personal message or an unacknowledged email does not create a contractual support ticket.

## 2. Potential production scope

A future production support agreement may cover, in a supported unmodified release:

- connection metadata construction and its refusals;
- live-data read validation, execution and refusal behaviour;
- evidence record construction, validation and blocker reporting;
- the acceptance harness and its CLI runner;
- the packaged boundary claim and the graph walk that enforces it.

Production support cannot begin until production `1.0.0` is earned through external acceptance and a signed agreement defines the service commitment.

## 3. Buyer-controlled components

Buyer infrastructure, excluded unless an order form expressly adds integration services:

- `ProviderLiveDataReadTransport` and `ProviderLiveDataDigestPort` implementations;
- credentials, vault integration, and egress policy — proxy, TLS, allow-lists;
- `ProviderConnectionPersistencePort` and the store behind it;
- identity, approval, quota, spend, audit transport and deployment controls, none of which are in the payload;
- retention of connection records, evidence records and acceptance records;
- provider accounts and the authorization to read from them.

**A defect is ours only if it reproduces in unmodified payload code with your ports replaced by trivial stubs.** That test is fair in both directions: it stops us blaming your wiring for our bug, and it stops a misconfigured proxy becoming a vendor incident.

## 4. Severity definitions for future contracting

| Severity | Definition |
| --- | --- |
| S1 | The package permits material it must refuse — a credential or response payload reaching a returned record, or any write reaching a provider. Unrecoverable: a leaked secret cannot be un-leaked, and the remedy is rotation on your side. |
| S2 | A read fails, or succeeds while reporting failure, in unmodified package code; or evidence misstates what occurred. |
| S3 | Validation, refusal messaging, freshness, rate-limit or blocker reporting is incorrect without misstating a fact or leaking material. |
| S4 | Documentation, ergonomics, or a question about intended behaviour. |

S1 is defined first and narrowly because it is this product's characteristic unrecoverable failure. Any report that plausibly falls in S1 should be raised as S1 and downgraded later if it does not hold.

For calibration: the `networkAccessPerformed` field asserting `false` after a real read was an **S2** — the record misstated what had occurred. It did not leak anything and no write took place, so it was not S1. That distinction is the one this table exists to make consistently.

## 5. Response targets are intentionally unset

We have not committed to numbers because we cannot yet staff them honestly. A target published before the capacity exists to meet it is a claim of the kind this product refuses to make about anything else.

At signing we will commit to named severity definitions, named channels, named hours and a named escalation path — with numbers filled in only when the staffing behind them is real.

## 6. Security reports

Security reports concerning the package take precedence over the ordering above, regardless of severity. Report them through the channel named in the agreement, with the affected version, the archive checksum, and reproduction steps.

Because the payload holds no credential, opens no socket, reads no environment variable and performs no write, the realistic categories are narrow: a dependency advisory, a gap in the refusal rules, a field that retains more than it should, or an error in the boundary claim itself. All four get a fast path.

## 7. Supported versions — proposed policy

The current release and the one before it. A defect found in an older archive is assessed against the current release first; if it no longer reproduces, the remedy is an upgrade.

Because the payload owns no schema and holds no state, an upgrade migrates nothing and a rollback reconciles nothing. That is what makes a two-version window reasonable rather than harsh.

**One upgrade note that will generate tickets if it is not read:** in `1.0.0-rc.1`, `networkAccessPerformed` became derived rather than a constant. Tooling that asserted it was always `false` will now see `true` after a real read. That is the field becoming correct.

## 8. Buyer responsibilities

- Run the acceptance harness against your own ports and a probe URL you control, before relying on a version and after every upgrade. Keep the record and its hash.
- Keep credentials out of URLs. The adapter refuses credential-shaped paths and query strings; the correct place for a credential is a header your transport adds.
- Decide retention for evidence records. The product imposes none.
- Decide who may create a connection record. The product enforces no authorization.
- Strip or bound provider ETags in your transport if you read from a provider that echoes content into them.

## 9. Known commercial limitations

- Source delivery makes licence enforcement contractual rather than technical.
- Production-mode reads are refused in this release. If your evaluation requires them, that is a roadmap conversation and not a configuration flag.
- No provider account, vault, transport or database is included.
- The packaged surface is connection metadata and bounded reads. Identity, vault, approval and audit contracts are not in the payload — raise it during evaluation if you expect them shipped.

## 10. Required approvals before use

Before a live read against a real provider, the buyer should have:

1. an acceptance record showing twelve passes against their own ports;
2. a transport that resolves credentials from their vault, never from a URL;
3. a decision on where evidence records are stored and for how long;
4. a named owner for connection creation;
5. an egress path — proxy, TLS, allow-list — that permits the probe origin and the provider origin.

None of these is enforced by the product. All five are the difference between an evaluation and a system holding real credentials.
