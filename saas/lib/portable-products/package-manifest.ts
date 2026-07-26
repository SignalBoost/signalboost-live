import { portableProductRegistry } from './product-registry.ts'

export const portablePackageManifestSchemaVersion = 'portable-package-manifest.v1' as const

export type PortablePackageManifestBlocker =
  | 'identity'
  | 'version'
  | 'source'
  | 'artifact'
  | 'integrity'
  | 'dependencies'
  | 'references'
  | 'unsafe-state'

type RecordValue = Record<string, unknown>
const SHA40 = /^[0-9a-f]{40}$/
const SHA256 = /^[0-9a-f]{64}$/
const VERSION = /^[0-9]+(?:\.[0-9]+){1,3}(?:-[A-Za-z0-9.-]+)?$/
const REFERENCE = /^[a-z][a-z0-9+.-]*:\/\/[A-Za-z0-9._~!$&'()*+,;=:@%\/?#\[\]-]+$/
const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/
const UNSAFE = /BEGIN\s|PRIVATE\s+KEY|password|secret=|token=|bearer\s|client_email|private_key/i

function record(value: unknown): RecordValue | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : null
}

function validReference(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 512 && REFERENCE.test(value) && !UNSAFE.test(value) && !value.includes('..') && !value.includes('@')
}

function validDependencies(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string' && SAFE_NAME.test(item)) && new Set(value).size === value.length
}

export function validatePortablePackageManifest(inputValue: unknown) {
  const input = record(inputValue)
  const blockers: PortablePackageManifestBlocker[] = []
  const portableId = typeof input?.portableId === 'string' ? input.portableId.trim() : ''
  const registered = portableProductRegistry.some(entry => entry.manifest.productId === portableId)
  if (!registered) blockers.push('identity')

  const version = typeof input?.version === 'string' ? input.version.trim() : ''
  if (!VERSION.test(version)) blockers.push('version')

  const sourceCommitSha = typeof input?.sourceCommitSha === 'string' ? input.sourceCommitSha : ''
  if (!SHA40.test(sourceCommitSha)) blockers.push('source')

  const artifactName = typeof input?.artifactName === 'string' ? input.artifactName.trim() : ''
  const mediaType = typeof input?.mediaType === 'string' ? input.mediaType.trim() : ''
  if (!SAFE_NAME.test(artifactName) || !mediaType || mediaType.length > 128 || UNSAFE.test(mediaType)) blockers.push('artifact')

  const sha256 = typeof input?.sha256 === 'string' ? input.sha256 : ''
  const sizeBytes = Number(input?.sizeBytes)
  if (!SHA256.test(sha256) || !Number.isSafeInteger(sizeBytes) || sizeBytes <= 0) blockers.push('integrity')

  const dependencies = validDependencies(input?.dependencies) ? Object.freeze([...input.dependencies].sort()) : Object.freeze<string[]>([])
  if (!validDependencies(input?.dependencies)) blockers.push('dependencies')

  const installationReference = input?.installationReference
  const configurationReference = input?.configurationReference
  const recoveryReference = input?.recoveryReference
  const supportReference = input?.supportReference
  if (![installationReference, configurationReference, recoveryReference, supportReference].every(validReference)) blockers.push('references')

  if (input?.credentialsIncluded !== false || input?.entitlementActivated !== false || input?.deploymentPerformed !== false || input?.providerExecutionEnabled !== false || input?.productionExecutionEnabled !== false) blockers.push('unsafe-state')

  return Object.freeze({
    schemaVersion: portablePackageManifestSchemaVersion,
    portableId,
    version,
    sourceCommitSha,
    artifactName,
    mediaType,
    sha256,
    sizeBytes: Number.isSafeInteger(sizeBytes) && sizeBytes > 0 ? sizeBytes : 0,
    dependencies,
    references: Object.freeze({
      installation: validReference(installationReference) ? installationReference : '',
      configuration: validReference(configurationReference) ? configurationReference : '',
      recovery: validReference(recoveryReference) ? recoveryReference : '',
      support: validReference(supportReference) ? supportReference : '',
    }),
    state: blockers.length === 0 ? 'package_manifest_validated' : 'blocked',
    blockers: Object.freeze([...new Set(blockers)]),
    readOnly: true,
    credentialsIncluded: false,
    entitlementActivated: false,
    deploymentPerformed: false,
    providerExecutionEnabled: false,
    productionExecutionEnabled: false,
  })
}
