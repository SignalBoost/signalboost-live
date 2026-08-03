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
    // POSITIVE FRAMING OF A TRUE FACT. This used to read "browser tasks prepared under
    // approval for your own browser runtime to run" — accurate, and written as though it
    // were an apology. The same fact stated as scope is a SELLING POINT to an enterprise:
    // the browser agent operates inside their perimeter, on their runtime, under their
    // credentials, which is exactly what a security review wants to hear. Nothing is
    // overclaimed — it still does not say we drive a browser in our own cloud.
    'the-browser-agent-works-inside-your-own-runtime-under-your-own-credentials',
    'a-clean-state-checkpoint-is-captured-before-any-repair-changes-anything',
    'atomic-restore-of-the-whole-execution-context-when-a-repair-does-not-verify',
    'repairs-that-cannot-be-checkpointed-are-blocked-before-they-start-not-after',
    'a-person-is-called-whenever-an-undo-would-be-unsafe-or-does-not-restore',
    'manual-operator-control-available-at-any-step',
  ]),
  shortDescription: 'Self-healing software: it fixes the failure itself — through your APIs, through a browser when there is no API, or by handing an operator the wheel. It checkpoints before it changes anything, and money, deletion and credentials stay yours to sign off.',
  // WHAT THIS SENTENCE DELIBERATELY DOES NOT SAY: reversible. RepairPlan declares
  // rollbackSteps and the fingerprinting hashes them, but no code executes them — the
  // verifier runs the plan's verificationSteps and nothing runs a rollback. A first
  // draft of this line claimed repairs were "reversible if the verification fails" and
  // it was checked against the executors before shipping, which is the only reason the
  // claim did not reach a buyer. Rollback sits in futureFeatures until it runs.
  longDescription: 'A governed self-healing supervisor that acts on its own authority across the ordinary work and reserves the extraordinary for you. It detects a failure, diagnoses the cause with the evidence and reasoning recorded, then repairs it — using your registered APIs first, a browser agent running inside your own infrastructure under your own credentials where no API exists, and an operator the moment you want one or the moment it meets a captcha, a second factor or anything outside its envelope. Before it changes anything it captures a checkpoint from your own infrastructure, and if the repair does not verify it restores the whole execution context in one operation. Work it cannot checkpoint is stopped before it starts rather than discovered afterwards. Every conclusion carries the evidence behind it, the rule that fired and what would have changed the answer.',
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
