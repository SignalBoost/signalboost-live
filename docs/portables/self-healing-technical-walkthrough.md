<!-- docs/portables/self-healing-technical-walkthrough.md -->

# Self-Healing Supervisor — hands-on evaluation walkthrough

**Release:** `1.0.0-rc.2` design-partner evaluation  
**Prerequisite:** Node.js 22 or newer  
**Safety:** the standard acceptance scenario is offline and does not call a real provider.

This walkthrough uses the exact npm package and public imports that a buyer receives. Repository-internal imports are not valid evaluation evidence.

## 1. Build the exact release artifact

From the repository:

```bash
cd saas
npm ci
node scripts/build-portable.mjs
```

The builder performs all of the following and exits non-zero if any step fails:

1. walks the buyer import graph and rejects undeclared runtime packages;
2. compiles TypeScript to ESM JavaScript;
3. generates `.d.ts` declarations;
4. writes `manifest.json`, CycloneDX `sbom.json`, and `SHA256SUMS`;
5. creates the npm tarball;
6. installs that tarball into a fresh temporary project;
7. imports the public package name;
8. runs the acceptance scenario for all five languages and all three risk categories.

The accepted artifact is:

```text
saas/dist/portable/signalboost-self-healing-supervisor-1.0.0-rc.2.tgz
```

Verify its archive checksum before installation:

```bash
cd saas/dist/portable
sha256sum -c signalboost-self-healing-supervisor-1.0.0-rc.2.tgz.sha256
```

## 2. Install it in a clean project

```bash
mkdir -p /tmp/supervisor-evaluation
cd /tmp/supervisor-evaluation
npm init -y
npm pkg set type=module
npm install /absolute/path/to/signalboost-self-healing-supervisor-1.0.0-rc.2.tgz
```

Confirm that Node loads compiled ESM JavaScript rather than raw `.ts` files:

```bash
node --input-type=module -e "import('@signalboost/self-healing-supervisor').then(m => console.log(Object.keys(m).sort()))"
```

## 3. Implement the buyer boundary

Create `host.mjs`:

```js
import { createStaticApproverDirectory } from '@signalboost/self-healing-supervisor'

const secrets = new Map([['provider-token', 'evaluation-placeholder']])

export const host = {
  secrets: {
    async getSecret(name) {
      return secrets.get(name)
    },
  },

  notifications: {
    async notify(notification) {
      console.log('\n--- APPROVAL NOTIFICATION ---')
      console.log('recipient:', notification.recipient?.address ?? '(directory default)')
      console.log('title:    ', notification.title)
      console.log('category: ', notification.category)
      console.log('reason:   ', notification.reason)
      console.log('incident: ', notification.incidentId)
      console.log('dispatch: ', notification.dispatchId)
    },
  },

  approvers: createStaticApproverDirectory({
    fallback: [{ id: 'oncall', address: 'oncall@example.test', displayName: 'On-call engineer' }],
  }),

  branding: {
    productName: 'Evaluation Supervisor',
    consoleBaseUrl: 'https://supervisor.example.test',
    locale: 'en',
  },
}
```

The required secret method is `getSecret(name)`. An adapter implementing `resolve(ref)` does not satisfy the package interface.

## 4. Run the packaged acceptance scenario

Create `acceptance.mjs`:

```js
import { runAcceptanceScenario } from '@signalboost/self-healing-supervisor'
import { host } from './host.mjs'

const categories = ['financial', 'destructive', 'credential_security']
let failed = false

for (const dangerousCategory of categories) {
  const result = await runAcceptanceScenario({ host, dangerousCategory })
  console.log(`\n${dangerousCategory}: ${result.passed ? 'PASS' : 'FAIL'}`)
  for (const check of result.checks) {
    console.log(check.passed ? 'PASS' : 'FAIL', check.title, '—', check.detail)
  }
  failed ||= !result.passed
}

if (failed) process.exitCode = 1
```

Run it:

```bash
node acceptance.mjs
```

Expected evidence:

- the exact registered GET/read-only capability executes;
- the unknown mutating API step pauses and never reaches the runner;
- the consequential step does not execute;
- a named approver receives the notification;
- buyer branding is used;
- dispatch audit events are emitted.

Keep the JSON-serializable result with the evaluated tarball checksum and source commit.

## 5. Verify the safety regression guard

The repository test suite contains isolated negative controls that replace the real runner with a recording stub and assert that unregistered or malformed capabilities never reach it. Run the focused release-blocker test:

```bash
cd saas
node --test tests/supervisorReleaseBlockers.node.test.ts
```

The test covers unknown provider actions, mutating methods, nested parameters, misleading descriptions, a mutation disguised as `read`, exact approval scope, canonical repair-plan fingerprints, post-approval plan changes, expiration, signature validation, prior-audit binding, and nonce reuse. It does not connect to infrastructure.

Changing `policy-engine.ts` is not a valid control for the packaged harness; the harness supplies an approved policy decision and tests the API capability gate directly.

## 6. Verify localization

Change `host.branding.locale` to each of:

```text
en, es, pt-BR, pl, ru
```

The approval heading, category wording, explanatory reason, and fallback description come from the package's five-language catalogue. Machine fields such as `kind`, `category`, `stepId`, `incidentId`, `dispatchId`, and audit event types remain unchanged.

A caller-provided step description is preserved as supplied; it is not silently rewritten by the notifier.

## 7. Configure production-like bounded execution

Paid planning and dispatch are available only through:

```js
import {
  createApiCapabilityRegistry,
  createEd25519ApprovalVerifier,
  createLicensedSelfHealingSupervisor,
  fingerprintRepairPlan,
} from '@signalboost/self-healing-supervisor'
```

The licensed factory requires all of these inputs and refuses to construct the paid execution path when any is absent:

- buyer `HostContext`;
- signed licence token, issuer, and issuer public keys;
- durable dispatch store;
- audit sink;
- buyer-supplied API runner;
- explicit API capability registry;
- signed-approval continuation verifier;
- thinker used for repair planning.

Every provider-bound `read`, `verify`, or mutation requires an exact capability registration. A `read` or `verify` step must match a non-mutating `read_only` capability using `GET` or `HEAD`. A routine mutation must explicitly identify its provider, stable action ID, allowed HTTP methods, resource pattern, parameter validator, reversibility, automatic-execution status, and execution limit.

Unknown provider actions never execute, even when a signature is presented. Approval can resume only a registered consequential capability.

## 8. Test signed post-approval continuation

A consequential action resumes only with an Ed25519-signed `ApprovalContinuationProof` bound to:

- the incident ID;
- the plan ID;
- the SHA-256 fingerprint of the complete canonical repair plan;
- a new dispatch ID for the continuation attempt;
- the exact ordered step IDs;
- the approver identity;
- approval and expiration times;
- a one-time nonce;
- the signing key ID;
- the prior pause audit-event ID.

Use the exported `fingerprintRepairPlan(plan)` helper when creating and auditing approval proofs. The prior pause event must record the same fingerprint.

The buyer supplies a durable atomic nonce store and a lookup that confirms the referenced pause event. Changed provider, resource, parameters, descriptions, verification steps, or any other plan content changes the fingerprint and invalidates the proof. Tampered scope, changed dispatch, expiration, unknown signing key, missing prior event, invalid signature, and nonce reuse also fail closed.

Use a new dispatch ID for the approved continuation. Reusing the paused dispatch ID is correctly rejected by the at-most-once dispatch ledger.

## 9. Release status and boundaries

This package is a **design-partner evaluation release**, not a production licence grant. It does not ship credentials, a vendor-hosted service, vendor telemetry, or a generic production runner. The buyer owns and reviews every real provider capability and runner.

Production designation remains blocked until the exact archived tarball completes a buyer-like external deployment, all three risk categories and signed continuation are accepted, licence refusal and valid entitlement are demonstrated through the packaged factory, and upgrade/rollback evidence is recorded.
