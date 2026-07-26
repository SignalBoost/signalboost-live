import { portableProductRegistry } from './product-registry.ts'

export const portableDeploymentAcceptanceEvidenceSchemaVersion = 'portable-deployment-acceptance-evidence.v1' as const

export type PortableDeploymentAcceptanceEvidenceBlocker =
  | 'identity'
  | 'scope'
  | 'release'
  | 'checks'
  | 'references'
  | 'timestamps'
  | 'acknowledgment'
  | 'unsafe-state'

type Value = Record<string, unknown>
const SEMVER = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[A-Za-z0-9.-]+)?$/
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/
const SAFE_REFERENCE = /^(?:https?:\/\/|urn:)[^\s]{1,500}$/
const UNSAFE_REFERENCE = /(?:password|secret|token|api[_-]?key|private[_-]?key|bearer)[=:]/i
const REQUIRED_CHECKS = Object.freeze(['clean-install', 'configuration-validation', 'health-check', 'rollback-readiness', 'buyer-signoff'] as const)

function record(value: unknown): Value | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Value : null
}

function safeReference(value: unknown): value is string {
  return typeof value === 'string' && SAFE_REFERENCE.test(value) && !UNSAFE_REFERENCE.test(value)
}

function timestamp(value: unknown): number | null {
  if (typeof value !== 'string') return null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function validatePortableDeploymentAcceptanceEvidence(inputValue: unknown) {
  const input = record(inputValue)
  const blockers: PortableDeploymentAcceptanceEvidenceBlocker[] = []
  const productId = typeof input?.productId === 'string' ? input.productId.trim() : ''
  const tenantId = typeof input?.tenantId === 'string' ? input.tenantId.trim() : ''
  const environmentId = typeof input?.environmentId === 'string' ? input.environmentId.trim() : ''
  const releaseVersion = typeof input?.releaseVersion === 'string' ? input.releaseVersion.trim() : ''

  if (!portableProductRegistry.some(item => item.manifest.productId === productId)) blockers.push('identity')
  if (!SAFE_ID.test(tenantId) || !SAFE_ID.test(environmentId)) blockers.push('scope')
  if (!SEMVER.test(releaseVersion)) blockers.push('release')

  const rawChecks = Array.isArray(input?.checks) ? input.checks : []
  const checks = rawChecks.map(record).filter((value): value is Value => value !== null)
  const kinds = checks.map(check => check.kind)
  if (
    checks.length !== REQUIRED_CHECKS.length ||
    new Set(kinds).size !== REQUIRED_CHECKS.length ||
    REQUIRED_CHECKS.some(kind => !checks.some(check => check.kind === kind && check.status === 'passed'))
  ) blockers.push('checks')
  if (checks.some(check => !safeReference(check.evidenceReference))) blockers.push('references')

  const evaluatedAt = timestamp(input?.evaluatedAt)
  const acknowledgedAt = timestamp(input?.acknowledgedAt)
  if (evaluatedAt === null || acknowledgedAt === null || acknowledgedAt < evaluatedAt) blockers.push('timestamps')
  if (input?.buyerAccepted !== true || !safeReference(input?.buyerSignoffReference)) blockers.push('acknowledgment')

  if (
    input?.readOnly !== true ||
    input?.deploymentPerformed !== false ||
    input?.infrastructureMutationPerformed !== false ||
    input?.credentialTransferred !== false ||
    input?.providerExecutionPerformed !== false ||
    input?.productionExecutionEnabled !== false
  ) blockers.push('unsafe-state')

  return Object.freeze({
    schemaVersion: portableDeploymentAcceptanceEvidenceSchemaVersion,
    productId,
    tenantId,
    environmentId,
    releaseVersion,
    checks: Object.freeze(checks.map(check => Object.freeze({ kind: String(check.kind ?? ''), status: String(check.status ?? ''), evidenceReference: safeReference(check.evidenceReference) ? check.evidenceReference : '' }))),
    buyerAccepted: input?.buyerAccepted === true,
    buyerSignoffReference: safeReference(input?.buyerSignoffReference) ? input.buyerSignoffReference : '',
    state: blockers.length === 0 ? 'deployment_acceptance_evidence_validated' : 'blocked',
    blockers: Object.freeze([...new Set(blockers)]),
    readOnly: true,
    deploymentPerformed: false,
    infrastructureMutationPerformed: false,
    credentialTransferred: false,
    providerExecutionPerformed: false,
    productionExecutionEnabled: false,
  })
}
