<!-- docs/portables/buyer-package/overview.md -->

# Self-Healing Supervisor Software — Design-Partner Evaluation

**Buyer-hosted incident supervision with explicit capability controls, named-human approval, signed continuation, and audit evidence.**

## Current status

The current package is `1.0.0-rc.2`, an evaluation release. It is not represented as production-ready automated remediation and carries no production licence, warranty, SLA, or 24/7 support commitment.

The purpose of the evaluation is to produce evidence in a clean buyer-like environment against the exact archived npm package.

## What it does

An authenticated incident enters the buyer's environment, is normalized and deduplicated, and can be used to propose a repair plan. Before any API step reaches a buyer runner, the package validates the exact provider, stable action ID, HTTP method, resource pattern, parameter schema, risk class, automatic-execution status, and execution limit.

A registered routine-reversible capability may run automatically. Anything unknown or consequential pauses. A consequential step can resume only with an Ed25519-signed continuation bound to the incident, plan, a fresh dispatch ID, exact ordered step IDs, named approver, time window, one-time nonce, signing key, and prior pause audit event.

The buyer's read-only verifier checks the result, and the buyer's audit sink receives the evidence.

## Where it runs

The package runs inside the buyer's infrastructure. It has no vendor-hosted control plane and no vendor telemetry in the execution path. The buyer supplies all credentials, storage, notifications, approver identity, provider capabilities, provider runners, approval keys, and SIEM transport.

That reduces vendor-side data handling, but it does not eliminate security review. Buyers must still review the delivered source, package evidence, licence model, key custody, capability registrations, runners, legal terms, and operational procedures.

## Installing the evaluation package

```bash
sha256sum -c signalboost-self-healing-supervisor-1.0.0-rc.2.tgz.sha256
npm install ./signalboost-self-healing-supervisor-1.0.0-rc.2.tgz
```

The package must contain compiled JavaScript and `.d.ts` declarations. The canonical workflow also produces `manifest.json`, CycloneDX `sbom.json`, `SHA256SUMS`, and an archive checksum, then installs and imports the exact tarball in a fresh project.

## Buyer integration boundary

Paid planning and dispatch are created only through:

```js
import { createLicensedSelfHealingSupervisor } from '@signalboost/self-healing-supervisor'
```

The factory requires:

- buyer host context;
- signed licence token and accepted issuer public keys;
- durable dispatch store;
- durable audit sink;
- buyer API runner;
- explicit API capability registry;
- signed-approval verifier and durable nonce store;
- repair-plan thinker.

It refuses incomplete paid-path configuration. Reading, observation, and audit export remain available independently.

Because the buyer receives source, licence enforcement is contractual rather than tamper-proof.

## What the evaluation must prove

- clean package installation and public import;
- no platform or third-party runtime dependency in the public graph;
- missing and invalid licences refuse paid paths through the packaged factory;
- valid entitlement permits only licensed features;
- all unknown and adversarial actions pause;
- exact registered routine capabilities run only within their limits;
- all three consequential categories route to the intended named approvers;
- valid signed continuation executes only its exact scope;
- tampering, expiration, missing audit binding, and nonce replay fail closed;
- five notification languages work without changing machine identifiers;
- read-only verification and audit delivery are truthful;
- upgrade and rollback work from archived artifacts.

## Known limitations

- no independent buyer acceptance has yet earned production `1.0.0`;
- real provider runners and capability registrations are buyer-supplied and unproven until reviewed and tested;
- monitoring adapters remain staged until accepted against buyer traffic;
- in-memory stores are evaluation-only;
- no SOC 2 report, ISO 27001 certification, or third-party penetration test is represented;
- no finalized production licence, pilot agreement, pricing, liability terms, governing law, or SLA exists;
- repository visibility and the long-term source-licensing model require a deliberate commercial decision.

## Accurate commercial positioning

> Self-Healing Supervisor Software Design-Partner Evaluation — buyer-hosted incident intake, diagnosis, explicit capability validation, approval routing, signed exact-scope continuation, bounded buyer-runner execution, read-only verification, and audit evidence. Production use remains subject to buyer acceptance and a separate signed agreement.
