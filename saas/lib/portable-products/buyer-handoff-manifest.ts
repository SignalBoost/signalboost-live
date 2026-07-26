export const portableBuyerHandoffManifestSchemaVersion = 'portable-buyer-handoff-manifest.v1' as const

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
}

export interface PortableBuyerHandoffManifest extends PortableBuyerHandoffManifestInput {
  readonly schemaVersion: typeof portableBuyerHandoffManifestSchemaVersion
  readonly complete: boolean
  readonly blockers: readonly string[]
}

const requiredKinds = Object.freeze<readonly PortableBuyerHandoffArtifactKind[]>([
  'package',
  'integrity',
  'installation',
  'configuration',
  'operations',
  'acceptance',
  'support',
])

const sha256Pattern = /^[a-f0-9]{64}$/

export function createPortableBuyerHandoffManifest(input: PortableBuyerHandoffManifestInput): PortableBuyerHandoffManifest {
  const artifacts = Object.freeze(input.artifacts.map(artifact => Object.freeze({ ...artifact })))
  const requiredArtifactKinds = new Set(artifacts.filter(artifact => artifact.required).map(artifact => artifact.kind))
  const validBuyerResponsibilities = input.buyerResponsibilities.filter(value => value.trim().length > 0)
  const validSupplierResponsibilities = input.supplierResponsibilities.filter(value => value.trim().length > 0)
  const blockers = [
    ...(!input.productId.trim() ? ['missing-product-id'] : []),
    ...(!input.releaseVersion.trim() ? ['missing-release-version'] : []),
    ...(!input.packageFormat.trim() ? ['missing-package-format'] : []),
    ...requiredKinds.filter(kind => !requiredArtifactKinds.has(kind)).map(kind => `missing-required-artifact:${kind}`),
    ...artifacts.filter(artifact => !artifact.path.trim()).map(artifact => `missing-path:${artifact.kind}`),
    ...artifacts.filter(artifact => !sha256Pattern.test(artifact.sha256)).map(artifact => `invalid-sha256:${artifact.kind}`),
    ...(validBuyerResponsibilities.length === 0 ? ['missing-buyer-responsibilities'] : []),
    ...(validSupplierResponsibilities.length === 0 ? ['missing-supplier-responsibilities'] : []),
  ]

  return Object.freeze({
    schemaVersion: portableBuyerHandoffManifestSchemaVersion,
    productId: input.productId,
    releaseVersion: input.releaseVersion,
    packageFormat: input.packageFormat,
    artifacts,
    buyerResponsibilities: Object.freeze([...input.buyerResponsibilities]),
    supplierResponsibilities: Object.freeze([...input.supplierResponsibilities]),
    exclusions: Object.freeze([...input.exclusions]),
    complete: blockers.length === 0,
    blockers: Object.freeze(blockers),
  })
}
