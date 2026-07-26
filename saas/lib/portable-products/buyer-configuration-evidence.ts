import { portableProductRegistry } from './product-registry.ts'

export const portableBuyerConfigurationEvidenceSchemaVersion = 'portable-buyer-configuration-evidence.v1' as const

export type PortableBuyerConfigurationEvidenceBlocker = 'identity' | 'scope' | 'requirements' | 'references' | 'timestamps' | 'unsafe-state'

const SAFE_ID = /^[a-z0-9][a-z0-9._-]{0,127}$/
const SAFE_REF = /^(?:urn:[A-Za-z0-9][A-Za-z0-9:._-]*|https:\/\/[A-Za-z0-9.-]+(?:\/[A-Za-z0-9._~!$&'()*+,;=:@%\/?#\[\]-]*)?)$/
const SECRET = /(?:api[_-]?key|access[_-]?token|client[_-]?secret|password|private[_-]?key|bearer|secret=|token=)/i

function validRef(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 512 && SAFE_REF.test(value) && !SECRET.test(value)
}

function validTimestamp(value: unknown): number | null {
  if (typeof value !== 'string') return null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function validatePortableBuyerConfigurationEvidence(inputValue: unknown) {
  const input = inputValue !== null && typeof inputValue === 'object' && !Array.isArray(inputValue)
    ? inputValue as Record<string, unknown>
    : {}
  const blockers: PortableBuyerConfigurationEvidenceBlocker[] = []
  const productId = typeof input.productId === 'string' ? input.productId.trim() : ''
  const registered = portableProductRegistry.some(entry => entry.manifest.productId === productId)
  if (!registered) blockers.push('identity')

  const tenantId = typeof input.tenantId === 'string' ? input.tenantId.trim() : ''
  const environmentId = typeof input.environmentId === 'string' ? input.environmentId.trim() : ''
  if (!SAFE_ID.test(tenantId) || !SAFE_ID.test(environmentId)) blockers.push('scope')

  const requirements = Array.isArray(input.requirements) ? input.requirements : []
  const normalized = requirements.map(value => typeof value === 'string' ? value.trim() : '')
  if (normalized.length === 0 || normalized.some(value => !SAFE_ID.test(value)) || new Set(normalized).size !== normalized.length) blockers.push('requirements')

  const configurationReference = input.configurationReference
  const credentialReference = input.credentialReference
  const validationReference = input.validationReference
  if (!validRef(configurationReference) || !validRef(credentialReference) || !validRef(validationReference)) blockers.push('references')

  const evaluatedAt = validTimestamp(input.evaluatedAt)
  const expiresAt = validTimestamp(input.expiresAt)
  if (evaluatedAt === null || expiresAt === null || expiresAt <= evaluatedAt) blockers.push('timestamps')

  if (input.readOnly !== true || input.secretValueAccessed !== false || input.credentialTransferred !== false || input.configurationMutationPerformed !== false || input.providerExecutionEnabled !== false || input.deploymentPerformed !== false || input.productionExecutionEnabled !== false) blockers.push('unsafe-state')

  return Object.freeze({
    schemaVersion: portableBuyerConfigurationEvidenceSchemaVersion,
    productId,
    tenantId,
    environmentId,
    requirements: Object.freeze(normalized),
    references: Object.freeze({
      configuration: validRef(configurationReference) ? configurationReference : '',
      credential: validRef(credentialReference) ? credentialReference : '',
      validation: validRef(validationReference) ? validationReference : '',
    }),
    state: blockers.length === 0 ? 'buyer_configuration_evidence_validated' : 'blocked',
    blockers: Object.freeze([...new Set(blockers)]),
    readOnly: true,
    secretValueAccessed: false,
    credentialTransferred: false,
    configurationMutationPerformed: false,
    providerExecutionEnabled: false,
    deploymentPerformed: false,
    productionExecutionEnabled: false,
  })
}
