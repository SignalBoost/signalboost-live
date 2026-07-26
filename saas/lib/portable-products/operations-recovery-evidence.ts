// saas/lib/portable-products/operations-recovery-evidence.ts
import { portableProductRegistry } from './product-registry.ts'

export const portableOperationsRecoveryEvidenceSchemaVersion = 'portable-operations-recovery-evidence.v1' as const

export type PortableOperationsRecoveryEvidenceBlocker =
  | 'identity'
  | 'version'
  | 'references'
  | 'objectives'
  | 'timestamps'
  | 'unsafe-state'

const VERSION = /^[0-9]+(?:\.[0-9]+){1,3}(?:-[A-Za-z0-9.-]+)?$/
const REFERENCE = /^(?:https?:\/\/|urn:)[A-Za-z0-9._~!$&'()*+,;=:@%\/?#\[\]-]+$/
const UNSAFE_REFERENCE = /(?:\.\.|@|BEGIN\s|PRIVATE\s+KEY|password|secret|token|bearer|api[_-]?key)/i

function validReference(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 512 && REFERENCE.test(value) && !UNSAFE_REFERENCE.test(value)
}

function parsedDate(value: unknown): number | null {
  if (typeof value !== 'string') return null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

function positiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0
}

export function validatePortableOperationsRecoveryEvidence(inputValue: unknown) {
  const input = inputValue !== null && typeof inputValue === 'object' && !Array.isArray(inputValue)
    ? inputValue as Record<string, unknown>
    : {}
  const blockers: PortableOperationsRecoveryEvidenceBlocker[] = []
  const productId = typeof input.productId === 'string' ? input.productId.trim() : ''
  const registered = portableProductRegistry.some(descriptor => descriptor.manifest.productId === productId)
  if (!registered) blockers.push('identity')

  const releaseVersion = typeof input.releaseVersion === 'string' ? input.releaseVersion.trim() : ''
  const previousVersion = typeof input.previousVersion === 'string' ? input.previousVersion.trim() : ''
  if (!VERSION.test(releaseVersion) || !VERSION.test(previousVersion) || releaseVersion === previousVersion) blockers.push('version')

  const runbookReference = input.runbookReference
  const upgradeReference = input.upgradeReference
  const rollbackReference = input.rollbackReference
  const backupReference = input.backupReference
  const restoreReference = input.restoreReference
  if (![runbookReference, upgradeReference, rollbackReference, backupReference, restoreReference].every(validReference)) blockers.push('references')

  if (!positiveInteger(input.recoveryPointObjectiveMinutes) || !positiveInteger(input.recoveryTimeObjectiveMinutes)) blockers.push('objectives')

  const validatedAt = parsedDate(input.validatedAt)
  const expiresAt = parsedDate(input.expiresAt)
  if (validatedAt === null || expiresAt === null || expiresAt <= validatedAt) blockers.push('timestamps')

  if (
    input.readOnly !== true ||
    input.artifactAccessed !== false ||
    input.upgradeExecuted !== false ||
    input.rollbackExecuted !== false ||
    input.backupExecuted !== false ||
    input.restoreExecuted !== false ||
    input.deploymentPerformed !== false ||
    input.productionExecutionEnabled !== false
  ) blockers.push('unsafe-state')

  return Object.freeze({
    schemaVersion: portableOperationsRecoveryEvidenceSchemaVersion,
    productId,
    releaseVersion,
    previousVersion,
    state: blockers.length === 0 ? 'operations_recovery_evidence_validated' : 'blocked',
    blockers: Object.freeze([...new Set(blockers)]),
    references: Object.freeze({
      runbook: validReference(runbookReference) ? runbookReference : '',
      upgrade: validReference(upgradeReference) ? upgradeReference : '',
      rollback: validReference(rollbackReference) ? rollbackReference : '',
      backup: validReference(backupReference) ? backupReference : '',
      restore: validReference(restoreReference) ? restoreReference : '',
    }),
    recoveryPointObjectiveMinutes: positiveInteger(input.recoveryPointObjectiveMinutes) ? input.recoveryPointObjectiveMinutes : 0,
    recoveryTimeObjectiveMinutes: positiveInteger(input.recoveryTimeObjectiveMinutes) ? input.recoveryTimeObjectiveMinutes : 0,
    validatedAt: validatedAt === null ? '' : String(input.validatedAt),
    expiresAt: expiresAt === null ? '' : String(input.expiresAt),
    readOnly: true,
    artifactAccessed: false,
    upgradeExecuted: false,
    rollbackExecuted: false,
    backupExecuted: false,
    restoreExecuted: false,
    deploymentPerformed: false,
    productionExecutionEnabled: false,
  })
}
