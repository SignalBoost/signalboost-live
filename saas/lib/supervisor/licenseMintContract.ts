// Machine-readable contract shared by the licence setup page and mint route.
// Values in this file are identifiers, not user-facing copy.

export const LICENSE_EDITIONS = ['standard', 'enterprise'] as const
export type LicenseEdition = (typeof LICENSE_EDITIONS)[number]

export const LICENSE_MINT_FEATURE_IDS = [
  'incident.observe',
  'siem.export',
  'approval.gating',
  'repair.plan',
  'repair.dispatch',
  'repair.api-steps',
  'repair.browser-steps',
] as const
export type LicenseMintFeatureId = (typeof LICENSE_MINT_FEATURE_IDS)[number]

export const LICENSE_MINT_ERROR_CODES = [
  'unauthorized',
  'ownerOnly',
  'licenseeRequired',
  'invalidEdition',
  'invalidDays',
] as const
export type LicenseMintErrorCode = (typeof LICENSE_MINT_ERROR_CODES)[number]

export const LICENSE_MINT_REMEDY_CODES = ['useLegalEntityName'] as const
export type LicenseMintRemedyCode = (typeof LICENSE_MINT_REMEDY_CODES)[number]

export const LICENSE_MINT_WARNING_CODES = [
  'privateKeyOnce',
  'recordLicenseId',
  'limitsNotEnforced',
  'redeployRequired',
] as const
export type LicenseMintWarningCode = (typeof LICENSE_MINT_WARNING_CODES)[number]

export type LicenseMintResult = {
  ok?: boolean
  schemaVersion?: string
  errorCode?: LicenseMintErrorCode
  remedyCode?: LicenseMintRemedyCode
  editions?: string[]
  licence?: {
    licenseId?: string
    product?: string
    licensee?: string
    issuer?: string
    edition?: string
    features?: string[]
    issuedAt?: string
    expiresAt?: string
    graceDays?: number
  }
  environment?: Record<string, string>
  privateKeyPem?: string
  warningCodes?: LicenseMintWarningCode[]
}
