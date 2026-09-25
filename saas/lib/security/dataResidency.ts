// saas/lib/security/dataResidency.ts
// Host-neutral data classification + residency policy. This module decides where sensitive
// payloads are allowed to be handled; provider adapters must declare every zone in which the
// payload may be processed, logged, cached, or persisted.

export const DATA_RESIDENCY_SCHEMA_VERSION = 'data-residency-v1' as const

export const DATA_RESIDENCY_ZONES = ['US', 'EU_EEA', 'BR', 'GLOBAL'] as const
export type DataResidencyZone = typeof DATA_RESIDENCY_ZONES[number]

export const DATA_CLASSIFICATIONS = ['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED'] as const
export type DataClassification = typeof DATA_CLASSIFICATIONS[number]

export const DATA_RESIDENCY_PROFILES = ['GLOBAL', 'US_ONLY', 'EU_EEA', 'BR_ONLY'] as const
export type DataResidencyProfile = typeof DATA_RESIDENCY_PROFILES[number]

export interface TenantDataResidencyPolicy {
  readonly schemaVersion: typeof DATA_RESIDENCY_SCHEMA_VERSION
  readonly tenantId: string
  readonly profile: DataResidencyProfile
  readonly allowedProcessingZones: readonly DataResidencyZone[]
  readonly allowedStorageZones: readonly DataResidencyZone[]
  readonly defaultClassification: DataClassification
  // Evidence only. A transfer basis never expands runtime authority by itself.
  readonly crossBorderTransferBasis?: string | null
  readonly policyVersion: number
}

export interface DataResidencyRoutingConstraint {
  readonly required: boolean
  readonly classification: DataClassification
  readonly containsPersonalData: boolean
  readonly allowedDataResidencyZones: readonly DataResidencyZone[]
  readonly requireDeclaredDataResidency: boolean
}

const PROFILE_DEFAULT_ZONES: Readonly<Record<DataResidencyProfile, readonly DataResidencyZone[]>> = Object.freeze({
  GLOBAL: Object.freeze<DataResidencyZone[]>(['US', 'EU_EEA', 'BR', 'GLOBAL']),
  US_ONLY: Object.freeze<DataResidencyZone[]>(['US']),
  EU_EEA: Object.freeze<DataResidencyZone[]>(['EU_EEA']),
  BR_ONLY: Object.freeze<DataResidencyZone[]>(['BR']),
})

function required(value: unknown, field: string): string {
  const normalized = String(value ?? '').trim()
  if (!normalized) throw new Error(`data_residency_${field}_required`)
  return normalized
}

function validZone(value: unknown): DataResidencyZone {
  const normalized = required(value, 'zone').toUpperCase()
  if (!DATA_RESIDENCY_ZONES.includes(normalized as DataResidencyZone)) {
    throw new Error('data_residency_zone_invalid')
  }
  return normalized as DataResidencyZone
}

function uniqueZones(values: readonly unknown[]): readonly DataResidencyZone[] {
  const zones = [...new Set(values.map(validZone))]
  if (!zones.length) throw new Error('data_residency_zone_required')
  return Object.freeze(zones)
}

function validClassification(value: unknown): DataClassification {
  const normalized = required(value, 'classification').toUpperCase()
  if (!DATA_CLASSIFICATIONS.includes(normalized as DataClassification)) {
    throw new Error('data_residency_classification_invalid')
  }
  return normalized as DataClassification
}

function validProfile(value: unknown): DataResidencyProfile {
  const normalized = required(value, 'profile').toUpperCase()
  if (!DATA_RESIDENCY_PROFILES.includes(normalized as DataResidencyProfile)) {
    throw new Error('data_residency_profile_invalid')
  }
  return normalized as DataResidencyProfile
}

function positiveVersion(value: unknown): number {
  const version = Math.floor(Number(value))
  if (!Number.isFinite(version) || version < 1) throw new Error('data_residency_policy_version_invalid')
  return version
}

export function defaultTenantDataResidencyPolicy(
  tenantId: string,
  profile: DataResidencyProfile = 'GLOBAL',
): TenantDataResidencyPolicy {
  const normalizedProfile = validProfile(profile)
  const zones = PROFILE_DEFAULT_ZONES[normalizedProfile]
  return Object.freeze({
    schemaVersion: DATA_RESIDENCY_SCHEMA_VERSION,
    tenantId: required(tenantId, 'tenant_id'),
    profile: normalizedProfile,
    allowedProcessingZones: zones,
    allowedStorageZones: zones,
    defaultClassification: 'CONFIDENTIAL',
    crossBorderTransferBasis: null,
    policyVersion: 1,
  })
}

export function createTenantDataResidencyPolicy(input: {
  tenantId: string
  profile: DataResidencyProfile | string
  allowedProcessingZones: readonly (DataResidencyZone | string)[]
  allowedStorageZones: readonly (DataResidencyZone | string)[]
  defaultClassification?: DataClassification | string
  crossBorderTransferBasis?: string | null
  policyVersion?: number
}): TenantDataResidencyPolicy {
  const profile = validProfile(input.profile)
  const allowedProcessingZones = uniqueZones(input.allowedProcessingZones)
  const allowedStorageZones = uniqueZones(input.allowedStorageZones)

  // Strict profiles may be widened only by an explicit persisted policy. The profile remains
  // descriptive; the allowlists are the actual deterministic authorization boundary.
  return Object.freeze({
    schemaVersion: DATA_RESIDENCY_SCHEMA_VERSION,
    tenantId: required(input.tenantId, 'tenant_id'),
    profile,
    allowedProcessingZones,
    allowedStorageZones,
    defaultClassification: validClassification(input.defaultClassification ?? 'CONFIDENTIAL'),
    crossBorderTransferBasis: String(input.crossBorderTransferBasis ?? '').trim() || null,
    policyVersion: positiveVersion(input.policyVersion ?? 1),
  })
}

function intersection(a: readonly DataResidencyZone[], b: readonly DataResidencyZone[]): readonly DataResidencyZone[] {
  const right = new Set(b)
  return Object.freeze(a.filter(zone => right.has(zone)))
}

export function requiresResidencyEnforcement(input: {
  classification: DataClassification
  containsPersonalData?: boolean
}): boolean {
  return Boolean(
    input.containsPersonalData ||
    input.classification === 'CONFIDENTIAL' ||
    input.classification === 'RESTRICTED'
  )
}

export function buildDataResidencyRoutingConstraint(
  policy: TenantDataResidencyPolicy,
  input?: {
    classification?: DataClassification | string
    containsPersonalData?: boolean
  },
): DataResidencyRoutingConstraint {
  const classification = validClassification(input?.classification ?? policy.defaultClassification)
  const containsPersonalData = input?.containsPersonalData === true
  const required = requiresResidencyEnforcement({ classification, containsPersonalData })

  if (!required) {
    return Object.freeze({
      required: false,
      classification,
      containsPersonalData,
      allowedDataResidencyZones: Object.freeze([]),
      requireDeclaredDataResidency: false,
    })
  }

  const allowedDataResidencyZones = intersection(policy.allowedProcessingZones, policy.allowedStorageZones)
  if (!allowedDataResidencyZones.length) throw new Error('data_residency_no_common_processing_storage_zone')

  return Object.freeze({
    required: true,
    classification,
    containsPersonalData,
    allowedDataResidencyZones,
    requireDeclaredDataResidency: true,
  })
}
