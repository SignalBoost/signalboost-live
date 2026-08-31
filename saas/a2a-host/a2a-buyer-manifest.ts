import { compileBuyerA2AOnboarding, type BuyerA2AApprovedSkill } from './a2a-buyer-onboarding.ts'

export const A2A_BUYER_MANIFEST_VERSION = 'signalboost-a2a-buyer-manifest-v1' as const

export type BuyerA2AOnboardingManifest = Readonly<{
  schemaVersion: typeof A2A_BUYER_MANIFEST_VERSION
  agentId: string
  transportRef: string
  assignmentId: string
  tenantId: string
  environmentId: string
  portableId: string
  approvedSkills: readonly BuyerA2AApprovedSkill[]
}>

export type BuyerA2AInstallPlan = Readonly<{
  status: 'buyer-ready'
  mode: 'dry-run'
  schemaVersion: typeof A2A_BUYER_MANIFEST_VERSION
  agent: Awaited<ReturnType<typeof compileBuyerA2AOnboarding>>['agent']
  assignment: Awaited<ReturnType<typeof compileBuyerA2AOnboarding>>['assignment']
  health: Awaited<ReturnType<typeof compileBuyerA2AOnboarding>>['health']
}>

const ALLOWED_KEYS = new Set([
  'schemaVersion', 'agentId', 'transportRef', 'assignmentId', 'tenantId',
  'environmentId', 'portableId', 'approvedSkills',
])
const SECRET_KEY = /(?:secret|token|password|passwd|api[_-]?key|access[_-]?key|private[_-]?key|client[_-]?secret|refresh[_-]?token|authorization|credential|endpoint|url|uri|host)/i

function plain(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function rejectSecretLikeFields(value: unknown, path = 'manifest'): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => rejectSecretLikeFields(item, `${path}[${index}]`))
    return
  }
  if (!plain(value)) return
  for (const [key, item] of Object.entries(value)) {
    if (SECRET_KEY.test(key)) throw new Error(`a2a_buyer_manifest_secret_or_endpoint_field_rejected:${path}.${key}`)
    rejectSecretLikeFields(item, `${path}.${key}`)
  }
}

function required(value: unknown, name: string): string {
  const normalized = String(value ?? '').trim()
  if (!normalized) throw new Error(`A2A buyer manifest ${name} is required`)
  if (normalized === '*') throw new Error(`A2A buyer manifest ${name} does not allow wildcard scope`)
  return normalized
}

export function validateBuyerA2AOnboardingManifest(value: unknown): BuyerA2AOnboardingManifest {
  if (!plain(value)) throw new Error('a2a_buyer_manifest_invalid')
  for (const key of Object.keys(value)) {
    if (!ALLOWED_KEYS.has(key)) throw new Error(`a2a_buyer_manifest_unknown_field:${key}`)
  }
  rejectSecretLikeFields(value)
  if (value.schemaVersion !== A2A_BUYER_MANIFEST_VERSION) throw new Error('a2a_buyer_manifest_schema_version_invalid')
  if (!Array.isArray(value.approvedSkills) || value.approvedSkills.length === 0) throw new Error('a2a_buyer_manifest_approved_skills_required')
  const approvedSkills = value.approvedSkills.map((item, index) => {
    if (!plain(item)) throw new Error(`a2a_buyer_manifest_skill_invalid:${index}`)
    const keys = Object.keys(item)
    if (keys.some(key => key !== 'skillId' && key !== 'risk')) throw new Error(`a2a_buyer_manifest_skill_unknown_field:${index}`)
    const skillId = required(item.skillId, `approvedSkills[${index}].skillId`)
    if (!['advisory', 'write', 'consequential'].includes(String(item.risk))) throw new Error(`a2a_buyer_manifest_skill_risk_invalid:${skillId}`)
    return Object.freeze({ skillId, risk: item.risk as BuyerA2AApprovedSkill['risk'] })
  })
  return Object.freeze({
    schemaVersion: A2A_BUYER_MANIFEST_VERSION,
    agentId: required(value.agentId, 'agentId'),
    transportRef: required(value.transportRef, 'transportRef'),
    assignmentId: required(value.assignmentId, 'assignmentId'),
    tenantId: required(value.tenantId, 'tenantId'),
    environmentId: required(value.environmentId, 'environmentId'),
    portableId: required(value.portableId, 'portableId'),
    approvedSkills: Object.freeze(approvedSkills),
  })
}

/**
 * Validate and compile a buyer onboarding manifest without installing a registry,
 * creating a transport, activating a host, or delegating to an agent.
 * Agent Card retrieval/health remains host-supplied because the card contains the endpoint.
 */
export async function dryRunBuyerA2AOnboarding(input: {
  manifest: unknown
  agentCard: unknown
  fetchAgentCardForHealth: () => Promise<unknown>
}): Promise<BuyerA2AInstallPlan> {
  const manifest = validateBuyerA2AOnboardingManifest(input.manifest)
  const compiled = await compileBuyerA2AOnboarding({
    agentCard: input.agentCard,
    fetchAgentCardForHealth: input.fetchAgentCardForHealth,
    agentId: manifest.agentId,
    transportRef: manifest.transportRef,
    assignmentId: manifest.assignmentId,
    tenantId: manifest.tenantId,
    environmentId: manifest.environmentId,
    portableId: manifest.portableId,
    approvedSkills: manifest.approvedSkills,
  })
  return Object.freeze({
    status: 'buyer-ready',
    mode: 'dry-run',
    schemaVersion: A2A_BUYER_MANIFEST_VERSION,
    agent: compiled.agent,
    assignment: compiled.assignment,
    health: compiled.health,
  })
}
