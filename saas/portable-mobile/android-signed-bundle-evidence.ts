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
  artifactUploaded: false
  playConsolePublished: false
  productionExecutionEnabled: false
}

export interface AndroidSignedBundleEvidenceReport {
  schemaVersion: typeof ANDROID_SIGNED_BUNDLE_EVIDENCE_SCHEMA_VERSION
  portableId: string
  packageName: string
  sourceCommitSha: string
  signedAabSha256: string
  certificateSha256Fingerprint: string
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
const SAFE_REFERENCE = /^[a-z][a-z0-9+.-]*:[A-Za-z0-9._~:/?#\[\]@!$&'()*+,;=%-]+$/
const UNSAFE_REFERENCE = /BEGIN\s|PRIVATE\s+KEY|keystore|\.jks\b|\.keystore\b|password|storepass|keypass|secret=/i

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function validDate(value: unknown): number | null {
  if (typeof value !== 'string') return null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

function validReference(value: unknown): value is string {
  return nonEmpty(value) && value.length <= 512 && SAFE_REFERENCE.test(value) && !value.includes('..') && !UNSAFE_REFERENCE.test(value)
}

export function validateAndroidSignedBundleEvidence(
  buildEvidenceValue: unknown,
  inputValue: unknown,
): AndroidSignedBundleEvidenceReport {
  const buildEvidence = buildEvidenceValue as Partial<AndroidBuildEvidenceReport> | null
  const input = inputValue as Partial<AndroidSignedBundleEvidenceInput> | null
  const blockers: AndroidSignedBundleEvidenceBlocker[] = []

  const validBuildEvidence = Boolean(
    buildEvidence &&
    buildEvidence.schemaVersion === 'signalboost-android-build-evidence-v1' &&
    buildEvidence.state === 'evidence_validated' &&
    Array.isArray(buildEvidence.blockers) &&
    buildEvidence.blockers.length === 0 &&
    SHA256.test(String(buildEvidence.unsignedAabSha256 ?? '')) &&
    buildEvidence.artifactAccessed === false &&
    buildEvidence.signingEnabled === false &&
    buildEvidence.storeSubmissionEnabled === false &&
    buildEvidence.productionExecutionEnabled === false,
  )
  if (!validBuildEvidence) blockers.push('build-evidence')

  const portableId = nonEmpty(input?.portableId) ? input.portableId.trim() : ''
  const packageName = nonEmpty(input?.packageName) ? input.packageName.trim() : ''
  if (!portableId || !PACKAGE_NAME.test(packageName) || portableId !== buildEvidence?.portableId || packageName !== buildEvidence?.packageName) blockers.push('identity')

  const signedAabPath = input?.signedAabPath
  if (typeof signedAabPath !== 'string' || !signedAabPath.endsWith('.aab') || signedAabPath.startsWith('/') || signedAabPath.includes('..') || signedAabPath.includes('\\')) blockers.push('artifact-path')

  const unsignedDigest = String(input?.unsignedAabSha256 ?? '')
  const signedDigest = String(input?.signedAabSha256 ?? '')
  if (!SHA256.test(unsignedDigest) || !SHA256.test(signedDigest) || unsignedDigest === signedDigest || unsignedDigest !== buildEvidence?.unsignedAabSha256) blockers.push('digest-linkage')

  const fingerprint = String(input?.certificateSha256Fingerprint ?? '')
  if (!FINGERPRINT.test(fingerprint)) blockers.push('certificate-fingerprint')
  if (!validReference(input?.signingKeyReference)) blockers.push('signing-reference')
  if (!validReference(input?.signerAttestationReference)) blockers.push('attestation-reference')

  const started = validDate(input?.signingStartedAt)
  const completed = validDate(input?.signingCompletedAt)
  if (started === null || completed === null || completed < started) blockers.push('timestamps')
  if ([input?.signingKeyReference, input?.signerAttestationReference].some(value => typeof value === 'string' && UNSAFE_REFERENCE.test(value))) blockers.push('unsafe-material')
  if (input?.artifactUploaded !== false || input?.playConsolePublished !== false || input?.productionExecutionEnabled !== false) blockers.push('unsafe-state')

  return Object.freeze({
    schemaVersion: ANDROID_SIGNED_BUNDLE_EVIDENCE_SCHEMA_VERSION,
    portableId,
    packageName,
    sourceCommitSha: validBuildEvidence ? String(buildEvidence?.sourceCommitSha ?? '') : '',
    signedAabSha256: SHA256.test(signedDigest) ? signedDigest : '',
    certificateSha256Fingerprint: FINGERPRINT.test(fingerprint) ? fingerprint : '',
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
