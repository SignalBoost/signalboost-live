import type { PortableCommercialReadinessDimension } from './commercial-readiness.ts'

export const providerHubCommercialEvidenceSchemaVersion = 'provider-hub-commercial-evidence.v1' as const

export interface ProviderHubCommercialEvidenceDimension {
  readonly dimension: PortableCommercialReadinessDimension
  readonly status: 'verified' | 'external-evidence-required'
  readonly evidence: readonly string[]
  readonly blockers: readonly string[]
}

export interface ProviderHubCommercialEvidenceProfile {
  readonly schemaVersion: typeof providerHubCommercialEvidenceSchemaVersion
  readonly productId: 'provider-hub'
  readonly verifiedCount: number
  readonly totalCount: number
  readonly completionPercent: number
  readonly commerciallyReady: false
  readonly dimensions: readonly ProviderHubCommercialEvidenceDimension[]
}

// Repository references prove contract and documentation coverage only. Buyer-specific
// deployment, artifact, licensing, recovery, and acceptance evidence remains fail-closed.
const dimensions = Object.freeze<readonly ProviderHubCommercialEvidenceDimension[]>([
  Object.freeze({
    dimension: 'architecture',
    status: 'verified',
    evidence: Object.freeze(['saas/provider-hub-core/', 'saas/provider-hub-host/']),
    blockers: Object.freeze([]),
  }),
  Object.freeze({
    dimension: 'distribution-package',
    status: 'external-evidence-required',
    evidence: Object.freeze(['saas/examples/provider-hub-reference/']),
    blockers: Object.freeze(['missing-versioned-release-artifact']),
  }),
  Object.freeze({
    dimension: 'integrity-manifest',
    status: 'external-evidence-required',
    evidence: Object.freeze([]),
    blockers: Object.freeze(['missing-release-artifact-sha256-and-size']),
  }),
  Object.freeze({
    dimension: 'buyer-installation',
    status: 'verified',
    evidence: Object.freeze(['docs/portables/provider-hub-security-operations-acceptance.md#5-installation-and-configuration']),
    blockers: Object.freeze([]),
  }),
  Object.freeze({
    dimension: 'licensing-enforcement',
    status: 'external-evidence-required',
    evidence: Object.freeze(['saas/provider-hub-core/host-ports.ts']),
    blockers: Object.freeze(['missing-buyer-entitlement-enforcement-evidence']),
  }),
  Object.freeze({
    dimension: 'fulfillment-handoff',
    status: 'external-evidence-required',
    evidence: Object.freeze(['docs/portables/provider-hub-security-operations-acceptance.md']),
    blockers: Object.freeze(['missing-complete-versioned-buyer-handoff-bundle']),
  }),
  Object.freeze({
    dimension: 'operations-recovery',
    status: 'external-evidence-required',
    evidence: Object.freeze([
      'docs/portables/provider-hub-security-operations-acceptance.md#6-upgrade-migration-and-rollback',
      'docs/portables/provider-hub-security-operations-acceptance.md#7-backup-and-recovery',
    ]),
    blockers: Object.freeze(['missing-buyer-backup-infrastructure-and-recovery-rehearsal']),
  }),
  Object.freeze({
    dimension: 'buyer-configuration',
    status: 'verified',
    evidence: Object.freeze([
      'docs/portables/provider-hub-byok-portable.md#dual-audience-contract',
      'docs/portables/provider-hub-security-operations-acceptance.md#53-required-production-configuration-record',
    ]),
    blockers: Object.freeze([]),
  }),
  Object.freeze({
    dimension: 'deployment-acceptance',
    status: 'external-evidence-required',
    evidence: Object.freeze(['docs/portables/provider-hub-security-operations-acceptance.md#9-acceptance-checklist']),
    blockers: Object.freeze(['missing-clean-environment-install-and-buyer-signoff']),
  }),
  Object.freeze({
    dimension: 'support-boundary',
    status: 'verified',
    evidence: Object.freeze([
      'docs/portables/provider-hub-security-operations-acceptance.md#4-compliance-and-evidence-responsibility-matrix',
      'docs/portables/provider-hub-security-operations-acceptance.md#10-permanent-safety-notices',
    ]),
    blockers: Object.freeze([]),
  }),
])

const verifiedCount = dimensions.filter(dimension => dimension.status === 'verified').length

export const providerHubCommercialEvidenceProfile: ProviderHubCommercialEvidenceProfile = Object.freeze({
  schemaVersion: providerHubCommercialEvidenceSchemaVersion,
  productId: 'provider-hub',
  verifiedCount,
  totalCount: dimensions.length,
  completionPercent: Math.round((verifiedCount / dimensions.length) * 100),
  commerciallyReady: false,
  dimensions,
})
