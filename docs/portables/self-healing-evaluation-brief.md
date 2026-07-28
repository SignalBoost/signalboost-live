<!-- docs/portables/self-healing-evaluation-brief.md -->

# Self-Healing Supervisor — evaluation brief

**For:** an engineer evaluating this portable on behalf of a prospective buyer or partner.
**Time to a useful opinion:** about 30 minutes reading, plus 20 minutes running tests.

This document is written to be checked, not believed. Every claim below names the file that
either proves or disproves it. Where something is unproven, it says so — the gaps section is
not an appendix, it is the part worth reading first if you are short on time.

---

## 1. What this is

A self-healing incident supervisor sold as a **portable**: source that runs inside the
buyer's own environment, with no vendor-operated service, no vendor account, and no
telemetry. The buyer supplies infrastructure through injected interfaces; the product
supplies behaviour.

The loop it implements: an incident arrives → it is authenticated, deduplicated and stored →
a repair plan is produced → policy classifies each step → consequential steps **stop for a
named human** → approved steps execute → results are verified → everything is audited to the
buyer's SIEM.

The safety property, and the thing worth attacking hardest during evaluation: **no
consequential step executes without a named human approving it, in any edition, including
with no licence installed.**

---

## 2. Where the code is

| Path | What it is |
| --- | --- |
| `saas/lib/supervisor/portable/` | The portable core — incident runtime, sources, host-context contract, acceptance harness |
| `saas/lib/supervisor/executors/` | Dispatcher, executor contracts, API and browser executors |
| `saas/lib/supervisor/policy-engine.ts` | Step classification and gating decisions |
| `saas/lib/supervisor/orchestrator.ts` | The run loop that ties thinker → policy → dispatch → verify → audit |
| `saas/portable-license/` | Entitlement layer: signed offline tokens, catalogue, guard, revocation |
| `saas/portable-kernel/`, `saas/portable-audit/` | Shared kernel and audit contracts |
| `saas/self-healing-host/` | **Reference host adapter.** SignalBoost's own wiring — an example of what a buyer writes, not part of the product |

Read `self-healing-host/` to understand the boundary. Everything platform-specific lives
there; if you find platform coupling inside the core directories, that is a genuine defect
and we want to hear about it.

---

## 3. Suggested reading order

1. `docs/portables/self-healing-integration-guide.md` — the buyer-provided interfaces, the
   dispatch ledger schema, reference wiring, and what "live" requires.
2. `saas/lib/supervisor/portable/host-context.ts` — the whole injection surface in one file.
3. `saas/lib/supervisor/policy-engine.ts` — where a step becomes "consequential".
4. `saas/portable-license/enforce.ts` and `guard.ts` — how entitlement is enforced at the
   execution boundary rather than at a UI.
5. `docs/portables/self-healing-security-and-data-handling.md` — written for a security
   reviewer, including the gaps.

---

## 4. Running the tests

Node 22 or newer. The suites run `node --test` directly against `.ts` sources — Node strips
types rather than compiling, which is why a strip-safety guard exists in the build.

```bash
cd saas
npm install
npm run test:supervisor          # supervisor core, dispatch, health, coordination
node --test tests/portableLicense*.node.test.ts
node --test tests/supervisorEntitlementWiring.node.test.ts
node --test tests/supervisorAcceptanceHarness.node.test.ts
npm run typecheck
npm run prebuild                 # route-config, strip-safety and i18n guards
```

There are 49 test files touching the supervisor, licensing and acceptance paths.

**A test worth reading rather than just running:** `supervisorEntitlementWiring.node.test.ts`
asserts that an unlicensed deployment still *receives and records* an incident but does not
diagnose it. Dropping a customer's incident because of a billing state would be a hostage
tactic; refusing to act on it is enforcement. The distinction is deliberate.

---

## 5. What is proven, and how

- **Approval gating.** `runAcceptanceScenario` runs one rehearsal incident per risk category
  (financial, destructive, credential security) against a real host context. The dangerous
  step is *required* to pause; if it ever executes, the run reports FAILED. Exercised on a
  live deployment on 27 July 2026: 15 checks, all passing, with a real approval email
  delivered and an audit trail produced.
- **Entitlement enforcement.** Ten tests, plus a negative control: the gate's refusal branch
  was deliberately disabled and 7 of 10 went red, then restored. A licence for a different
  product does not unlock this one; a token signed by a foreign key is refused; an expired
  licence is refused.
- **Incident authentication.** HMAC-SHA256 over `${timestamp}.${body}`, timestamp inside the
  signed material so a captured request cannot be replayed with a fresh one. 300-second
  replay window, 60-second clock skew, 128KB body cap, 16-character minimum secret.

---

## 6. What is NOT proven — read this before forming a view

- **Eight monitoring vendor adapters are `staged`, not validated.** Datadog, PagerDuty,
  CloudWatch/EventBridge, Alertmanager, Splunk, Azure Monitor, Grafana, Google Cloud
  Operations. Each was mapped against fixtures; none has met live traffic from a real
  account. A buyer's first alert is the first time that mapping meets reality.
- **No repair executes without a buyer-supplied runner.** The product ships no execution step
  runner. With none configured it receives, diagnoses, gates, verifies read-only steps and
  audits — then ends `unresolved` and records why, rather than claiming a fix. Intended
  behaviour, documented in the integration guide, section 4.
- **In-memory defaults.** The reference host uses in-memory dedupe and incident record
  stores. On a serverless host those do not survive between invocations. `DedupeStore` and
  `IncidentRecordStore` are exported interfaces; a durable implementation is the buyer's to
  supply.
- **Seats and execution limits are not enforced.** They are recorded in the licence token and
  are contract terms only. No technical control reads them.
- **No SOC 2 report, no ISO 27001, no third-party penetration test**, no published
  coordinated-disclosure timeline, no signed release artifacts, no reproducible-build
  attestation.
- **No unattended retry.** There is no durable attempt counter, so recovery actions require a
  human to initiate them. An automatic retry driven by a failure webhook would loop.

---

## 7. What we would most like you to attack

1. **Find a path where a consequential step executes without a named human.** This is the
   product's central claim. If it can be broken, everything else is decoration.
2. **Find platform coupling inside the core.** Any `process.env`, vendor name, network
   destination or host singleton reached from `lib/supervisor/portable/`,
   `portable-license/`, `portable-kernel/` or `portable-audit/`.
3. **Attack the intake authenticator.** Replay, timing, signature comparison, body-size
   handling, malformed payloads.
4. **Judge the host-context boundary as an integrator would.** Is `HostContext` the right
   shape to implement against? What would you have to fake, wrap or fork to run this on your
   own stack?
5. **Tell us where the audit trail could lie.** Any path where a record could claim a
   step ran, or omit one that did, is the most serious class of defect in this product.

---

## 8. What not to spend time on

The UI. The pages under `saas/app/dashboard/supervisor/` are SignalBoost's own operator
console and demo surface — a test rig, not part of what a buyer receives. The same is true of
anything under `saas/app/`, `saas/components/` and `saas/app/api/`. Judge the portable by the
directories in section 2.

---

## 9. Documents in this set

All under `docs/portables/`:

`self-healing-integration-guide.md` · `self-healing-incident-intake-guide.md` ·
`self-healing-monitoring-connections.md` · `self-healing-license-installation.md` ·
`self-healing-operations-runbook.md` · `self-healing-security-and-data-handling.md` ·
`self-healing-support-terms.md` · `self-healing-pilot-agreement.md`

The support terms and pilot agreement are commercial drafts, not engineering documents. The
pilot agreement is a structural draft for counsel and is not ready to sign.
