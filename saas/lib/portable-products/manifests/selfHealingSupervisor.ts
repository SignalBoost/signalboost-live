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
    'the-browser-agent-works-inside-your-own-runtime-under-your-own-credentials',
    'a-clean-state-checkpoint-is-captured-before-any-repair-changes-anything',
    'atomic-restore-of-the-whole-execution-context-when-a-repair-does-not-verify',
    'repairs-that-cannot-be-checkpointed-are-blocked-before-they-start-not-after',
    'a-person-is-called-whenever-an-undo-would-be-unsafe-or-does-not-restore',
    'manual-operator-control-available-at-any-step',
  ]),
  shortDescription: 'Self-healing software: an AI-driven operations system with the COS AI brain that fixes failures itself through pre-integrated provider/API connectors, through a browser when there is no API, or by handing an operator the wheel. It is buyer-hosted, keeps consequential actions under human approval, and records the evidence, reasoning and actions in an audit trail.',
  // THIS DESCRIPTION IS ALSO THE PRODUCT-SPECIFIC OUTREACH BRIEF. ProspectCampaignCore
  // injects the manifest into every COS-generated draft, including refreshed pending drafts.
  // Keep these instructions HERE, not in a global outreach prompt: every SignalBoost product
  // gets its own campaign rules and another product must never inherit Supervisor messaging.
  longDescription: 'A governed, buyer-hosted, AI-driven self-healing operations system whose COS AI brain detects a failure, diagnoses the cause from evidence, chooses a permitted recovery path, and repairs it. It uses pre-integrated providers, connectors and registered APIs first; when no API exists, the browser agent works inside the buyer own runtime under the buyer own credentials; an operator can take control at any point. Before changing anything it captures a checkpoint from the buyer infrastructure, verifies the repair afterwards, and restores the execution context when verification fails. Money, deletion and credential changes remain reserved for explicit human approval. Every conclusion and action carries the evidence behind it, the rule that fired, the reasoning, the action taken and what would have changed the answer, creating an auditable operational trail. OUTREACH REQUIREMENT FOR THIS PRODUCT ONLY: every Self-Healing Supervisor email must communicate the relevant combination of these mandatory concepts: AI-driven operations, self-healing, COS AI brain, buyer-hosted architecture, human approval for consequential actions, audit trail, pre-integrated providers/connectors, and concrete operational benefits. Do not dump them as a feature list; adapt them to the recipient and lead with the business problem. Audience weighting for MSPs, managed cloud providers and DevOps/SRE consultancies: self-healing and lower MTTR are highest priority, cloud operations next, browser automation supporting. Audience weighting for banks and financial institutions: governance, auditability and buyer-hosted control are highest priority, with human approval explained as buyer control. Audience weighting for healthcare organizations: compliance-oriented controls, availability and governance are highest priority, with self-healing supporting continuity. These audience weights change emphasis only; they never authorize claims outside this manifest. COS prepares the personalized email as a pending draft for owner review and approval; the campaign does not send merely because the draft was generated.',
  category: 'infrastructure',
  status: 'live',
  maturity: 'production',
  publicVisible: true,
  licensingAvailable: true,
  targetAudience: Object.freeze([
    'managed service providers',
    'managed cloud providers',
    'DevOps and SRE consultancies',
    'platform operators',
    'reliability teams',
    'banks and financial institutions',
    'healthcare organizations',
  ]),
  requiredCapabilities: Object.freeze([
    'ai-driven-operations',
    'self-healing',
    'cos-ai-reasoning',
    'buyer-hosted-operation',
    'failure-detection',
    'repair-proposals',
    'approved-repair-execution',
    'human-approval-for-consequential-actions',
    'post-repair-verification',
    'automatic-rollback-on-failed-verification',
    'transactional-execution-boundaries',
    'point-in-time-state-restore',
    'auditable-evidence-and-reasoning',
    'pre-integrated-provider-and-api-connectors',
  ]),
  optionalCapabilities: Object.freeze(['approval-gates']),
  dependencies: Object.freeze(['supervisor-policy']),
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
