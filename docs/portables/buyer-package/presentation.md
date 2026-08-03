<!-- docs/portables/buyer-package/presentation.md -->

# Self-Healing Supervisor Software — Design-Partner Evaluation

**Buyer-hosted incident supervision with explicit capability validation, named-human approval, signed continuation, and audit evidence.**

*Prepared by SignalBoost · technical evaluation material · not an offer or production commitment*

---

## 1. The problem

Automated remediation becomes dangerous when an AI-generated description, an unfamiliar provider action, or a broad approval can reach production systems without a precise technical boundary.

The Self-Healing Supervisor Software evaluation is designed to answer one question with evidence:

> Can a buyer keep routine reversible actions bounded while forcing every unknown or consequential action through a named-human, exact-scope approval path?

## 2. The evaluation architecture

```text
buyer incident source
→ authentication, normalization, deduplication
→ repair-plan proposal
→ policy decision
→ explicit provider/action capability validation
→ pause unknown or consequential work
→ named-human approval
→ signed exact-scope continuation
→ buyer-controlled runner
→ read-only verification
→ buyer audit/SIEM
```

The vendor operates no control plane in this path and receives no telemetry from it.

## 3. What authorizes execution

Descriptions and keywords do not authorize execution.

A routine action can run automatically only when all of these match an explicit buyer registration:

- provider;
- stable action ID;
- HTTP method;
- resource pattern;
- parameter schema, including nested values;
- reversible risk classification;
- automatic-execution flag;
- execution limit.

Everything unknown pauses by default.

## 4. What happens after approval

A consequential action resumes only when an Ed25519-signed continuation validates the exact:

- incident ID;
- plan ID;
- fresh continuation dispatch ID;
- ordered approved step IDs;
- approver identity;
- approval and expiration times;
- one-time nonce;
- signing key ID;
- prior pause audit-event ID.

Modification, expiration, missing audit binding, unknown key, invalid signature, extra scope, and nonce replay fail closed before the buyer runner.

## 5. Buyer-hosted boundary

The buyer supplies:

- secret manager;
- notification sink;
- named approver directory;
- product branding and locale;
- durable dispatch ledger;
- durable approval nonce store;
- audit repository and SIEM transport;
- provider capability registry;
- provider API runner;
- approval public-key directory;
- repair-plan thinker and read-only verifier;
- licence token and accepted issuer keys.

Paid planning and dispatch are constructed only through the packaged `createLicensedSelfHealingSupervisor` factory.

Because the buyer receives source, licence enforcement is contractual rather than tamper-proof.

## 6. Package evidence

The canonical release workflow must produce and validate one evidence set:

- compiled JavaScript;
- `.d.ts` declarations;
- manifest with source commit and file hashes;
- CycloneDX SBOM;
- package and archive checksums;
- clean installation into a fresh project;
- public package import;
- focused release-blocker regression tests;
- five notification languages;
- three consequential risk categories.

The package is rejected if any step fails.

## 7. Current version and positioning

The current release is:

```text
@signalboost/self-healing-supervisor 1.0.0-rc.2
```

It is a **design-partner evaluation**, not production `1.0.0` and not a production licence grant.

Accurate positioning:

> Buyer-hosted incident intake, diagnosis, explicit capability validation, approval routing, signed exact-scope continuation, bounded buyer-runner execution, read-only verification, and audit evidence.

## 8. What is not yet proven

- clean external acceptance by a buyer or independent evaluator;
- real provider runners and capability registrations;
- durable nonce behavior under buyer concurrency;
- buyer SSO approver authorization and key operations;
- live SIEM delivery and retention;
- staged monitoring adapters against buyer traffic;
- upgrade and rollback from archived artifacts;
- operational response capacity;
- finalized software licence and pilot agreement;
- finalized pricing, fees, governing law, liability allocation, termination terms, and SLA;
- repository-visibility and source-licensing model;
- SOC 2, ISO 27001, or third-party penetration-test evidence.

## 9. Evaluation sequence

1. Verify the archive checksum, manifest, and SBOM.
2. Install the tarball in a clean project and import the public package name.
3. Run the offline acceptance scenario for all three risk categories and five locales.
4. Review the capability registry and signed-continuation contracts.
5. Run adversarial tests for unknown actions, nested values, method/resource mismatch, tampering, expiration, missing audit binding, and nonce replay.
6. Connect only a read-only or isolated staging runner.
7. Test valid entitlement and refusal through the packaged licensed factory.
8. Record upgrade and rollback evidence from archived artifacts.
9. Decide whether production criteria and legal terms can be completed.

## 10. Commercial status

No price, no-cost pilot, 24/7 support target, production warranty, or production availability is promised by this document. Those terms require a signed agreement identifying the vendor legal entity and completed commercial, operational, security, and legal review.
