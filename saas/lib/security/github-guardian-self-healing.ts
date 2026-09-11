import { incidentSchema, type SupervisorIncident } from '../supervisor/incident-schema.ts'
import { repairPlanSchema, type RepairPlan } from '../supervisor/repair-plan-schema.ts'
import { DefaultSupervisorPolicyEngine } from '../supervisor/policy-engine.ts'
import type { PolicyDecision } from '../supervisor/execution-contracts.ts'

export const GUARDIAN_REPOSITORY_REVIEW_CODE = 'guardian_repository_change_review_required'

export type GuardianSelfHealingHandoff = Readonly<{
  incident: SupervisorIncident
  plan: RepairPlan
  policy: PolicyDecision
}>

export function createGuardianSelfHealingHandoff(input: {
  deliveryId: string
  workItemId: string
  organizationId: string
  observation: Readonly<Record<string, any>>
  alert: Readonly<Record<string, any>> | null
}): GuardianSelfHealingHandoff | null {
  if (!input.alert) return null
  const at = String(input.observation.observed_at || new Date().toISOString())
  const repository = String(input.observation.resource_id || input.alert.repo || '').toLowerCase()
  const metadata = input.observation.safe_metadata && typeof input.observation.safe_metadata === 'object'
    ? input.observation.safe_metadata as Record<string, unknown>
    : {}
  const sensitivePaths = Array.isArray(metadata.sensitivePaths)
    ? metadata.sensitivePaths.map(value => String(value)).slice(0, 100)
    : []
  const incidentId = `guardian-repository-change:${input.deliveryId}`
  const incident = incidentSchema.parse({
    incidentId,
    provider: 'github',
    environment: 'production',
    severity: 'warning',
    detectedAt: at,
    source: 'webhook',
    errorCode: GUARDIAN_REPOSITORY_REVIEW_CODE,
    errorMessage: 'Authenticated activity changed security-sensitive repository paths and requires review.',
    affectedResource: repository,
    evidence: [{
      evidenceId: `${incidentId}:signed-patrol-evidence`,
      type: 'signed_repository_patrol_evidence',
      capturedAt: at,
      summary: `${sensitivePaths.length} security-sensitive path change(s) observed.`,
      reference: String(input.observation.correlation_id || input.workItemId),
      digest: typeof metadata.evidenceEntryHash === 'string' ? metadata.evidenceEntryHash : undefined,
    }],
    metadata: {
      organizationId: input.organizationId,
      observationOnly: true,
      reviewRequired: true,
      recoveryPreauthorized: false,
      automaticRepairAuthorized: false,
      changedPathCount: sensitivePaths.length,
      sensitivePaths,
    },
  })
  const plan = repairPlanSchema.parse({
    planId: `${incidentId}:review-plan`,
    incidentId,
    diagnosis: 'A signed repository change is review evidence, not proof that the repository is defective or compromised.',
    confidenceScore: 100,
    requiresBrowser: false,
    riskLevel: 'medium',
    targetProvider: 'github',
    targetEnvironment: 'production',
    approvalRequirements: {
      requiredApprovalsCount: 1,
      requiredRoles: ['owner'],
      rationale: 'Repository repair or rollback requires owner review and stronger fault evidence.',
    },
    steps: [{
      stepId: 'owner-security-review',
      action: 'request_approval',
      description: 'Review the authenticated security-sensitive repository change.',
      protectedAction: true,
      parameters: { repository, sensitivePaths },
    }],
    verificationSteps: [{
      stepId: 'verify-review-decision',
      action: 'verify',
      description: 'Verify that the review disposition is durably recorded before any repair is considered.',
      protectedAction: false,
      parameters: { incidentId },
    }],
    generatedAt: at,
    schemaVersion: 'guardian-self-healing-review-v1',
  })
  const policy = new DefaultSupervisorPolicyEngine().evaluate({ incident, plan, mode: 'autopilot', context: {} })
  return Object.freeze({ incident, plan, policy })
}
