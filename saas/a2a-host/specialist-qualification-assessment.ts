import type { SupabaseClient } from '@supabase/supabase-js'
import type { A2ATransportFactory } from './a2a-agent-registry.ts'
import { createA2AAgentResolver, type A2AAgentRegistryPort } from './a2a-agent-registry.ts'

export const SPECIALIST_QUALIFICATION_ASSESSMENT_VERSION = 'signalboost-specialist-qualification-assessment-v2' as const

export interface SpecialistQualificationVerification {
  qualified: boolean
  verifierId: string
  evidenceRef: string
}

export interface SpecialistQualificationVerifier {
  verify(input: {
    tenantId: string
    environmentId: string
    portableId: string
    agentId: string
    skillId: string
    response: Readonly<Record<string, unknown>>
  }): Promise<SpecialistQualificationVerification>
}

export interface SpecialistQualificationProbeProvider {
  issue(input: {
    tenantId: string
    environmentId: string
    portableId: string
    agentId: string
    skillId: string
    assessmentId: string
  }): Promise<{ messageId: string; probeText: string }>
}

export interface SpecialistQualificationAssessmentRequest {
  tenantId: string
  environmentId: string
  portableId: string
  agentId: string
  skillId: string
  assessmentId: string
}

export interface SpecialistQualificationAssessmentRecord {
  schemaVersion: typeof SPECIALIST_QUALIFICATION_ASSESSMENT_VERSION
  assessmentId: string
  tenantId: string
  environmentId: string
  portableId: string
  agentId: string
  skillId: string
  qualified: boolean
  verifierId: string
  evidenceRef: string
  executionAttempted: true
  observedAt: string
  validUntil: string
}

export interface SpecialistQualificationAssessmentPort {
  assess(input: SpecialistQualificationAssessmentRequest): Promise<SpecialistQualificationAssessmentRecord>
}

function required(value: unknown, name: string): string {
  const normalized = String(value ?? '').trim()
  if (!normalized) throw new Error(`Specialist qualification ${name} is required`)
  if (normalized === '*') throw new Error(`Specialist qualification ${name} does not allow wildcard scope`)
  return normalized
}

function boundedValidityMs(value: number | undefined): number {
  const resolved = value ?? 86_400_000
  if (!Number.isFinite(resolved) || resolved < 60_000 || resolved > 30 * 86_400_000) throw new Error('specialist_qualification_validity_invalid')
  return Math.floor(resolved)
}

/** Fail closed unless the verifier record is correlated to the exact server-owned assessment request. */
export function assertSpecialistQualificationAssessmentCorrelation(
  record: SpecialistQualificationAssessmentRecord,
  expected: SpecialistQualificationAssessmentRequest,
): void {
  const fields = ['assessmentId', 'tenantId', 'environmentId', 'portableId', 'agentId', 'skillId'] as const
  for (const field of fields) {
    const actual = required(record?.[field], `record.${field}`)
    const wanted = required(expected?.[field], `expected.${field}`)
    if (actual !== wanted) throw new Error(`specialist_qualification_correlation_mismatch:${field}`)
  }
}

/**
 * Run one advisory qualification probe outside the mesh qualification gate while preserving exact registry scope.
 * A successful remote call is necessary but not sufficient: an independently injected host verifier must judge
 * the response and provide a durable evidence reference. Raw probe/response content is not returned for persistence.
 */
export async function runSpecialistQualificationAssessment(options: {
  registry: A2AAgentRegistryPort
  transportFactory: A2ATransportFactory
  verifier: SpecialistQualificationVerifier
  tenantId: string
  environmentId: string
  portableId: string
  agentId: string
  skillId: string
  assessmentId: string
  messageId: string
  probeText: string
  timeoutMs?: number
  validForMs?: number
  now?: () => Date
}): Promise<SpecialistQualificationAssessmentRecord> {
  const tenantId = required(options.tenantId, 'tenantId')
  const environmentId = required(options.environmentId, 'environmentId')
  const portableId = required(options.portableId, 'portableId')
  const agentId = required(options.agentId, 'agentId')
  const skillId = required(options.skillId, 'skillId')
  const assessmentId = required(options.assessmentId, 'assessmentId')
  const messageId = required(options.messageId, 'messageId')
  const probeText = required(options.probeText, 'probeText')
  const validForMs = boundedValidityMs(options.validForMs)
  const now = options.now ?? (() => new Date())

  let executionAttempted = false
  const transportFactory: A2ATransportFactory = Object.freeze({
    create(input) {
      const transport = options.transportFactory.create(input)
      return Object.freeze({ async send(request) { executionAttempted = true; return transport.send(request) } })
    },
  })

  const resolver = createA2AAgentResolver({ registry: options.registry, transportFactory, timeoutMs: options.timeoutMs })
  const resolved = await resolver.resolve({ tenantId, environmentId, portableId, agentId })
  if (!resolved) throw new Error(`specialist_qualification_agent_unavailable:${agentId}`)
  if (!resolved.allowedSkillIds.includes(skillId)) throw new Error(`specialist_qualification_skill_not_authorized:${skillId}`)

  const response = await resolved.sendAdvisory({ skillId, messageId, text: probeText })
  if (!executionAttempted) throw new Error('specialist_qualification_transport_not_attempted')

  const verification = await options.verifier.verify({ tenantId, environmentId, portableId, agentId, skillId, response })
  const verifierId = required(verification?.verifierId, 'verifierId')
  const evidenceRef = required(verification?.evidenceRef, 'evidenceRef')
  if (verifierId === agentId) throw new Error('specialist_qualification_self_verification_rejected')

  const observedAt = now()
  if (!Number.isFinite(observedAt.getTime())) throw new Error('specialist_qualification_time_invalid')
  const validUntil = new Date(observedAt.getTime() + validForMs)
  return Object.freeze({
    schemaVersion: SPECIALIST_QUALIFICATION_ASSESSMENT_VERSION,
    assessmentId, tenantId, environmentId, portableId, agentId, skillId,
    qualified: verification.qualified === true,
    verifierId, evidenceRef, executionAttempted: true,
    observedAt: observedAt.toISOString(), validUntil: validUntil.toISOString(),
  })
}

/** Build the server/portable entry point. Probe text and scoring stay host-owned and are never caller inputs. */
export function createSpecialistQualificationAssessmentPort(options: {
  registry: A2AAgentRegistryPort
  transportFactory: A2ATransportFactory
  verifier: SpecialistQualificationVerifier
  probes: SpecialistQualificationProbeProvider
  timeoutMs?: number
  validForMs?: number
  now?: () => Date
}): SpecialistQualificationAssessmentPort {
  return Object.freeze({
    async assess(input) {
      const tenantId = required(input.tenantId, 'tenantId')
      const environmentId = required(input.environmentId, 'environmentId')
      const portableId = required(input.portableId, 'portableId')
      const agentId = required(input.agentId, 'agentId')
      const skillId = required(input.skillId, 'skillId')
      const assessmentId = required(input.assessmentId, 'assessmentId')
      const probe = await options.probes.issue({ tenantId, environmentId, portableId, agentId, skillId, assessmentId })
      return runSpecialistQualificationAssessment({
        registry: options.registry, transportFactory: options.transportFactory, verifier: options.verifier,
        tenantId, environmentId, portableId, agentId, skillId, assessmentId,
        messageId: required(probe?.messageId, 'probe.messageId'),
        probeText: required(probe?.probeText, 'probe.probeText'),
        timeoutMs: options.timeoutMs, validForMs: options.validForMs, now: options.now,
      })
    },
  })
}

/** Persist only the bounded host-verifier decision; raw probe prompts/responses never enter this table. */
export async function persistSupabaseSpecialistQualificationAssessment(db: SupabaseClient, record: SpecialistQualificationAssessmentRecord): Promise<void> {
  if (record.schemaVersion !== SPECIALIST_QUALIFICATION_ASSESSMENT_VERSION) throw new Error('specialist_qualification_schema_mismatch')
  if (record.executionAttempted !== true) throw new Error('specialist_qualification_execution_evidence_missing')
  const observedAt = new Date(record.observedAt)
  const validUntil = new Date(record.validUntil)
  if (!Number.isFinite(observedAt.getTime()) || !Number.isFinite(validUntil.getTime()) || validUntil <= observedAt) throw new Error('specialist_qualification_window_invalid')

  const payload = {
    qualification_key: `qualification:${required(record.assessmentId, 'assessmentId')}`,
    tenant_id: required(record.tenantId, 'tenantId'), environment_id: required(record.environmentId, 'environmentId'),
    portable_id: required(record.portableId, 'portableId'), agent_id: required(record.agentId, 'agentId'), skill_id: required(record.skillId, 'skillId'),
    qualified: record.qualified === true, evidence_ref: required(record.evidenceRef, 'evidenceRef'), verified_by: required(record.verifierId, 'verifierId'),
    valid_from: record.observedAt, valid_until: record.validUntil, observed_at: record.observedAt,
  }
  if (payload.verified_by === payload.agent_id) throw new Error('specialist_qualification_self_verification_rejected')
  const { error } = await db.from('a2a_specialist_qualifications').insert(payload)
  if (error) throw error
}
