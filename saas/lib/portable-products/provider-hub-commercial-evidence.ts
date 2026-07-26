// saas/lib/portable-products/provider-hub-commercial-evidence.ts

export const providerHubCommercialEvidenceSchemaVersion = 'provider-hub-commercial-evidence.v1' as const

export type ProviderHubCommercialEvidenceState = 'documented' | 'verified' | 'blocked'

export interface ProviderHubCommercialEvidenceDimension {
  readonly dimension: string
  readonly state: ProviderHubCommercialEvidenceState
  readonly references: readonly string[]
  readonly blockers: readonly string[]
}

export interface ProviderHubCommercialEvidenceProfile {
  readonly schemaVersion: typeof providerHubCommercialEvidenceSchemaVersion
  readonly productId: 'provider-hub'
  readonly dimensions: readonly ProviderHubCommercialEvidenceDimension[]
  readonly commerciallyReady: boolean
  readonly blockers: readonly string[]
  readonly checkoutEnabled: false
  readonly entitlementMutationEnabled: false
  readonly fulfillmentMutationEnabled: false
  readonly providerExecutionEnabled: false
  readonly productionExecutionEnabled: false
}

const dimensions = Object.freeze<readonly ProviderHubCommercialEvidenceDimension[]>([
  Object.freeze({
    dimension: 'packaging-specification',
    state: 'verified',
    references: Object.freeze([
      'docs/portables/google-play-packaging.md',
      'saas/portable-mobile/provider-hub-build-readiness.ts',
      'saas/portable-mobile/provider-hub-unsigned-build-evidence-bundle.ts',
    ]),
    blockers: Object.freeze<string[]>([]),
  }),
  Object.freeze({
    dimension: 'installation-configuration',
    state: 'documented',
    references: Object.freeze([
      'docs/portables/provider-hub-byok-portable.md',
      'saas/examples/provider-hub-reference/README.md',
    ]),
    blockers: Object.freeze<string[]>([]),
  }),
  Object.freeze({
    dimension: 'operations-security',
    state: 'verified',
    references: Object.freeze([
      'docs/portables/provider-hub-security-operations-acceptance.md',
      'saas/provider-hub-host/status-surface.ts',
    ]),
    blockers: Object.freeze<string[]>([]),
  }),
  Object.freeze({
    dimension: 'licensing-entitlement',
    state: 'documented',
    references: Object.freeze([
      'saas/lib/portable-products/license-evidence.ts',
      'saas/lib/portable-products/licensing-fulfillment-evidence.ts',
    ]),
    blockers: Object.freeze(['missing-provider-hub-license-issuance-evidence']),
  }),
  Object.freeze({
    dimension: 'distribution-artifact',
    state: 'blocked',
    references: Object.freeze([
      'saas/portable-mobile/provider-hub-unsigned-build-provenance.ts',
      'saas/portable-mobile/android-buyer-handoff-manifest.ts',
    ]),
    blockers: Object.freeze([
      'missing-production-artifact-identity',
      'missing-signed-release-artifact',
    ]),
  }),
  Object.freeze({
    dimension: 'buyer-acceptance',
    state: 'blocked',
    references: Object.freeze(['docs/portables/provider-hub-security-operations-acceptance.md']),
    blockers: Object.freeze([
      'missing-clean-environment-deployment-evidence',
      'missing-end-to-end-buyer-acceptance-evidence',
    ]),
  }),
  Object.freeze({
    dimension: 'support-recovery',
    state: 'documented',
    references: Object.freeze([
      'docs/portables/provider-hub-implementation-status.md',
      'docs/portables/provider-hub-security-operations-acceptance.md',
    ]),
    blockers: Object.freeze(['missing-buyer-verified-recovery-run']),
  }),
])

const blockers = Object.freeze(dimensions.flatMap(dimension => dimension.blockers))

export const providerHubCommercialEvidenceProfile: ProviderHubCommercialEvidenceProfile = Object.freeze({
  schemaVersion: providerHubCommercialEvidenceSchemaVersion,
  productId: 'provider-hub',
  dimensions,
  commerciallyReady: blockers.length === 0,
  blockers,
  checkoutEnabled: false,
  entitlementMutationEnabled: false,
  fulfillmentMutationEnabled: false,
  providerExecutionEnabled: false,
  productionExecutionEnabled: false,
})
