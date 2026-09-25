// saas/lib/ai/modelGovernance.ts
import type { PlatformModelProfile } from './modelCapabilityRegistry.ts'
import type { AssignableModelUse } from './modelConfigurationPort.ts'
import type { ModelCertificationReceipt } from './modelCertification.ts'

const REQUIRED_CHECKS: Readonly<Record<AssignableModelUse, readonly string[]>> = Object.freeze({
  cos_reasoner: Object.freeze(['health', 'chat_completion', 'structured_json', 'tool_calling']),
  builder: Object.freeze(['health', 'chat_completion', 'structured_json']),
  specialist: Object.freeze(['health', 'chat_completion', 'structured_json']),
})

export function requiredCertificationChecks(use: AssignableModelUse): readonly string[] {
  return REQUIRED_CHECKS[use]
}

export function assertModelAssignmentCertification(input: {
  use: AssignableModelUse
  profile: PlatformModelProfile
  receipt: Pick<ModelCertificationReceipt, 'profileKey' | 'status' | 'checks'> & { certificationId?: string }
}): void {
  if (!input.profile.uses.includes(input.use)) throw new Error('platform_model_assignment_use_not_registered')
  if (input.receipt.profileKey !== input.profile.key) throw new Error('platform_model_assignment_certification_profile_mismatch')
  if (input.receipt.status === 'failed') throw new Error('platform_model_assignment_certification_failed')
  const checks = new Map(input.receipt.checks.map(check => [check.id, check.status]))
  for (const id of requiredCertificationChecks(input.use)) {
    const capability = id === 'structured_json' ? 'structuredJson' : id === 'tool_calling' ? 'toolCalling' : 'chatCompletion'
    if (id !== 'health' && (input.profile.inference as Readonly<Record<string,string>>)[capability] !== 'validated') {
      throw new Error(`platform_model_assignment_capability_required:${capability}`)
    }
    if (checks.get(id as any) !== 'passed') throw new Error(`platform_model_assignment_certification_check_required:${id}`)
  }
}
