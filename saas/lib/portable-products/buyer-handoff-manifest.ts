import { portableProductRegistry } from './product-registry.ts'

export const portableBuyerHandoffManifestSchemaVersion = 'portable-buyer-handoff-manifest.v2' as const

export type PortableBuyerHandoffArtifactKind = 'package' | 'integrity' | 'installation' | 'configuration' | 'operations' | 'acceptance' | 'support'

export interface PortableBuyerHandoffArtifact {
  readonly kind: PortableBuyerHandoffArtifactKind
  readonly path: string
  readonly sha256: string
  readonly required: boolean
}

export interface PortableBuyerHandoffManifestInput {
  readonly productId: string
  readonly releaseVersion: string
  readonly packageFormat: string
  readonly artifacts: readonly PortableBuyerHandoffArtifact[]
  readonly buyerResponsibilities: readonly string[]
  readonly supplierResponsibilities: readonly string[]
  readonly exclusions: readonly string[]
  readonly preparedAt?: string
  readonly acknowledgedAt?: string
  readonly artifactTransferred?: boolean
  readonly credentialsTransferred?: boolean
  readonly entitlementMutated?: boolean
  readonly deploymentPerformed?: boolean
  readonly productionExecutionEnabled?: boolean
}

export interface PortableBuyerHandoffManifest extends PortableBuyerHandoffManifestInput {
  readonly schemaVersion: typeof portableBuyerHandoffManifestSchemaVersion
  readonly complete: boolean
  readonly blockers: readonly string[]
  readonly readOnly: true
}

const requiredKinds = Object.freeze<readonly PortableBuyerHandoffArtifactKind[]>([
  'package', 'integrity', 'installation', 'configuration', 'operations', 'acceptance', 'support',
])
const sha256Pattern = /^[a-f0-9]{64}$/
const versionPattern = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[A-Za-z0-9.-]+)?$/
const pathPattern = /^(?:docs|dist|artifacts|packages)\/[A-Za-z0-9._/-]+$/
const unsafePath = /(?:^|\/)\.\.(?:\/|$)|[?#@]|(?:secret|token|password|private[_-]?key)/i

function nonEmpty(values: readonly string[]): boolean {
  return values.length > 0 && values.every(value => value.trim().length > 0)
}

function parsedDate(value: string | undefined): number | null {
  if (!value) return null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function createPortableBuyerHandoffManifest(input: PortableBuyerHandoffManifestInput): PortableBuyerHandoffManifest {
  const productId = input.productId.trim()
  const registered = portableProductRegistry.some(entry => entry.manifest.productId === productId)
  const artifacts = Object.freeze(input.artifacts.map(artifact => Object.freeze({ ...artifact, path: artifact.path.trim() })))
  const kinds = artifacts.map(artifact => artifact.kind)
  const prepared = parsedDate(input.preparedAt)
  const acknowledged = parsedDate(input.acknowledgedAt)
  const blockers = [
    ...(!registered ? ['unregistered-product-id'] : []),
    ...(!versionPattern.test(input.releaseVersion.trim()) ? ['invalid-release-version'] : []),
    ...(!input.packageFormat.trim() ? ['missing-package-format'] : []),
    ...requiredKinds.filter(kind => !artifacts.some(artifact => artifact.kind === kind && artifact.required)).map(kind => `missing-required-artifact:${kind}`),
    ...(new Set(kinds).size !== kinds.length ? ['duplicate-artifact-kind'] : []),
    ...artifacts.filter(artifact => !pathPattern.test(artifact.path) || unsafePath.test(artifact.path)).map(artifact => `unsafe-path:${artifact.kind}`),
    ...artifacts.filter(artifact => !sha256Pattern.test(artifact.sha256)).map(artifact => `invalid-sha256:${artifact.kind}`),
    ...(!nonEmpty(input.buyerResponsibilities) ? ['missing-buyer-responsibilities'] : []),
    ...(!nonEmpty(input.supplierResponsibilities) ? ['missing-supplier-responsibilities'] : []),
    ...(!nonEmpty(input.exclusions) ? ['missing-exclusions'] : []),
    ...(prepared === null || acknowledged === null || acknowledged < prepared ? ['invalid-timestamps'] : []),
    ...(input.artifactTransferred === true || input.credentialsTransferred === true || input.entitlementMutated === true || input.deploymentPerformed === true || input.productionExecutionEnabled === true ? ['unsafe-state'] : []),
  ]
  const uniqueBlockers = Object.freeze([...new Set(blockers)])
  return Object.freeze({
    ...input,
    schemaVersion: portableBuyerHandoffManifestSchemaVersion,
    productId,
    releaseVersion: input.releaseVersion.trim(),
    packageFormat: input.packageFormat.trim(),
    artifacts,
    buyerResponsibilities: Object.freeze([...input.buyerResponsibilities]),
    supplierResponsibilities: Object.freeze([...input.supplierResponsibilities]),
    exclusions: Object.freeze([...input.exclusions]),
    artifactTransferred: false,
    credentialsTransferred: false,
    entitlementMutated: false,
    deploymentPerformed: false,
    productionExecutionEnabled: false,
    complete: uniqueBlockers.length === 0,
    blockers: uniqueBlockers,
    readOnly: true,
  })
}
