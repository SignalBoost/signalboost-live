import { evaluateReleaseCandidateReadiness } from './readiness.ts'
import type { RcCheckCategory, RcCheckResult, RcCheckStatus, RcEvidence, RcReadinessSnapshot } from './types.ts'
import type { TenantContext } from '../autonomous-systems/types.ts'

export const COS_ENTERPRISE_AI_PROFILE_VERSION = '1.0.0' as const

/**
 * Enterprise COS is a provider-neutral cognitive runtime, not a Qwen/RunPod product.
 * These are release requirements, not marketing claims: missing evidence remains not_run.
 */
export const COS_ENTERPRISE_AI_REQUIREMENTS = [
  {
    checkId: 'cos.enterprise_ai.byom.model_port',
    category: 'integration',
    summary: 'COS accepts a buyer-supplied model through an injected model/reasoning port without changing COS engine code.',
  },
  {
    checkId: 'cos.enterprise_ai.byoa.agent_port',
    category: 'integration',
    summary: 'COS can collaborate with a buyer-supplied existing agent through the governed Agent Gateway without requiring that agent to be replaced.',
  },
  {
    checkId: 'cos.enterprise_ai.qwen.optional',
    category: 'deployment',
    summary: 'The buyer deployment has no mandatory Qwen model dependency; Qwen may be absent unless explicitly selected by the buyer.',
  },
  {
    checkId: 'cos.enterprise_ai.runpod.optional',
    category: 'deployment',
    summary: 'The buyer deployment has no mandatory RunPod dependency; inference may run on buyer infrastructure or another approved provider.',
  },
  {
    checkId: 'cos.enterprise_ai.credentials.buyer_owned',
    category: 'security',
    summary: 'Model/agent credentials and infrastructure authorization are buyer-owned, scoped, and supplied through approved host/vault boundaries.',
  },
  {
    checkId: 'cos.enterprise_ai.governance.model_not_authority',
    category: 'security',
    summary: 'The selected model or agent cannot bypass COS governance, approval, capability, audit, and verification boundaries to control infrastructure directly.',
  },
  {
    checkId: 'cos.enterprise_ai.memory.model_portable',
    category: 'resilience',
    summary: 'COS durable memory, knowledge, cognitive skills, provenance, and learning survive a supported model/provider replacement.',
  },
  {
    checkId: 'cos.enterprise_ai.continuity.provider_neutral',
    category: 'resilience',
    summary: 'Backup/continuity reasoning accepts a buyer-approved reasoner and does not require a SignalBoost-selected model provider.',
  },
  {
    checkId: 'cos.enterprise_ai.documentation.disclosure',
    category: 'documentation',
    summary: 'Buyer documentation clearly distinguishes COS from optional development/runtime model and hosting choices and lists actual shipped/runtime dependencies.',
  },
] as const satisfies readonly { checkId: string; category: RcCheckCategory; summary: string }[]

export type CosEnterpriseAiCheckId = typeof COS_ENTERPRISE_AI_REQUIREMENTS[number]['checkId']

export interface CosEnterpriseAiEvidenceInput {
  readonly status: RcCheckStatus
  readonly evidence: readonly RcEvidence[]
  readonly summary?: string
}

export type CosEnterpriseAiEvidenceMap = Partial<Record<CosEnterpriseAiCheckId, CosEnterpriseAiEvidenceInput>>

export function buildCosEnterpriseAiChecks(evidence: CosEnterpriseAiEvidenceMap = {}): readonly RcCheckResult[] {
  return COS_ENTERPRISE_AI_REQUIREMENTS.map(requirement => {
    const supplied = evidence[requirement.checkId]
    return {
      checkId: requirement.checkId,
      category: requirement.category,
      required: true,
      status: supplied?.status ?? 'not_run',
      summary: supplied?.summary?.trim() || requirement.summary,
      evidence: supplied?.evidence ? [...supplied.evidence] : [],
    }
  })
}

export function evaluateCosEnterpriseAiRelease(input: {
  tenant: TenantContext
  generatedAt: string
  evidence?: CosEnterpriseAiEvidenceMap
}): RcReadinessSnapshot {
  return evaluateReleaseCandidateReadiness({
    tenant: input.tenant,
    generatedAt: input.generatedAt,
    checks: buildCosEnterpriseAiChecks(input.evidence),
  })
}
