// saas/lib/enterprise/memory/repairPlanning.ts
// Grounded repair-plan proposals derived from Enterprise root-cause analysis.
// Plans never execute actions and never bypass approval boundaries.

import type { RootCauseAnalysis, RootCauseHypothesis } from './rootCauseAnalysis.ts'

export type RepairRisk = 'low' | 'medium' | 'high'

export type RepairPlanStep = Readonly<{
  sequence: number
  action: string
  system: 'browser' | 'repository' | 'security' | 'supervisor' | 'vercel'
  risk: RepairRisk
  requiresApproval: true
  verification: readonly string[]
  evidenceEventIds: readonly string[]
}>

export type EnterpriseRepairPlan = Readonly<{
  organizationId: string
  targetEventId: string
  status: 'proposed' | 'insufficient_evidence'
  objective: string
  confidence: number
  assumptions: readonly string[]
  steps: readonly RepairPlanStep[]
  rollbackStrategy: readonly string[]
}>

function clamp01(value: unknown): number {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return 0
  return Math.min(1, Math.max(0, numeric))
}

function identifySystem(hypothesis: RootCauseHypothesis): RepairPlanStep['system'] {
  const summary = hypothesis.summary.toLowerCase()
  if (summary.includes('deployment.')) return 'vercel'
  if (summary.includes('repository.')) return 'repository'
  if (summary.includes('security.')) return 'security'
  if (summary.includes('browser.')) return 'browser'
  return 'supervisor'
}

function actionFor(system: RepairPlanStep['system'], hypothesis: RootCauseHypothesis): string {
  switch (system) {
    case 'vercel':
      return `Review and, if approved, roll back or redeploy the deployment associated with ${hypothesis.eventId}.`
    case 'repository':
      return `Review the repository changes associated with ${hypothesis.eventId} and prepare a minimal corrective patch.`
    case 'security':
      return `Contain and remediate the verified security finding associated with ${hypothesis.eventId}.`
    case 'browser':
      return `Reproduce and isolate the browser failure associated with ${hypothesis.eventId} before changing production.`
    default:
      return `Escalate ${hypothesis.eventId} for supervised remediation planning.`
  }
}

function riskFor(system: RepairPlanStep['system'], hypothesis: RootCauseHypothesis): RepairRisk {
  if (system === 'security') return 'high'
  if (system === 'vercel' || system === 'repository') return hypothesis.confidence >= 0.75 ? 'medium' : 'high'
  return 'low'
}

function verificationFor(system: RepairPlanStep['system']): readonly string[] {
  const checks = ['Supervisor confirms the approved action completed without new errors.']
  if (system === 'vercel' || system === 'repository') {
    checks.unshift('Vercel reports a successful deployment.', 'Browser Agent repeats the affected user-flow check.')
  } else if (system === 'security') {
    checks.unshift('Security scanner confirms the finding is no longer present.')
  } else if (system === 'browser') {
    checks.unshift('Browser Agent reproduces the expected behavior in a fresh session.')
  }
  return Object.freeze(checks)
}

export function buildEnterpriseRepairPlan(
  analysis: RootCauseAnalysis,
  options: { maxSteps?: number; minimumConfidence?: number } = {},
): EnterpriseRepairPlan {
  const maxSteps = options.maxSteps ?? 3
  const minimumConfidence = options.minimumConfidence ?? 0.45
  if (!Number.isSafeInteger(maxSteps) || maxSteps < 1 || maxSteps > 10) {
    throw new Error('Repair plan maxSteps must be an integer from 1 to 10.')
  }
  if (!Number.isFinite(minimumConfidence) || minimumConfidence < 0 || minimumConfidence > 1) {
    throw new Error('Repair plan minimumConfidence must be from 0 to 1.')
  }

  const hypotheses = [analysis.primaryHypothesis, ...analysis.alternateHypotheses]
    .filter((item): item is RootCauseHypothesis => Boolean(item))
    .filter(item => clamp01(item.confidence) >= minimumConfidence)
    .slice(0, maxSteps)

  if (analysis.status !== 'supported' || !hypotheses.length) {
    return Object.freeze({
      organizationId: analysis.organizationId,
      targetEventId: analysis.targetEventId,
      status: 'insufficient_evidence',
      objective: 'Collect additional evidence before proposing a repair.',
      confidence: 0,
      assumptions: Object.freeze([...analysis.unknowns]),
      steps: Object.freeze([]),
      rollbackStrategy: Object.freeze([]),
    })
  }

  const steps = hypotheses.map((hypothesis, index): RepairPlanStep => {
    const system = identifySystem(hypothesis)
    return Object.freeze({
      sequence: index + 1,
      action: actionFor(system, hypothesis),
      system,
      risk: riskFor(system, hypothesis),
      requiresApproval: true,
      verification: verificationFor(system),
      evidenceEventIds: Object.freeze([...new Set([hypothesis.eventId, ...hypothesis.relatedEventIds])].sort()),
    })
  })

  const confidence = Math.round((hypotheses.reduce((sum, item) => sum + clamp01(item.confidence), 0) / hypotheses.length) * 1000) / 1000

  return Object.freeze({
    organizationId: analysis.organizationId,
    targetEventId: analysis.targetEventId,
    status: 'proposed',
    objective: `Mitigate the observed issue associated with ${analysis.targetEventId} using approved, reversible steps.`,
    confidence,
    assumptions: Object.freeze([
      ...analysis.unknowns,
      'Every repair step requires explicit approval before execution.',
      'Successful execution must be confirmed by fresh evidence rather than assumed.',
    ]),
    steps: Object.freeze(steps),
    rollbackStrategy: Object.freeze([
      'Stop execution if verification fails or new critical evidence appears.',
      'Restore the last known-good deployment or code revision using the existing approved rollback process.',
      'Repeat Browser Agent, Vercel, Supervisor, and relevant security checks after rollback.',
    ]),
  })
}
