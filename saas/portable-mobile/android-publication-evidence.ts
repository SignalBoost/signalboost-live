import type { AndroidPublicationReadinessManifest } from './android-publication-readiness.ts'
import type { AndroidSignedBundleEvidenceReport } from './android-signed-bundle-evidence.ts'

export const ANDROID_PUBLICATION_EVIDENCE_SCHEMA_VERSION = 'signalboost-android-publication-evidence-v1' as const

export type AndroidPublicationEvidenceBlocker =
  | 'publication-readiness'
  | 'signed-bundle-evidence'
  | 'identity'
  | 'release-version'
  | 'release-track'
  | 'digest-linkage'
  | 'console-references'
  | 'rollout'
  | 'review-status'
  | 'country-scope'
  | 'timestamps'
  | 'unsafe-material'
  | 'unsafe-state'

export interface AndroidPublicationEvidenceInput {
  portableId: string
  packageName: string
  versionCode: number
  versionName: string
  releaseTrack: 'internal' | 'closed' | 'open' | 'production'
  signedAabSha256: string
  playEditReference: string
  playReleaseReference: string
  rolloutPercentage: number
  reviewStatus: 'draft' | 'in_review' | 'approved'
  countryCodes: readonly string[]
  submittedAt: string
  reviewedAt: string
  automaticRolloutEnabled: false
  artifactUploadedBySignalBoost: false
  playApiInvoked: false
  productionPublished: false
  productionExecutionEnabled: false
}

export interface AndroidPublicationEvidenceReport {
  schemaVersion: typeof ANDROID_PUBLICATION_EVIDENCE_SCHEMA_VERSION
  portableId: string
  packageName: string
  versionCode: number
  versionName: string
  releaseTrack: string
  state: 'publication_evidence_validated' | 'blocked'
  blockers: readonly AndroidPublicationEvidenceBlocker[]
  readOnly: true
  artifactAccessed: false
  playApiInvoked: false
  storeMutationPerformed: false
  productionPublished: false
  productionExecutionEnabled: false
}

const SHA256 = /^[0-9a-f]{64}$/
const PACKAGE_NAME = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){2,}$/
const VERSION_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/
const REFERENCE = /^[a-z][a-z0-9+.-]*:[A-Za-z0-9._~:/?#\[\]@!$&'()*+,;=%-]+$/
const COUNTRY = /^[A-Z]{2}$/
const UNSAFE = /BEGIN\s|PRIVATE\s+KEY|client_email|private_key|access[_-]?token|bearer\s|password|secret=|service[_-]?account/i

function validReference(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 512 && REFERENCE.test(value) && !value.includes('..') && !UNSAFE.test(value)
}

function validDate(value: unknown): number | null {
  if (typeof value !== 'string') return null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function validateAndroidPublicationEvidence(
  readinessValue: unknown,
  signedEvidenceValue: unknown,
  inputValue: unknown,
): AndroidPublicationEvidenceReport {
  const readiness = readinessValue as Partial<AndroidPublicationReadinessManifest> | null
  const signedEvidence = signedEvidenceValue as Partial<AndroidSignedBundleEvidenceReport> | null
  const input = inputValue as Partial<AndroidPublicationEvidenceInput> | null
  const blockers: AndroidPublicationEvidenceBlocker[] = []

  const validReadiness = Boolean(readiness && readiness.schemaVersion === 'signalboost-android-publication-readiness-v1' && readiness.state === 'publication_ready' && Array.isArray(readiness.blockers) && readiness.blockers.length === 0 && readiness.storeSubmissionExecuted === false && readiness.productionPublished === false && readiness.productionExecutionEnabled === false)
  if (!validReadiness) blockers.push('publication-readiness')

  const validSignedEvidence = Boolean(signedEvidence && signedEvidence.schemaVersion === 'signalboost-android-signed-bundle-evidence-v1' && signedEvidence.state === 'signed_bundle_evidence_validated' && Array.isArray(signedEvidence.blockers) && signedEvidence.blockers.length === 0 && SHA256.test(String(signedEvidence.signedAabSha256 ?? '')) && signedEvidence.storeSubmissionEnabled === false && signedEvidence.productionExecutionEnabled === false)
  if (!validSignedEvidence) blockers.push('signed-bundle-evidence')

  const portableId = typeof input?.portableId === 'string' ? input.portableId.trim() : ''
  const packageName = typeof input?.packageName === 'string' ? input.packageName.trim() : ''
  if (!portableId || !PACKAGE_NAME.test(packageName) || portableId !== readiness?.portableId || portableId !== signedEvidence?.portableId || packageName !== readiness?.packageName || packageName !== signedEvidence?.packageName) blockers.push('identity')

  const versionCode = Number(input?.versionCode)
  const versionName = typeof input?.versionName === 'string' ? input.versionName.trim() : ''
  if (!Number.isSafeInteger(versionCode) || versionCode <= 0 || !VERSION_NAME.test(versionName)) blockers.push('release-version')

  const releaseTrack = input?.releaseTrack
  if (!['internal', 'closed', 'open', 'production'].includes(String(releaseTrack ?? ''))) blockers.push('release-track')
  if (!SHA256.test(String(input?.signedAabSha256 ?? '')) || input?.signedAabSha256 !== signedEvidence?.signedAabSha256) blockers.push('digest-linkage')
  if (!validReference(input?.playEditReference) || !validReference(input?.playReleaseReference)) blockers.push('console-references')

  const rollout = Number(input?.rolloutPercentage)
  if (!Number.isFinite(rollout) || rollout < 0 || rollout > 100 || (releaseTrack !== 'production' && rollout !== 100)) blockers.push('rollout')
  if (!['draft', 'in_review', 'approved'].includes(String(input?.reviewStatus ?? ''))) blockers.push('review-status')

  const countries = input?.countryCodes
  if (!Array.isArray(countries) || countries.length === 0 || countries.some(code => typeof code !== 'string' || !COUNTRY.test(code)) || new Set(countries).size !== countries.length) blockers.push('country-scope')

  const submitted = validDate(input?.submittedAt)
  const reviewed = validDate(input?.reviewedAt)
  if (submitted === null || reviewed === null || reviewed < submitted) blockers.push('timestamps')
  if ([input?.playEditReference, input?.playReleaseReference].some(value => typeof value === 'string' && UNSAFE.test(value))) blockers.push('unsafe-material')
  if (input?.automaticRolloutEnabled !== false || input?.artifactUploadedBySignalBoost !== false || input?.playApiInvoked !== false || input?.productionPublished !== false || input?.productionExecutionEnabled !== false) blockers.push('unsafe-state')

  return Object.freeze({
    schemaVersion: ANDROID_PUBLICATION_EVIDENCE_SCHEMA_VERSION,
    portableId,
    packageName,
    versionCode: Number.isSafeInteger(versionCode) && versionCode > 0 ? versionCode : 0,
    versionName: VERSION_NAME.test(versionName) ? versionName : '',
    releaseTrack: typeof releaseTrack === 'string' ? releaseTrack : '',
    state: blockers.length === 0 ? 'publication_evidence_validated' : 'blocked',
    blockers: Object.freeze(blockers),
    readOnly: true,
    artifactAccessed: false,
    playApiInvoked: false,
    storeMutationPerformed: false,
    productionPublished: false,
    productionExecutionEnabled: false,
  })
}
