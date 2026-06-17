# SignalBoost AI Operator — Engine Manual

A governed execution system that operates SaaS providers **only** through approved
templates and runbooks. It never calls providers directly, never invents provider
behavior, and enforces safety, governance, approvals, and auditability on every
action. This document describes the live implementation under
`console-core/operator/` and how to wire, extend, and verify it.

---

## 1. Design principles

- **Portable core.** Everything in `console-core/operator/` imports only other
  operator modules — no app internals — except the one React UI file. A host
  platform plugs in through a single adapter interface (`ExecutorHost`).
- **Composition, not duplication.** Each module builds on the ones before it;
  doctrine lives in exactly one place and is imported, never restated.
- **Fail closed.** Unknown providers, missing templates, failed preflight, and
  unverifiable state all stop execution rather than guessing.
- **Truthful.** The operator never fabricates provider responses, IDs, or keys,
  and is honest when a template, permission, or policy blocks an action.

Precedence when values conflict: **Safety > Governance > Clarity > Auditability >
Helpfulness.**

---

## 2. The ten modules

| # | File | Purpose |
|---|------|---------|
| 1 | `principles.ts` | Identity, precedence doctrine, the 10 principles, core contract, policy version, invariants. |
| 2 | `templates.ts` | `GovernedTemplate` contract + linter, payload validation, risk→approval map, permission hierarchy, versioning, immutability. |
| 3 | `capabilityMatrix.ts` | Per-provider truth table (idempotency, rollback, retry, rate limits, auth model, destructive/safe actions, quirks). Fail-closed default for undeclared providers. |
| 4 | `runbook.ts` | Multi-step runbook model + builder, dependency ordering, preflight + approval gates, audit, summary. Carries locale. |
| 5 | `failureCard.ts` + `components/hub/FailureCard.tsx` | Failure Card logic (button/override gating, secret redaction) and its localized React renderer. |
| 6 | `safetyPolicy.ts` | The override-everything gate: RBAC, approval, capability, destructive, preflight, post-state, cross-provider consistency, deadman budgets. |
| 7 | `executor.ts` | The only component that performs real provider actions. Runs the immutable 11-step pipeline. |
| 8 | `stateMachine.ts` | The 8-state lifecycle with frozen transitions and contextual guards. |
| 9 | `persona.ts` | Forbidden behaviors, relationships, summary, and the injectable governance preamble. |
| 10 | `index.ts` | Barrel + `verifyInstallation()` + Operator Mode gate + `createOperator(host)`. |

---

## 3. The execution pipeline (Module 7)

Every action runs this immutable sequence; it stops at the first failed stage and
emits a `FailureRecord` for the Failure Card:

```
1 Template Load → 2 Schema Validation → 3 RBAC → 4 Approval →
5 Secret Injection → 6 Payload Validation → 7 Capability Enforcement →
8 Execution → 9 Post-State Validation → 10 Audit → 11 Normalized Response
```

Steps 3, 4, 7 and preflight are enforced by the Module 6 safety gate; 1, 2, 6 by
the Module 2 template contract. **Simulation mode makes no provider call.**

---

## 4. Wiring it into a host

The operator depends only on the `ExecutorHost` adapter. The SignalBoost bridge is
`lib/hub/operatorHost.ts`, which derives templates from the live executor registry
+ action-policy + capability matrix and delegates execution to the registered
executors.

```ts
import { createOperator } from '@/console-core/operator'
import { createOperatorHost } from '@/lib/hub/operatorHost'

const operator = createOperator(createOperatorHost())

const result = await operator.run({
  providerId: 'github',
  actionId: 'list_repos',
  input: {},
  user: { id: userId, role: 'owner' },     // 'user' | 'admin' | 'owner'
  executionMode: 'simulation',             // 'simulation' | 'execution'
  approvalGranted: false,
})
```

To target a different platform, implement the four `ExecutorHost` methods —
`resolveTemplate`, `injectSecrets`, `runProvider`, `audit` — against that host.

---

## 5. HTTP routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/hub/operator/run` | POST | Run one action through the governed pipeline. Defaults to simulation; `mode:'execution'` runs for real after the gate clears. |
| `/api/hub/operator/verify` | GET | Self-verify: confirms installation and dry-runs every registered action in simulation, reporting each action's stage. |
| `/api/hub/providers/verify` | GET | Reads live Production env and verifies Stripe, Supabase, Vercel, OpenAI against their APIs; flags mismatches; returns canonical non-secret values. |

All three are owner-gated.

---

## 6. Adding a provider

The operator derives its template from whatever the registry exposes, so adding a
provider is the existing executor recipe — no operator changes needed:

1. Write the executor in `console-core/executors/<provider>.ts` and
   `registerExecutor({ providerId, actionId, policyActionId, schema, run })`.
2. Add a policy entry in `lib/hub/action-policy.ts` (sets risk + approval).
3. Add capability facts in `console-core/operator/capabilityMatrix.ts` if the
   provider has known idempotency/rollback/quirks; otherwise the conservative
   default applies (fail-closed).
4. Add the card to `lib/hub/console-catalog.ts`.

The operator then governs the new actions automatically: template lint, RBAC,
approval, capability, payload validation, audit.

---

## 7. Localization (5 languages)

Supported: **English, Spanish, Portuguese (Brazil), Polish, Russian.** Rules the
UI surfaces must follow:

- Detect and respect the active locale; load `/locales/{lang}.json`; default to
  English when unsupported.
- Wrap all UI/preview/error text in `t(dict, 'key', 'English fallback')`. Never
  hard-code strings.
- Never invent translations — only reference keys. English fallbacks are provided
  in code; `es/pt/pl/ru` values live in the locale JSON.
- Apply locale context to runbooks, previews, and error messages
  (`runbook.metadata.locale`, `resolveLocale()`).

Keys to add to each `/locales/{lang}.json`: `hub.failure.*` (Failure Card) and
`hub.state.*` (state labels). Until added, every string falls back to English —
nothing renders blank.

---

## 8. Verifying

```
GET /api/hub/operator/verify     → installation + per-action simulation report
GET /api/hub/providers/verify    → live provider data + mismatch flags
```

`verifyInstallation()` returns `{ ok, modules[], missing[], policyVersion }`.
Operator Mode only enables when verification passes.
