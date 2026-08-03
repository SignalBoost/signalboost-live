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
    'automated-api-execution-against-your-registered-capabilities',
    'automatic-failover-from-api-to-browser-or-to-a-human',
    'browser-tasks-prepared-under-approval-for-your-own-browser-runtime-to-run',
    'manual-operator-control-available-at-any-step',
  ]),
  shortDescription: 'Self-healing software: executes approved repairs against the capabilities you register, verifies the result, and records the evidence and reasoning behind every conclusion.',
  // WHAT THIS SENTENCE DELIBERATELY DOES NOT SAY: reversible. RepairPlan declares
  // rollbackSteps and the fingerprinting hashes them, but no code executes them — the
  // verifier runs the plan's verificationSteps and nothing runs a rollback. A first
  // draft of this line claimed repairs were "reversible if the verification fails" and
  // it was checked against the executors before shipping, which is the only reason the
  // claim did not reach a buyer. Rollback sits in futureFeatures until it runs.
  longDescription: 'A governed self-healing supervisor. It detects a failure, diagnoses the cause with the evidence and the reasoning recorded, then repairs it by executing bounded steps that are approved before they run and verified after. Execution is default-deny: a step runs only when it matches a capability the buyer has explicitly registered and carries a signed approval, so the supervisor can never act outside the authority it was given.',
  category: 'infrastructure',
  status: 'live',
  maturity: 'production',
  publicVisible: true,
  licensingAvailable: true,
  targetAudience: Object.freeze(['platform operators', 'reliability teams']),
  requiredCapabilities: Object.freeze(['failure-detection', 'repair-proposals', 'approved-repair-execution', 'post-repair-verification']),
  optionalCapabilities: Object.freeze(['approval-gates']),
  dependencies: Object.freeze(['supervisor-policy']),
  exclusions: Object.freeze(['autonomous-production-repair']),
  architectureReferences: Object.freeze(['supervisor', 'policy-engine', 'durable-coordination']),
  documentationReferences: Object.freeze(['docs/portables/self-healing-integration-guide.md']),
  futureFeatures: Object.freeze(['operator-catalog', 'automated-rollback-execution']),
  supportedLanguages: Object.freeze(['en', 'pt', 'es', 'pl', 'ru']),
})
