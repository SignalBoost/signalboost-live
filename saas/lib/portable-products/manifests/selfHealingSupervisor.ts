// saas/lib/portable-products/manifests/selfHealingSupervisor.ts
import type { PortableProductManifest } from '../manifestTypes.ts'

export const selfHealingSupervisorManifest: PortableProductManifest = Object.freeze({
  productId: 'self-healing-supervisor',
  displayName: 'Self-Healing Supervisor',
  // THE HEADLINE IS THE REPAIR, NOT THE DETECTION. Both descriptions used to lead with
  // detecting and diagnosing, and every surface reading them wrote about a product that
  // watches things. Detection is the commodity half — the buyer already owns something
  // that alerts. What they do not own is software that fixes the fault and can show its
  // work afterwards, so that is what these sentences now say first.
  categoryLabel: 'self-healing software',
  // THE THREE CHANNELS ARE REAL AND THEY ARE A SELLING POINT. execution-policy/ selects
  // between them per step: ExecutionChannel is 'api' | 'browser' | 'manual' | 'none' and
  // ExecutionMode is 'api_only' | 'smart_failover' | 'browser_on_demand'. A human can take
  // over at any step — that is not a fallback, it is a mode the operator can choose.
  //
  // THE BROWSER ENTRY SAYS "PREPARES", NOT "RUNS", AND THE WORD IS LOAD-BEARING.
  // portable-browser-executor.ts emits a fingerprinted dry-run package and rejects any
  // dispatch asking for more, with its own message: the buyer package creates browser
  // dry-run evidence only, and a separately reviewed buyer runtime performs the execution.
  // Production browser execution is additionally gated behind productionBrowserExecutionEnabled;
  // without that flag the policy routes to human approval instead.
  executionModes: Object.freeze([
    'automatic-unattended-repair-of-steps-that-are-not-financial-destructive-or-credential',
    'signed-approval-required-only-for-money-deletion-or-credential-changes',
    'you-authorise-each-incident-plan-once-then-its-safe-steps-run-unattended',
    'automatic-failover-from-api-to-browser-or-to-a-human',
    'browser-tasks-prepared-under-approval-for-your-own-browser-runtime-to-run',
    'a-clean-state-checkpoint-is-captured-before-any-repair-changes-anything',
    'atomic-restore-of-the-whole-execution-context-when-a-repair-does-not-verify',
    'repairs-that-cannot-be-checkpointed-are-blocked-before-they-start-not-after',
    'a-person-is-called-whenever-an-undo-would-be-unsafe-or-does-not-restore',
    'manual-operator-control-available-at-any-step',
  ]),
  shortDescription: 'Self-healing software: repairs failures automatically within the capabilities you register, stopping for a signed approval only on financial, destructive or credential changes.',
  // WHAT THIS SENTENCE DELIBERATELY DOES NOT SAY: reversible. RepairPlan declares
  // rollbackSteps and the fingerprinting hashes them, but no code executes them — the
  // verifier runs the plan's verificationSteps and nothing runs a rollback. A first
  // draft of this line claimed repairs were "reversible if the verification fails" and
  // it was checked against the executors before shipping, which is the only reason the
  // claim did not reach a buyer. Rollback sits in futureFeatures until it runs.
  longDescription: 'A governed self-healing supervisor. It detects a failure, diagnoses the cause with the evidence and reasoning recorded, then repairs it. Repair steps that match a capability you have registered and are not financial, destructive or credential changes execute unattended — no one is paged and no one waits. Steps that touch money, delete or disable something, or alter a key, permission or role stop for a signed approval every time, and a step matching no registered capability is treated as destructive and stops as well. The boundary is the point: automation is what makes it useful at three in the morning, and the carve-out is what makes it acceptable to a risk committee.',
  category: 'infrastructure',
  status: 'live',
  maturity: 'production',
  publicVisible: true,
  licensingAvailable: true,
  targetAudience: Object.freeze(['platform operators', 'reliability teams']),
  requiredCapabilities: Object.freeze(['failure-detection', 'repair-proposals', 'approved-repair-execution', 'post-repair-verification', 'automatic-rollback-on-failed-verification', 'transactional-execution-boundaries', 'point-in-time-state-restore']),
  optionalCapabilities: Object.freeze(['approval-gates']),
  dependencies: Object.freeze(['supervisor-policy']),
  // 'autonomous-production-repair' USED TO BE LISTED HERE AND IT WAS WRONG — misleading in
  // the costly direction. It implied nothing runs without a human, so outreach drafts told
  // prospects the product never repairs on its own, which is the opposite of the design and
  // throws away the reason to buy. api-executor.ts gates on `if (verdict.dangerous)`: a
  // non-dangerous step matching a registered capability falls straight through to the runner
  // and executes. The real, permanent exclusions are the two below.
  exclusions: Object.freeze([
    'unapproved-financial-destructive-or-credential-changes',
    'automatic-reversal-of-effects-already-observed-outside-your-systems',
    'execution-outside-your-registered-capability-list',
  ]),
  architectureReferences: Object.freeze(['supervisor', 'policy-engine', 'durable-coordination']),
  documentationReferences: Object.freeze(['docs/portables/self-healing-integration-guide.md']),
  futureFeatures: Object.freeze(['operator-catalog']),
  supportedLanguages: Object.freeze(['en', 'pt', 'es', 'pl', 'ru']),
})
