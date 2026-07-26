import type { AndroidBuildEvidenceReport } from './android-build-evidence.ts'

export const ANDROID_SIGNED_BUNDLE_EVIDENCE_SCHEMA_VERSION = 'signalboost-android-signed-bundle-evidence-v1' as const

export type AndroidSignedBundleEvidenceBlocker =
  | 'build-evidence'
  | 'identity'
  | 'artifact-path'
  | 'digest-linkage'
  | 'certificate-fingerprint'
  | 'signing-reference'
  | 'attestation-reference'
  | 'timestamps'
  | 'unsafe-material'
  | 'unsafe-state'

export interface AndroidSignedBundleEvidenceInput {
  portableId: string
  packageName: string
  unsignedAabSha256: string
  signedAabPath: string
  signedAabSha256: string
  certificateSha256Fingerprint: string
  signingKeyReference: string
  signerAttestationReference: string
  signingStartedAt: string
  signingCompletedAt: string
  artifactUploaded: boolean
  playConsolePublished: boolean
  productionExecutionEnabled: boolean
}

export interface AndroidSignedBundleEvidenceReport {
  schemaVersion: typeof ANDROID_SIGNED_BUNDLE_EVIDENCE_SCHEMA_VERSION
  portableId: string
  packageName: string
  state: 'signed_bundle_evidence_validated' | 'blocked'
  blockers: readonly AndroidSignedBundleEvidenceBlocker[]
  readOnly: true
  artifactAccessed: false
  signingPerformed: false
  rawSigningMaterialAccepted: false
  storeSubmissionEnabled: false
  productionExecutionEnabled: false
}

const SHA256 = /^[0-9a-f]{64}$/
const FINGERPRINT = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/
const PACKAGE_NAME = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){2,}$/
const UNSAFE_REFERENCE = /BEGIN\s|PRIVATE\s+KEY|keystore|\.jks\b|\.keystore\b|password|storepass|keypass/i

function nonEmpty(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0
}

function validDate(value: string): number | null {
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function validateAndroidSignedBundleEvidence(
  buildEvidence: AndroidBuildEvidenceReport,
  input: AndroidSignedBundleEvidenceInput,
): AndroidSignedBundleEvidenceReport {
  if (!input || typeof input !== 'object') throw new Error('Android signed bundle evidence input is required')

  const blockers: AndroidSignedBundleEvidenceBlocker[] = []
  if (!buildEvidence || buildEvidence.state !== 'evidence_validated' || buildEvidence.blockers.length !== 0) blockers.push('build-evidence')
  if (!nonEmpty(input.portableId) || !PACKAGE_NAME.test(input.packageName) || input.portableId !== buildEvidence?.portableId || input.packageName !== buildEvidence?.packageName) blockers.push('identity')
  if (!input.signedAabPath.endsWith('.aab') || input.signedAabPath.startsWith('/') || input.signedAabPath.includes('..')) blockers.push('artifact-path')
  if (!SHA256.test(input.unsignedAabSha256) || !SHA256.test(input.signedAabSha256) || input.unsignedAabSha256 === input.signedAabSha256) blockers.push('digest-linkage')
  if (!FINGERPRINT.test(input.certificateSha256Fingerprint)) blockers.push('certificate-fingerprint')
  if (!nonEmpty(input.signingKeyReference)) blockers.push('signing-reference')
  if (!nonEmpty(input.signerAttestationReference)) blockers.push('attestation-reference')

  const started = validDate(input.signingStartedAt)
  const completed = validDate(input.signingCompletedAt)
  if (started === null || completed === null || completed < started) blockers.push('timestamps')
  if ([input.signingKeyReference, input.signerAttestationReference].some(value => UNSAFE_REFERENCE.test(value))) blockers.push('unsafe-material')
  if (input.artifactUploaded || input.playConsolePublished || input.productionExecutionEnabled) blockers.push('unsafe-state')

  return Object.freeze({
    schemaVersion: ANDROID_SIGNED_BUNDLE_EVIDENCE_SCHEMA_VERSION,
    portableId: String(input.portableId ?? '').trim(),
    packageName: String(input.packageName ?? '').trim(),
    state: blockers.length === 0 ? 'signed_bundle_evidence_validated' : 'blocked',
    blockers: Object.freeze(blockers),
    readOnly: true,
    artifactAccessed: false,
    signingPerformed: false,
    rawSigningMaterialAccepted: false,
    storeSubmissionEnabled: false,
    productionExecutionEnabled: false,
  })
}
